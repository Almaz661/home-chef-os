import { z } from 'zod';
import { router, publicProcedure } from '../trpc.js';
import { db, schema } from '../db/index.js';
import { eq, sql } from 'drizzle-orm';

export const shoppingRouter = router({
  list: publicProcedure.query(async () => {
    const items = db.select().from(schema.purchaseItems)
      .orderBy(schema.purchaseItems.category, schema.purchaseItems.productName)
      .all();
    return items;
  }),

  add: publicProcedure
    .input(z.object({
      productName: z.string().min(1),
      quantity: z.number().optional(),
      unit: z.string().optional(),
      category: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      // Check if same product already exists
      const existing = db.select().from(schema.purchaseItems)
        .where(sql`lower(${schema.purchaseItems.productName}) = ${input.productName.toLowerCase()}`)
        .get();

      if (existing) {
        db.update(schema.purchaseItems)
          .set({ quantity: (existing.quantity || 0) + (input.quantity || 1) })
          .where(eq(schema.purchaseItems.id, existing.id))
          .run();
        return { id: existing.id };
      }

      // Try to find category from product master
      let category = input.category;
      if (!category) {
        const product = db.select().from(schema.productMaster)
          .where(sql`lower(${schema.productMaster.name}) = ${input.productName.toLowerCase()}`)
          .get();
        category = product?.category || 'Другое';
      }

      const result = db.insert(schema.purchaseItems).values({
        userId: 1,
        productName: input.productName,
        quantity: input.quantity || 1,
        unit: input.unit || '',
        category,
        isChecked: false,
      }).run();
      return { id: Number(result.lastInsertRowid) };
    }),

  toggleChecked: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const item = db.select().from(schema.purchaseItems)
        .where(eq(schema.purchaseItems.id, input.id))
        .get();
      if (item) {
        const newChecked = !item.isChecked;
        db.update(schema.purchaseItems)
          .set({ isChecked: newChecked })
          .where(eq(schema.purchaseItems.id, input.id))
          .run();

        // ШефДом! Phase A: auto-add to inventory when checked
        if (newChecked && item.productName) {
          // Look up category from product master
          const product = db.select().from(schema.productMaster)
            .where(sql`lower(${schema.productMaster.name}) = ${item.productName.toLowerCase()}`)
            .get();

          const category = product?.category || item.category || 'Другое';

          // Smart storage: pantry items go to pantry, perishables to fridge
          const PANTRY_CATEGORIES = ['Бакалея', 'Крупы', 'Специи', 'Консервы', 'Соусы', 'Другое'];
          const FREEZER_CATEGORIES = ['Заморозка'];
          let storageType: string = 'fridge';
          if (PANTRY_CATEGORIES.includes(category)) {
            storageType = 'pantry';
          } else if (FREEZER_CATEGORIES.includes(category)) {
            storageType = 'freezer';
          }

          db.insert(schema.inventory).values({
            userId: 1,
            productName: item.productName,
            quantity: item.quantity || 1,
            unit: item.unit || '',
            storageType,
            category,
          }).run();
        }

        // If unchecked, remove the last matching item from inventory
        if (!newChecked && item.productName) {
          const invItem = db.select().from(schema.inventory)
            .where(sql`lower(${schema.inventory.productName}) = ${item.productName.toLowerCase()}`)
            .limit(1)
            .get();
          if (invItem) {
            db.delete(schema.inventory)
              .where(eq(schema.inventory.id, invItem.id))
              .run();
          }
        }
      }
      return { success: true };
    }),

  remove: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      db.delete(schema.purchaseItems).where(eq(schema.purchaseItems.id, input.id)).run();
      return { success: true };
    }),

  clearChecked: publicProcedure.mutation(async () => {
    db.delete(schema.purchaseItems)
      .where(eq(schema.purchaseItems.isChecked, true))
      .run();
    return { success: true };
  }),

  getStats: publicProcedure.query(async () => {
    const total = db.select({ count: sql<number>`count(*)` }).from(schema.purchaseItems).get();
    const unchecked = db.select({ count: sql<number>`count(*)` }).from(schema.purchaseItems)
      .where(eq(schema.purchaseItems.isChecked, false)).get();
    return { total: total?.count || 0, unchecked: unchecked?.count || 0 };
  }),
});
