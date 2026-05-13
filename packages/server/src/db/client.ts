import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'

export function createDatabase(dbPath: string) {
  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('synchronous = NORMAL')
  sqlite.pragma('foreign_keys = ON')

  return drizzle(sqlite, { schema })
}

export type AppDatabase = ReturnType<typeof createDatabase>
