import { DatabaseSync } from 'node:sqlite';
import { drizzle, type SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import { bootstrapSchema } from './bootstrap.js';
import * as schema from './schema/index.js';

export type GolemancyDb = SqliteRemoteDatabase<typeof schema> & { close(): void };

export type DbOptions = {
  readonly path: string;
  readonly readonly?: boolean;
  readonly bootstrap?: boolean;
};

export function createDb(options: DbOptions): GolemancyDb {
  const readonly = options.readonly ?? false;
  const sqlite = new DatabaseSync(options.path, { readOnly: readonly });
  sqlite.exec('PRAGMA journal_mode = WAL;');
  sqlite.exec('PRAGMA foreign_keys = ON;');
  sqlite.exec('PRAGMA busy_timeout = 5000;');
  if (!readonly && (options.bootstrap ?? true)) {
    bootstrapSchema(sqlite);
  }

  type SqliteParam = string | number | bigint | null | Uint8Array;
  const proxy = drizzle(
    async (sql, params, method) => {
      const stmt = sqlite.prepare(sql);
      const args = params as SqliteParam[];
      if (method === 'run') {
        stmt.run(...args);
        return { rows: [] };
      }
      if (method === 'get') {
        // drizzle-orm/sqlite-proxy treats `rows` as a SINGLE tuple here, not an
        // array of tuples — see drizzle's mapGetResult(rows): `const row = rows`.
        // For "no row" we must pass nullish so the `!row` short-circuit fires;
        // an empty array would synthesize a row of all-undefined columns.
        const row = stmt.get(...args) as Record<string, unknown> | undefined;
        if (row === undefined) return { rows: undefined as unknown as unknown[] };
        return { rows: Object.values(row) as unknown[] };
      }
      const rows = stmt.all(...args) as Array<Record<string, unknown>>;
      return { rows: rows.map((r) => Object.values(r)) };
    },
    { schema },
  );

  return Object.assign(proxy, {
    close: () => sqlite.close(),
  });
}
