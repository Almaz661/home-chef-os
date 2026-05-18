import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';

/**
 * Universal recipe scraper. Tries (in order):
 *   1. Schema.org JSON-LD       — works for ~80% of modern recipe sites
 *   2. Schema.org microdata     — works for some older / Russian sites
 *   3. Site-specific selectors  — handles menunedeli.ru, povar.ru, eda.ru,
 *      iamcook.ru, gotovim.ru and other popular RU sites that don't expose
 *      structured data
 *   4. Heuristic generic        — picks up h1 title + og:image, no recipe body
 *
 * Returns whichever stage produced the most complete result (i.e. has at least
 * a title + something to cook with).
 */

export interface ScrapedRecipe {
  title: string;
  description?: string;
  imageUrl?: string;
  ingredients: ScrapedIngredient[];
  steps: ScrapedStep[];
  servings?: number;
  prepTime?: number;
  cookTime?: number;
  totalTime?: number;
  category?: string;
  cuisine?: string;
  source: string;
  /** Strategy that produced this result — useful for logs/diagnostics. */
  strategy: 'json-ld' | 'microdata' | 'site-specific' | 'generic';
}

export interface ScrapedIngredient {
  name: string;
  amount: number | null;
  unit: string | null;
}

export interface ScrapedStep {
  stepNumber: number;
  instruction: string;
  imageUrl?: string;
}

const FETCH_TIMEOUT_MS = 15000;
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Fetch a URL and return decoded HTML.
 * Handles Windows-1251 (common on older Russian sites).
 */
async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ru,en;q=0.7',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  // Detect encoding from Content-Type or <meta charset>
  const contentType = res.headers.get('content-type') || '';
  const charsetMatch = contentType.match(/charset=([^;]+)/i);
  let charset = charsetMatch?.[1].toLowerCase().trim() || 'utf-8';

  const buffer = Buffer.from(await res.arrayBuffer());

  // If header says utf-8 but body has <meta charset=windows-1251>, prefer that
  const sniff = buffer.subarray(0, 1024).toString('latin1');
  const metaMatch = sniff.match(/<meta[^>]+charset[=:\s"']+([\w-]+)/i);
  if (metaMatch) {
    const metaCharset = metaMatch[1].toLowerCase();
    if (metaCharset && metaCharset !== charset) {
      charset = metaCharset;
    }
  }

  if (charset === 'utf-8' || charset === 'utf8') {
    return buffer.toString('utf-8');
  }
  if (iconv.encodingExists(charset)) {
    return iconv.decode(buffer, charset);
  }
  return buffer.toString('utf-8');
}

/** Parse ISO-8601 duration ("PT1H30M") to minutes. */
function parseIsoDuration(d?: string | null): number | undefined {
  if (!d) return undefined;
  const m = d.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m) {
    // Maybe a plain "30" or "30 min" string
    const n = String(d).match(/\d+/);
    return n ? parseInt(n[0], 10) : undefined;
  }
  return (parseInt(m[1] || '0', 10) * 60) + parseInt(m[2] || '0', 10) || undefined;
}

/** Extract leading "5 шт", "1.5 кг", "200 г" from "5 шт яблок" etc. */
function splitIngredient(raw: string): ScrapedIngredient {
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  if (!cleaned) return { name: '', amount: null, unit: null };

  // Try "QTY UNIT NAME" pattern
  const m = cleaned.match(
    /^([\d.,/½⅓⅔¼¾⅛⅜⅝⅞]+)\s*(г|гр|кг|мл|л|шт|ст\.?\s*л\.?|ч\.?\s*л\.?|стак(?:ан)?|щепот(?:ка|ки)|зубч(?:ик|ика|иков)?|лист(?:ьев|а|ьев)?|пакет(?:ик|а|иков)?|долька|кусок|ломтик|пуч(?:ок|ка)|стручок|см|по\s+вкусу)?\s+(.+)$/i,
  );
  if (m) {
    let amountStr = m[1];
    // Replace unicode fractions
    amountStr = amountStr
      .replace('½', '0.5')
      .replace('⅓', '0.33')
      .replace('⅔', '0.67')
      .replace('¼', '0.25')
      .replace('¾', '0.75')
      .replace('⅛', '0.125')
      .replace('⅜', '0.375')
      .replace('⅝', '0.625')
      .replace('⅞', '0.875')
      .replace(',', '.');
    // x/y -> decimal
    if (amountStr.includes('/')) {
      const [a, b] = amountStr.split('/').map((s) => parseFloat(s));
      if (b) amountStr = String(a / b);
    }
    const amount = parseFloat(amountStr);
    return {
      name: m[3].trim(),
      amount: isNaN(amount) ? null : amount,
      unit: (m[2] || '').toLowerCase().trim() || null,
    };
  }

  return { name: cleaned, amount: null, unit: null };
}

function absoluteUrl(href: string | undefined, base: string): string | undefined {
  if (!href) return undefined;
  try {
    return new URL(href, base).toString();
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Strategy 1: Schema.org JSON-LD
// ---------------------------------------------------------------------------

function tryJsonLd($: cheerio.CheerioAPI, url: string): ScrapedRecipe | null {
  const scripts = $('script[type="application/ld+json"]').toArray();
  for (const el of scripts) {
    const text = $(el).contents().text();
    if (!text) continue;
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      continue;
    }
    const recipe = findRecipeNode(parsed);
    if (!recipe) continue;
    return jsonLdToScraped(recipe, url);
  }
  return null;
}

function findRecipeNode(node: any): any {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findRecipeNode(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof node !== 'object') return null;

  const types = node['@type'];
  if (types === 'Recipe' || (Array.isArray(types) && types.includes('Recipe'))) {
    return node;
  }
  if (node['@graph']) return findRecipeNode(node['@graph']);
  return null;
}

function jsonLdToScraped(r: any, baseUrl: string): ScrapedRecipe {
  const ingredients: ScrapedIngredient[] = (r.recipeIngredient || r.ingredients || [])
    .filter((s: any) => typeof s === 'string' && s.trim())
    .map((s: string) => splitIngredient(s));

  const rawSteps = r.recipeInstructions || [];
  const steps: ScrapedStep[] = [];
  flattenInstructions(rawSteps, steps);

  let imageUrl: string | undefined;
  const img = r.image;
  if (typeof img === 'string') imageUrl = img;
  else if (Array.isArray(img)) imageUrl = typeof img[0] === 'string' ? img[0] : img[0]?.url;
  else if (img?.url) imageUrl = img.url;

  let servings: number | undefined;
  const yieldVal = r.recipeYield;
  if (yieldVal) {
    const yieldStr = Array.isArray(yieldVal) ? yieldVal[0] : yieldVal;
    const m = String(yieldStr).match(/(\d+)/);
    if (m) servings = parseInt(m[1], 10);
  }

  const prepTime = parseIsoDuration(r.prepTime);
  const cookTime = parseIsoDuration(r.cookTime);
  const totalTime = parseIsoDuration(r.totalTime) || ((prepTime || 0) + (cookTime || 0)) || undefined;

  return {
    title: r.name || 'Импортированный рецепт',
    description: r.description || undefined,
    imageUrl: absoluteUrl(imageUrl, baseUrl),
    ingredients,
    steps,
    servings: servings || undefined,
    prepTime,
    cookTime,
    totalTime,
    category: Array.isArray(r.recipeCategory) ? r.recipeCategory[0] : r.recipeCategory,
    cuisine: Array.isArray(r.recipeCuisine) ? r.recipeCuisine[0] : r.recipeCuisine,
    source: new URL(baseUrl).hostname,
    strategy: 'json-ld',
  };
}

function flattenInstructions(input: any, out: ScrapedStep[]) {
  if (!input) return;
  if (typeof input === 'string') {
    out.push({ stepNumber: out.length + 1, instruction: input.trim() });
    return;
  }
  if (Array.isArray(input)) {
    for (const item of input) flattenInstructions(item, out);
    return;
  }
  if (typeof input === 'object') {
    const type = input['@type'];
    if (type === 'HowToSection' && input.itemListElement) {
      flattenInstructions(input.itemListElement, out);
      return;
    }
    if (type === 'HowToStep' || input.text || input.name) {
      const text = (input.text || input.name || '').toString().trim();
      if (text) {
        out.push({
          stepNumber: out.length + 1,
          instruction: text,
          imageUrl: typeof input.image === 'string' ? input.image : undefined,
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Strategy 2: Microdata (itemtype="...Recipe")
// ---------------------------------------------------------------------------

function tryMicrodata($: cheerio.CheerioAPI, url: string): ScrapedRecipe | null {
  const root = $('[itemtype*="schema.org/Recipe"]').first();
  if (!root.length) return null;

  const get = (prop: string) =>
    root.find(`[itemprop="${prop}"]`).first().attr('content') ||
    root.find(`[itemprop="${prop}"]`).first().text().trim() ||
    undefined;

  const getAll = (prop: string) =>
    root
      .find(`[itemprop="${prop}"]`)
      .map((_, el) => $(el).attr('content') || $(el).text().trim())
      .get()
      .filter((s) => s);

  const title = get('name');
  if (!title) return null;

  const ingredients = (
    getAll('recipeIngredient').length
      ? getAll('recipeIngredient')
      : getAll('ingredients')
  ).map(splitIngredient);

  const stepsRaw = getAll('recipeInstructions');
  const steps: ScrapedStep[] = stepsRaw
    .map((s, i) => ({ stepNumber: i + 1, instruction: s }))
    .filter((s) => s.instruction);

  const imgEl = root.find('[itemprop="image"]').first();
  const imageUrl =
    imgEl.attr('src') || imgEl.attr('content') || imgEl.attr('href') || undefined;

  const servingsStr = get('recipeYield');
  const servings = servingsStr?.match(/\d+/)?.[0];

  return {
    title,
    description: get('description'),
    imageUrl: absoluteUrl(imageUrl, url),
    ingredients,
    steps,
    servings: servings ? parseInt(servings, 10) : undefined,
    prepTime: parseIsoDuration(get('prepTime')),
    cookTime: parseIsoDuration(get('cookTime')),
    totalTime: parseIsoDuration(get('totalTime')),
    category: get('recipeCategory'),
    cuisine: get('recipeCuisine'),
    source: new URL(url).hostname,
    strategy: 'microdata',
  };
}

// ---------------------------------------------------------------------------
// Strategy 3: Site-specific selectors
// ---------------------------------------------------------------------------

interface SiteSelectors {
  match: (host: string) => boolean;
  title: string | string[];
  description?: string | string[];
  image?: string | string[];
  ingredients: string | string[];
  steps: string | string[];
  servings?: string | string[];
}

const SITE_RULES: SiteSelectors[] = [
  {
    // menunedeli.ru — main user-requested site.
    // Their HTML uses a custom structure with .ingredients-list and
    // ordered .recipe-step or .step blocks. Hand-curated to match the
    // typical layout (we err on the side of broad selectors).
    match: (h) => h.includes('menunedeli.ru'),
    title: ['h1.recipe-title', '.recipe-title', 'h1.entry-title', 'h1'],
    description: ['.recipe-description', '.recipe-intro p', '.entry-content > p:first-of-type'],
    image: ['.recipe-photo img', '.recipe-image img', '.entry-content img:first-of-type'],
    ingredients: [
      '.ingredients-list li',
      '.recipe-ingredients li',
      'ul.ingredients li',
      '[class*="ingredient"] li',
    ],
    steps: [
      '.recipe-steps li',
      '.recipe-steps .step',
      'ol.steps li',
      '.cooking-steps li',
      '[class*="step"] p',
    ],
    servings: ['.recipe-servings', '[class*="serving"]', '[class*="portion"]'],
  },
  {
    // povar.ru
    match: (h) => h.includes('povar.ru'),
    title: ['h1[itemprop="name"]', 'h1.detailed'],
    description: ['[itemprop="description"]', '.detailed_full'],
    image: ['img[itemprop="image"]', '.bigImgBox img'],
    ingredients: ['.detailed_ingredients li', '[itemprop="recipeIngredient"]'],
    steps: ['.detailed_step_description', '[itemprop="recipeInstructions"] li'],
    servings: ['[itemprop="recipeYield"]'],
  },
  {
    // eda.ru
    match: (h) => h.includes('eda.ru'),
    title: ['h1', '.emotion-1qxl1cm'],
    image: ['picture img', '.emotion-1mb6f0g img'],
    ingredients: ['[itemprop="recipeIngredient"]', '.emotion-12ynd5j'],
    steps: ['[itemprop="recipeInstructions"]', '.emotion-1ho4nun'],
  },
  {
    // iamcook.ru
    match: (h) => h.includes('iamcook.ru'),
    title: ['h1[itemprop="name"]', 'h1'],
    image: ['img[itemprop="image"]', '.bigfotoarea img'],
    ingredients: ['.ingredient', '[itemprop="recipeIngredient"]'],
    steps: ['.step-text', '[itemprop="recipeInstructions"] li'],
  },
];

function pickFirst($: cheerio.CheerioAPI, selectors: string | string[] | undefined): string | undefined {
  if (!selectors) return undefined;
  const list = Array.isArray(selectors) ? selectors : [selectors];
  for (const sel of list) {
    const el = $(sel).first();
    if (el.length) {
      const txt = el.text().trim();
      if (txt) return txt;
    }
  }
  return undefined;
}

function pickFirstImage(
  $: cheerio.CheerioAPI,
  selectors: string | string[] | undefined,
  url: string,
): string | undefined {
  if (!selectors) return undefined;
  const list = Array.isArray(selectors) ? selectors : [selectors];
  for (const sel of list) {
    const el = $(sel).first();
    if (el.length) {
      const src = el.attr('src') || el.attr('data-src') || el.attr('data-original');
      if (src) return absoluteUrl(src, url);
    }
  }
  return undefined;
}

function pickAll($: cheerio.CheerioAPI, selectors: string | string[]): string[] {
  const list = Array.isArray(selectors) ? selectors : [selectors];
  for (const sel of list) {
    const items = $(sel)
      .map((_, el) => $(el).text().replace(/\s+/g, ' ').trim())
      .get()
      .filter((s) => s);
    if (items.length >= 2) return items;
  }
  return [];
}

function trySiteSpecific($: cheerio.CheerioAPI, url: string): ScrapedRecipe | null {
  const host = new URL(url).hostname;
  const rule = SITE_RULES.find((r) => r.match(host));
  if (!rule) return null;

  const title = pickFirst($, rule.title);
  if (!title) return null;

  const ingredientLines = pickAll($, rule.ingredients);
  const stepLines = pickAll($, rule.steps);

  if (ingredientLines.length === 0 && stepLines.length === 0) return null;

  return {
    title,
    description: pickFirst($, rule.description),
    imageUrl: pickFirstImage($, rule.image, url) || pickOgImage($, url),
    ingredients: ingredientLines.map(splitIngredient),
    steps: stepLines.map((s, i) => ({ stepNumber: i + 1, instruction: s })),
    servings: parseServings(pickFirst($, rule.servings)),
    source: host,
    strategy: 'site-specific',
  };
}

function pickOgImage($: cheerio.CheerioAPI, url: string): string | undefined {
  const og = $('meta[property="og:image"]').attr('content');
  return absoluteUrl(og, url);
}

function parseServings(s?: string): number | undefined {
  if (!s) return undefined;
  const m = s.match(/\d+/);
  return m ? parseInt(m[0], 10) : undefined;
}

// ---------------------------------------------------------------------------
// Strategy 4: Generic fallback (h1 + og:image, no recipe body)
// ---------------------------------------------------------------------------

function tryGeneric($: cheerio.CheerioAPI, url: string): ScrapedRecipe {
  const title =
    $('h1').first().text().trim() ||
    $('meta[property="og:title"]').attr('content') ||
    'Импортированный рецепт';

  return {
    title,
    description:
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      undefined,
    imageUrl: pickOgImage($, url),
    ingredients: [],
    steps: [],
    source: new URL(url).hostname,
    strategy: 'generic',
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** How "complete" a scraped recipe is — used to pick the best strategy. */
function score(r: ScrapedRecipe | null): number {
  if (!r) return -1;
  return (
    (r.title ? 10 : 0) +
    (r.imageUrl ? 5 : 0) +
    r.ingredients.length * 2 +
    r.steps.length * 2 +
    (r.description ? 1 : 0)
  );
}

export async function scrapeRecipe(url: string): Promise<ScrapedRecipe> {
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  // Try every strategy and pick the best result. This way menunedeli.ru
  // wins via 'site-specific' even if there's a (broken) JSON-LD on the
  // page, and a clean modern site wins via 'json-ld' even if our generic
  // selectors would partially match.
  const candidates: (ScrapedRecipe | null)[] = [
    tryJsonLd($, url),
    tryMicrodata($, url),
    trySiteSpecific($, url),
  ];

  let best: ScrapedRecipe | null = null;
  for (const c of candidates) {
    if (score(c) > score(best)) best = c;
  }

  // Need at least title + (ingredients OR steps) to be useful
  if (best && (best.ingredients.length > 0 || best.steps.length > 0)) {
    // Backfill image from og:image if we don't have one
    if (!best.imageUrl) best.imageUrl = pickOgImage($, url);
    return best;
  }

  // Last resort: at least give the user a stub with the title and og:image
  // so they can add ingredients/steps manually.
  const generic = tryGeneric($, url);
  if (generic.title) return generic;

  throw new Error(
    'Не удалось распознать рецепт на странице. Возможно, сайт защищён от ботов или структура слишком нестандартная.',
  );
}
