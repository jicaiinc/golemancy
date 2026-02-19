import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { sql } from 'drizzle-orm'
import { createTestDb } from '../test/helpers'
import { TokenRecordStorage } from './token-records'
import type { AppDatabase } from '../db/client'
import type { ProjectId } from '@golemancy/shared'

describe('TokenRecordStorage', () => {
  let db: AppDatabase
  let close: () => void
  let storage: TokenRecordStorage

  const projId = 'proj-1' as ProjectId

  beforeEach(() => {
    const test = createTestDb()
    db = test.db
    close = test.close
    storage = new TokenRecordStorage(() => db)
  })

  afterEach(() => {
    close()
  })

  describe('save', () => {
    it('returns a tkr- prefixed ID', () => {
      const id = storage.save(projId, {
        agentId: 'agent-1',
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        inputTokens: 100,
        outputTokens: 50,
        source: 'chat',
      })

      expect(id).toMatch(/^tkr-/)
    })

    it('writes all fields correctly', () => {
      const id = storage.save(projId, {
        conversationId: 'conv-1',
        messageId: 'msg-1',
        agentId: 'agent-1',
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        inputTokens: 1500,
        outputTokens: 800,
        source: 'chat',
      })

      const rows = db.all<{
        id: string
        conversation_id: string | null
        message_id: string | null
        agent_id: string
        provider: string
        model: string
        input_tokens: number
        output_tokens: number
        source: string
        parent_record_id: string | null
        aborted: number
        created_at: string
      }>(sql`SELECT * FROM token_records WHERE id = ${id}`)

      expect(rows).toHaveLength(1)
      const row = rows[0]
      expect(row.id).toBe(id)
      expect(row.conversation_id).toBe('conv-1')
      expect(row.message_id).toBe('msg-1')
      expect(row.agent_id).toBe('agent-1')
      expect(row.provider).toBe('anthropic')
      expect(row.model).toBe('claude-sonnet-4-20250514')
      expect(row.input_tokens).toBe(1500)
      expect(row.output_tokens).toBe(800)
      expect(row.source).toBe('chat')
      expect(row.parent_record_id).toBeNull()
      expect(row.aborted).toBe(0)
      expect(row.created_at).toBeTruthy()
    })

    it('handles optional fields as null', () => {
      const id = storage.save(projId, {
        agentId: 'agent-1',
        provider: 'openai',
        model: 'gpt-4o',
        inputTokens: 200,
        outputTokens: 100,
        source: 'cron',
      })

      const rows = db.all<{
        conversation_id: string | null
        message_id: string | null
        parent_record_id: string | null
      }>(sql`SELECT conversation_id, message_id, parent_record_id FROM token_records WHERE id = ${id}`)

      expect(rows).toHaveLength(1)
      expect(rows[0].conversation_id).toBeNull()
      expect(rows[0].message_id).toBeNull()
      expect(rows[0].parent_record_id).toBeNull()
    })

    it('stores aborted=0 for normal completion', () => {
      const id = storage.save(projId, {
        agentId: 'agent-1',
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        inputTokens: 500,
        outputTokens: 300,
        source: 'chat',
        aborted: false,
      })

      const rows = db.all<{ aborted: number }>(
        sql`SELECT aborted FROM token_records WHERE id = ${id}`,
      )
      expect(rows[0].aborted).toBe(0)
    })

    it('stores aborted=1 for aborted requests', () => {
      const id = storage.save(projId, {
        agentId: 'agent-1',
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        inputTokens: 500,
        outputTokens: 100,
        source: 'chat',
        aborted: true,
      })

      const rows = db.all<{ aborted: number }>(
        sql`SELECT aborted FROM token_records WHERE id = ${id}`,
      )
      expect(rows[0].aborted).toBe(1)
    })

    it('stores aborted=0 when aborted is undefined', () => {
      const id = storage.save(projId, {
        agentId: 'agent-1',
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        inputTokens: 500,
        outputTokens: 300,
        source: 'chat',
      })

      const rows = db.all<{ aborted: number }>(
        sql`SELECT aborted FROM token_records WHERE id = ${id}`,
      )
      expect(rows[0].aborted).toBe(0)
    })

    it('saves with source=chat', () => {
      const id = storage.save(projId, {
        agentId: 'agent-1',
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        inputTokens: 100,
        outputTokens: 50,
        source: 'chat',
      })

      const rows = db.all<{ source: string }>(
        sql`SELECT source FROM token_records WHERE id = ${id}`,
      )
      expect(rows[0].source).toBe('chat')
    })

    it('saves with source=cron', () => {
      const id = storage.save(projId, {
        agentId: 'agent-1',
        provider: 'openai',
        model: 'gpt-4o',
        inputTokens: 300,
        outputTokens: 150,
        source: 'cron',
      })

      const rows = db.all<{ source: string }>(
        sql`SELECT source FROM token_records WHERE id = ${id}`,
      )
      expect(rows[0].source).toBe('cron')
    })

    it('saves with source=sub-agent and parentRecordId', () => {
      // First save a parent record
      const parentId = storage.save(projId, {
        conversationId: 'conv-1',
        messageId: 'msg-1',
        agentId: 'agent-1',
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        inputTokens: 1000,
        outputTokens: 500,
        source: 'chat',
      })

      // Save sub-agent record with parentRecordId
      const childId = storage.save(projId, {
        conversationId: 'conv-1',
        agentId: 'agent-2',
        provider: 'anthropic',
        model: 'claude-haiku-4-5-20251001',
        inputTokens: 200,
        outputTokens: 80,
        source: 'sub-agent',
        parentRecordId: parentId,
      })

      const rows = db.all<{ source: string; parent_record_id: string | null }>(
        sql`SELECT source, parent_record_id FROM token_records WHERE id = ${childId}`,
      )
      expect(rows[0].source).toBe('sub-agent')
      expect(rows[0].parent_record_id).toBe(parentId)
    })

    it('generates unique IDs for each save', () => {
      const ids = new Set<string>()
      for (let i = 0; i < 10; i++) {
        ids.add(storage.save(projId, {
          agentId: 'agent-1',
          provider: 'anthropic',
          model: 'claude-sonnet-4-20250514',
          inputTokens: 100,
          outputTokens: 50,
          source: 'chat',
        }))
      }
      expect(ids.size).toBe(10)
    })

    it('stores ISO timestamp in created_at', () => {
      const before = new Date().toISOString()
      const id = storage.save(projId, {
        agentId: 'agent-1',
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        inputTokens: 100,
        outputTokens: 50,
        source: 'chat',
      })
      const after = new Date().toISOString()

      const rows = db.all<{ created_at: string }>(
        sql`SELECT created_at FROM token_records WHERE id = ${id}`,
      )
      expect(rows[0].created_at >= before).toBe(true)
      expect(rows[0].created_at <= after).toBe(true)
    })
  })
})
