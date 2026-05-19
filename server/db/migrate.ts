import Database from 'better-sqlite3';
import { join, dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

/**
 * Migrations are versioned via PRAGMA user_version.
 *
 * V1: initial schema (CREATE TABLE IF NOT EXISTS ...).
 * V2: shopping list — track in-stock context for each item.
 *
 * To add a new migration, push another entry to MIGRATIONS with
 * incremented version. Each migration runs inside a transaction.
 */
const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pin TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recipes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  servings INTEGER DEFAULT 4,
  prep_time INTEGER,
  cook_time INTEGER,
  total_time INTEGER,
  source_url TEXT,
  source TEXT,
  category TEXT,
  cuisine TEXT,
  difficulty TEXT DEFAULT 'medium',
  calories INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount REAL,
  unit TEXT,
  group_name TEXT,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS recipe_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  instruction TEXT NOT NULL,
  image_url TEXT,
  timer_minutes INTEGER
);

CREATE TABLE IF NOT EXISTS menus (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  week_start_date TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS menu_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  menu_id INTEGER NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL,
  meal_type TEXT NOT NULL,
  meal_slot INTEGER DEFAULT 0,
  recipe_id INTEGER REFERENCES recipes(id)
);

CREATE TABLE IF NOT EXISTS inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  product_name TEXT NOT NULL,
  quantity REAL DEFAULT 1,
  unit TEXT,
  storage_type TEXT NOT NULL DEFAULT 'fridge',
  expiry_date TEXT,
  min_quantity REAL,
  category TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  product_name TEXT NOT NULL,
  quantity REAL DEFAULT 1,
  unit TEXT,
  category TEXT,
  is_checked INTEGER DEFAULT 0,
  recipe_source TEXT,
  added_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS product_master (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  default_unit TEXT,
  category TEXT
);

CREATE TABLE IF NOT EXISTS product_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES product_master(id) ON DELETE CASCADE,
  alias TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  store_name TEXT,
  date TEXT,
  total_amount REAL,
  currency TEXT DEFAULT 'EUR',
  image_url TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS receipt_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_id INTEGER NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  quantity REAL,
  unit TEXT,
  price REAL,
  currency TEXT DEFAULT 'EUR'
);

CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_id ON recipe_ingredients(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_steps_recipe_id ON recipe_steps(recipe_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_menu_id ON menu_items(menu_id);
CREATE INDEX IF NOT EXISTS idx_inventory_storage ON inventory(storage_type);
CREATE INDEX IF NOT EXISTS idx_purchase_items_user ON purchase_items(user_id);
`;

// V2: track inventory context on shopping list items
//   - needed_quantity: how much the recipes called for (before subtracting stock)
//   - in_stock_quantity: how much was already at home
//   - quantity is the final amount the user still needs to buy
const SCHEMA_V2 = `
ALTER TABLE purchase_items ADD COLUMN needed_quantity REAL;
ALTER TABLE purchase_items ADD COLUMN in_stock_quantity REAL DEFAULT 0;
`;

// V3: receipts + i18n metadata
//   - receipt_items.matched_product_id: link to product_master (after OCR + matching)
//   - receipt_items.was_added_to_inventory: prevent double-counting on re-import
//   - receipt_items.original_name: NL or other source language; product_name is RU
//   - product_master.name_nl: known NL name (for matching/scanning Dutch receipts)
//   - exchange_rates: cached daily EUR->RUB (and others)
const SCHEMA_V3 = `
ALTER TABLE receipt_items ADD COLUMN matched_product_id INTEGER REFERENCES product_master(id);
ALTER TABLE receipt_items ADD COLUMN was_added_to_inventory INTEGER DEFAULT 0;
ALTER TABLE receipt_items ADD COLUMN original_name TEXT;
ALTER TABLE receipts ADD COLUMN status TEXT DEFAULT 'pending';
ALTER TABLE receipts ADD COLUMN ocr_provider TEXT;

ALTER TABLE product_master ADD COLUMN name_nl TEXT;
ALTER TABLE product_master ADD COLUMN name_en TEXT;

CREATE TABLE IF NOT EXISTS exchange_rates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  base TEXT NOT NULL,
  quote TEXT NOT NULL,
  rate REAL NOT NULL,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(base, quote)
);
`;

// V4: ШефДом! Phase A — cooking history
const SCHEMA_V4 = `
CREATE TABLE IF NOT EXISTS cooking_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  recipe_id INTEGER REFERENCES recipes(id) ON DELETE SET NULL,
  servings INTEGER,
  cooked_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cooking_history_recipe ON cooking_history(recipe_id);
CREATE INDEX IF NOT EXISTS idx_cooking_history_date ON cooking_history(cooked_at);
`;

const MIGRATIONS: Array<{ version: number; sql: string }> = [
  { version: 1, sql: SCHEMA_V1 },
  { version: 2, sql: SCHEMA_V2 },
  { version: 3, sql: SCHEMA_V3 },
  { version: 4, sql: SCHEMA_V4 },
];

export function runMigrations() {
  const dbPath = process.env.DB_PATH
    ? resolve(process.env.DB_PATH)
    : join(process.cwd(), 'data', 'homechef.db');

  mkdirSync(dirname(dbPath), { recursive: true });

  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  const currentVersion = (sqlite.pragma('user_version', { simple: true }) as number) ?? 0;

  for (const m of MIGRATIONS) {
    if (m.version > currentVersion) {
      const trx = sqlite.transaction(() => {
        sqlite.exec(m.sql);
        sqlite.pragma(`user_version = ${m.version}`);
      });
      trx();
      console.log(`[migrate] applied v${m.version}`);
    }
  }

  sqlite.close();
  console.log(`[migrate] schema at ${dbPath} (version ${MIGRATIONS[MIGRATIONS.length - 1].version})`);
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations();
}
