import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';

/**
 * Universal recipe scraper. Tries multiple strategies and picks the best
 * result by score. Sites like menunedeli.ru bury the recipe inside
 * <div itemprop="recipeInstructions"> blocks that also contain inline images,
 * cross-promo links and authors' style overrides — we strip those out.
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

  const contentType = res.headers.get('content-type') || '';
  const charsetMatch = contentType.match(/charset=([^;]+)/i);
  let charset = charsetMatch?.[1].toLowerCase().trim() || 'utf-8';

  const buffer = Buffer.from(await res.arrayBuffer());

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

function parseIsoDuration(d?: string | null): number | undefined {
  if (!d) return undefined;
  const m = d.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m) {
    const n = String(d).match(/\d+/);
    return n ? parseInt(n[0], 10) : undefined;
  }
  return parseInt(m[1] || '0', 10) * 60 + parseInt(m[2] || '0', 10) || undefined;
}

/**
 * Aggressively clean up text extracted from messy recipe HTML. Removes:
 *   - inline CSS leftovers ("section.inline-post-link { ... }")
 *   - @media query blocks
 *   - the author's promotional cross-links ("Смотрите мастер-класс...",
 *     "👉🏻ЗДЕСЬ", "📌Другие рецепты...", "🎃 Что приготовить из тыквы")
 *   - "Шаг N" headers that may slip into the next step's text
 *   - URL fragments
 *   - excessive whitespace
 */
function cleanText(raw: string): string {
  if (!raw) return '';
  let t = raw;

  // CSS rule blocks: ".foo { color: red; ... }" — drop them
  t = t.replace(/[.#]?[\w\-:>\s,()*+~^$="']+\s*\{[^}]*\}/g, ' ');
  t = t.replace(/@media[^{]*\{[\s\S]*?\}\s*\}/g, ' ');
  t = t.replace(/\}/g, ' ');

  // Promotional / cross-link breadcrumbs the editor likes to insert
  t = t.replace(/Смотрите\s+мастер[-\s]класс[\s\S]*?(?=Шаг|$)/gi, ' ');
  t = t.replace(/Вам\s+может\s+быть\s+интересно:?[\s\S]*?(?=Шаг|$)/gi, ' ');
  t = t.replace(/📌[\s\S]*?(?=Шаг|$)/g, ' ');
  t = t.replace(/👉🏻?\s*ЗДЕСЬ/gi, ' ');
  t = t.replace(/🎃[^.!?\n]*[.!?\n]/g, ' ');
  t = t.replace(/Другие\s+рецепты[^.!?]*(?:здесь|ЗДЕСЬ|тут)[^.!?]*[.!?]?/gi, ' ');
  t = t.replace(/Подписывайтесь[\s\S]*?(?=Шаг|$)/gi, ' ');

  // Wordpress shortcodes that escaped through
  t = t.replace(/\[\/?[^\]]+\]/g, ' ');

  // Strip absolute http(s) URLs that ended up in plain text
  t = t.replace(/https?:\/\/\S+/g, ' ');

  // Collapse whitespace
  t = t.replace(/[\t\n\r]+/g, ' ');
  t = t.replace(/\s{2,}/g, ' ').trim();

  // Drop a trailing "Шаг N" if it ended up at the end of a step
  t = t.replace(/\s*Шаг\s+\d+\s*$/i, '').trim();

  return t;
}

function splitIngredient(raw: string): ScrapedIngredient {
  const cleaned = cleanText(raw);
  if (!cleaned) return { name: '', amount: null, unit: null };

  const m = cleaned.match(
    /^([\d.,/½⅓⅔¼¾⅛⅜⅝⅞]+)\s*(г|гр|кг|мл|л|шт|ст\.?\s*л\.?|ч\.?\s*л\.?|стак(?:ан)?|щепот(?:ка|ки)|зубч(?:ик|ика|иков)?|лист(?:ьев|а|ьев)?|пакет(?:ик|а|иков)?|долька|кусок|ломтик|пуч(?:ок|ка)|стручок|см|по\s+вкусу)?\s+(.+)$/i,
  );
  if (m) {
    let amountStr = m[1];
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
// Helpers shared between strategies
// ---------------------------------------------------------------------------

const STEP_NOISE_SELECTORS =
  'img, picture, source, style, script, iframe, noscript, ' +
  '.inline-post-link, [class*="banner"], [class*="ads"], ' +
  '[class*="related"], [class*="cross"], a[href*="masterclass"], ' +
  'figure, figcaption';

/**
 * Get the cleaned plain-text contents of an element, dropping inline images,
 * styles, scripts and cross-promo blocks.
 */
function cleanInner($: cheerio.CheerioAPI, el: any): string {
  const $el = $(el).clone();
  $el.find(STEP_NOISE_SELECTORS).remove();
  return cleanText($el.text());
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

  const steps: ScrapedStep[] = [];
  flattenInstructions(r.recipeInstructions || [], steps);

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
  const totalTime =
    parseIsoDuration(r.totalTime) || (prepTime || 0) + (cookTime || 0) || undefined;

  return {
    title: cleanText(r.name) || 'Импортированный рецепт',
    description: r.description ? cleanText(r.description) : undefined,
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
    const txt = cleanText(input);
    if (txt) out.push({ stepNumber: out.length + 1, instruction: txt });
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
      const text = cleanText((input.text || input.name || '').toString());
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
// Strategy 2: Schema.org microdata (itemtype="...Recipe" + itemprop)
// ---------------------------------------------------------------------------

function tryMicrodata($: cheerio.CheerioAPI, url: string): ScrapedRecipe | null {
  const root = $('[itemtype*="schema.org/Recipe"]').first();
  if (!root.length) return null;

  const get = (prop: string) => {
    const el = root.find(`[itemprop="${prop}"]`).first();
    if (!el.length) return undefined;
    const content = el.attr('content')?.trim();
    if (content) return cleanText(content);
    return cleanInner($, el[0]);
  };

  const getAll = (prop: string) =>
    root
      .find(`[itemprop="${prop}"]`)
      .map((_, el) => {
        const $el = $(el);
        const content = $el.attr('content')?.trim();
        if (content) return cleanText(content);
        return cleanInner($, el);
      })
      .get()
      .filter((s) => s);

  const title = get('name');
  if (!title) return null;

  const ingredientLines = getAll('recipeIngredient').length
    ? getAll('recipeIngredient')
    : getAll('ingredients');
  const ingredients = ingredientLines.map(splitIngredient);

  const stepLines = getAll('recipeInstructions');
  const steps: ScrapedStep[] = stepLines
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
    // menunedeli.ru — uses Schema.org microdata. Strategy 2 should win here,
    // but we keep these as a fallback in case the markup changes.
    match: (h) => h.includes('menunedeli.ru'),
    title: ['h1[itemprop="name"]', 'h1.entry-title', 'h1'],
    description: ['[itemprop="description"]', '.recipe-description'],
    image: [
      'img[itemprop="image"]',
      '.recipe-photo img',
      'meta[property="og:image"]',
    ],
    ingredients: [
      '[itemprop="recipeIngredient"]',
      '.ingredients-list li',
      '.recipe-ingredients li',
    ],
    steps: [
      '[itemprop="recipeInstructions"]',
      '.recipe-step',
      '.cooking-step',
    ],
    servings: ['[itemprop="recipeYield"]', '.recipe-servings'],
  },
  {
    match: (h) => h.includes('povar.ru'),
    title: ['h1[itemprop="name"]', 'h1.detailed'],
    description: ['[itemprop="description"]', '.detailed_full'],
    image: ['img[itemprop="image"]', '.bigImgBox img'],
    ingredients: ['.detailed_ingredients li', '[itemprop="recipeIngredient"]'],
    steps: ['.detailed_step_description', '[itemprop="recipeInstructions"] li'],
    servings: ['[itemprop="recipeYield"]'],
  },
  {
    match: (h) => h.includes('eda.ru'),
    title: ['h1', '.emotion-1qxl1cm'],
    image: ['picture img', '.emotion-1mb6f0g img'],
    ingredients: ['[itemprop="recipeIngredient"]', '.emotion-12ynd5j'],
    steps: ['[itemprop="recipeInstructions"]', '.emotion-1ho4nun'],
  },
  {
    match: (h) => h.includes('iamcook.ru'),
    title: ['h1[itemprop="name"]', 'h1'],
    image: ['img[itemprop="image"]', '.bigfotoarea img'],
    ingredients: ['.ingredient', '[itemprop="recipeIngredient"]'],
    steps: ['.step-text', '[itemprop="recipeInstructions"] li'],
  },
];

function pickFirst(
  $: cheerio.CheerioAPI,
  selectors: string | string[] | undefined,
): string | undefined {
  if (!selectors) return undefined;
  const list = Array.isArray(selectors) ? selectors : [selectors];
  for (const sel of list) {
    const el = $(sel).first();
    if (el.length) {
      const txt = cleanInner($, el[0]);
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
      const src =
        el.attr('content') ||
        el.attr('src') ||
        el.attr('data-src') ||
        el.attr('data-original');
      if (src) return absoluteUrl(src, url);
    }
  }
  return undefined;
}

function pickAll($: cheerio.CheerioAPI, selectors: string | string[]): string[] {
  const list = Array.isArray(selectors) ? selectors : [selectors];
  for (const sel of list) {
    const items = $(sel)
      .map((_, el) => cleanInner($, el))
      .get()
      .filter((s) => s.length > 2);
    if (items.length >= 1) return items;
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
// Strategy 4: Generic fallback
// ---------------------------------------------------------------------------

function tryGeneric($: cheerio.CheerioAPI, url: string): ScrapedRecipe {
  const title =
    cleanText($('h1').first().text()) ||
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

/**
 * Score a candidate. We *penalise* very long step text — that's almost always
 * a sign that the cleaning regexes didn't catch some block of HTML soup, and
 * we'd rather pick a strategy that returned shorter, focused steps.
 */
function score(r: ScrapedRecipe | null): number {
  if (!r) return -1;
  const stepPenalty = r.steps.reduce(
    (acc, s) => acc + (s.instruction.length > 800 ? -3 : 0),
    0,
  );
  return (
    (r.title ? 10 : 0) +
    (r.imageUrl ? 5 : 0) +
    r.ingredients.length * 2 +
    r.steps.length * 2 +
    (r.description ? 1 : 0) +
    stepPenalty
  );
}

export async function scrapeRecipe(url: string): Promise<ScrapedRecipe> {
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const candidates: (ScrapedRecipe | null)[] = [
    tryJsonLd($, url),
    tryMicrodata($, url),
    trySiteSpecific($, url),
  ];

  let best: ScrapedRecipe | null = null;
  for (const c of candidates) {
    if (score(c) > score(best)) best = c;
  }

  if (best && (best.ingredients.length > 0 || best.steps.length > 0)) {
    if (!best.imageUrl) best.imageUrl = pickOgImage($, url);
    return best;
  }

  const generic = tryGeneric($, url);
  if (generic.title) return generic;

  throw new Error(
    'Не удалось распознать рецепт на странице. Возможно, сайт защищён от ботов или структура слишком нестандартная.',
  );
}
