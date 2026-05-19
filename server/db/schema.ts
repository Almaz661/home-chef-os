import { pgTable, text, integer, serial, real, boolean, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * PostgreSQL schema (Neon). All timestamps use `timestamptz` so we don't
 * have to worry about deployment timezone drift.
 *
 * Date-only fields (expiry_date, week_start_date, receipt date) stay as
 * plain text in `YYYY-MM-DD` form so they sort lexicographically and the
 * existing string-based comparisons keep working.
 */

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  pin: text('pin').notNull(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const recipes = pgTable('recipes', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  imageUrl: text('image_url'),
  servings: integer('servings').default(4),
  prepTime: integer('prep_time'),
  cookTime: integer('cook_time'),
  totalTime: integer('total_time'),
  sourceUrl: text('source_url'),
  source: text('source'),
  category: text('category'),
  cuisine: text('cuisine'),
  difficulty: text('difficulty').default('medium'),
  calories: integer('calories'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const recipeIngredients = pgTable('recipe_ingredients', {
  id: serial('id').primaryKey(),
  recipeId: integer('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  amount: real('amount'),
  unit: text('unit'),
  group: text('group_name'),
  sortOrder: integer('sort_order').default(0),
});

export const recipeSteps = pgTable('recipe_steps', {
  id: serial('id').primaryKey(),
  recipeId: integer('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }),
  stepNumber: integer('step_number').notNull(),
  instruction: text('instruction').notNull(),
  imageUrl: text('image_url'),
  timerMinutes: integer('timer_minutes'),
});

export const menus = pgTable('menus', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  weekStartDate: text('week_start_date').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const menuItems = pgTable('menu_items', {
  id: serial('id').primaryKey(),
  menuId: integer('menu_id').notNull().references(() => menus.id, { onDelete: 'cascade' }),
  dayOfWeek: integer('day_of_week').notNull(),
  mealType: text('meal_type').notNull(),
  mealSlot: integer('meal_slot').default(0),
  recipeId: integer('recipe_id').references(() => recipes.id),
});

export const inventory = pgTable('inventory', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  productName: text('product_name').notNull(),
  quantity: real('quantity').default(1),
  unit: text('unit'),
  storageType: text('storage_type').notNull().default('fridge'),
  expiryDate: text('expiry_date'),
  minQuantity: real('min_quantity'),
  category: text('category'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const purchaseItems = pgTable('purchase_items', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  productName: text('product_name').notNull(),
  quantity: real('quantity').default(1),
  unit: text('unit'),
  category: text('category'),
  isChecked: boolean('is_checked').default(false),
  recipeSource: text('recipe_source'),
  /** How much the recipes called for, before subtracting stock. */
  neededQuantity: real('needed_quantity'),
  /** How much was already at home (subtracted from `quantity`). */
  inStockQuantity: real('in_stock_quantity').default(0),
  addedAt: timestamp('added_at', { withTimezone: true }).defaultNow(),
});

export const productMaster = pgTable('product_master', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  /** Dutch name, used to match products when scanning Dutch receipts. */
  nameNl: text('name_nl'),
  /** English name (for future imports / API matching). */
  nameEn: text('name_en'),
  defaultUnit: text('default_unit'),
  category: text('category'),
});

export const productAliases = pgTable('product_aliases', {
  id: serial('id').primaryKey(),
  productId: integer('product_id').notNull().references(() => productMaster.id, { onDelete: 'cascade' }),
  alias: text('alias').notNull(),
});

export const receipts = pgTable('receipts', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  storeName: text('store_name'),
  date: text('date'),
  totalAmount: real('total_amount'),
  currency: text('currency').default('EUR'),
  imageUrl: text('image_url'),
  /** 'pending' | 'parsed' | 'imported' | 'failed' */
  status: text('status').default('pending'),
  /** which OCR provider produced the items, if any */
  ocrProvider: text('ocr_provider'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const receiptItems = pgTable('receipt_items', {
  id: serial('id').primaryKey(),
  receiptId: integer('receipt_id').notNull().references(() => receipts.id, { onDelete: 'cascade' }),
  /** Russian display name (after translation, if any). */
  productName: text('product_name').notNull(),
  /** Original-language name (e.g. NL from a Dutch receipt). */
  originalName: text('original_name'),
  quantity: real('quantity'),
  unit: text('unit'),
  price: real('price'),
  currency: text('currency').default('EUR'),
  /** Linked product_master id (after auto-match or user confirmation). */
  matchedProductId: integer('matched_product_id').references(() => productMaster.id),
  /** Has the user already pushed this row into inventory? */
  wasAddedToInventory: boolean('was_added_to_inventory').default(false),
});

/** Cached FX rates so we don't call the upstream API on every page load. */
export const exchangeRates = pgTable('exchange_rates', {
  id: serial('id').primaryKey(),
  base: text('base').notNull(),
  quote: text('quote').notNull(),
  rate: real('rate').notNull(),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  baseQuoteIdx: uniqueIndex('exchange_rates_base_quote_idx').on(t.base, t.quote),
}));

/** ШефДом! Phase A — cooking history log */
export const cookingHistory = pgTable('cooking_history', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  recipeId: integer('recipe_id').references(() => recipes.id, { onDelete: 'set null' }),
  servings: integer('servings'),
  cookedAt: timestamp('cooked_at', { withTimezone: true }).defaultNow(),
});

/** Internal: schema migration tracking */
export const schemaMigrations = pgTable('schema_migrations', {
  version: integer('version').primaryKey(),
  appliedAt: timestamp('applied_at', { withTimezone: true }).defaultNow(),
});

// Re-export for callers that want raw SQL constructs
export { sql };
