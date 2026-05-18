import { z } from 'zod';
import { router, publicProcedure } from '../trpc.js';
import { db, schema } from '../db/index.js';
import { eq, like, and, or, sql } from 'drizzle-orm';

export const recipesRouter = router({
  list: publicProcedure
    .input(z.object({
      search: z.string().optional(),
      category: z.string().optional(),
      difficulty: z.string().optional(),
      maxTime: z.number().optional(),
    }).optional())
    .query(async ({ input }) => {
      let query = db.select().from(schema.recipes);
      const conditions: any[] = [];

      if (input?.search) {
        conditions.push(
          or(
            like(schema.recipes.title, `%${input.search}%`),
            like(schema.recipes.description, `%${input.search}%`)
          )
        );
      }
      if (input?.category) {
        conditions.push(eq(schema.recipes.category, input.category));
      }
      if (input?.difficulty) {
        conditions.push(eq(schema.recipes.difficulty, input.difficulty));
      }

      let results;
      if (conditions.length > 0) {
        results = db.select().from(schema.recipes).where(and(...conditions)).all();
      } else {
        results = db.select().from(schema.recipes).all();
      }

      if (input?.maxTime) {
        results = results.filter(r => (r.totalTime || 999) <= input.maxTime!);
      }

      return results;
    }),

  getById: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const recipe = db.select().from(schema.recipes).where(eq(schema.recipes.id, input.id)).get();
      if (!recipe) return null;

      const ingredients = db.select().from(schema.recipeIngredients)
        .where(eq(schema.recipeIngredients.recipeId, input.id))
        .orderBy(schema.recipeIngredients.sortOrder)
        .all();

      const steps = db.select().from(schema.recipeSteps)
        .where(eq(schema.recipeSteps.recipeId, input.id))
        .orderBy(schema.recipeSteps.stepNumber)
        .all();

      return { ...recipe, ingredients, steps };
    }),

  create: publicProcedure
    .input(z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      imageUrl: z.string().optional(),
      servings: z.number().optional(),
      prepTime: z.number().optional(),
      cookTime: z.number().optional(),
      totalTime: z.number().optional(),
      sourceUrl: z.string().optional(),
      source: z.string().optional(),
      category: z.string().optional(),
      cuisine: z.string().optional(),
      difficulty: z.string().optional(),
      calories: z.number().optional(),
      ingredients: z.array(z.object({
        name: z.string(),
        amount: z.number().nullable().optional(),
        unit: z.string().nullable().optional(),
        group: z.string().nullable().optional(),
        sortOrder: z.number().optional(),
      })),
      steps: z.array(z.object({
        stepNumber: z.number(),
        instruction: z.string(),
        imageUrl: z.string().optional(),
        timerMinutes: z.number().optional(),
      })),
    }))
    .mutation(async ({ input }) => {
      const { ingredients, steps, ...recipeData } = input;

      const result = db.insert(schema.recipes).values(recipeData).run();
      const recipeId = Number(result.lastInsertRowid);

      for (const ing of ingredients) {
        db.insert(schema.recipeIngredients).values({
          recipeId,
          name: ing.name,
          amount: ing.amount ?? null,
          unit: ing.unit ?? null,
          group: ing.group ?? null,
          sortOrder: ing.sortOrder ?? 0,
        }).run();
      }

      for (const step of steps) {
        db.insert(schema.recipeSteps).values({
          recipeId,
          stepNumber: step.stepNumber,
          instruction: step.instruction,
          imageUrl: step.imageUrl,
          timerMinutes: step.timerMinutes,
        }).run();
      }

      return { id: recipeId };
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      db.delete(schema.recipes).where(eq(schema.recipes.id, input.id)).run();
      return { success: true };
    }),

  update: publicProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().min(1),
      description: z.string().nullable().optional(),
      imageUrl: z.string().nullable().optional(),
      servings: z.number().nullable().optional(),
      prepTime: z.number().nullable().optional(),
      cookTime: z.number().nullable().optional(),
      totalTime: z.number().nullable().optional(),
      sourceUrl: z.string().nullable().optional(),
      source: z.string().nullable().optional(),
      category: z.string().nullable().optional(),
      cuisine: z.string().nullable().optional(),
      difficulty: z.string().nullable().optional(),
      calories: z.number().nullable().optional(),
      ingredients: z.array(z.object({
        name: z.string(),
        amount: z.number().nullable().optional(),
        unit: z.string().nullable().optional(),
        group: z.string().nullable().optional(),
        sortOrder: z.number().optional(),
      })),
      steps: z.array(z.object({
        stepNumber: z.number(),
        instruction: z.string(),
        imageUrl: z.string().nullable().optional(),
        timerMinutes: z.number().nullable().optional(),
      })),
    }))
    .mutation(async ({ input }) => {
      const { id, ingredients, steps, ...recipeData } = input;

      // Check existence
      const existing = db.select().from(schema.recipes).where(eq(schema.recipes.id, id)).get();
      if (!existing) {
        throw new Error('Рецепт не найден');
      }

      db.update(schema.recipes).set({
        ...recipeData,
        updatedAt: sql`(datetime('now'))`,
      }).where(eq(schema.recipes.id, id)).run();

      // Replace ingredients and steps wholesale (the form sends the full list).
      db.delete(schema.recipeIngredients).where(eq(schema.recipeIngredients.recipeId, id)).run();
      db.delete(schema.recipeSteps).where(eq(schema.recipeSteps.recipeId, id)).run();

      for (const ing of ingredients) {
        db.insert(schema.recipeIngredients).values({
          recipeId: id,
          name: ing.name,
          amount: ing.amount ?? null,
          unit: ing.unit ?? null,
          group: ing.group ?? null,
          sortOrder: ing.sortOrder ?? 0,
        }).run();
      }

      for (const step of steps) {
        db.insert(schema.recipeSteps).values({
          recipeId: id,
          stepNumber: step.stepNumber,
          instruction: step.instruction,
          imageUrl: step.imageUrl ?? null,
          timerMinutes: step.timerMinutes ?? null,
        }).run();
      }

      return { id, success: true };
    }),

  getCategories: publicProcedure.query(async () => {
    const results = db.selectDistinct({ category: schema.recipes.category })
      .from(schema.recipes)
      .where(sql`${schema.recipes.category} IS NOT NULL`)
      .all();
    return results.map(r => r.category).filter(Boolean) as string[];
  }),

  getStats: publicProcedure.query(async () => {
    const count = db.select({ count: sql<number>`count(*)` }).from(schema.recipes).get();
    return { total: count?.count || 0 };
  }),

  importFromUrl: publicProcedure
    .input(z.object({ url: z.string().url() }))
    .mutation(async ({ input }) => {
      try {
        const response = await fetch(input.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; HomeChef/1.0)',
          },
        });
        const html = await response.text();

        // Try to extract Schema.org Recipe JSON-LD
        const jsonLdMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
        let recipeData: any = null;

        if (jsonLdMatch) {
          for (const match of jsonLdMatch) {
            try {
              const jsonContent = match.replace(/<script[^>]*>/, '').replace(/<\/script>/, '');
              const parsed = JSON.parse(jsonContent);

              if (Array.isArray(parsed)) {
                recipeData = parsed.find((item: any) => item['@type'] === 'Recipe');
              } else if (parsed['@type'] === 'Recipe') {
                recipeData = parsed;
              } else if (parsed['@graph']) {
                recipeData = parsed['@graph'].find((item: any) => item['@type'] === 'Recipe');
              }

              if (recipeData) break;
            } catch (e) {
              continue;
            }
          }
        }

        if (!recipeData) {
          throw new Error('Не удалось найти данные рецепта на странице. Убедитесь, что сайт использует разметку Schema.org.');
        }

        // Parse duration (ISO 8601)
        const parseDuration = (duration: string | undefined): number | undefined => {
          if (!duration) return undefined;
          const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
          if (!match) return undefined;
          return (parseInt(match[1] || '0') * 60) + parseInt(match[2] || '0');
        };

        // Parse ingredients
        const ingredients = (recipeData.recipeIngredient || []).map((ing: string, idx: number) => {
          const match = ing.match(/^([\d.,/½⅓¼¾⅔⅛]+)?\s*(г|кг|мл|л|шт|ст\.л\.|ч\.л\.|стакан|cup|tbsp|tsp|oz|lb|g|kg|ml|pcs)?\s*(.+)/i);
          if (match) {
            return {
              name: match[3].trim(),
              amount: match[1] ? parseFloat(match[1].replace(',', '.').replace('½', '0.5').replace('¼', '0.25').replace('¾', '0.75')) : null,
              unit: match[2] || null,
              sortOrder: idx + 1,
            };
          }
          return { name: ing.trim(), amount: null, unit: null, sortOrder: idx + 1 };
        });

        // Parse steps
        const rawSteps = recipeData.recipeInstructions || [];
        const steps = rawSteps.map((step: any, idx: number) => ({
          stepNumber: idx + 1,
          instruction: typeof step === 'string' ? step : (step.text || step.name || ''),
        }));

        // Get image
        let imageUrl: string | undefined;
        if (recipeData.image) {
          if (typeof recipeData.image === 'string') {
            imageUrl = recipeData.image;
          } else if (Array.isArray(recipeData.image)) {
            imageUrl = recipeData.image[0];
          } else if (recipeData.image.url) {
            imageUrl = recipeData.image.url;
          }
        }

        const prepTime = parseDuration(recipeData.prepTime);
        const cookTime = parseDuration(recipeData.cookTime);
        const totalTime = parseDuration(recipeData.totalTime) || ((prepTime || 0) + (cookTime || 0)) || undefined;

        // Get servings
        let servings: number | undefined;
        if (recipeData.recipeYield) {
          const yieldStr = Array.isArray(recipeData.recipeYield) ? recipeData.recipeYield[0] : recipeData.recipeYield;
          const yieldMatch = String(yieldStr).match(/(\d+)/);
          if (yieldMatch) servings = parseInt(yieldMatch[1]);
        }

        // Save to DB
        const result = db.insert(schema.recipes).values({
          title: recipeData.name || 'Импортированный рецепт',
          description: recipeData.description || null,
          imageUrl: imageUrl || null,
          servings: servings || 4,
          prepTime: prepTime || null,
          cookTime: cookTime || null,
          totalTime: totalTime || null,
          sourceUrl: input.url,
          source: new URL(input.url).hostname,
          category: recipeData.recipeCategory || (recipeData.recipeCategory?.[0]) || null,
          cuisine: recipeData.recipeCuisine || (Array.isArray(recipeData.recipeCuisine) ? recipeData.recipeCuisine[0] : null),
          difficulty: 'medium',
          calories: recipeData.nutrition?.calories ? parseInt(recipeData.nutrition.calories) : null,
        }).run();

        const recipeId = Number(result.lastInsertRowid);

        for (const ing of ingredients) {
          db.insert(schema.recipeIngredients).values({ recipeId, ...ing }).run();
        }
        for (const step of steps) {
          db.insert(schema.recipeSteps).values({ recipeId, ...step }).run();
        }

        return { id: recipeId, title: recipeData.name };
      } catch (error: any) {
        throw new Error(error.message || 'Ошибка импорта рецепта');
      }
    }),
});
