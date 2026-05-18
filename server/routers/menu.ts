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
      // Get all menu items with recipes
      const items = db.select().from(schema.menuItems)
        .where(eq(schema.menuItems.menuId, input.menuId))
        .all();

      const ingredientMap = new Map<string, { quantity: number; unit: string; category: string | null }>();

      for (const item of items) {
        if (!item.recipeId) continue;
        const ingredients = db.select().from(schema.recipeIngredients)
          .where(eq(schema.recipeIngredients.recipeId, item.recipeId))
          .all();

        for (const ing of ingredients) {
          const key = ing.name.toLowerCase();
          const existing = ingredientMap.get(key);
          if (existing && ing.amount) {
            existing.quantity += ing.amount;
          } else if (ing.amount) {
            // Try to find category from product master
            const product = db.select().from(schema.productMaster)
              .where(sql`lower(${schema.productMaster.name}) = ${key}`)
              .get();
            ingredientMap.set(key, {
              quantity: ing.amount,
              unit: ing.unit || '',
              category: product?.category || 'Другое',
            });
          } else {
            if (!ingredientMap.has(key)) {
              const product = db.select().from(schema.productMaster)
                .where(sql`lower(${schema.productMaster.name}) = ${key}`)
                .get();
              ingredientMap.set(key, {
                quantity: 1,
                unit: ing.unit || '',
                category: product?.category || 'Другое',
              });
            }
          }
        }
      }

      // Subtract inventory
      const inventoryItems = db.select().from(schema.inventory).all();
      for (const inv of inventoryItems) {
        const key = inv.productName.toLowerCase();
        const needed = ingredientMap.get(key);
        if (needed && inv.quantity) {
          needed.quantity = Math.max(0, needed.quantity - inv.quantity);
          if (needed.quantity === 0) {
            ingredientMap.delete(key);
          }
        }
      }

      // Clear existing purchase items and add new ones
      db.delete(schema.purchaseItems).where(eq(schema.purchaseItems.userId, 1)).run();

      for (const [name, data] of ingredientMap) {
        db.insert(schema.purchaseItems).values({
          userId: 1,
          productName: name.charAt(0).toUpperCase() + name.slice(1),
          quantity: data.quantity,
          unit: data.unit,
          category: data.category,
          isChecked: false,
          recipeSource: 'menu',
        }).run();
      }

      return { count: ingredientMap.size };
    }),
});
