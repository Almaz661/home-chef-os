import { runMigrations } from './migrate.js';
import { runSeed } from './seed.js';

async function main() {
  runMigrations();
  await runSeed();
  console.log('[seed-cli] done');
}

main().catch((err) => {
  console.error('[seed-cli] error:', err);
  process.exit(1);
});
