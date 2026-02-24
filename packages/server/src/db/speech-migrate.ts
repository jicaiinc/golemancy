import { sql } from 'drizzle-orm'
import type { SpeechDatabase } from './speech-db'
import { logger } from '../logger'

const log = logger.child({ component: 'db:speech' })

export function migrateSpeechDatabase(db: SpeechDatabase) {
  log.info('running speech database migrations')

  db.run(sql`
    CREATE TABLE IF NOT EXISTS transcription_records (
      id                TEXT PRIMARY KEY,
      status            TEXT NOT NULL DEFAULT 'pending',
      audio_file_id     TEXT NOT NULL,
      audio_duration_ms INTEGER NOT NULL,
      audio_size_bytes  INTEGER NOT NULL,
      text              TEXT,
      error             TEXT,
      provider          TEXT NOT NULL,
      model             TEXT NOT NULL,
      project_id        TEXT,
      conversation_id   TEXT,
      used_in_message   INTEGER NOT NULL DEFAULT 0,
      created_at        TEXT NOT NULL
    )
  `)

  db.run(sql`CREATE INDEX IF NOT EXISTS idx_transcription_created ON transcription_records(created_at DESC)`)
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_transcription_status ON transcription_records(status)`)

  log.info('speech database migrations complete')
}
