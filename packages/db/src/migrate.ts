import { createDb } from './client.js';

const path = process.argv[2];
if (!path) {
  console.error('usage: tsx src/migrate.ts <db-path>');
  process.exit(1);
}

// Migrations runner is intentionally minimal at baseline.
// Real implementation should load SQL files from ./migrations and apply them inside a single transaction.
const _db = createDb({ path });
console.log(`opened sqlite at ${path}`);
console.log('TODO: load and apply ./migrations/*.sql via drizzle-orm migrator');
