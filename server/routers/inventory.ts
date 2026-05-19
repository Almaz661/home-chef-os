import { z } from 'zod';
import { router, publicProcedure } from '../trpc.js';
import { db, schema } from '../db/index.js';
import { eq, sql } from 'drizzle-orm';

export const inventoryRouter = router({
  list: publicProcedure
    .input(z.object({ storageType: z.string().optional() }).optional())
    .query(async ({ input }) => {
      if (input?.storageType) {
        return await db
          .select()
          .from(schema.inventory)
          .where(eq(schema.inventory.storageType, input.storageType))
          .orderBy(schema.inventory.category, schema.inventory.productName);
      }
      return await db
        .select()
        .from(schema.inventory)
        .orderBy(
          schema.inventory.storageType,
          schema.inventory.category,
          schema.inventory.productName,
        );
    }),

  add: publicProcedure
    .input(z.object({
      productName: z.string().min(1),
      quantity: z.number().optional(),
      unit: z.string().optional(),
      storageType: z.enum(['fridge', 'freezer', 'pantry']),
      expiryDate: z.string().optional(),
      minQuantity: z.number().optional(),
      category: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      let category = input.category;
      if (!category) {
        const [product] = await db
          .select()
          .from(schema.productMaster)
          .where(sql`lower(${schema.productMaster.name}) = ${input.productName.toLowerCase()}`)
          .limit(1);
        category = product?.category || 'Другое';
      }

      const [{ id }] = await db
        .insert(schema.inventory)
        .values({
          userId: 1,
          productName: input.productName,
          quantity: input.quantity || 1,
          unit: input.unit || '',
          storageType: input.storageType,
          expiryDate: input.expiryDate || null,
          minQuantity: input.minQuantity || null,
          category,
        })
        .returning({ id: schema.inventory.id });
      return { id };
    }),

  update: publicProcedure
    .input(z.object({
      id: z.number(),
      productName: z.string().optional(),
      quantity: z.number().optional(),
      unit: z.string().optional(),
      storageType: z.enum(['fridge', 'freezer', 'pantry']).optional(),
      expiryDate: z.string().nullable().optional(),
      minQuantity: z.number().nullable().optional(),
      category: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const updateData: Record<string, unknown> = { ...data, updatedAt: sql`now()` };
      Object.keys(updateData).forEach((key) => {
        if (updateData[key] === undefined) delete updateData[key];
      });
      await db.update(schema.inventory).set(updateData).where(eq(schema.inventory.id, id));
      return { success: true };
    }),

  remove: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.delete(schema.inventory).where(eq(schema.inventory.id, input.id));
      return { success: true };
    }),

  getStats: publicProcedure.query(async () => {
    const [total] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.inventory);
    const [fridge] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.inventory)
      .where(eq(schema.inventory.storageType, 'fridge'));
    const [freezer] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.inventory)
      .where(eq(schema.inventory.storageType, 'freezer'));
    const [pantry] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.inventory)
      .where(eq(schema.inventory.storageType, 'pantry'));

    // Items expiring within 3 days. expiry_date is YYYY-MM-DD text.
    const [expiringSoon] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.inventory)
      .where(
        sql`${schema.inventory.expiryDate} IS NOT NULL
            AND ${schema.inventory.expiryDate} <= to_char(current_date + interval '3 days', 'YYYY-MM-DD')`,
      );

    return {
      total: total?.count || 0,
      fridge: fridge?.count || 0,
      freezer: freezer?.count || 0,
      pantry: pantry?.count || 0,
      expiringSoon: expiringSoon?.count || 0,
    };
  }),
});
