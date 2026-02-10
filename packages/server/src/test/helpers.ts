import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema'
import { migrateDatabase } from '../db/migrate'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

/**
 * Create an in-memory SQLite database with all tables, indexes, and FTS5 set up.
 * Returns the Drizzle instance and a close function.
 */
export function createTestDb() {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  migrateDatabase(db)
  return { db, close: () => sqlite.close() }
}

/**
 * Create a temporary directory for file-system storage tests.
 * Returns the directory path and a cleanup function.
 */
export async function createTmpDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'solocraft-test-'))
  return {
    dir,
    cleanup: () => fs.rm(dir, { recursive: true, force: true }),
  }
}
