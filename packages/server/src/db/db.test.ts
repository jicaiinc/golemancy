import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { sql } from 'drizzle-orm'
import { createTestDb } from '../test/helpers'
import type { AppDatabase } from './client'

describe('database migration', () => {
  let db: AppDatabase
  let close: () => void

  beforeEach(() => {
    const test = createTestDb()
    db = test.db
    close = test.close
  })

  afterEach(() => {
    close()
  })

  describe('tables', () => {
    it('creates conversations table', () => {
      const rows = db.all<any>(sql`SELECT name FROM sqlite_master WHERE type='table' AND name='conversations'`)
      expect(rows).toHaveLength(1)
    })

    it('creates messages table', () => {
      const rows = db.all<any>(sql`SELECT name FROM sqlite_master WHERE type='table' AND name='messages'`)
      expect(rows).toHaveLength(1)
    })

    it('creates task_logs table', () => {
      const rows = db.all<any>(sql`SELECT name FROM sqlite_master WHERE type='table' AND name='task_logs'`)
      expect(rows).toHaveLength(1)
    })

    it('creates FTS5 virtual table', () => {
      const rows = db.all<any>(sql`SELECT name FROM sqlite_master WHERE type='table' AND name='messages_fts'`)
      expect(rows).toHaveLength(1)
    })
  })

  describe('indexes', () => {
    it('creates conversation project index', () => {
      const rows = db.all<any>(sql`SELECT name FROM sqlite_master WHERE type='index' AND name='idx_conversations_project'`)
      expect(rows).toHaveLength(1)
    })

    it('creates conversation agent index', () => {
      const rows = db.all<any>(sql`SELECT name FROM sqlite_master WHERE type='index' AND name='idx_conversations_agent'`)
      expect(rows).toHaveLength(1)
    })

    it('creates message conversation index', () => {
      const rows = db.all<any>(sql`SELECT name FROM sqlite_master WHERE type='index' AND name='idx_messages_conversation'`)
      expect(rows).toHaveLength(1)
    })

    it('creates task_logs task index', () => {
      const rows = db.all<any>(sql`SELECT name FROM sqlite_master WHERE type='index' AND name='idx_task_logs_task'`)
      expect(rows).toHaveLength(1)
    })
  })

  describe('foreign keys', () => {
    it('enforces cascade delete from conversations to messages', () => {
      db.run(sql`INSERT INTO conversations (id, project_id, agent_id, title, created_at, updated_at)
        VALUES ('conv-1', 'proj-1', 'agent-1', 'Test', '2024-01-01', '2024-01-01')`)
      db.run(sql`INSERT INTO messages (id, conversation_id, role, parts, content, created_at)
        VALUES ('msg-1', 'conv-1', 'user', '[{"type":"text","text":"Hello"}]', 'Hello', '2024-01-01')`)

      db.run(sql`DELETE FROM conversations WHERE id = 'conv-1'`)

      const msgs = db.all<any>(sql`SELECT * FROM messages WHERE conversation_id = 'conv-1'`)
      expect(msgs).toHaveLength(0)
    })

    it('rejects message insert with invalid conversation_id', () => {
      expect(() => {
        db.run(sql`INSERT INTO messages (id, conversation_id, role, parts, content, created_at)
          VALUES ('msg-1', 'conv-nonexistent', 'user', '[{"type":"text","text":"Hello"}]', 'Hello', '2024-01-01')`)
      }).toThrow()
    })
  })

  describe('FTS5 triggers', () => {
    it('indexes messages on insert', () => {
      db.run(sql`INSERT INTO conversations (id, project_id, agent_id, title, created_at, updated_at)
        VALUES ('conv-1', 'proj-1', 'agent-1', 'Test', '2024-01-01', '2024-01-01')`)
      db.run(sql`INSERT INTO messages (id, conversation_id, role, parts, content, created_at)
        VALUES ('msg-1', 'conv-1', 'user', '[{"type":"text","text":"Hello world testing FTS"}]', 'Hello world testing FTS', '2024-01-01')`)

      const results = db.all<any>(sql`SELECT * FROM messages_fts WHERE content MATCH 'testing'`)
      expect(results).toHaveLength(1)
    })

    it('removes from index on delete', () => {
      db.run(sql`INSERT INTO conversations (id, project_id, agent_id, title, created_at, updated_at)
        VALUES ('conv-1', 'proj-1', 'agent-1', 'Test', '2024-01-01', '2024-01-01')`)
      db.run(sql`INSERT INTO messages (id, conversation_id, role, parts, content, created_at)
        VALUES ('msg-1', 'conv-1', 'user', '[{"type":"text","text":"unique term xyz"}]', 'unique term xyz', '2024-01-01')`)

      db.run(sql`DELETE FROM messages WHERE id = 'msg-1'`)

      const results = db.all<any>(sql`SELECT * FROM messages_fts WHERE content MATCH 'unique'`)
      expect(results).toHaveLength(0)
    })

    it('updates index on message update', () => {
      db.run(sql`INSERT INTO conversations (id, project_id, agent_id, title, created_at, updated_at)
        VALUES ('conv-1', 'proj-1', 'agent-1', 'Test', '2024-01-01', '2024-01-01')`)
      db.run(sql`INSERT INTO messages (id, conversation_id, role, parts, content, created_at)
        VALUES ('msg-1', 'conv-1', 'user', '[{"type":"text","text":"old content alpha"}]', 'old content alpha', '2024-01-01')`)

      db.run(sql`UPDATE messages SET content = 'new content beta' WHERE id = 'msg-1'`)

      const oldResults = db.all<any>(sql`SELECT * FROM messages_fts WHERE content MATCH 'alpha'`)
      expect(oldResults).toHaveLength(0)

      const newResults = db.all<any>(sql`SELECT * FROM messages_fts WHERE content MATCH 'beta'`)
      expect(newResults).toHaveLength(1)
    })

    it('supports multi-word FTS search', () => {
      db.run(sql`INSERT INTO conversations (id, project_id, agent_id, title, created_at, updated_at)
        VALUES ('conv-1', 'proj-1', 'agent-1', 'Test', '2024-01-01', '2024-01-01')`)
      db.run(sql`INSERT INTO messages (id, conversation_id, role, parts, content, created_at)
        VALUES ('msg-1', 'conv-1', 'user', '[{"type":"text","text":"The quick brown fox jumps"}]', 'The quick brown fox jumps', '2024-01-01')`)
      db.run(sql`INSERT INTO messages (id, conversation_id, role, parts, content, created_at)
        VALUES ('msg-2', 'conv-1', 'user', '[{"type":"text","text":"The lazy brown dog sleeps"}]', 'The lazy brown dog sleeps', '2024-01-01')`)

      const results = db.all<any>(sql`SELECT * FROM messages_fts WHERE content MATCH 'brown fox'`)
      expect(results).toHaveLength(1)
    })
  })

  describe('task_logs', () => {
    it('auto-increments id', () => {
      db.run(sql`INSERT INTO task_logs (task_id, type, content, timestamp)
        VALUES ('task-1', 'start', 'Started', '2024-01-01T00:00:00Z')`)
      db.run(sql`INSERT INTO task_logs (task_id, type, content, timestamp)
        VALUES ('task-1', 'generation', 'Working', '2024-01-01T00:00:01Z')`)

      const rows = db.all<any>(sql`SELECT id FROM task_logs ORDER BY id`)
      expect(rows).toHaveLength(2)
      expect(rows[1].id).toBeGreaterThan(rows[0].id)
    })

    it('stores JSON metadata', () => {
      db.run(sql`INSERT INTO task_logs (task_id, type, content, metadata, timestamp)
        VALUES ('task-1', 'completed', 'Done', '{"tokenUsage":1500}', '2024-01-01T00:00:00Z')`)

      const rows = db.all<any>(sql`SELECT metadata FROM task_logs WHERE task_id = 'task-1'`)
      expect(JSON.parse(rows[0].metadata)).toEqual({ tokenUsage: 1500 })
    })
  })
})
