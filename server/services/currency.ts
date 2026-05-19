import { db, schema } from '../db/index.js';
import { and, eq, sql } from 'drizzle-orm';

const CACHE_TTL_HOURS = 24;

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

export async function getRate(base: string, quote: string): Promise<{
  rate: number;
  fetchedAt: string;
  source: 'cache' | 'upstream';
}> {
  const [cached] = await db
    .select()
    .from(schema.exchangeRates)
    .where(and(eq(schema.exchangeRates.base, base), eq(schema.exchangeRates.quote, quote)))
    .limit(1);

  const fetchedAtIso = (d: Date | string | null | undefined) =>
    d instanceof Date ? d.toISOString() : (d ?? new Date().toISOString());

  if (cached) {
    const fetchedAt = cached.fetchedAt instanceof Date ? cached.fetchedAt : new Date(cached.fetchedAt as any);
    const ageMs = Date.now() - fetchedAt.getTime();
    if (ageMs < CACHE_TTL_HOURS * 3600 * 1000) {
      return { rate: cached.rate, fetchedAt: fetchedAtIso(cached.fetchedAt), source: 'cache' };
    }
  }

  try {
    const rate = await fetchRateFromUpstream(base, quote);
    const now = new Date().toISOString();

    if (cached) {
      await db
        .update(schema.exchangeRates)
        .set({ rate, fetchedAt: sql`now()` })
        .where(eq(schema.exchangeRates.id, cached.id));
    } else {
      await db.insert(schema.exchangeRates).values({ base, quote, rate });
    }

    return { rate, fetchedAt: now, source: 'upstream' };
  } catch (err) {
    if (cached) {
      return { rate: cached.rate, fetchedAt: fetchedAtIso(cached.fetchedAt), source: 'cache' };
    }
    throw err;
  }
}

export function convert(amount: number, rate: number): number {
  return Math.round(amount * rate * 100) / 100;
}
