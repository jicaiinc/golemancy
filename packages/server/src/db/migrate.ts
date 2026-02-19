import type { AppDatabase } from './client'
import { sql } from 'drizzle-orm'
import { setupFTS } from './fts'
import { logger } from '../logger'

const log = logger.child({ component: 'db' })

export function migrateDatabase(db: AppDatabase) {
  log.info('running database migrations')
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
      parts             TEXT NOT NULL,
      content           TEXT NOT NULL DEFAULT '',
      created_at        TEXT NOT NULL
    )
  `)

  // Migration: drop legacy task_logs table
  db.run(sql`DROP TABLE IF EXISTS task_logs`)

  db.run(sql`
    CREATE TABLE IF NOT EXISTS conversation_tasks (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      subject TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      active_form TEXT,
      owner TEXT,
      metadata TEXT,
      blocks TEXT NOT NULL DEFAULT '[]',
      blocked_by TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)

  // Create indexes
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_conversations_project ON conversations(project_id)`)
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_conversations_agent ON conversations(project_id, agent_id)`)
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at DESC)`)
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_conversation_tasks_conv ON conversation_tasks(conversation_id)`)

  // --- Migration v2: message parts ---
  const columns = db.all<{ name: string }>(sql`PRAGMA table_info(messages)`)

  const hasParts = columns.some(col => col.name === 'parts')
  if (!hasParts) {
    log.info('migrating messages table: adding parts column')
    db.run(sql`ALTER TABLE messages ADD COLUMN parts TEXT`)
    db.run(sql`
      UPDATE messages
      SET parts = json_array(json_object('type', 'text', 'text', content))
      WHERE parts IS NULL
    `)
  }

  const hasToolCalls = columns.some(col => col.name === 'tool_calls')
  if (hasToolCalls) {
    log.info('migrating messages table: dropping tool_calls column')
    db.run(sql`ALTER TABLE messages DROP COLUMN tool_calls`)
  }

  const hasTokenUsage = columns.some(col => col.name === 'token_usage')
  if (hasTokenUsage) {
    log.info('migrating messages table: dropping token_usage column')
    db.run(sql`ALTER TABLE messages DROP COLUMN token_usage`)
  }

  // Set up FTS5
  setupFTS(db)
  log.info('database migrations complete')
}
