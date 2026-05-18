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

  // In production, serve the built frontend.
  //
  // We try several candidate locations because the layout differs between
  // running with tsx (server/index.ts) and a hypothetical compiled build.
  if (NODE_ENV === 'production') {
    const candidates = [
      path.resolve(process.cwd(), 'dist'),
      path.resolve(__dirname, '..', 'dist'),
      path.resolve(__dirname, '..', '..', 'dist'),
    ];

    const distDir = candidates.find((p) => existsSync(path.join(p, 'index.html')));

    if (distDir) {
      console.log(`[server] serving frontend from ${distDir}`);
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    } else {
      console.warn('[server] WARNING: frontend bundle not found in any of:');
      for (const p of candidates) console.warn(`  - ${p}`);

      // Diagnostic page so the user gets useful feedback instead of "Cannot GET /"
      app.get('*', (_req, res) => {
        res.status(503).type('html').send(`<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>ШефДом</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:640px;margin:48px auto;padding:0 20px;color:#333}h1{color:#c00}code{background:#eee;padding:2px 5px;border-radius:3px;font-size:13px}</style>
</head><body>
<h1>Фронтенд не собран</h1>
<p>Сервер запустился, но не нашёл <code>dist/index.html</code>.
В логах деплоя должно было быть <code>vite build</code>.</p>
<p>API живой: <a href="/api/health">/api/health</a></p>
</body></html>`);
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
