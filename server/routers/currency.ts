import { z } from 'zod';
import { router, publicProcedure } from '../trpc.js';
import { getRate, convert } from '../services/currency.js';

export const currencyRouter = router({
  getRate: publicProcedure
    .input(
      z.object({
        base: z.string().length(3).default('EUR'),
        quote: z.string().length(3).default('RUB'),
      }),
    )
    .query(async ({ input }) => {
      const r = await getRate(input.base.toUpperCase(), input.quote.toUpperCase());
      return r;
    }),

  convert: publicProcedure
    .input(
      z.object({
        amount: z.number(),
        base: z.string().length(3).default('EUR'),
        quote: z.string().length(3).default('RUB'),
      }),
    )
    .query(async ({ input }) => {
      const { rate, fetchedAt, source } = await getRate(
        input.base.toUpperCase(),
        input.quote.toUpperCase(),
      );
      return {
        amount: input.amount,
        converted: convert(input.amount, rate),
        rate,
        base: input.base.toUpperCase(),
        quote: input.quote.toUpperCase(),
        fetchedAt,
        source,
      };
    }),
});
