import { z } from 'zod';
import { router, publicProcedure } from '../trpc.js';
import { db, schema } from '../db/index.js';
import { eq, sql } from 'drizzle-orm';

export const shoppingRouter = router({
  list: publicProcedure.query(async () => {
    const items = await db
      .select()
      .from(schema.purchaseItems)
      .orderBy(schema.purchaseItems.category, schema.purchaseItems.productName);
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
      // Merge if same product already exists
      const [existing] = await db
        .select()
        .from(schema.purchaseItems)
        .where(sql`lower(${schema.purchaseItems.productName}) = ${input.productName.toLowerCase()}`)
        .limit(1);

      if (existing) {
        await db
          .update(schema.purchaseItems)
          .set({ quantity: (existing.quantity || 0) + (input.quantity || 1) })
          .where(eq(schema.purchaseItems.id, existing.id));
        return { id: existing.id };
      }

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
        .insert(schema.purchaseItems)
        .values({
          userId: 1,
          productName: input.productName,
          quantity: input.quantity || 1,
          unit: input.unit || '',
          category,
          isChecked: false,
        })
        .returning({ id: schema.purchaseItems.id });
      return { id };
    }),

  toggleChecked: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const [item] = await db
        .select()
        .from(schema.purchaseItems)
        .where(eq(schema.purchaseItems.id, input.id))
        .limit(1);
      if (!item) return { success: true };

      const newChecked = !item.isChecked;
      await db
        .update(schema.purchaseItems)
        .set({ isChecked: newChecked })
        .where(eq(schema.purchaseItems.id, input.id));

      // ШефДом! Phase A: auto-add to inventory when checked
      if (newChecked && item.productName) {
        const [product] = await db
          .select()
          .from(schema.productMaster)
          .where(sql`lower(${schema.productMaster.name}) = ${item.productName.toLowerCase()}`)
          .limit(1);

        const category = product?.category || item.category || 'Другое';

        // Smart storage: vegetables/fruits to pantry, dairy/meat to fridge.
        const PANTRY_CATEGORIES = [
          'Бакалея', 'Крупы', 'Специи', 'Консервы', 'Соусы',
          'Овощи', 'Фрукты', 'Другое',
        ];
        const FRIDGE_CATEGORIES = [
          'Молочные', 'Мясо', 'Рыба', 'Морепродукты', 'Зелень', 'Яйца',
        ];
        const FREEZER_CATEGORIES = ['Заморозка'];
        let storageType: string;
        if (FRIDGE_CATEGORIES.includes(category)) {
          storageType = 'fridge';
        } else if (FREEZER_CATEGORIES.includes(category)) {
          storageType = 'freezer';
        } else {
          storageType = 'pantry';
        }

        await db.insert(schema.inventory).values({
          userId: 1,
          productName: item.productName,
          quantity: item.quantity || 1,
          unit: item.unit || '',
          storageType,
          category,
        });
      }

      // If unchecked, remove the last matching item from inventory
      if (!newChecked && item.productName) {
        const [invItem] = await db
          .select()
          .from(schema.inventory)
          .where(sql`lower(${schema.inventory.productName}) = ${item.productName.toLowerCase()}`)
          .limit(1);
        if (invItem) {
          await db.delete(schema.inventory).where(eq(schema.inventory.id, invItem.id));
        }
      }
      return { success: true };
    }),

  remove: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.delete(schema.purchaseItems).where(eq(schema.purchaseItems.id, input.id));
      return { success: true };
    }),

  clearChecked: publicProcedure.mutation(async () => {
    await db
      .delete(schema.purchaseItems)
      .where(eq(schema.purchaseItems.isChecked, true));
    return { success: true };
  }),

  getStats: publicProcedure.query(async () => {
    const [totalRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.purchaseItems);
    const [uncheckedRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.purchaseItems)
      .where(eq(schema.purchaseItems.isChecked, false));
    return {
      total: totalRow?.count || 0,
      unchecked: uncheckedRow?.count || 0,
    };
  }),
});
