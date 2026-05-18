import { z } from 'zod';
import { router, publicProcedure } from '../trpc.js';
import { db, schema } from '../db/index.js';
import { eq, and, sql } from 'drizzle-orm';

export const inventoryRouter = router({
  list: publicProcedure
    .input(z.object({ storageType: z.string().optional() }).optional())
    .query(async ({ input }) => {
      if (input?.storageType) {
        return db.select().from(schema.inventory)
          .where(eq(schema.inventory.storageType, input.storageType))
          .orderBy(schema.inventory.category, schema.inventory.productName)
          .all();
      }
      return db.select().from(schema.inventory)
        .orderBy(schema.inventory.storageType, schema.inventory.category, schema.inventory.productName)
        .all();
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
        const product = db.select().from(schema.productMaster)
          .where(sql`lower(${schema.productMaster.name}) = ${input.productName.toLowerCase()}`)
          .get();
        category = product?.category || 'Другое';
      }

      const result = db.insert(schema.inventory).values({
        userId: 1,
        productName: input.productName,
        quantity: input.quantity || 1,
        unit: input.unit || '',
        storageType: input.storageType,
        expiryDate: input.expiryDate || null,
        minQuantity: input.minQuantity || null,
        category,
      }).run();
      return { id: Number(result.lastInsertRowid) };
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
      const updateData: any = { ...data, updatedAt: sql`(datetime('now'))` };
      // Remove undefined values
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) delete updateData[key];
      });
      db.update(schema.inventory).set(updateData).where(eq(schema.inventory.id, id)).run();
      return { success: true };
    }),

  remove: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      db.delete(schema.inventory).where(eq(schema.inventory.id, input.id)).run();
      return { success: true };
    }),

  getStats: publicProcedure.query(async () => {
    const total = db.select({ count: sql<number>`count(*)` }).from(schema.inventory).get();
    const fridge = db.select({ count: sql<number>`count(*)` }).from(schema.inventory)
      .where(eq(schema.inventory.storageType, 'fridge')).get();
    const freezer = db.select({ count: sql<number>`count(*)` }).from(schema.inventory)
      .where(eq(schema.inventory.storageType, 'freezer')).get();
    const pantry = db.select({ count: sql<number>`count(*)` }).from(schema.inventory)
      .where(eq(schema.inventory.storageType, 'pantry')).get();

    // Count expiring soon (within 3 days)
    const expiringSoon = db.select({ count: sql<number>`count(*)` }).from(schema.inventory)
      .where(sql`${schema.inventory.expiryDate} IS NOT NULL AND ${schema.inventory.expiryDate} <= date('now', '+3 days')`)
      .get();

    return {
      total: total?.count || 0,
      fridge: fridge?.count || 0,
      freezer: freezer?.count || 0,
      pantry: pantry?.count || 0,
      expiringSoon: expiringSoon?.count || 0,
    };
  }),
});
