import { z } from 'zod';
import { router, publicProcedure } from '../trpc.js';
import { db, schema } from '../db/index.js';
import { eq, like, sql } from 'drizzle-orm';

export const productsRouter = router({
  list: publicProcedure
    .input(z.object({ search: z.string().optional() }).optional())
    .query(async ({ input }) => {
      if (input?.search) {
        return db.select().from(schema.productMaster)
          .where(like(schema.productMaster.name, `%${input.search}%`))
          .orderBy(schema.productMaster.category, schema.productMaster.name)
          .all();
      }
      return db.select().from(schema.productMaster)
        .orderBy(schema.productMaster.category, schema.productMaster.name)
        .all();
    }),

  add: publicProcedure
    .input(z.object({
      name: z.string().min(1),
      defaultUnit: z.string().optional(),
      category: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const result = db.insert(schema.productMaster).values(input).run();
      return { id: Number(result.lastInsertRowid) };
    }),

  update: publicProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      defaultUnit: z.string().optional(),
      category: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      db.update(schema.productMaster).set(data).where(eq(schema.productMaster.id, id)).run();
      return { success: true };
    }),

  remove: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      db.delete(schema.productMaster).where(eq(schema.productMaster.id, input.id)).run();
      return { success: true };
    }),

  getStats: publicProcedure.query(async () => {
    const count = db.select({ count: sql<number>`count(*)` }).from(schema.productMaster).get();
    return { total: count?.count || 0 };
  }),

  getCategories: publicProcedure.query(async () => {
    const results = db.selectDistinct({ category: schema.productMaster.category })
      .from(schema.productMaster)
      .where(sql`${schema.productMaster.category} IS NOT NULL`)
      .all();
    return results.map(r => r.category).filter(Boolean) as string[];
  }),
});
