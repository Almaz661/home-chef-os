import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { appRouter } from './routers/_app.js';
import { createContext } from './trpc.js';
import { runMigrations } from './db/migrate.js';
import { runSeed } from './db/seed.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

async function main() {
  // Run migrations & seed on startup
  console.log('[server] Running migrations...');
  runMigrations();
  console.log('[server] Running seed...');
  await runSeed();

  const app = express();

  app.use(cors({ origin: true, credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: '10mb' }));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, env: NODE_ENV });
  });

  // tRPC endpoint
  app.use(
    '/api/trpc',
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  // In production, serve the built frontend
  if (NODE_ENV === 'production') {
    // When compiled, this file lives at dist-server/server/index.js,
    // and the client bundle is at dist/. So we go two levels up.
    const distDir = path.resolve(__dirname, '..', '..', 'dist');
    if (existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[server] listening on http://0.0.0.0:${PORT} (${NODE_ENV})`);
  });
}

main().catch((err) => {
  console.error('[server] fatal:', err);
  process.exit(1);
});
