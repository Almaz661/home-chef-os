import { z } from 'zod';
import { router, publicProcedure } from '../trpc.js';
import { db, schema } from '../db/index.js';
import { eq, desc, sql, or } from 'drizzle-orm';
import { ocrImage, parseReceiptText, isOcrConfigured } from '../services/ocr.js';
import { translateBatch, isTranslatorConfigured } from '../services/translate.js';

/**
 * Look up an existing product by NL name, RU name, or EN name. Two-pass:
 * exact match first, then a "first-token starts with" fallback for fuzzy
 * matches like "Tomaten cherry" -> "Tomaten".
 */
async function findMatchingProduct(name: string) {
  const norm = name.trim().toLowerCase();
  if (!norm) return null;

  const [exact] = await db
    .select()
    .from(schema.productMaster)
    .where(
      or(
        sql`lower(${schema.productMaster.name}) = ${norm}`,
        sql`lower(${schema.productMaster.nameNl}) = ${norm}`,
        sql`lower(${schema.productMaster.nameEn}) = ${norm}`,
      ),
    )
    .limit(1);
  if (exact) return exact;

  const head = norm.split(/\s+/)[0];
  if (head.length < 3) return null;
  const headPattern = `${head}%`;
  const [fuzzy] = await db
    .select()
    .from(schema.productMaster)
    .where(
      or(
        sql`lower(${schema.productMaster.name}) ILIKE ${headPattern}`,
        sql`lower(${schema.productMaster.nameNl}) ILIKE ${headPattern}`,
        sql`lower(${schema.productMaster.nameEn}) ILIKE ${headPattern}`,
      ),
    )
    .limit(1);
  return fuzzy ?? null;
}

export const receiptsRouter = router({
  capabilities: publicProcedure.query(async () => ({
    ocr: isOcrConfigured(),
    translation: isTranslatorConfigured(),
  })),

  list: publicProcedure.query(async () => {
    return await db
      .select()
      .from(schema.receipts)
      .orderBy(desc(schema.receipts.createdAt));
  }),

  getById: publicProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const [receipt] = await db
      .select()
      .from(schema.receipts)
      .where(eq(schema.receipts.id, input.id))
      .limit(1);
    if (!receipt) return null;
    const items = await db
      .select()
      .from(schema.receiptItems)
      .where(eq(schema.receiptItems.receiptId, input.id));
    return { ...receipt, items };
  }),

  scan: publicProcedure
    .input(
      z.object({
        imageBase64: z.string().min(20),
        mimeType: z.string().default('image/jpeg'),
      }),
    )
    .mutation(async ({ input }) => {
      const ocr = await ocrImage(input.imageBase64, input.mimeType);

      if (!ocr.available) {
        const [{ id: receiptId }] = await db
          .insert(schema.receipts)
          .values({
            userId: 1,
            status: 'pending',
            currency: 'EUR',
          })
          .returning({ id: schema.receipts.id });
        return {
          receiptId,
          itemsCount: 0,
          ocrAvailable: false,
          translationAvailable: isTranslatorConfigured(),
          warning: 'OCR не настроен — введите позиции вручную или настройте OCR_SPACE_API_KEY.',
        };
      }

      const parsed = parseReceiptText(ocr.text);

      let translatedNames: string[];
      if (parsed.items.length > 0 && isTranslatorConfigured()) {
        const results = await translateBatch(
          parsed.items.map((i) => i.name),
          'NL',
          'RU',
        );
        translatedNames = results.map((r) => r.text);
      } else {
        translatedNames = parsed.items.map((i) => i.name);
      }

      const [{ id: receiptId }] = await db
        .insert(schema.receipts)
        .values({
          userId: 1,
          storeName: parsed.storeName,
          date: parsed.date,
          totalAmount: parsed.totalAmount,
          currency: 'EUR',
          status: 'parsed',
          ocrProvider: ocr.provider,
        })
        .returning({ id: schema.receipts.id });

      for (let i = 0; i < parsed.items.length; i++) {
        const item = parsed.items[i];
        const ruName = translatedNames[i];
        const matched =
          (await findMatchingProduct(ruName)) ?? (await findMatchingProduct(item.name));

        await db.insert(schema.receiptItems).values({
          receiptId,
          productName: ruName,
          originalName: item.name,
          quantity: item.quantity ?? 1,
          unit: item.unit ?? matched?.defaultUnit ?? null,
          price: item.price,
          currency: 'EUR',
          matchedProductId: matched?.id ?? null,
          wasAddedToInventory: false,
        });
      }

      return {
        receiptId,
        itemsCount: parsed.items.length,
        ocrAvailable: true,
        translationAvailable: isTranslatorConfigured(),
      };
    }),

  updateItem: publicProcedure
    .input(
      z.object({
        id: z.number(),
        productName: z.string().optional(),
        quantity: z.number().nullable().optional(),
        unit: z.string().nullable().optional(),
        price: z.number().nullable().optional(),
        matchedProductId: z.number().nullable().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { id, ...patch } = input;
      await db.update(schema.receiptItems).set(patch).where(eq(schema.receiptItems.id, id));
      return { success: true };
    }),

  deleteItem: publicProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    await db.delete(schema.receiptItems).where(eq(schema.receiptItems.id, input.id));
    return { success: true };
  }),

  delete: publicProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    await db.delete(schema.receipts).where(eq(schema.receipts.id, input.id));
    return { success: true };
  }),

  importToInventory: publicProcedure
    .input(
      z.object({
        receiptId: z.number(),
        storageType: z.enum(['fridge', 'freezer', 'pantry']).default('pantry'),
      }),
    )
    .mutation(async ({ input }) => {
      const items = await db
        .select()
        .from(schema.receiptItems)
        .where(eq(schema.receiptItems.receiptId, input.receiptId));

      let added = 0;
      for (const item of items) {
        if (item.wasAddedToInventory) continue;
        if (!item.productName) continue;

        const matched = item.matchedProductId
          ? (await db
              .select()
              .from(schema.productMaster)
              .where(eq(schema.productMaster.id, item.matchedProductId))
              .limit(1))[0]
          : null;

        await db.insert(schema.inventory).values({
          userId: 1,
          productName: matched?.name ?? item.productName,
          quantity: item.quantity ?? 1,
          unit: item.unit ?? matched?.defaultUnit ?? null,
          storageType: input.storageType,
          category: matched?.category ?? null,
        });

        await db
          .update(schema.receiptItems)
          .set({ wasAddedToInventory: true })
          .where(eq(schema.receiptItems.id, item.id));
        added++;
      }

      await db
        .update(schema.receipts)
        .set({ status: 'imported' })
        .where(eq(schema.receipts.id, input.receiptId));

      return { added };
    }),
});
