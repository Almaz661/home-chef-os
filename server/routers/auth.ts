import { z } from 'zod';
import { router, publicProcedure } from '../trpc.js';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';

export const authRouter = router({
  login: publicProcedure
    .input(z.object({ pin: z.string().length(4) }))
    .mutation(async ({ input }) => {
      const user = db.select().from(schema.users).where(eq(schema.users.pin, input.pin)).get();
      if (!user) {
        throw new Error('Неверный PIN-код');
      }
      return { userId: user.id, name: user.name };
    }),

  getUser: publicProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => {
      const user = db.select().from(schema.users).where(eq(schema.users.id, input.userId)).get();
      return user || null;
    }),
});
