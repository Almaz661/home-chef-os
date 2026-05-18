import Database from 'better-sqlite3';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Hand-written initial migration for SQLite.
 * Idempotent — uses CREATE TABLE IF NOT EXISTS.
 */
const SCHEMA_SQL = `
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

export function runMigrations() {
  const dbPath = process.env.DB_PATH
    ? process.env.DB_PATH
    : join(__dirname, '..', '..', 'data', 'homechef.db');

  mkdirSync(dirname(dbPath), { recursive: true });

  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(SCHEMA_SQL);
  sqlite.close();

  console.log(`[migrate] schema ensured at ${dbPath}`);
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations();
}
