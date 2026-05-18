import { z } from 'zod';
import { router, publicProcedure } from '../trpc.js';
import { db, schema } from '../db/index.js';
import { eq, and, sql } from 'drizzle-orm';

export const menuRouter = router({
  getWeek: publicProcedure
    .input(z.object({ weekStartDate: z.string() }))
    .query(async ({ input }) => {
      let menu = db.select().from(schema.menus)
        .where(eq(schema.menus.weekStartDate, input.weekStartDate))
        .get();

      if (!menu) {
        const result = db.insert(schema.menus).values({
          userId: 1,
          weekStartDate: input.weekStartDate,
        }).run();
        menu = db.select().from(schema.menus)
          .where(eq(schema.menus.id, Number(result.lastInsertRowid)))
          .get()!;
      }

      const items = db.select().from(schema.menuItems)
        .where(eq(schema.menuItems.menuId, menu.id))
        .all();

      // Get recipe details for each item
      const itemsWithRecipes = await Promise.all(items.map(async (item) => {
        if (item.recipeId) {
          const recipe = db.select().from(schema.recipes)
            .where(eq(schema.recipes.id, item.recipeId))
            .get();
          return { ...item, recipe };
        }
        return { ...item, recipe: null };
      }));

      return { menu, items: itemsWithRecipes };
    }),

  addItem: publicProcedure
    .input(z.object({
      menuId: z.number(),
      dayOfWeek: z.number().min(0).max(6),
      mealType: z.string(),
      recipeId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const result = db.insert(schema.menuItems).values({
        menuId: input.menuId,
        dayOfWeek: input.dayOfWeek,
        mealType: input.mealType,
        recipeId: input.recipeId,
      }).run();
      return { id: Number(result.lastInsertRowid) };
    }),

  removeItem: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      db.delete(schema.menuItems).where(eq(schema.menuItems.id, input.id)).run();
      return { success: true };
    }),

  generateShoppingList: publicProcedure
    .input(z.object({ menuId: z.number() }))
    .mutation(async ({ input }) => {
      // 1. Collect all menu items with recipes
      const items = db.select().from(schema.menuItems)
        .where(eq(schema.menuItems.menuId, input.menuId))
        .all();

      // 2. Aggregate ingredients across all menu recipes.
      // Key combines normalized name + unit, so "молоко мл" and "молоко л"
      // stay separate.
      type Aggregated = {
        displayName: string;
        quantity: number;
        unit: string;
        category: string | null;
      };
      const ingredientMap = new Map<string, Aggregated>();

      for (const item of items) {
        if (!item.recipeId) continue;
        const ingredients = db.select().from(schema.recipeIngredients)
          .where(eq(schema.recipeIngredients.recipeId, item.recipeId))
          .all();

        for (const ing of ingredients) {
          const nameKey = ing.name.toLowerCase().trim();
          const unitKey = (ing.unit || '').toLowerCase().trim();
          const key = `${nameKey}|${unitKey}`;
          const amount = ing.amount ?? 1;

          const existing = ingredientMap.get(key);
          if (existing) {
            existing.quantity += amount;
          } else {
            // Look up category from product master
            const product = db.select().from(schema.productMaster)
              .where(sql`lower(${schema.productMaster.name}) = ${nameKey}`)
              .get();
            ingredientMap.set(key, {
              displayName: ing.name.charAt(0).toUpperCase() + ing.name.slice(1),
              quantity: amount,
              unit: ing.unit || '',
              category: product?.category || 'Другое',
            });
          }
        }
      }

      // 3. Subtract inventory. Match by normalized name + unit;
      // also try a "name only" fallback if units are different but same product.
      const inventoryItems = db.select().from(schema.inventory).all();
      const inStockMap = new Map<string, number>(); // key -> in-stock amount used

      for (const inv of inventoryItems) {
        if (!inv.quantity || inv.quantity <= 0) continue;
        const nameKey = inv.productName.toLowerCase().trim();
        const unitKey = (inv.unit || '').toLowerCase().trim();
        const exactKey = `${nameKey}|${unitKey}`;

        // Try exact match first (same name + unit)
        let target = ingredientMap.get(exactKey);
        let targetKey = exactKey;

        // Fallback: any unit, same name
        if (!target) {
          for (const [k, v] of ingredientMap) {
            if (k.startsWith(`${nameKey}|`)) {
              target = v;
              targetKey = k;
              break;
            }
          }
        }

        if (target) {
          const used = Math.min(inv.quantity, target.quantity);
          target.quantity -= used;
          inStockMap.set(targetKey, (inStockMap.get(targetKey) || 0) + used);
        }
      }

      // 4. Make idempotent: remove only auto-generated rows; keep manually
      // added items (they have recipeSource = NULL or a different value).
      db.delete(schema.purchaseItems)
        .where(and(
          eq(schema.purchaseItems.userId, 1),
          eq(schema.purchaseItems.recipeSource, 'menu'),
        ))
        .run();

      // 5. Insert fresh rows with full context.
      let insertedCount = 0;
      for (const [key, data] of ingredientMap) {
        const inStock = inStockMap.get(key) || 0;
        const needed = data.quantity + inStock;

        // Skip if everything is already at home.
        if (data.quantity <= 0) continue;

        db.insert(schema.purchaseItems).values({
          userId: 1,
          productName: data.displayName,
          quantity: data.quantity,
          unit: data.unit,
          category: data.category,
          isChecked: false,
          recipeSource: 'menu',
          neededQuantity: needed,
          inStockQuantity: inStock,
        }).run();
        insertedCount++;
      }

      return { count: insertedCount };
    }),
});
