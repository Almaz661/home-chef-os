import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  pin: text('pin').notNull(),
  name: text('name').notNull(),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
});

export const recipes = sqliteTable('recipes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
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
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
});

export const recipeIngredients = sqliteTable('recipe_ingredients', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  recipeId: integer('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  amount: real('amount'),
  unit: text('unit'),
  group: text('group_name'),
  sortOrder: integer('sort_order').default(0),
});

export const recipeSteps = sqliteTable('recipe_steps', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  recipeId: integer('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }),
  stepNumber: integer('step_number').notNull(),
  instruction: text('instruction').notNull(),
  imageUrl: text('image_url'),
  timerMinutes: integer('timer_minutes'),
});

export const menus = sqliteTable('menus', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').references(() => users.id),
  weekStartDate: text('week_start_date').notNull(),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
});

export const menuItems = sqliteTable('menu_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  menuId: integer('menu_id').notNull().references(() => menus.id, { onDelete: 'cascade' }),
  dayOfWeek: integer('day_of_week').notNull(),
  mealType: text('meal_type').notNull(),
  mealSlot: integer('meal_slot').default(0),
  recipeId: integer('recipe_id').references(() => recipes.id),
});

export const inventory = sqliteTable('inventory', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').references(() => users.id),
  productName: text('product_name').notNull(),
  quantity: real('quantity').default(1),
  unit: text('unit'),
  storageType: text('storage_type').notNull().default('fridge'),
  expiryDate: text('expiry_date'),
  minQuantity: real('min_quantity'),
  category: text('category'),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
});

export const purchaseItems = sqliteTable('purchase_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').references(() => users.id),
  productName: text('product_name').notNull(),
  quantity: real('quantity').default(1),
  unit: text('unit'),
  category: text('category'),
  isChecked: integer('is_checked', { mode: 'boolean' }).default(false),
  recipeSource: text('recipe_source'),
  addedAt: text('added_at').default(sql`(datetime('now'))`),
});

export const productMaster = sqliteTable('product_master', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  defaultUnit: text('default_unit'),
  category: text('category'),
});

export const productAliases = sqliteTable('product_aliases', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  productId: integer('product_id').notNull().references(() => productMaster.id, { onDelete: 'cascade' }),
  alias: text('alias').notNull(),
});

export const receipts = sqliteTable('receipts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').references(() => users.id),
  storeName: text('store_name'),
  date: text('date'),
  totalAmount: real('total_amount'),
  currency: text('currency').default('EUR'),
  imageUrl: text('image_url'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
});

export const receiptItems = sqliteTable('receipt_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  receiptId: integer('receipt_id').notNull().references(() => receipts.id, { onDelete: 'cascade' }),
  productName: text('product_name').notNull(),
  quantity: real('quantity'),
  unit: text('unit'),
  price: real('price'),
  currency: text('currency').default('EUR'),
});
