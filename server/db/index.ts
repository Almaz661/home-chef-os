import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import { join, dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

// Always resolve relative to the working directory (the project root) so
// the compiled output (in dist-server/) and the dev runner (tsx) agree.
const dbPath = process.env.DB_PATH
  ? resolve(process.env.DB_PATH)
  : join(process.cwd(), 'data', 'homechef.db');

mkdirSync(dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });
export { schema };
