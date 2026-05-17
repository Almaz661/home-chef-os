import "dotenv/config";
const db = await import("./db.ts");
const recipes = await db.getRecipes();
console.log("Total recipes:", recipes.length);
recipes.forEach(r => console.log(" -", r.id, r.title));
process.exit(0);
