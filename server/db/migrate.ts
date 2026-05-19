import { sqlClient } from './index.js';

/**
 * Versioned migrations for PostgreSQL (Neon).
 *
 * Tracking table: `schema_migrations(version int primary key, applied_at timestamptz)`.
 * Each migration runs in a transaction; on failure we abort and don't
 * record the version.
 *
 * V1: initial schema.
 * V2: shopping list — track in-stock context.
 * V3: receipts + i18n metadata + exchange rates cache.
 * V4: cooking history.
 *
 * NOTE: this is a fresh-install schema. We're moving from SQLite to
 * PostgreSQL — old SQLite data does NOT migrate (the user knew this).
 * Production starts with V1 + seed.
 */

const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  pin TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recipes (
  id SERIAL PRIMARY KEY,
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
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id SERIAL PRIMARY KEY,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount REAL,
  unit TEXT,
  group_name TEXT,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS recipe_steps (
  id SERIAL PRIMARY KEY,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  instruction TEXT NOT NULL,
  image_url TEXT,
  timer_minutes INTEGER
);

CREATE TABLE IF NOT EXISTS menus (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  week_start_date TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS menu_items (
  id SERIAL PRIMARY KEY,
  menu_id INTEGER NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL,
  meal_type TEXT NOT NULL,
  meal_slot INTEGER DEFAULT 0,
  recipe_id INTEGER REFERENCES recipes(id)
);

CREATE TABLE IF NOT EXISTS inventory (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  product_name TEXT NOT NULL,
  quantity REAL DEFAULT 1,
  unit TEXT,
  storage_type TEXT NOT NULL DEFAULT 'fridge',
  expiry_date TEXT,
  min_quantity REAL,
  category TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  product_name TEXT NOT NULL,
  quantity REAL DEFAULT 1,
  unit TEXT,
  category TEXT,
  is_checked BOOLEAN DEFAULT FALSE,
  recipe_source TEXT,
  added_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_master (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  default_unit TEXT,
  category TEXT
);

CREATE TABLE IF NOT EXISTS product_aliases (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES product_master(id) ON DELETE CASCADE,
  alias TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS receipts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  store_name TEXT,
  date TEXT,
  total_amount REAL,
  currency TEXT DEFAULT 'EUR',
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS receipt_items (
  id SERIAL PRIMARY KEY,
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

const SCHEMA_V2 = `
ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS needed_quantity REAL;
ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS in_stock_quantity REAL DEFAULT 0;
`;

const SCHEMA_V3 = `
ALTER TABLE receipt_items ADD COLUMN IF NOT EXISTS matched_product_id INTEGER REFERENCES product_master(id);
ALTER TABLE receipt_items ADD COLUMN IF NOT EXISTS was_added_to_inventory BOOLEAN DEFAULT FALSE;
ALTER TABLE receipt_items ADD COLUMN IF NOT EXISTS original_name TEXT;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS ocr_provider TEXT;

ALTER TABLE product_master ADD COLUMN IF NOT EXISTS name_nl TEXT;
ALTER TABLE product_master ADD COLUMN IF NOT EXISTS name_en TEXT;

CREATE TABLE IF NOT EXISTS exchange_rates (
  id SERIAL PRIMARY KEY,
  base TEXT NOT NULL,
  quote TEXT NOT NULL,
  rate REAL NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS exchange_rates_base_quote_idx ON exchange_rates(base, quote);
`;

const SCHEMA_V4 = `
CREATE TABLE IF NOT EXISTS cooking_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  recipe_id INTEGER REFERENCES recipes(id) ON DELETE SET NULL,
  servings INTEGER,
  cooked_at TIMESTAMPTZ DEFAULT now()
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

export async function runMigrations(): Promise<void> {
  // Bootstrap: create the tracking table first (idempotent).
  await sqlClient.unsafe(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  const rows = await sqlClient<{ version: number }[]>`
    SELECT version FROM schema_migrations ORDER BY version
  `;
  const applied = new Set(rows.map((r) => r.version));

  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;

    await sqlClient.begin(async (tx) => {
      await tx.unsafe(m.sql);
      await tx`INSERT INTO schema_migrations (version) VALUES (${m.version})`;
    });
    console.log(`[migrate] applied v${m.version}`);
  }

  const head = MIGRATIONS[MIGRATIONS.length - 1].version;
  console.log(`[migrate] schema at v${head}`);
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(() => sqlClient.end())
    .catch((err) => {
      console.error('[migrate] failed:', err);
      process.exit(1);
    });
}
