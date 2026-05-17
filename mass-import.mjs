/**
 * Mass import script for menunedeli.ru recipes.
 * Run with: node --loader tsx server/mass-import.mjs
 * Or: npx tsx server/mass-import.mjs
 *
 * This script uses the recipeParser to fetch and parse recipes,
 * then inserts them into the database via the db module.
 */

// We need to set up env before anything else
import "dotenv/config";

const RECIPE_URLS = [
  "https://menunedeli.ru/recipe/lenivye-golubcy/",
  "https://menunedeli.ru/recipe/ponchiki-recept-klassicheskij/",
  "https://menunedeli.ru/recipe/klassicheskij-ratatuj-s-neobychnym-ingredientom/",
  "https://menunedeli.ru/recipe/den-bolshoj-zagotovki-syrniki-klassicheskij-recept/",
  "https://menunedeli.ru/recipe/sharlotka-klassicheskaya-s-razryxlitelem/",
  "https://menunedeli.ru/recipe/kurinaya-grudka-s-pomidorami-v-folge/",
  "https://menunedeli.ru/recipe/podliva-iz-farsha-na-skovorode/",
  "https://menunedeli.ru/recipe/keks-na-moloke-v-duxovke/",
  "https://menunedeli.ru/recipe/salat-iz-kapusty-ogurcov-i-pomidorov/",
  "https://menunedeli.ru/recipe/babaganush-klassicheskij-recept-iz-baklazhanov/",
  "https://menunedeli.ru/recipe/kurica-s-ovoshhami-na-skovorode/",
  "https://menunedeli.ru/recipe/tort-smetannyj-domashnij-klassicheskij-recept/",
  "https://menunedeli.ru/recipe/uzhin-na-raz-dva-tri-sochnaya-kurochka-i-zapechennye-s-italyanskimi-travami-ovoshhi/",
  "https://menunedeli.ru/recipe/molochnyj-pirog-na-goryachem-moloke/",
  "https://menunedeli.ru/recipe/zapechennyj-sushi-tort-v-duxovke/",
];

async function main() {
  // Dynamic import to ensure env is loaded first
  const { parseRecipeFromUrl, downloadAndStoreImage } = await import("./recipeParser.ts");
  const db = await import("./db.ts");

  console.log(`Starting mass import of ${RECIPE_URLS.length} recipes from menunedeli.ru...\n`);

  let imported = 0;
  let failed = 0;

  for (const url of RECIPE_URLS) {
    try {
      console.log(`[${imported + failed + 1}/${RECIPE_URLS.length}] Parsing: ${url}`);
      const parsed = await parseRecipeFromUrl(url);
      console.log(`  Title: ${parsed.title}`);
      console.log(`  Ingredients: ${parsed.ingredients.length}`);
      console.log(`  Steps: ${parsed.steps.length}`);

      // Download and store main image
      let storedImageUrl = undefined;
      if (parsed.imageUrl) {
        const slug = parsed.title.replace(/[^а-яА-Яa-zA-Z0-9]/g, "_").slice(0, 40);
        try {
          storedImageUrl = await downloadAndStoreImage(parsed.imageUrl, `main_${slug}_${Date.now()}`);
          console.log(`  Image: ${storedImageUrl ? "stored" : "failed"}`);
        } catch (e) {
          console.log(`  Image: download failed, skipping`);
        }
      }

      // Insert into database
      const recipeData = {
        title: parsed.title,
        description: parsed.description,
        imageUrl: storedImageUrl || parsed.imageUrl,
        servings: parsed.servings || 4,
        prepTime: parsed.prepTime || 0,
        cookTime: parsed.cookTime || 0,
        totalTime: parsed.totalTime || 0,
        category: parsed.category || "Основные блюда",
        cuisine: parsed.cuisine || "Русская",
        difficulty: parsed.difficulty || "medium",
        calories: parsed.calories,
        sourceUrl: url,
      };

      const ingredients = parsed.ingredients.map((ing, idx) => ({
        name: ing.name,
        amount: ing.amount,
        unit: ing.unit || "",
        sortOrder: idx,
      }));

      const steps = parsed.steps.map(s => ({
        stepNumber: s.stepNumber,
        instruction: s.instruction,
        imageUrl: s.imageUrl || null,
        timerMinutes: null,
      }));

      await db.createRecipe(recipeData, ingredients, steps);
      imported++;
      console.log(`  ✓ Imported successfully!\n`);

      // Small delay to be polite to the server
      await new Promise(r => setTimeout(r, 1500));
    } catch (e) {
      failed++;
      console.error(`  ✗ Failed: ${e.message}\n`);
    }
  }

  console.log(`\n=== Import complete ===`);
  console.log(`Imported: ${imported}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${RECIPE_URLS.length}`);

  process.exit(0);
}

main().catch(e => {
  console.error("Fatal error:", e);
  process.exit(1);
});
