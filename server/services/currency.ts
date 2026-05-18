import { db, schema } from '../db/index.js';
import { and, eq, sql } from 'drizzle-orm';

const CACHE_TTL_HOURS = 24;

/**
 * Fetch a fresh rate from a public, no-key API.
 * Primary: Frankfurter (ECB rates). Fallback: open.er-api.com.
 * Both are free and don't need an API key. If both fail, throws.
 */
async function fetchRateFromUpstream(base: string, quote: string): Promise<number> {
  // Frankfurter
  try {
    const url = `https://api.frankfurter.dev/v1/latest?base=${base}&symbols=${quote}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const json = (await res.json()) as { rates?: Record<string, number> };
      const r = json.rates?.[quote];
      if (typeof r === 'number' && r > 0) return r;
    }
  } catch {
    /* fall through to backup */
  }

  // open.er-api.com
  try {
    const url = `https://open.er-api.com/v6/latest/${base}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const json = (await res.json()) as { rates?: Record<string, number> };
      const r = json.rates?.[quote];
      if (typeof r === 'number' && r > 0) return r;
    }
  } catch {
    /* ignored */
  }

  throw new Error(`Не удалось получить курс ${base}→${quote} ни от одного провайдера`);
}

/**
 * Get rate for `base → quote`, using a 24h DB cache.
 * Always returns a positive number, or throws if everything fails AND there's no cache.
 */
export async function getRate(base: string, quote: string): Promise<{
  rate: number;
  fetchedAt: string;
  source: 'cache' | 'upstream';
}> {
  const cached = db
    .select()
    .from(schema.exchangeRates)
    .where(and(eq(schema.exchangeRates.base, base), eq(schema.exchangeRates.quote, quote)))
    .get();

  if (cached) {
    const ageMs = Date.now() - new Date(cached.fetchedAt + 'Z').getTime();
    if (ageMs < CACHE_TTL_HOURS * 3600 * 1000) {
      return { rate: cached.rate, fetchedAt: cached.fetchedAt, source: 'cache' };
    }
  }

  try {
    const rate = await fetchRateFromUpstream(base, quote);
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    if (cached) {
      db.update(schema.exchangeRates)
        .set({ rate, fetchedAt: sql`(datetime('now'))` })
        .where(eq(schema.exchangeRates.id, cached.id))
        .run();
    } else {
      db.insert(schema.exchangeRates).values({ base, quote, rate }).run();
    }

    return { rate, fetchedAt: now, source: 'upstream' };
  } catch (err) {
    // Upstream failed — return stale cache if we have one, otherwise rethrow.
    if (cached) {
      return { rate: cached.rate, fetchedAt: cached.fetchedAt, source: 'cache' };
    }
    throw err;
  }
}

export function convert(amount: number, rate: number): number {
  return Math.round(amount * rate * 100) / 100;
}
