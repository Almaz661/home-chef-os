import { z } from 'zod';
import { router, publicProcedure } from '../trpc.js';
import { db, schema } from '../db/index.js';
import { eq, sql } from 'drizzle-orm';

export const productsRouter = router({
  list: publicProcedure
    .input(z.object({ search: z.string().optional() }).optional())
    .query(async ({ input }) => {
      if (input?.search) {
        const term = `%${input.search}%`;
        return await db
          .select()
          .from(schema.productMaster)
          .where(
            sql`${schema.productMaster.name} ILIKE ${term}
                OR ${schema.productMaster.nameNl} ILIKE ${term}
                OR ${schema.productMaster.nameEn} ILIKE ${term}`,
          )
          .orderBy(schema.productMaster.category, schema.productMaster.name);
      }
      return await db
        .select()
        .from(schema.productMaster)
        .orderBy(schema.productMaster.category, schema.productMaster.name);
    }),

  add: publicProcedure
    .input(z.object({
      name: z.string().min(1),
      nameNl: z.string().optional(),
      nameEn: z.string().optional(),
      defaultUnit: z.string().optional(),
      category: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const [{ id }] = await db
        .insert(schema.productMaster)
        .values(input)
        .returning({ id: schema.productMaster.id });
      return { id };
    }),

  update: publicProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      nameNl: z.string().nullable().optional(),
      nameEn: z.string().nullable().optional(),
      defaultUnit: z.string().optional(),
      category: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await db.update(schema.productMaster).set(data).where(eq(schema.productMaster.id, id));
      return { success: true };
    }),

  remove: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.delete(schema.productMaster).where(eq(schema.productMaster.id, input.id));
      return { success: true };
    }),

  getStats: publicProcedure.query(async () => {
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.productMaster);
    return { total: row?.count || 0 };
  }),

  getCategories: publicProcedure.query(async () => {
    const results = await db
      .selectDistinct({ category: schema.productMaster.category })
      .from(schema.productMaster)
      .where(sql`${schema.productMaster.category} IS NOT NULL`);
    return results.map((r) => r.category).filter(Boolean) as string[];
  }),
});
