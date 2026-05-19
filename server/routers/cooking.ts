import { z } from 'zod';
import { router, publicProcedure } from '../trpc.js';
import { db, schema } from '../db/index.js';
import { eq, and, sql, asc, isNotNull } from 'drizzle-orm';

/**
 * ШефДом! — Phase A: Cooking router.
 *
 * Handles the "cook" action: given a recipe, subtract ingredients from
 * inventory using FEFO (First Expiry, First Out) strategy.
 */
export const cookingRouter = router({
  /**
   * Cook a recipe: subtract its ingredients from inventory.
   * Uses FEFO — items expiring soonest are consumed first.
   * Returns what was consumed and what was missing.
   */
  cook: publicProcedure
    .input(z.object({
      recipeId: z.number(),
      servingsMultiplier: z.number().min(0.5).max(10).default(1),
    }))
    .mutation(async ({ input }) => {
      const recipe = db.select().from(schema.recipes)
        .where(eq(schema.recipes.id, input.recipeId))
        .get();
      if (!recipe) throw new Error('Рецепт не найден');

      const ingredients = db.select().from(schema.recipeIngredients)
        .where(eq(schema.recipeIngredients.recipeId, input.recipeId))
        .all();

      const consumed: Array<{ name: string; quantity: number; unit: string }> = [];
      const missing: Array<{ name: string; needed: number; have: number; unit: string }> = [];

      for (const ing of ingredients) {
        if (!ing.amount || ing.amount <= 0) continue;

        const needed = ing.amount * input.servingsMultiplier;
        const unit = (ing.unit || '').toLowerCase().trim();
        const nameLower = ing.name.toLowerCase().trim();

        // Find matching inventory items, sorted by expiry (FEFO)
        // Items with expiry date come first (soonest first), then items without expiry
        const inventoryItems = db.select().from(schema.inventory)
          .where(sql`lower(${schema.inventory.productName}) = ${nameLower}`)
          .orderBy(
            // NULL expiry dates go last (they don't expire)
            sql`CASE WHEN ${schema.inventory.expiryDate} IS NULL THEN 1 ELSE 0 END`,
            asc(schema.inventory.expiryDate),
          )
          .all();

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

        // FEFO drain
        for (const item of inventoryItems) {
          if (remaining <= 0) break;
          const available = item.quantity || 0;
          if (available <= 0) continue;

          const take = Math.min(available, remaining);
          remaining -= take;

          const newQty = available - take;
          if (newQty <= 0.01) {
            // Remove empty item
            db.delete(schema.inventory)
              .where(eq(schema.inventory.id, item.id))
              .run();
          } else {
            db.update(schema.inventory)
              .set({ quantity: newQty, updatedAt: sql`(datetime('now'))` })
              .where(eq(schema.inventory.id, item.id))
              .run();
          }
        }

        consumed.push({ name: ing.name, quantity: needed, unit: ing.unit || '' });
      }

      // Record in cooking history
      db.insert(schema.cookingHistory).values({
        userId: 1,
        recipeId: input.recipeId,
        servings: Math.round((recipe.servings || 4) * input.servingsMultiplier),
      }).run();

      return {
        success: missing.length === 0,
        recipeTitle: recipe.title,
        consumed,
        missing,
      };
    }),

  /**
   * Get cooking history — what was cooked and when.
   */
  history: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(20) }).optional())
    .query(async ({ input }) => {
      const limit = input?.limit ?? 20;
      const rows = db.select().from(schema.cookingHistory)
        .orderBy(sql`${schema.cookingHistory.cookedAt} DESC`)
        .limit(limit)
        .all();

      // Enrich with recipe titles
      const enriched = rows.map(row => {
        const recipe = row.recipeId
          ? db.select().from(schema.recipes)
              .where(eq(schema.recipes.id, row.recipeId))
              .get()
          : null;
        return {
          ...row,
          recipeTitle: recipe?.title ?? '(удалён)',
        };
      });

      return enriched;
    }),

  /**
   * Stats for dashboard.
   */
  stats: publicProcedure
    .input(z.object({ days: z.number().default(30) }).optional())
    .query(async ({ input }) => {
      const days = input?.days ?? 30;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
        .toISOString().slice(0, 19).replace('T', ' ');

      const totalCooks = db.select({ count: sql<number>`count(*)` })
        .from(schema.cookingHistory)
        .where(sql`${schema.cookingHistory.cookedAt} >= ${since}`)
        .get();

      return {
        totalCooks: totalCooks?.count || 0,
        days,
      };
    }),
});
