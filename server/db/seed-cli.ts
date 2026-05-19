import { runMigrations } from './migrate.js';
import { runSeed } from './seed.js';
import { sqlClient } from './index.js';

async function main() {
  await runMigrations();
  await runSeed();
  console.log('[seed-cli] done');
  await sqlClient.end();
}

main().catch((err) => {
  console.error('[seed-cli] error:', err);
  process.exit(1);
});
