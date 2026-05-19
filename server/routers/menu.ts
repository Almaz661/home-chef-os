import { z } from 'zod';
import { router, publicProcedure } from '../trpc.js';
import { db, schema } from '../db/index.js';
import { eq, and, sql } from 'drizzle-orm';

export const menuRouter = router({
  getWeek: publicProcedure
    .input(z.object({ weekStartDate: z.string() }))
    .query(async ({ input }) => {
      let [menu] = await db
        .select()
        .from(schema.menus)
        .where(eq(schema.menus.weekStartDate, input.weekStartDate))
        .limit(1);

      if (!menu) {
        const [created] = await db
          .insert(schema.menus)
          .values({
            userId: 1,
            weekStartDate: input.weekStartDate,
          })
          .returning();
        menu = created;
      }

      const items = await db
        .select()
        .from(schema.menuItems)
        .where(eq(schema.menuItems.menuId, menu.id));

      // Hydrate recipes
      const itemsWithRecipes = await Promise.all(
        items.map(async (item) => {
          if (item.recipeId) {
            const [recipe] = await db
              .select()
              .from(schema.recipes)
              .where(eq(schema.recipes.id, item.recipeId))
              .limit(1);
            return { ...item, recipe: recipe ?? null };
          }
          return { ...item, recipe: null };
        }),
      );

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
      const [{ id }] = await db
        .insert(schema.menuItems)
        .values({
          menuId: input.menuId,
          dayOfWeek: input.dayOfWeek,
          mealType: input.mealType,
          recipeId: input.recipeId,
        })
        .returning({ id: schema.menuItems.id });
      return { id };
    }),

  removeItem: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.delete(schema.menuItems).where(eq(schema.menuItems.id, input.id));
      return { success: true };
    }),

  generateShoppingList: publicProcedure
    .input(z.object({ menuId: z.number() }))
    .mutation(async ({ input }) => {
      // 1. Collect all menu items with recipes
      const items = await db
        .select()
        .from(schema.menuItems)
        .where(eq(schema.menuItems.menuId, input.menuId));

      type Aggregated = {
        displayName: string;
        quantity: number;
        unit: string;
        category: string | null;
      };
      const ingredientMap = new Map<string, Aggregated>();

      for (const item of items) {
        if (!item.recipeId) continue;
        const ingredients = await db
          .select()
          .from(schema.recipeIngredients)
          .where(eq(schema.recipeIngredients.recipeId, item.recipeId));

        for (const ing of ingredients) {
          const nameKey = ing.name.toLowerCase().trim();
          const unitKey = (ing.unit || '').toLowerCase().trim();
          const key = `${nameKey}|${unitKey}`;
          const amount = ing.amount ?? 1;

          const existing = ingredientMap.get(key);
          if (existing) {
            existing.quantity += amount;
          } else {
            const [product] = await db
              .select()
              .from(schema.productMaster)
              .where(sql`lower(${schema.productMaster.name}) = ${nameKey}`)
              .limit(1);
            ingredientMap.set(key, {
              displayName: ing.name.charAt(0).toUpperCase() + ing.name.slice(1),
              quantity: amount,
              unit: ing.unit || '',
              category: product?.category || 'Другое',
            });
          }
        }
      }

      // 2. Subtract inventory (FEFO ignored here — we only care about totals).
      const inventoryItems = await db.select().from(schema.inventory);
      const inStockMap = new Map<string, number>();

      for (const inv of inventoryItems) {
        if (!inv.quantity || inv.quantity <= 0) continue;
        const nameKey = inv.productName.toLowerCase().trim();
        const unitKey = (inv.unit || '').toLowerCase().trim();
        const exactKey = `${nameKey}|${unitKey}`;

        let target = ingredientMap.get(exactKey);
        let targetKey = exactKey;

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

      // 3. Idempotent: drop only auto-generated rows.
      await db
        .delete(schema.purchaseItems)
        .where(
          and(
            eq(schema.purchaseItems.userId, 1),
            eq(schema.purchaseItems.recipeSource, 'menu'),
          ),
        );

      // 4. Insert fresh rows.
      const rowsToInsert: Array<typeof schema.purchaseItems.$inferInsert> = [];
      for (const [key, data] of ingredientMap) {
        const inStock = inStockMap.get(key) || 0;
        const needed = data.quantity + inStock;
        if (data.quantity <= 0) continue;

        rowsToInsert.push({
          userId: 1,
          productName: data.displayName,
          quantity: data.quantity,
          unit: data.unit,
          category: data.category,
          isChecked: false,
          recipeSource: 'menu',
          neededQuantity: needed,
          inStockQuantity: inStock,
        });
      }

      if (rowsToInsert.length > 0) {
        await db.insert(schema.purchaseItems).values(rowsToInsert);
      }

      return { count: rowsToInsert.length };
    }),
});
