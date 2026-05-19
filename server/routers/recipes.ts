import { z } from 'zod';
import { router, publicProcedure } from '../trpc.js';
import { db, schema } from '../db/index.js';
import { eq, ilike, and, or, sql, desc } from 'drizzle-orm';
import { startSectionImport, getSectionImportStatus, listActiveImportJobs } from '../services/sectionImport.js';

export const recipesRouter = router({
  list: publicProcedure
    .input(z.object({
      search: z.string().optional(),
      category: z.string().optional(),
      difficulty: z.string().optional(),
      maxTime: z.number().optional(),
    }).optional())
    .query(async ({ input }) => {
      const conditions: any[] = [];

      if (input?.search) {
        const term = `%${input.search}%`;
        conditions.push(
          or(
            ilike(schema.recipes.title, term),
            ilike(schema.recipes.description, term),
          ),
        );
      }
      if (input?.category) {
        conditions.push(eq(schema.recipes.category, input.category));
      }
      if (input?.difficulty) {
        conditions.push(eq(schema.recipes.difficulty, input.difficulty));
      }

      let results = conditions.length > 0
        ? await db.select().from(schema.recipes).where(and(...conditions)).orderBy(desc(schema.recipes.createdAt))
        : await db.select().from(schema.recipes).orderBy(desc(schema.recipes.createdAt));

      if (input?.maxTime) {
        results = results.filter((r) => (r.totalTime || 999) <= input.maxTime!);
      }

      return results;
    }),

  getById: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const [recipe] = await db
        .select()
        .from(schema.recipes)
        .where(eq(schema.recipes.id, input.id))
        .limit(1);
      if (!recipe) return null;

      const ingredients = await db
        .select()
        .from(schema.recipeIngredients)
        .where(eq(schema.recipeIngredients.recipeId, input.id))
        .orderBy(schema.recipeIngredients.sortOrder);

      const steps = await db
        .select()
        .from(schema.recipeSteps)
        .where(eq(schema.recipeSteps.recipeId, input.id))
        .orderBy(schema.recipeSteps.stepNumber);

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

      const [{ id: recipeId }] = await db
        .insert(schema.recipes)
        .values(recipeData)
        .returning({ id: schema.recipes.id });

      if (ingredients.length > 0) {
        await db.insert(schema.recipeIngredients).values(
          ingredients.map((ing) => ({
            recipeId,
            name: ing.name,
            amount: ing.amount ?? null,
            unit: ing.unit ?? null,
            group: ing.group ?? null,
            sortOrder: ing.sortOrder ?? 0,
          })),
        );
      }

      if (steps.length > 0) {
        await db.insert(schema.recipeSteps).values(
          steps.map((step) => ({
            recipeId,
            stepNumber: step.stepNumber,
            instruction: step.instruction,
            imageUrl: step.imageUrl ?? null,
            timerMinutes: step.timerMinutes ?? null,
          })),
        );
      }

      return { id: recipeId };
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.delete(schema.recipes).where(eq(schema.recipes.id, input.id));
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

      const [existing] = await db
        .select()
        .from(schema.recipes)
        .where(eq(schema.recipes.id, id))
        .limit(1);
      if (!existing) {
        throw new Error('Рецепт не найден');
      }

      await db
        .update(schema.recipes)
        .set({
          ...recipeData,
          updatedAt: sql`now()`,
        })
        .where(eq(schema.recipes.id, id));

      // Replace ingredients and steps wholesale (the form sends the full list).
      await db
        .delete(schema.recipeIngredients)
        .where(eq(schema.recipeIngredients.recipeId, id));
      await db
        .delete(schema.recipeSteps)
        .where(eq(schema.recipeSteps.recipeId, id));

      if (ingredients.length > 0) {
        await db.insert(schema.recipeIngredients).values(
          ingredients.map((ing) => ({
            recipeId: id,
            name: ing.name,
            amount: ing.amount ?? null,
            unit: ing.unit ?? null,
            group: ing.group ?? null,
            sortOrder: ing.sortOrder ?? 0,
          })),
        );
      }

      if (steps.length > 0) {
        await db.insert(schema.recipeSteps).values(
          steps.map((step) => ({
            recipeId: id,
            stepNumber: step.stepNumber,
            instruction: step.instruction,
            imageUrl: step.imageUrl ?? null,
            timerMinutes: step.timerMinutes ?? null,
          })),
        );
      }

      return { id, success: true };
    }),

  getCategories: publicProcedure.query(async () => {
    const results = await db
      .selectDistinct({ category: schema.recipes.category })
      .from(schema.recipes)
      .where(sql`${schema.recipes.category} IS NOT NULL`);
    return results.map((r) => r.category).filter(Boolean) as string[];
  }),

  getStats: publicProcedure.query(async () => {
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.recipes);
    return { total: row?.count || 0 };
  }),

  /**
   * Import a single recipe by URL — unchanged behaviour from before.
   */
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

      const [{ id: recipeId }] = await db
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
        .returning({ id: schema.recipes.id });

      const ingredientRows = scraped.ingredients
        .filter((ing) => ing.name)
        .map((ing, i) => ({
          recipeId,
          name: ing.name,
          amount: ing.amount,
          unit: ing.unit,
          sortOrder: i + 1,
        }));
      if (ingredientRows.length > 0) {
        await db.insert(schema.recipeIngredients).values(ingredientRows);
      }

      const stepRows = scraped.steps.map((step) => ({
        recipeId,
        stepNumber: step.stepNumber,
        instruction: step.instruction,
        imageUrl: step.imageUrl || null,
      }));
      if (stepRows.length > 0) {
        await db.insert(schema.recipeSteps).values(stepRows);
      }

      return {
        id: recipeId,
        title: scraped.title,
        strategy: scraped.strategy,
        ingredientsCount: scraped.ingredients.length,
        stepsCount: scraped.steps.length,
      };
    }),

  /**
   * Bulk import: kicks off a background job that scrapes all recipe links
   * from a section/category page and imports each one. Returns a jobId
   * the client polls via importSectionStatus for progress.
   */
  importSectionStart: publicProcedure
    .input(
      z.object({
        url: z.string().url(),
        /** Cap how many recipes to import in one job (safety net). */
        limit: z.number().min(1).max(1000).default(500),
        /** Politeness delay between recipe fetches, ms. */
        delayMs: z.number().min(0).max(30000).default(2000),
      }),
    )
    .mutation(async ({ input }) => {
      const job = startSectionImport(input);
      return { jobId: job.jobId };
    }),

  importSectionStatus: publicProcedure
    .input(z.object({ jobId: z.string() }))
    .query(async ({ input }) => {
      const job = getSectionImportStatus(input.jobId);
      if (!job) return null;
      // Trim errors list size for transport.
      return {
        jobId: job.jobId,
        url: job.url,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
        done: job.done,
        cancelled: job.cancelled,
        phase: job.phase,
        total: job.total,
        processed: job.processed,
        success: job.success,
        skipped: job.skipped,
        failed: job.failed,
        currentTitle: job.currentTitle,
        currentUrl: job.currentUrl,
        errors: job.errors.slice(-20),
        recentlyAdded: job.recentlyAdded.slice(-10),
      };
    }),

  importSectionList: publicProcedure.query(async () => {
    const jobs = listActiveImportJobs();
    return jobs.map((job) => ({
      jobId: job.jobId,
      url: job.url,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      done: job.done,
      total: job.total,
      processed: job.processed,
      success: job.success,
    }));
  }),

  importSectionCancel: publicProcedure
    .input(z.object({ jobId: z.string() }))
    .mutation(async ({ input }) => {
      const job = getSectionImportStatus(input.jobId);
      if (!job) throw new Error('Задача не найдена');
      job.cancelled = true;
      return { success: true };
    }),
});
