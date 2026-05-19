import { nanoid } from 'nanoid';
import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { scrapeRecipe } from './recipeScraper.js';

/**
 * Bulk import: given a section/category page (e.g. menunedeli.ru/.../salaty/),
 * find all recipe links on the page (and following pagination), then scrape
 * each one via the existing scrapeRecipe and persist to DB.
 *
 * Runs as a background job because it can take several minutes for a big
 * section. Client polls importSectionStatus(jobId) for progress.
 */

interface ImportJob {
  jobId: string;
  url: string;
  startedAt: string;
  finishedAt: string | null;
  done: boolean;
  cancelled: boolean;
  /** human-readable phase: "discovering" | "importing" */
  phase: 'discovering' | 'importing' | 'done' | 'failed';
  total: number;
  processed: number;
  success: number;
  skipped: number;
  failed: number;
  currentTitle: string;
  currentUrl: string;
  errors: Array<{ url: string; error: string }>;
  recentlyAdded: Array<{ id: number; title: string; url: string }>;
  /** caller-provided politeness delay between recipe fetches */
  delayMs: number;
  limit: number;
}

const jobs = new Map<string, ImportJob>();
const MAX_PAGINATION_PAGES = 30;
const FETCH_TIMEOUT_MS = 15000;
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ru,en;q=0.7',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const sniff = buffer.subarray(0, 1024).toString('latin1');
  const metaCharset = sniff.match(/<meta[^>]+charset[=:\s"']+([\w-]+)/i)?.[1]?.toLowerCase();
  const ctCharset = (res.headers.get('content-type') || '')
    .match(/charset=([^;]+)/i)?.[1]
    ?.toLowerCase()
    .trim();
  const charset = metaCharset || ctCharset || 'utf-8';
  if (charset === 'utf-8' || charset === 'utf8') return buffer.toString('utf-8');
  if (iconv.encodingExists(charset)) return iconv.decode(buffer, charset);
  return buffer.toString('utf-8');
}

/**
 * Heuristic: a URL looks like a recipe link (not a section/admin/etc).
 *
 *   - same hostname as the seed page
 *   - path has at least one slug-like segment with letters
 *   - path is NOT obviously a section index, search, tag etc.
 */
function looksLikeRecipeLink(url: URL, seedHost: string): boolean {
  if (url.hostname !== seedHost) return false;

  const path = url.pathname.replace(/\/$/, '');
  if (!path || path === '/') return false;

  // Reject infrastructure URLs
  const lowered = path.toLowerCase();
  const blocklist = [
    '/wp-', '/feed', '/comments', '/?', '/page/', '/tag/', '/category/',
    '/author/', '/search/', '/about', '/contact', '/login', '/admin',
    '/cart', '/account', '/sitemap', '/robots',
  ];
  if (blocklist.some((b) => lowered.includes(b))) return false;
  if (lowered.endsWith('.xml') || lowered.endsWith('.txt') || lowered.endsWith('.pdf')) {
    return false;
  }

  // Last path segment should look like a slug: 3+ chars, contain letters,
  // and ideally have a hyphen (multi-word slug).
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) return false;
  const last = segments[segments.length - 1];
  if (last.length < 4) return false;
  if (!/[a-zа-яё]/i.test(last)) return false;

  return true;
}

interface DiscoveryResult {
  links: string[];
  paginationLinks: string[];
}

/**
 * Find recipe-like links on a section page. Walks <article>, .post,
 * .entry-* and similar containers first; falls back to scanning every
 * <a href>. Also collects pagination links so the caller can crawl
 * additional pages.
 */
function discoverLinksOnPage(html: string, baseUrl: string): DiscoveryResult {
  const $ = cheerio.load(html);
  const seed = new URL(baseUrl);
  const seedPath = seed.pathname.replace(/\/$/, '');
  const recipeLinks = new Set<string>();
  const paginationLinks = new Set<string>();

  // 1. Look in classic Wordpress recipe-card containers first
  const containers = $(
    'article a[href], .post a[href], .entry-title a[href], ' +
      '.card a[href], .recipe-card a[href], .posts-loop a[href], ' +
      '.recipes-list a[href], .grid-item a[href], main a[href]',
  );

  containers.each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    try {
      const abs = new URL(href, baseUrl);
      if (abs.pathname.replace(/\/$/, '') === seedPath) return; // self-link
      if (looksLikeRecipeLink(abs, seed.hostname)) {
        recipeLinks.add(abs.toString().split('#')[0]);
      }
    } catch {
      /* ignore malformed */
    }
  });

  // 2. Fallback: if we found nothing, scan every <a href> on the page
  if (recipeLinks.size === 0) {
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;
      try {
        const abs = new URL(href, baseUrl);
        if (abs.pathname.replace(/\/$/, '') === seedPath) return;
        if (looksLikeRecipeLink(abs, seed.hostname)) {
          recipeLinks.add(abs.toString().split('#')[0]);
        }
      } catch {
        /* ignore */
      }
    });
  }

  // 3. Pagination: links that mention "page/N", "?page=N", "?paged=N",
  //    or appear in pagination markup.
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    try {
      const abs = new URL(href, baseUrl);
      if (abs.hostname !== seed.hostname) return;
      const path = abs.pathname + abs.search;
      if (
        /\/page\/\d+\/?$/i.test(abs.pathname) ||
        /[?&](?:page|paged)=\d+/i.test(abs.search)
      ) {
        paginationLinks.add(abs.toString().split('#')[0]);
      }
      // also class-based hints
      const cls = ($(el).attr('class') || '').toLowerCase();
      if (cls.includes('page-numbers') || cls.includes('pagination')) {
        if (path !== seedPath + '/' && path !== seedPath) {
          paginationLinks.add(abs.toString().split('#')[0]);
        }
      }
    } catch {
      /* ignore */
    }
  });

  return {
    links: Array.from(recipeLinks),
    paginationLinks: Array.from(paginationLinks),
  };
}

/**
 * Walk paginated section pages until either:
 *   - we hit MAX_PAGINATION_PAGES,
 *   - or a page yields no new recipe links.
 */
async function discoverAllRecipeLinks(seedUrl: string, limit: number): Promise<string[]> {
  const seen = new Set<string>();
  const visitedPages = new Set<string>();
  const queue: string[] = [seedUrl];

  while (queue.length > 0 && visitedPages.size < MAX_PAGINATION_PAGES) {
    const pageUrl = queue.shift()!;
    if (visitedPages.has(pageUrl)) continue;
    visitedPages.add(pageUrl);

    let html: string;
    try {
      html = await fetchHtml(pageUrl);
    } catch (err) {
      console.warn(`[sectionImport] failed to fetch ${pageUrl}:`, err);
      continue;
    }

    const { links, paginationLinks } = discoverLinksOnPage(html, pageUrl);
    let added = 0;
    for (const link of links) {
      if (!seen.has(link)) {
        seen.add(link);
        added++;
        if (seen.size >= limit) break;
      }
    }

    if (seen.size >= limit) break;

    // Only enqueue pagination if this page actually contributed links —
    // protects against pagination loops on a different sub-section.
    if (added > 0) {
      for (const p of paginationLinks) {
        if (!visitedPages.has(p) && !queue.includes(p)) {
          queue.push(p);
        }
      }
    }

    // small delay between section-page fetches
    await delay(800);
  }

  return Array.from(seen).slice(0, limit);
}

/**
 * Skip a recipe URL that we already have in DB (matched by source_url).
 */
async function alreadyImported(sourceUrl: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.recipes.id })
    .from(schema.recipes)
    .where(eq(schema.recipes.sourceUrl, sourceUrl))
    .limit(1);
  return !!row;
}

async function importOne(url: string): Promise<{ id: number; title: string }> {
  const scraped = await scrapeRecipe(url);
  if (!scraped.title || (scraped.ingredients.length === 0 && scraped.steps.length === 0)) {
    throw new Error('Не удалось извлечь содержимое рецепта (пустые ингредиенты и шаги)');
  }

  const [{ id: recipeId }] = await db
    .insert(schema.recipes)
    .values({
      title: scraped.title,
      description: scraped.description || null,
      imageUrl: scraped.imageUrl || null,
      servings: scraped.servings || 4,
      prepTime: scraped.prepTime || null,
      cookTime: scraped.cookTime || null,
      totalTime: scraped.totalTime || null,
      sourceUrl: url,
      source: scraped.source,
      category: scraped.category || null,
      cuisine: scraped.cuisine || null,
      difficulty: 'medium',
    })
    .returning({ id: schema.recipes.id });

  const ingRows = scraped.ingredients
    .filter((i) => i.name)
    .map((ing, i) => ({
      recipeId,
      name: ing.name,
      amount: ing.amount,
      unit: ing.unit,
      sortOrder: i + 1,
    }));
  if (ingRows.length > 0) await db.insert(schema.recipeIngredients).values(ingRows);

  const stepRows = scraped.steps.map((step) => ({
    recipeId,
    stepNumber: step.stepNumber,
    instruction: step.instruction,
    imageUrl: step.imageUrl || null,
  }));
  if (stepRows.length > 0) await db.insert(schema.recipeSteps).values(stepRows);

  return { id: recipeId, title: scraped.title };
}

/**
 * Public entry: kick off a background section-import job.
 */
export function startSectionImport(opts: {
  url: string;
  limit: number;
  delayMs: number;
}): ImportJob {
  const job: ImportJob = {
    jobId: nanoid(10),
    url: opts.url,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    done: false,
    cancelled: false,
    phase: 'discovering',
    total: 0,
    processed: 0,
    success: 0,
    skipped: 0,
    failed: 0,
    currentTitle: '',
    currentUrl: '',
    errors: [],
    recentlyAdded: [],
    delayMs: opts.delayMs,
    limit: opts.limit,
  };
  jobs.set(job.jobId, job);

  // Detach: don't await
  void runJob(job);
  return job;
}

async function runJob(job: ImportJob): Promise<void> {
  try {
    job.phase = 'discovering';
    const links = await discoverAllRecipeLinks(job.url, job.limit);
    job.total = links.length;
    job.phase = 'importing';

    if (links.length === 0) {
      job.errors.push({
        url: job.url,
        error: 'На странице раздела не найдено ни одной ссылки на рецепт',
      });
    }

    for (const link of links) {
      if (job.cancelled) break;
      job.currentUrl = link;
      job.currentTitle = '';

      try {
        if (await alreadyImported(link)) {
          job.skipped++;
          job.processed++;
          continue;
        }
        const result = await importOne(link);
        job.currentTitle = result.title;
        job.success++;
        job.recentlyAdded.push({ id: result.id, title: result.title, url: link });
        // Cap memory
        if (job.recentlyAdded.length > 50) job.recentlyAdded.shift();
      } catch (err: any) {
        job.failed++;
        job.errors.push({ url: link, error: String(err?.message || err) });
        // Cap errors list
        if (job.errors.length > 200) job.errors.shift();
      } finally {
        job.processed++;
      }

      if (job.delayMs > 0 && !job.cancelled) {
        await delay(job.delayMs);
      }
    }

    job.phase = job.cancelled ? 'failed' : 'done';
  } catch (err: any) {
    job.phase = 'failed';
    job.errors.push({ url: job.url, error: String(err?.message || err) });
  } finally {
    job.done = true;
    job.finishedAt = new Date().toISOString();
    // Schedule cleanup: remove finished job after 30 minutes so memory
    // doesn't grow forever.
    setTimeout(() => jobs.delete(job.jobId), 30 * 60 * 1000).unref?.();
  }
}

export function getSectionImportStatus(jobId: string): ImportJob | null {
  return jobs.get(jobId) ?? null;
}

export function listActiveImportJobs(): ImportJob[] {
  return Array.from(jobs.values());
}
