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
      const { scrapeRecipe } = await import('../services/recipeScraper.js');

      let scraped;
      try {
        scraped = await scrapeRecipe(input.url);
      } catch (error: any) {
        throw new Error(error.message || 'Ошибка импорта рецепта');
      }

      console.log(
        `[importFromUrl] ${scraped.strategy} → "${scraped.title}" ` +
          `(${scraped.ingredients.length} ing, ${scraped.steps.length} steps)`,
      );

      // Save to DB
      const result = db
        .insert(schema.recipes)
        .values({
          title: scraped.title,
          description: scraped.description || null,
          imageUrl: scraped.imageUrl || null,
          servings: scraped.servings || 4,
          prepTime: scraped.prepTime || null,
          cookTime: scraped.cookTime || null,
          totalTime: scraped.totalTime || null,
          sourceUrl: input.url,
          source: scraped.source,
          category: scraped.category || null,
          cuisine: scraped.cuisine || null,
          difficulty: 'medium',
        })
        .run();

      const recipeId = Number(result.lastInsertRowid);

      for (let i = 0; i < scraped.ingredients.length; i++) {
        const ing = scraped.ingredients[i];
        if (!ing.name) continue;
        db.insert(schema.recipeIngredients)
          .values({
            recipeId,
            name: ing.name,
            amount: ing.amount,
            unit: ing.unit,
            sortOrder: i + 1,
          })
          .run();
      }

      for (const step of scraped.steps) {
        db.insert(schema.recipeSteps)
          .values({
            recipeId,
            stepNumber: step.stepNumber,
            instruction: step.instruction,
            imageUrl: step.imageUrl || null,
          })
          .run();
      }

      return {
        id: recipeId,
        title: scraped.title,
        strategy: scraped.strategy,
        ingredientsCount: scraped.ingredients.length,
        stepsCount: scraped.steps.length,
      };
    }),
});
