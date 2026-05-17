/**
 * Script to re-download all recipe images from external URLs and store them in S3.
 * Run once via: npx tsx server/redownloadImages.ts
 * 
 * This fixes hotlink-blocked images from menunedeli.ru and other sites.
 */
import { drizzle } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import { recipes } from "../drizzle/schema";
import { storagePut } from "./storage";
import * as dotenv from "dotenv";

dotenv.config();

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  "Accept": "image/webp,image/avif,image/*,*/*;q=0.8",
  "Accept-Language": "ru-RU,ru;q=0.9",
  "Referer": "https://menunedeli.ru/",
};

async function downloadAndStore(imageUrl: string, recipeId: number): Promise<string | null> {
  try {
    console.log(`  Downloading: ${imageUrl.slice(0, 80)}...`);
    const resp = await fetch(imageUrl, {
      headers: HEADERS,
      signal: AbortSignal.timeout(20000),
    });
    if (!resp.ok) {
      console.warn(`  ✗ HTTP ${resp.status} for recipe ${recipeId}`);
      return null;
    }
    const contentType = resp.headers.get("content-type") || "image/jpeg";
    // Only accept image types
    if (!contentType.startsWith("image/")) {
      console.warn(`  ✗ Not an image (${contentType}) for recipe ${recipeId}`);
      return null;
    }
    const buffer = Buffer.from(await resp.arrayBuffer());
    if (buffer.length < 1000) {
      console.warn(`  ✗ Image too small (${buffer.length} bytes) for recipe ${recipeId}`);
      return null;
    }
    const ext = contentType.includes("png") ? ".png" : contentType.includes("webp") ? ".webp" : ".jpg";
    const key = `recipes/main_${recipeId}_${Date.now()}${ext}`;
    const { url } = await storagePut(key, buffer, contentType);
    console.log(`  ✓ Stored at ${url}`);
    return url;
  } catch (err: any) {
    console.warn(`  ✗ Error for recipe ${recipeId}: ${err.message}`);
    return null;
  }
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }

  const db = drizzle(dbUrl);
  
  // Get all recipes with external image URLs (not already in /manus-storage/)
  const allRecipes = await db.select({ id: recipes.id, title: recipes.title, imageUrl: recipes.imageUrl }).from(recipes);
  
  const toProcess = allRecipes.filter(r => 
    r.imageUrl && 
    r.imageUrl.startsWith("http") && 
    !r.imageUrl.includes("/manus-storage/")
  );

  console.log(`Found ${toProcess.length} recipes with external image URLs (out of ${allRecipes.length} total)`);

  let successCount = 0;
  let failCount = 0;

  for (const recipe of toProcess) {
    console.log(`\n[${recipe.id}] ${recipe.title}`);
    const newUrl = await downloadAndStore(recipe.imageUrl!, recipe.id);
    if (newUrl) {
      await db.update(recipes).set({ imageUrl: newUrl }).where(eq(recipes.id, recipe.id));
      successCount++;
    } else {
      failCount++;
    }
    // Small delay to be polite to the server
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n✅ Done! ${successCount} images stored, ${failCount} failed`);
  process.exit(0);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
