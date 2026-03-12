import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { sql } from 'drizzle-orm'
import { createTestDb } from '../test/helpers'
import { DashboardService } from './dashboard'
import { TokenRecordStorage } from './token-records'
import { toLocalDate } from '../utils/time-range'
import type { AppDatabase } from '../db/client'
import type { ProjectId, AgentId, IProjectService, IAgentService } from '@golemancy/shared'

const projId = 'proj-1' as ProjectId
const agentId = 'agent-1' as AgentId

function today() {
  return toLocalDate()
}

function todayISO() {
  return new Date().toISOString()
}

function yesterdayISO() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString()
}

describe('DashboardService (integration with token_records)', () => {
  let db: AppDatabase
  let close: () => void
  let dashboard: DashboardService
  let tokenRecordStorage: TokenRecordStorage

  const mockProjectStorage: IProjectService = {
    list: vi.fn().mockResolvedValue([]),
    getById: vi.fn().mockResolvedValue({ id: projId, name: 'Test Project' }),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  }

  const mockAgentStorage: IAgentService = {
    list: vi.fn().mockResolvedValue([
      {
        id: agentId,
        name: 'Test Agent',
        status: 'idle',
        modelConfig: { model: 'claude-sonnet-4-20250514' },
      },
    ]),
    getById: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  }

  beforeEach(() => {
    const test = createTestDb()
    db = test.db
    close = test.close
    const getProjectDb = () => db

    tokenRecordStorage = new TokenRecordStorage(getProjectDb)
    dashboard = new DashboardService({
      projectStorage: mockProjectStorage,
      agentStorage: mockAgentStorage,
      getProjectDb,
    })
  })

  afterEach(() => {
    close()
  })

  /** Insert a conversation + optional messages directly via SQL for test setup */
  function insertConversation(convId: string, agentIdParam: string = agentId) {
    db.run(sql`INSERT INTO conversations (id, agent_id, title, created_at, updated_at)
      VALUES (${convId}, ${agentIdParam}, 'Test Conv', ${todayISO()}, ${todayISO()})`)
  }

  function insertMessage(
    msgId: string,
    convId: string,
    opts: { inputTokens?: number; outputTokens?: number; createdAt?: string; provider?: string; model?: string } = {},
  ) {
    const createdAt = opts.createdAt ?? todayISO()
    db.run(sql`INSERT INTO messages (id, conversation_id, role, parts, content, input_tokens, output_tokens, provider, model, created_at)
      VALUES (${msgId}, ${convId}, 'assistant', '[]', '', ${opts.inputTokens ?? 0}, ${opts.outputTokens ?? 0}, ${opts.provider ?? ''}, ${opts.model ?? ''}, ${createdAt})`)
  }

  describe('getSummary', () => {
    it('returns today token totals from token_records', async () => {
      tokenRecordStorage.save(projId, {
        agentId,
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        inputTokens: 1000,
        outputTokens: 500,
        source: 'chat',
      })
      tokenRecordStorage.save(projId, {
        agentId,
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        inputTokens: 2000,
        outputTokens: 800,
        source: 'chat',
      })

      const summary = await dashboard.getSummary(projId)
      expect(summary.todayTokens.input).toBe(3000)
      expect(summary.todayTokens.output).toBe(1300)
      expect(summary.todayTokens.total).toBe(4300)
    })

    it('falls back to messages table when token_records is empty', async () => {
      insertConversation('conv-1')
      insertMessage('msg-1', 'conv-1', { inputTokens: 500, outputTokens: 200 })
      insertMessage('msg-2', 'conv-1', { inputTokens: 300, outputTokens: 100 })

      const summary = await dashboard.getSummary(projId)
      expect(summary.todayTokens.input).toBe(800)
      expect(summary.todayTokens.output).toBe(300)
      expect(summary.todayTokens.total).toBe(1100)
    })

    it('does not double-count when both token_records and messages exist for same messageId', async () => {
      insertConversation('conv-1')
      insertMessage('msg-1', 'conv-1', { inputTokens: 500, outputTokens: 200 })

      // token_record linked to same message
      tokenRecordStorage.save(projId, {
        conversationId: 'conv-1',
        messageId: 'msg-1',
        agentId,
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        inputTokens: 500,
        outputTokens: 200,
        source: 'chat',
      })

      const summary = await dashboard.getSummary(projId)
      // Should only count once (from token_records, messages excluded via NOT EXISTS)
      expect(summary.todayTokens.input).toBe(500)
      expect(summary.todayTokens.output).toBe(200)
      expect(summary.todayTokens.total).toBe(700)
    })

    it('combines token_records and unlinked messages without double-counting', async () => {
      insertConversation('conv-1')

      // msg-1 has a linked token_record → should only count from token_records
      insertMessage('msg-1', 'conv-1', { inputTokens: 500, outputTokens: 200 })
      tokenRecordStorage.save(projId, {
        conversationId: 'conv-1',
        messageId: 'msg-1',
        agentId,
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        inputTokens: 500,
        outputTokens: 200,
        source: 'chat',
      })

      // msg-2 has NO linked token_record → should fall back to messages table
      insertMessage('msg-2', 'conv-1', { inputTokens: 300, outputTokens: 100 })

      const summary = await dashboard.getSummary(projId)
      expect(summary.todayTokens.input).toBe(800) // 500 (tkr) + 300 (msg fallback)
      expect(summary.todayTokens.output).toBe(300) // 200 (tkr) + 100 (msg fallback)
    })

    it('excludes messages with input_tokens=0 from fallback', async () => {
      insertConversation('conv-1')
      // User messages typically have 0 tokens — these should not be counted
      insertMessage('msg-user', 'conv-1', { inputTokens: 0, outputTokens: 0 })
      insertMessage('msg-asst', 'conv-1', { inputTokens: 400, outputTokens: 150 })

      const summary = await dashboard.getSummary(projId)
      expect(summary.todayTokens.input).toBe(400)
      expect(summary.todayTokens.output).toBe(150)
    })
  })

  describe('getTokenTrend', () => {
    it('returns daily trend data from token_records', async () => {
      tokenRecordStorage.save(projId, {
        agentId,
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        inputTokens: 1000,
        outputTokens: 500,
        source: 'chat',
      })

      const trend = await dashboard.getTokenTrend(projId, 7)
      expect(trend).toHaveLength(7)

      // Today's entry should have our token data
      const todayEntry = trend.find(t => t.date === today())
      expect(todayEntry).toBeDefined()
      expect(todayEntry!.inputTokens).toBe(1000)
      expect(todayEntry!.outputTokens).toBe(500)
    })

    it('returns zeros for days with no data', async () => {
      const trend = await dashboard.getTokenTrend(projId, 7)
      expect(trend).toHaveLength(7)

      for (const entry of trend) {
        expect(entry.inputTokens).toBe(0)
        expect(entry.outputTokens).toBe(0)
      }
    })

    it('aggregates multiple records on same day', async () => {
      tokenRecordStorage.save(projId, {
        agentId,
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        inputTokens: 1000,
        outputTokens: 500,
        source: 'chat',
      })
      tokenRecordStorage.save(projId, {
        agentId,
        provider: 'openai',
        model: 'gpt-4o',
        inputTokens: 600,
        outputTokens: 300,
        source: 'cron',
      })

      const trend = await dashboard.getTokenTrend(projId, 7)
      const todayEntry = trend.find(t => t.date === today())
      expect(todayEntry!.inputTokens).toBe(1600)
      expect(todayEntry!.outputTokens).toBe(800)
    })

    it('falls back to messages when token_records is empty', async () => {
      insertConversation('conv-1')
      insertMessage('msg-1', 'conv-1', { inputTokens: 400, outputTokens: 200 })

      const trend = await dashboard.getTokenTrend(projId, 7)
      const todayEntry = trend.find(t => t.date === today())
      expect(todayEntry!.inputTokens).toBe(400)
      expect(todayEntry!.outputTokens).toBe(200)
    })

    it('does not double-count when token_record has matching messageId', async () => {
      insertConversation('conv-1')
      insertMessage('msg-1', 'conv-1', { inputTokens: 400, outputTokens: 200 })

      tokenRecordStorage.save(projId, {
        conversationId: 'conv-1',
        messageId: 'msg-1',
        agentId,
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        inputTokens: 400,
        outputTokens: 200,
        source: 'chat',
      })

      const trend = await dashboard.getTokenTrend(projId, 7)
      const todayEntry = trend.find(t => t.date === today())
      expect(todayEntry!.inputTokens).toBe(400)
      expect(todayEntry!.outputTokens).toBe(200)
    })
  })

  describe('getAgentStats', () => {
    it('sums tokens from token_records for agent', async () => {
      tokenRecordStorage.save(projId, {
        agentId,
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        inputTokens: 1000,
        outputTokens: 500,
        source: 'chat',
      })
      tokenRecordStorage.save(projId, {
        agentId,
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        inputTokens: 800,
        outputTokens: 400,
        source: 'chat',
      })

      const stats = await dashboard.getAgentStats(projId)
      expect(stats).toHaveLength(1)
      expect(stats[0].totalTokens).toBe(2700) // 1000+500+800+400
    })

    it('does not double-count linked messages in agent stats', async () => {
      insertConversation('conv-1')
      insertMessage('msg-1', 'conv-1', { inputTokens: 600, outputTokens: 300 })

      tokenRecordStorage.save(projId, {
        conversationId: 'conv-1',
        messageId: 'msg-1',
        agentId,
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        inputTokens: 600,
        outputTokens: 300,
        source: 'chat',
      })

      const stats = await dashboard.getAgentStats(projId)
      expect(stats[0].totalTokens).toBe(900) // only counted once
    })
  })

  describe('saveMessage with provider/model columns', () => {
    it('stores provider and model on messages', () => {
      insertConversation('conv-1')
      insertMessage('msg-prov', 'conv-1', {
        inputTokens: 100,
        outputTokens: 50,
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
      })

      const rows = db.all<{ provider: string; model: string }>(
        sql`SELECT provider, model FROM messages WHERE id = 'msg-prov'`,
      )
      expect(rows).toHaveLength(1)
      expect(rows[0].provider).toBe('anthropic')
      expect(rows[0].model).toBe('claude-sonnet-4-20250514')
    })

    it('defaults provider and model to empty string', () => {
      insertConversation('conv-1')
      insertMessage('msg-default', 'conv-1', { inputTokens: 100, outputTokens: 50 })

      const rows = db.all<{ provider: string; model: string }>(
        sql`SELECT provider, model FROM messages WHERE id = 'msg-default'`,
      )
      expect(rows).toHaveLength(1)
      expect(rows[0].provider).toBe('')
      expect(rows[0].model).toBe('')
    })
  })
})
