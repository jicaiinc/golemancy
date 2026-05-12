import { DatabaseSync } from 'node:sqlite';
import { drizzle, type SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import * as schema from './schema/index.js';

export type GolemancyDb = SqliteRemoteDatabase<typeof schema> & { close(): void };

export type DbOptions = {
  readonly path: string;
  readonly readonly?: boolean;
};

export function createDb(options: DbOptions): GolemancyDb {
  const sqlite = new DatabaseSync(options.path, { readOnly: options.readonly ?? false });
  sqlite.exec('PRAGMA journal_mode = WAL;');
  sqlite.exec('PRAGMA foreign_keys = ON;');
  sqlite.exec('PRAGMA busy_timeout = 5000;');

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
        const row = stmt.get(...args) as Record<string, unknown> | undefined;
        return { rows: row ? [Object.values(row)] : [] };
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
