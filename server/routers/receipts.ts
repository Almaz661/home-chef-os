import { z } from 'zod';
import { router, publicProcedure } from '../trpc.js';
import { db, schema } from '../db/index.js';
import { eq, desc, sql, like, or } from 'drizzle-orm';
import { ocrImage, parseReceiptText, isOcrConfigured } from '../services/ocr.js';
import { translateBatch, isTranslatorConfigured } from '../services/translate.js';

/**
 * Look up an existing product by NL name, RU name, or EN name (case-insensitive,
 * and an extra "starts with" pass for fuzziness like "Tomaten cherry" -> "Tomaten").
 */
function findMatchingProduct(name: string) {
  const norm = name.trim().toLowerCase();
  if (!norm) return null;

  const exact = db
    .select()
    .from(schema.productMaster)
    .where(
      or(
        sql`lower(${schema.productMaster.name}) = ${norm}`,
        sql`lower(${schema.productMaster.nameNl}) = ${norm}`,
        sql`lower(${schema.productMaster.nameEn}) = ${norm}`,
      ),
    )
    .get();
  if (exact) return exact;

  // Fuzzy: receipt token is a prefix of product name (or vice versa)
  const head = norm.split(/\s+/)[0];
  if (head.length < 3) return null;
  const fuzzy = db
    .select()
    .from(schema.productMaster)
    .where(
      or(
        like(sql`lower(${schema.productMaster.name})`, `${head}%`),
        like(sql`lower(${schema.productMaster.nameNl})`, `${head}%`),
        like(sql`lower(${schema.productMaster.nameEn})`, `${head}%`),
      ),
    )
    .get();
  return fuzzy ?? null;
}

export const receiptsRouter = router({
  /**
   * Capability check for the UI: which optional integrations are configured.
   * Lets the UI hide/disable buttons before the user tries to use them.
   */
  capabilities: publicProcedure.query(async () => ({
    ocr: isOcrConfigured(),
    translation: isTranslatorConfigured(),
  })),

  list: publicProcedure.query(async () => {
    return db.select().from(schema.receipts).orderBy(desc(schema.receipts.createdAt)).all();
  }),

  getById: publicProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const receipt = db
      .select()
      .from(schema.receipts)
      .where(eq(schema.receipts.id, input.id))
      .get();
    if (!receipt) return null;
    const items = db
      .select()
      .from(schema.receiptItems)
      .where(eq(schema.receiptItems.receiptId, input.id))
      .all();
    return { ...receipt, items };
  }),

  /**
   * Scan a base64-encoded receipt photo. The flow is:
   *   1. Run OCR (if configured). If not, create an empty pending receipt.
   *   2. Parse the OCR text into store/date/total + line items.
   *   3. Translate Dutch product names to Russian (if configured).
   *   4. Try to match each item to product_master.
   *   5. Persist receipt + items with status='parsed'.
   */
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
        // Create empty receipt — user will fill it manually.
        const r = db
          .insert(schema.receipts)
          .values({
            userId: 1,
            status: 'pending',
            currency: 'EUR',
          })
          .run();
        return {
          receiptId: Number(r.lastInsertRowid),
          itemsCount: 0,
          ocrAvailable: false,
          translationAvailable: isTranslatorConfigured(),
          warning: 'OCR не настроен — введите позиции вручную или настройте OCR_SPACE_API_KEY.',
        };
      }

      const parsed = parseReceiptText(ocr.text);

      // Translate names (Dutch -> Russian)
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

      // Persist
      const insertedReceipt = db
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
        .run();
      const receiptId = Number(insertedReceipt.lastInsertRowid);

      for (let i = 0; i < parsed.items.length; i++) {
        const item = parsed.items[i];
        const ruName = translatedNames[i];
        const matched = findMatchingProduct(ruName) ?? findMatchingProduct(item.name);

        db.insert(schema.receiptItems)
          .values({
            receiptId,
            productName: ruName,
            originalName: item.name,
            quantity: item.quantity ?? 1,
            unit: item.unit ?? matched?.defaultUnit ?? null,
            price: item.price,
            currency: 'EUR',
            matchedProductId: matched?.id ?? null,
            wasAddedToInventory: false,
          })
          .run();
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
      db.update(schema.receiptItems).set(patch).where(eq(schema.receiptItems.id, id)).run();
      return { success: true };
    }),

  deleteItem: publicProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    db.delete(schema.receiptItems).where(eq(schema.receiptItems.id, input.id)).run();
    return { success: true };
  }),

  delete: publicProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    db.delete(schema.receipts).where(eq(schema.receipts.id, input.id)).run();
    return { success: true };
  }),

  /**
   * Push everything from this receipt into inventory. Items already pushed
   * (was_added_to_inventory) are skipped. Returns the count actually added.
   */
  importToInventory: publicProcedure
    .input(
      z.object({
        receiptId: z.number(),
        storageType: z.enum(['fridge', 'freezer', 'pantry']).default('pantry'),
      }),
    )
    .mutation(async ({ input }) => {
      const items = db
        .select()
        .from(schema.receiptItems)
        .where(eq(schema.receiptItems.receiptId, input.receiptId))
        .all();

      let added = 0;
      for (const item of items) {
        if (item.wasAddedToInventory) continue;
        if (!item.productName) continue;

        const matched = item.matchedProductId
          ? db
              .select()
              .from(schema.productMaster)
              .where(eq(schema.productMaster.id, item.matchedProductId))
              .get()
          : null;

        db.insert(schema.inventory)
          .values({
            userId: 1,
            productName: matched?.name ?? item.productName,
            quantity: item.quantity ?? 1,
            unit: item.unit ?? matched?.defaultUnit ?? null,
            storageType: input.storageType,
            category: matched?.category ?? null,
          })
          .run();

        db.update(schema.receiptItems)
          .set({ wasAddedToInventory: true })
          .where(eq(schema.receiptItems.id, item.id))
          .run();
        added++;
      }

      db.update(schema.receipts)
        .set({ status: 'imported' })
        .where(eq(schema.receipts.id, input.receiptId))
        .run();

      return { added };
    }),
});
