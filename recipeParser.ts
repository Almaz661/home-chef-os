/**
 * Recipe Parser — extracts recipe data from any cooking website.
 * Strategy:
 *   1. Fetch HTML
 *   2. Try Schema.org JSON-LD (covers ~80% of cooking sites)
 *   3. Fall back to LLM extraction from page text
 *
 * Image extraction strategy (applied after parsing):
 *   1. Schema.org image field (string, array, or object with url)
 *   2. og:image meta tag
 *   3. twitter:image meta tag
 *   4. First large <img> in the page body (heuristic: src contains "recipe" or large dimensions)
 *
 * Also handles image downloading and S3 upload.
 */
import * as cheerio from "cheerio";
import { storagePut } from "./storage";
import { invokeLLM } from "./_core/llm";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ParsedIngredient {
  name: string;
  amount?: number;
  unit?: string;
}

export interface ParsedStep {
  stepNumber: number;
  instruction: string;
  imageUrl?: string;
}

export interface ParsedRecipe {
  title: string;
  description?: string;
  imageUrl?: string;
  servings?: number;
  prepTime?: number;
  cookTime?: number;
  totalTime?: number;
  category?: string;
  cuisine?: string;
  difficulty?: "easy" | "medium" | "hard";
  calories?: number;
  sourceUrl: string;
  ingredients: ParsedIngredient[];
  steps: ParsedStep[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Parse ISO 8601 duration (PT30M, PT1H30M, etc.) to minutes */
function parseIsoDuration(iso?: string): number | undefined {
  if (!iso) return undefined;
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
  if (!match) return undefined;
  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  return hours * 60 + minutes;
}

/** Parse servings string like "4 порции" → 4 */
function parseServings(s?: string): number | undefined {
  if (!s) return undefined;
  const m = s.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : undefined;
}

/** Parse calories from string or number */
function parseCalories(c?: string | number): number | undefined {
  if (c === undefined || c === null) return undefined;
  if (typeof c === "number") return c;
  const m = String(c).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : undefined;
}

/** Safely parse a numeric amount from a string, handling complex cases like "2 ст.л. +3 ст.л." */
function safeParseAmount(raw: string): number | undefined {
  if (!raw) return undefined;
  // Remove non-numeric chars except digits, dots, commas
  const firstNum = raw.match(/(\d+[\.,]?\d*)/);
  if (!firstNum) return undefined;
  const val = parseFloat(firstNum[1].replace(",", "."));
  return isFinite(val) ? val : undefined;
}

/** Parse ingredient string like "Мука – 500 г" into structured data */
function parseIngredientString(raw: string): ParsedIngredient {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  // Try pattern: "Name – Amount Unit" or "Name - Amount Unit"
  const dashMatch = cleaned.match(/^(.+?)\s*[–—-]\s*(.+)$/);
  if (dashMatch) {
    const nameStr = dashMatch[1].trim();
    const rest = dashMatch[2].trim();
    // Try to extract numeric amount from the rest
    const numMatch = rest.match(/^(\d+[\.,]?\d*)\s*(.*)$/);
    if (numMatch) {
      return {
        name: nameStr,
        amount: safeParseAmount(numMatch[1]),
        unit: numMatch[2].trim() || undefined,
      };
    }
    // "по вкусу" or complex text
    return { name: nameStr, unit: rest || undefined };
  }
  // Try pattern: "Amount Unit Name"
  const prefixMatch = cleaned.match(/^(\d+[\.,]?\d*)\s*(\S+)\s+(.+)$/);
  if (prefixMatch) {
    return {
      name: prefixMatch[3].trim(),
      amount: safeParseAmount(prefixMatch[1]),
      unit: prefixMatch[2].trim(),
    };
  }
  // "по вкусу" pattern
  const tasteMatch = cleaned.match(/^(.+?)\s*[–—-]?\s*(по вкусу.*)$/i);
  if (tasteMatch) {
    return { name: tasteMatch[1].trim(), unit: tasteMatch[2].trim() };
  }
  return { name: cleaned };
}

/** Guess difficulty from total time */
function guessDifficulty(totalMin?: number): "easy" | "medium" | "hard" | undefined {
  if (!totalMin) return undefined;
  if (totalMin <= 30) return "easy";
  if (totalMin <= 60) return "medium";
  return "hard";
}

/** Download an image and upload to S3, returning the storage URL */
export async function downloadAndStoreImage(
  imageUrl: string,
  keyPrefix: string
): Promise<string | undefined> {
  try {
    const resp = await fetch(imageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        "Referer": new URL(imageUrl).origin,
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) {
      console.warn(`[RecipeParser] Image download failed ${resp.status}: ${imageUrl}`);
      return undefined;
    }
    const contentType = resp.headers.get("content-type") || "image/jpeg";
    // Skip non-image responses (e.g., HTML error pages)
    if (!contentType.startsWith("image/")) {
      console.warn(`[RecipeParser] Non-image content-type ${contentType}: ${imageUrl}`);
      return undefined;
    }
    const buffer = Buffer.from(await resp.arrayBuffer());
    // Skip suspiciously small files (likely tracking pixels or errors)
    if (buffer.length < 1024) {
      console.warn(`[RecipeParser] Image too small (${buffer.length} bytes): ${imageUrl}`);
      return undefined;
    }
    const ext = contentType.includes("png") ? ".png" : contentType.includes("webp") ? ".webp" : ".jpg";
    const { url } = await storagePut(`recipes/${keyPrefix}${ext}`, buffer, contentType);
    return url;
  } catch (e) {
    console.warn(`[RecipeParser] Failed to download image: ${imageUrl}`, e);
    return undefined;
  }
}

/**
 * Extract the best image URL from a parsed page using multiple strategies:
 * 1. Schema.org image field (handles string, array, object with url/contentUrl)
 * 2. og:image meta tag
 * 3. twitter:image meta tag
 * 4. First large <img> in the page (heuristic)
 */
function extractImageUrl(
  schemaImage: any,
  $: cheerio.CheerioAPI,
  baseUrl: string
): string | undefined {
  // Strategy 1: Schema.org image field
  if (schemaImage) {
    let candidate: string | undefined;
    if (typeof schemaImage === "string") {
      candidate = schemaImage;
    } else if (Array.isArray(schemaImage)) {
      // Array of strings or objects — pick the first valid one
      for (const item of schemaImage) {
        if (typeof item === "string") { candidate = item; break; }
        if (item?.url) { candidate = item.url; break; }
        if (item?.contentUrl) { candidate = item.contentUrl; break; }
      }
    } else if (typeof schemaImage === "object") {
      candidate = schemaImage.url || schemaImage.contentUrl || undefined;
    }
    if (candidate && candidate.startsWith("http")) {
      console.log(`[RecipeParser] Image from Schema.org: ${candidate}`);
      return candidate;
    }
  }

  // Strategy 2: og:image
  const ogImage = $('meta[property="og:image"]').attr("content")
    || $('meta[name="og:image"]').attr("content");
  if (ogImage && ogImage.startsWith("http")) {
    console.log(`[RecipeParser] Image from og:image: ${ogImage}`);
    return ogImage;
  }

  // Strategy 3: twitter:image
  const twitterImage = $('meta[name="twitter:image"]').attr("content")
    || $('meta[property="twitter:image"]').attr("content");
  if (twitterImage && twitterImage.startsWith("http")) {
    console.log(`[RecipeParser] Image from twitter:image: ${twitterImage}`);
    return twitterImage;
  }

  // Strategy 4: First large <img> in the article/main content area
  const contentSelectors = [
    "article img",
    "main img",
    ".recipe img",
    ".recipe-image img",
    '[class*="recipe"] img',
    '[class*="hero"] img',
    '[class*="featured"] img',
    ".post-content img",
    ".entry-content img",
    ".content img",
  ];

  for (const selector of contentSelectors) {
    const imgs = $(selector);
    for (let i = 0; i < imgs.length; i++) {
      const img = $(imgs[i]);
      const src = img.attr("src") || img.attr("data-src") || img.attr("data-lazy-src") || img.attr("data-original");
      if (!src) continue;
      // Resolve relative URLs
      const absoluteSrc = src.startsWith("http") ? src : new URL(src, baseUrl).href;
      // Skip tiny images, icons, logos, avatars
      const width = parseInt(img.attr("width") || "0", 10);
      const height = parseInt(img.attr("height") || "0", 10);
      if (width > 0 && width < 200) continue;
      if (height > 0 && height < 150) continue;
      // Skip common non-recipe image patterns
      if (/logo|icon|avatar|sprite|banner|ad|pixel|tracking|1x1|placeholder/i.test(absoluteSrc)) continue;
      if (/logo|icon|avatar/i.test(img.attr("class") || "")) continue;
      if (/logo|icon|avatar/i.test(img.attr("alt") || "")) continue;
      console.log(`[RecipeParser] Image from HTML heuristic (${selector}): ${absoluteSrc}`);
      return absoluteSrc;
    }
  }

  // Strategy 5: Any img in the page body with reasonable size
  const allImgs = $("body img");
  for (let i = 0; i < allImgs.length; i++) {
    const img = $(allImgs[i]);
    const src = img.attr("src") || img.attr("data-src") || img.attr("data-lazy-src");
    if (!src) continue;
    const absoluteSrc = src.startsWith("http") ? src : new URL(src, baseUrl).href;
    const width = parseInt(img.attr("width") || "0", 10);
    const height = parseInt(img.attr("height") || "0", 10);
    // Only pick images that have explicit large dimensions
    if (width >= 400 && height >= 300) {
      if (/logo|icon|avatar|sprite|banner|ad/i.test(absoluteSrc)) continue;
      console.log(`[RecipeParser] Image from body img (${width}x${height}): ${absoluteSrc}`);
      return absoluteSrc;
    }
  }

  return undefined;
}

// ─── Schema.org JSON-LD extraction ───────────────────────────────────────────

function extractSchemaOrgRecipe($: cheerio.CheerioAPI): any | null {
  const scripts = $('script[type="application/ld+json"]');
  for (let i = 0; i < scripts.length; i++) {
    try {
      const json = JSON.parse($(scripts[i]).html() || "");
      // Could be a single object or @graph array
      if (json["@type"] === "Recipe") return json;
      if (Array.isArray(json["@graph"])) {
        const recipe = json["@graph"].find((item: any) => item["@type"] === "Recipe");
        if (recipe) return recipe;
      }
      if (Array.isArray(json)) {
        const recipe = json.find((item: any) => item["@type"] === "Recipe");
        if (recipe) return recipe;
      }
    } catch {
      // skip invalid JSON
    }
  }
  return null;
}

function schemaOrgToRecipe(schema: any, url: string, $: cheerio.CheerioAPI): ParsedRecipe {
  const prepTime = parseIsoDuration(schema.prepTime);
  const cookTime = parseIsoDuration(schema.cookTime);
  const totalTime = parseIsoDuration(schema.totalTime) || ((prepTime || 0) + (cookTime || 0)) || undefined;

  // Parse ingredients
  const ingredients: ParsedIngredient[] = (schema.recipeIngredient || []).map(
    (raw: string) => parseIngredientString(raw)
  );

  // Parse steps — handle both string[] and HowToStep[]
  const rawSteps = schema.recipeInstructions || [];
  const steps: ParsedStep[] = [];
  let stepNum = 1;

  for (const rawStep of rawSteps) {
    let text = "";
    if (typeof rawStep === "string") {
      text = rawStep;
    } else if (rawStep["@type"] === "HowToStep") {
      text = rawStep.text || rawStep.name || "";
    } else if (rawStep["@type"] === "HowToSection") {
      // Nested sections
      for (const inner of rawStep.itemListElement || []) {
        const innerText = typeof inner === "string" ? inner : inner.text || inner.name || "";
        if (innerText.trim()) {
          steps.push({ stepNumber: stepNum++, instruction: innerText.trim() });
        }
      }
      continue;
    }
    if (text.trim() && !text.includes("Посмотреть видео")) {
      steps.push({ stepNumber: stepNum++, instruction: text.trim() });
    }
  }

  // Try to extract step images from HTML (menunedeli.ru pattern)
  const stepContainers = $(".wprm-recipe-instruction, .recipe-step, [class*='step']");
  stepContainers.each((i, el) => {
    const img = $(el).find("img").first();
    if (img.length && steps[i]) {
      steps[i].imageUrl = img.attr("src") || img.attr("data-src") || undefined;
    }
  });

  // Extract image using the universal strategy
  const imageUrl = extractImageUrl(schema.image, $, url);

  // Parse calories from nutrition
  const calories = parseCalories(
    schema.nutrition?.calories || schema.nutrition?.["@type"] === "NutritionInformation"
      ? schema.nutrition.calories : undefined
  );

  return {
    title: schema.name || "Без названия",
    description: schema.description || undefined,
    imageUrl,
    servings: parseServings(schema.recipeYield || schema.recipeYield?.[0]),
    prepTime,
    cookTime,
    totalTime,
    category: schema.recipeCategory || undefined,
    cuisine: schema.recipeCuisine || "Русская",
    difficulty: guessDifficulty(totalTime),
    calories,
    sourceUrl: url,
    ingredients,
    steps,
  };
}

// ─── LLM fallback extraction ─────────────────────────────────────────────────

async function extractWithLLM(html: string, url: string, $: cheerio.CheerioAPI): Promise<ParsedRecipe> {
  // Extract visible text from HTML
  $("script, style, nav, footer, header, aside").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, 8000);

  const result = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `Ты — парсер кулинарных рецептов. Извлеки рецепт из текста страницы и верни JSON.
Формат ответа (строго JSON):
{
  "title": "Название рецепта",
  "description": "Краткое описание",
  "servings": 4,
  "prepTime": 20,
  "cookTime": 30,
  "totalTime": 50,
  "category": "Основные блюда",
  "cuisine": "Русская",
  "calories": 250,
  "ingredients": [{"name": "Мука", "amount": 500, "unit": "г"}, ...],
  "steps": [{"stepNumber": 1, "instruction": "Текст шага"}, ...]
}
Все поля кроме title, ingredients, steps — опциональны. Время в минутах. Извлеки ВСЕ ингредиенты и ВСЕ шаги.`,
      },
      { role: "user", content: `URL: ${url}\n\nТекст страницы:\n${text}` },
    ],
    response_format: { type: "json_object" },
  });

  const content = typeof result.choices[0]?.message?.content === "string"
    ? result.choices[0].message.content
    : "";
  const parsed = JSON.parse(content);

  // Extract image from HTML even for LLM path
  const imageUrl = extractImageUrl(undefined, $, url);

  return {
    title: parsed.title || "Импортированный рецепт",
    description: parsed.description,
    imageUrl,
    servings: parsed.servings,
    prepTime: parsed.prepTime,
    cookTime: parsed.cookTime,
    totalTime: parsed.totalTime || ((parsed.prepTime || 0) + (parsed.cookTime || 0)) || undefined,
    category: parsed.category || "Основные блюда",
    cuisine: parsed.cuisine || "Русская",
    difficulty: guessDifficulty(parsed.totalTime),
    calories: parsed.calories,
    sourceUrl: url,
    ingredients: (parsed.ingredients || []).map((i: any) => ({
      name: String(i.name || "").trim(),
      amount: typeof i.amount === "number" ? i.amount : safeParseAmount(String(i.amount || "")),
      unit: String(i.unit || "").trim() || undefined,
    })),
    steps: (parsed.steps || []).map((s: any, idx: number) => ({
      stepNumber: s.stepNumber || idx + 1,
      instruction: s.instruction || s.text || "",
    })),
  };
}

// ─── Main parse function ─────────────────────────────────────────────────────

export async function parseRecipeFromUrl(url: string): Promise<ParsedRecipe> {
  // Fetch the page
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.5",
    },
    signal: AbortSignal.timeout(20000),
  });

  if (!resp.ok) {
    throw new Error(`Не удалось загрузить страницу: ${resp.status} ${resp.statusText}`);
  }

  const html = await resp.text();
  const $ = cheerio.load(html);

  // Strategy 1: Schema.org JSON-LD
  const schemaRecipe = extractSchemaOrgRecipe($);
  if (schemaRecipe) {
    console.log(`[RecipeParser] Found Schema.org JSON-LD for: ${url}`);
    return schemaOrgToRecipe(schemaRecipe, url, $);
  }

  // Strategy 2: LLM fallback (pass $ so image extraction still works)
  console.log(`[RecipeParser] No Schema.org found, using LLM for: ${url}`);
  return extractWithLLM(html, url, $);
}

/** Parse and store a recipe: download images, save to S3, return ready-to-insert data */
export async function parseAndPrepareRecipe(url: string): Promise<ParsedRecipe> {
  const recipe = await parseRecipeFromUrl(url);

  // Download and store main image
  if (recipe.imageUrl && recipe.imageUrl.startsWith("http")) {
    const slug = recipe.title.replace(/[^а-яА-Яa-zA-Z0-9]/g, "_").slice(0, 40);
    console.log(`[RecipeParser] Downloading main image: ${recipe.imageUrl}`);
    const storedUrl = await downloadAndStoreImage(recipe.imageUrl, `main_${slug}_${Date.now()}`);
    if (storedUrl) {
      recipe.imageUrl = storedUrl;
      console.log(`[RecipeParser] Main image stored in S3: ${storedUrl}`);
    } else {
      // Image download failed — clear the URL so we don't store a broken external link
      recipe.imageUrl = undefined;
      console.warn(`[RecipeParser] Main image download failed, clearing imageUrl`);
    }
  }

  // Download and store step images
  for (const step of recipe.steps) {
    if (step.imageUrl && step.imageUrl.startsWith("http")) {
      const slug = `step_${step.stepNumber}_${Date.now()}`;
      const storedUrl = await downloadAndStoreImage(step.imageUrl, slug);
      if (storedUrl) {
        step.imageUrl = storedUrl;
      } else {
        step.imageUrl = undefined;
      }
    }
  }

  return recipe;
}
