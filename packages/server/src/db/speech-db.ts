import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as speechSchema from './speech-schema'

export function createSpeechDatabase(dbPath: string) {
  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('synchronous = NORMAL')
  sqlite.pragma('foreign_keys = ON')

  return drizzle(sqlite, { schema: speechSchema })
}

export type SpeechDatabase = ReturnType<typeof createSpeechDatabase>
