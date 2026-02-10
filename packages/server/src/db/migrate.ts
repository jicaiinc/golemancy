import type { AppDatabase } from './client'
import { sql } from 'drizzle-orm'
import { setupFTS } from './fts'

export function migrateDatabase(db: AppDatabase) {
  // Create tables
  db.run(sql`
    CREATE TABLE IF NOT EXISTS conversations (
      id            TEXT PRIMARY KEY,
      project_id    TEXT NOT NULL,
      agent_id      TEXT NOT NULL,
      title         TEXT NOT NULL,
      last_message_at TEXT,
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL
    )
  `)

  db.run(sql`
    CREATE TABLE IF NOT EXISTS messages (
      id                TEXT PRIMARY KEY,
      conversation_id   TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role              TEXT NOT NULL,
      content           TEXT NOT NULL,
      tool_calls        TEXT,
      token_usage       TEXT,
      created_at        TEXT NOT NULL
    )
  `)

  db.run(sql`
    CREATE TABLE IF NOT EXISTS task_logs (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id   TEXT NOT NULL,
      type      TEXT NOT NULL,
      content   TEXT NOT NULL,
      metadata  TEXT,
      timestamp TEXT NOT NULL
    )
  `)

  // Create indexes
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_conversations_project ON conversations(project_id)`)
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_conversations_agent ON conversations(project_id, agent_id)`)
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at DESC)`)
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_task_logs_task ON task_logs(task_id, timestamp)`)

  // Set up FTS5
  setupFTS(db)
}
