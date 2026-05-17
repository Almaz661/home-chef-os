/**
 * Admin router for re-downloading recipe images to S3.
 * Used to fix recipes that have null imageUrl after initial import.
 */
import { router, publicProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { recipes } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { storagePut } from "./storage";
import * as cheerio from "cheerio";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "ru-RU,ru;q=0.9",
};

const IMAGE_HEADERS = {
  "User-Agent": "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  "Accept": "image/webp,image/avif,image/*,*/*;q=0.8",
  "Accept-Language": "ru-RU,ru;q=0.9",
  "Referer": "https://menunedeli.ru/",
};

/** Extract image URL from a recipe page */
async function extractImageFromPage(pageUrl: string): Promise<string | null> {
  try {
    const resp = await fetch(pageUrl, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
    if (!resp.ok) return null;
    const html = await resp.text();
    const $ = cheerio.load(html);

    // Try Schema.org JSON-LD first
    const scripts = $('script[type="application/ld+json"]');
    for (let i = 0; i < scripts.length; i++) {
      try {
        const json = JSON.parse($(scripts[i]).html() || "");
        const recipe = json["@type"] === "Recipe" ? json :
          (json["@graph"] || []).find((x: any) => x["@type"] === "Recipe");
        if (recipe?.image) {
          const img = typeof recipe.image === "string" ? recipe.image :
            Array.isArray(recipe.image) ? recipe.image[0] :
            recipe.image?.url;
          if (img && img.startsWith("http")) return img;
        }
      } catch { /* skip */ }
    }

    // Try Open Graph image
    const ogImage = $('meta[property="og:image"]').attr("content");
    if (ogImage && ogImage.startsWith("http")) return ogImage;

    // Try first large image in article
    const articleImg = $("article img, .recipe img, .wprm-recipe img").first().attr("src");
    if (articleImg && articleImg.startsWith("http")) return articleImg;

    return null;
  } catch {
    return null;
  }
}

/** Download an image and upload to S3 */
async function downloadAndStore(imageUrl: string, recipeId: number): Promise<string | null> {
  try {
    const resp = await fetch(imageUrl, {
      headers: IMAGE_HEADERS,
      signal: AbortSignal.timeout(20000),
    });
    if (!resp.ok) return null;
    const contentType = resp.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) return null;
    const buffer = Buffer.from(await resp.arrayBuffer());
    if (buffer.length < 2000) return null; // Skip tiny/placeholder images
    const ext = contentType.includes("png") ? ".png" : contentType.includes("webp") ? ".webp" : ".jpg";
    const key = `recipes/main_${recipeId}_${Date.now()}${ext}`;
    const { url } = await storagePut(key, buffer, contentType);
    return url;
  } catch {
    return null;
  }
}

export const imageRedownloadRouter = router({
  /** Check image status of all recipes */
  checkImages: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    const allRecipes = await db.select({
      id: recipes.id,
      title: recipes.title,
      imageUrl: recipes.imageUrl,
      sourceUrl: recipes.sourceUrl,
    }).from(recipes);
    return allRecipes.map(r => ({
      id: r.id,
      title: r.title,
      imageUrl: r.imageUrl,
      sourceUrl: r.sourceUrl,
      isExternal: !!(r.imageUrl && r.imageUrl.startsWith("http") && !r.imageUrl.includes("/manus-storage/")),
      isS3: !!(r.imageUrl && r.imageUrl.includes("/manus-storage/")),
      hasImage: !!r.imageUrl,
    }));
  }),

  /** Re-fetch images for all recipes that have null imageUrl but have a sourceUrl */
  refetchMissingImages: publicProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new Error("DB not available");

    const allRecipes = await db.select({
      id: recipes.id,
      title: recipes.title,
      imageUrl: recipes.imageUrl,
      sourceUrl: recipes.sourceUrl,
    }).from(recipes);

    // Process recipes with null/empty imageUrl that have a sourceUrl
    const toProcess = allRecipes.filter(r =>
      !r.imageUrl && r.sourceUrl && r.sourceUrl.startsWith("http")
    );

    const results: { id: number; title: string; success: boolean; url?: string }[] = [];

    for (const recipe of toProcess) {
      console.log(`[ImageFix] Processing recipe ${recipe.id}: ${recipe.title}`);

      // Step 1: Extract image URL from the source page
      const imageUrl = await extractImageFromPage(recipe.sourceUrl!);
      if (!imageUrl) {
        console.warn(`[ImageFix] No image found for recipe ${recipe.id}`);
        results.push({ id: recipe.id, title: recipe.title, success: false });
        await new Promise(r => setTimeout(r, 300));
        continue;
      }

      // Step 2: Download and store in S3
      const storedUrl = await downloadAndStore(imageUrl, recipe.id);
      if (storedUrl) {
        await db.update(recipes).set({ imageUrl: storedUrl }).where(eq(recipes.id, recipe.id));
        console.log(`[ImageFix] ✓ Stored image for recipe ${recipe.id}: ${storedUrl}`);
        results.push({ id: recipe.id, title: recipe.title, success: true, url: storedUrl });
      } else {
        console.warn(`[ImageFix] ✗ Failed to store image for recipe ${recipe.id}`);
        results.push({ id: recipe.id, title: recipe.title, success: false });
      }

      // Polite delay between requests
      await new Promise(r => setTimeout(r, 800));
    }

    return {
      total: allRecipes.length,
      processed: toProcess.length,
      results,
    };
  }),

  /** Re-download external images (hotlink-blocked) to S3 */
  redownloadExternal: publicProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new Error("DB not available");

    const allRecipes = await db.select({
      id: recipes.id,
      title: recipes.title,
      imageUrl: recipes.imageUrl,
    }).from(recipes);

    const toProcess = allRecipes.filter(r =>
      r.imageUrl &&
      r.imageUrl.startsWith("http") &&
      !r.imageUrl.includes("/manus-storage/")
    );

    const results: { id: number; title: string; success: boolean; url?: string }[] = [];

    for (const recipe of toProcess) {
      const newUrl = await downloadAndStore(recipe.imageUrl!, recipe.id);
      if (newUrl) {
        await db.update(recipes).set({ imageUrl: newUrl }).where(eq(recipes.id, recipe.id));
        results.push({ id: recipe.id, title: recipe.title, success: true, url: newUrl });
      } else {
        results.push({ id: recipe.id, title: recipe.title, success: false });
      }
      await new Promise(r => setTimeout(r, 300));
    }

    return { total: allRecipes.length, processed: toProcess.length, results };
  }),
});
