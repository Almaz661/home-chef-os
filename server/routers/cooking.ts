import { z } from 'zod';
import { router, publicProcedure } from '../trpc.js';
import { db, schema } from '../db/index.js';
import { eq, sql, asc, desc } from 'drizzle-orm';

/**
 * ШефДом! — Phase A: Cooking router.
 *
 * Handles the "cook" action: given a recipe, subtract ingredients from
 * inventory using FEFO (First Expiry, First Out) strategy.
 */
export const cookingRouter = router({
  cook: publicProcedure
    .input(z.object({
      recipeId: z.number(),
      servingsMultiplier: z.number().min(0.5).max(10).default(1),
    }))
    .mutation(async ({ input }) => {
      const [recipe] = await db
        .select()
        .from(schema.recipes)
        .where(eq(schema.recipes.id, input.recipeId))
        .limit(1);
      if (!recipe) throw new Error('Рецепт не найден');

      const ingredients = await db
        .select()
        .from(schema.recipeIngredients)
        .where(eq(schema.recipeIngredients.recipeId, input.recipeId));

      const consumed: Array<{ name: string; quantity: number; unit: string }> = [];
      const missing: Array<{ name: string; needed: number; have: number; unit: string }> = [];

      for (const ing of ingredients) {
        if (!ing.amount || ing.amount <= 0) continue;

        const needed = ing.amount * input.servingsMultiplier;
        const nameLower = ing.name.toLowerCase().trim();

        // FEFO: items expiring sooner first; NULL expiry last.
        const inventoryItems = await db
          .select()
          .from(schema.inventory)
          .where(sql`lower(${schema.inventory.productName}) = ${nameLower}`)
          .orderBy(
            sql`CASE WHEN ${schema.inventory.expiryDate} IS NULL THEN 1 ELSE 0 END`,
            asc(schema.inventory.expiryDate),
          );

        let remaining = needed;
        let totalHave = 0;
        for (const item of inventoryItems) {
          totalHave += item.quantity || 0;
        }

        if (totalHave < needed) {
          missing.push({
            name: ing.name,
            needed,
            have: totalHave,
            unit: ing.unit || '',
          });
          continue;
        }

        for (const item of inventoryItems) {
          if (remaining <= 0) break;
          const available = item.quantity || 0;
          if (available <= 0) continue;

          const take = Math.min(available, remaining);
          remaining -= take;
          const newQty = available - take;

          if (newQty <= 0.01) {
            await db.delete(schema.inventory).where(eq(schema.inventory.id, item.id));
          } else {
            await db
              .update(schema.inventory)
              .set({ quantity: newQty, updatedAt: sql`now()` })
              .where(eq(schema.inventory.id, item.id));
          }
        }

        consumed.push({ name: ing.name, quantity: needed, unit: ing.unit || '' });
      }

      await db.insert(schema.cookingHistory).values({
        userId: 1,
        recipeId: input.recipeId,
        servings: Math.round((recipe.servings || 4) * input.servingsMultiplier),
      });

      return {
        success: missing.length === 0,
        recipeTitle: recipe.title,
        consumed,
        missing,
      };
    }),

  history: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(20) }).optional())
    .query(async ({ input }) => {
      const limit = input?.limit ?? 20;
      const rows = await db
        .select()
        .from(schema.cookingHistory)
        .orderBy(desc(schema.cookingHistory.cookedAt))
        .limit(limit);

      const enriched = await Promise.all(
        rows.map(async (row) => {
          const recipe = row.recipeId
            ? (await db
                .select()
                .from(schema.recipes)
                .where(eq(schema.recipes.id, row.recipeId))
                .limit(1))[0]
            : null;
          return {
            ...row,
            recipeTitle: recipe?.title ?? '(удалён)',
          };
        }),
      );

      return enriched;
    }),

  stats: publicProcedure
    .input(z.object({ days: z.number().default(30) }).optional())
    .query(async ({ input }) => {
      const days = input?.days ?? 30;
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.cookingHistory)
        .where(sql`${schema.cookingHistory.cookedAt} >= now() - (${days}::int * interval '1 day')`);

      return {
        totalCooks: row?.count || 0,
        days,
      };
    }),
});
