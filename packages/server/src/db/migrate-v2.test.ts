import { describe, it, expect, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { sql } from 'drizzle-orm'
import { migrateDatabase } from './migrate'

describe('migration v2: message parts backfill', () => {
  let sqlite: InstanceType<typeof Database>

  afterEach(() => {
    sqlite?.close()
  })

  it('backfills parts from content for old-format messages', () => {
    sqlite = new Database(':memory:')
    sqlite.pragma('foreign_keys = ON')
    const db = drizzle(sqlite)

    // Create old-format tables (with tool_calls, token_usage, no parts)
    db.run(sql`
      CREATE TABLE conversations (
        id TEXT PRIMARY KEY, agent_id TEXT NOT NULL,
        title TEXT NOT NULL, last_message_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      )
    `)
    db.run(sql`
      CREATE TABLE messages (
        id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL, content TEXT NOT NULL, tool_calls TEXT, token_usage TEXT, created_at TEXT NOT NULL
      )
    `)

    // Insert old-format data
    db.run(sql`INSERT INTO conversations (id, agent_id, title, created_at, updated_at)
      VALUES ('conv-1', 'agent-1', 'Old Chat', '2024-01-01', '2024-01-01')`)
    db.run(sql`INSERT INTO messages (id, conversation_id, role, content, tool_calls, created_at)
      VALUES ('msg-old-1', 'conv-1', 'user', 'Old message text', NULL, '2024-01-01')`)
    db.run(sql`INSERT INTO messages (id, conversation_id, role, content, tool_calls, created_at)
      VALUES ('msg-old-2', 'conv-1', 'assistant', 'Old assistant reply', '[]', '2024-01-01')`)

    // Run migration
    migrateDatabase(db)

    // Verify parts were backfilled
    const rows = db.all<{ id: string; parts: string; content: string }>(
      sql`SELECT id, parts, content FROM messages ORDER BY id`,
    )
    expect(rows).toHaveLength(2)

    const msg1Parts = JSON.parse(rows[0].parts)
    expect(msg1Parts).toEqual([{ type: 'text', text: 'Old message text' }])

    const msg2Parts = JSON.parse(rows[1].parts)
    expect(msg2Parts).toEqual([{ type: 'text', text: 'Old assistant reply' }])

    // Verify old columns were dropped
    const columns = db.all<{ name: string }>(sql`PRAGMA table_info(messages)`)
    const colNames = columns.map(c => c.name)
    expect(colNames).not.toContain('tool_calls')
    expect(colNames).not.toContain('token_usage')
    expect(colNames).toContain('parts')
  })

  it('is idempotent — running migration twice does not error', () => {
    sqlite = new Database(':memory:')
    sqlite.pragma('foreign_keys = ON')
    const db = drizzle(sqlite)

    // First migration creates everything fresh
    migrateDatabase(db)

    // Insert a message using new schema
    db.run(sql`INSERT INTO conversations (id, agent_id, title, created_at, updated_at)
      VALUES ('conv-1', 'agent-1', 'Chat', '2024-01-01', '2024-01-01')`)
    db.run(sql`INSERT INTO messages (id, conversation_id, role, parts, content, created_at)
      VALUES ('msg-1', 'conv-1', 'user', '[{"type":"text","text":"Hello"}]', 'Hello', '2024-01-01')`)

    // Second migration should be a no-op
    migrateDatabase(db)

    const rows = db.all<{ parts: string }>(sql`SELECT parts FROM messages WHERE id = 'msg-1'`)
    expect(JSON.parse(rows[0].parts)).toEqual([{ type: 'text', text: 'Hello' }])
  })
})
