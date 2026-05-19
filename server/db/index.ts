import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema.js';

/**
 * Database connection.
 *
 * Production / Neon / любой PostgreSQL: задайте DATABASE_URL.
 * Поддерживается формат `postgres://user:pass@host/db?sslmode=require`.
 *
 * Если переменная не задана — выбрасываем понятную ошибку, чтобы запуск
 * сразу упал с подсказкой, а не превратился в каскад непонятных ошибок
 * на каждый SQL-запрос.
 */

const DATABASE_URL =
  process.env.DATABASE_URL ||
  process.env.NEON_DATABASE_URL ||
  process.env.POSTGRES_URL ||
  '';

if (!DATABASE_URL) {
  // Don't throw at module-load time during tooling (typecheck etc.)
  // Throw lazily when the db is actually used.
  console.warn(
    '[db] DATABASE_URL не задан. Установите переменную окружения с ' +
      'connection string PostgreSQL (Neon: project → Connection Details → ' +
      '"Pooled connection"). Сервер запустится, но любой SQL-запрос упадёт.',
  );
}

// `postgres` will throw on first query if the URL is invalid; we use a
// permissive default to keep imports working in offline tooling.
const client = postgres(DATABASE_URL || 'postgres://invalid:invalid@localhost:5432/invalid', {
  // Neon uses TLS; keep ssl on for any remote host. When DATABASE_URL
  // already contains sslmode=require, postgres-js honours it.
  ssl: DATABASE_URL.includes('sslmode=disable') ? false : 'require',
  max: 10,
  idle_timeout: 30,
  connect_timeout: 10,
  // Avoid noisy "notice" warnings on schema setup.
  onnotice: () => {},
});

export const db = drizzle(client, { schema });
export const sqlClient = client;
export { schema };
