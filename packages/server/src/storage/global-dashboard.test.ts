import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { sql } from 'drizzle-orm'
import { createTestDb } from '../test/helpers'
import { GlobalDashboardService } from './global-dashboard'
import { TokenRecordStorage } from './token-records'
import type { AppDatabase } from '../db/client'
import type { ProjectId, AgentId, IProjectService, IAgentService } from '@golemancy/shared'
import { toLocalDate } from '../utils/time-range'

const projId = 'proj-1' as ProjectId
const projId2 = 'proj-2' as ProjectId
const agentId = 'agent-1' as AgentId
const agentId2 = 'agent-2' as AgentId

function todayISO() {
  return new Date().toISOString()
}

function todayLocal() {
  return toLocalDate()
}

describe('GlobalDashboardService', () => {
  let db: AppDatabase
  let close: () => void
  let dashboard: GlobalDashboardService
  let tokenRecordStorage: TokenRecordStorage
  let mockProjectStorage: IProjectService
  let mockAgentStorage: IAgentService

  beforeEach(() => {
    const test = createTestDb()
    db = test.db
    close = test.close
    const getProjectDb = () => db

    tokenRecordStorage = new TokenRecordStorage(getProjectDb)

    mockProjectStorage = {
      list: vi.fn().mockResolvedValue([
        { id: projId, name: 'Project 1' },
      ]),
      getById: vi.fn().mockResolvedValue({ id: projId, name: 'Project 1' }),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    }

    mockAgentStorage = {
      list: vi.fn().mockResolvedValue([
        { id: agentId, name: 'Agent 1', status: 'idle' },
      ]),
      getById: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    }

    dashboard = new GlobalDashboardService({
      projectStorage: mockProjectStorage,
      agentStorage: mockAgentStorage,
      getProjectDb,
    })
  })

  afterEach(() => {
    close()
  })

  function insertConversation(convId: string, agentIdParam: string = agentId as string) {
    db.run(sql`INSERT INTO conversations (id, project_id, agent_id, title, created_at, updated_at)
      VALUES (${convId}, ${projId}, ${agentIdParam}, 'Test Conv', ${todayISO()}, ${todayISO()})`)
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
    it('returns zero totals when no data exists', async () => {
      const summary = await dashboard.getSummary()
      expect(summary.totalAgents).toBe(1)
      expect(summary.totalChats).toBe(0)
      expect(summary.activeChats).toBe(0)
      expect(summary.todayTokens.total).toBe(0)
      expect(summary.todayTokens.input).toBe(0)
      expect(summary.todayTokens.output).toBe(0)
      expect(summary.todayTokens.callCount).toBe(0)
    })

    it('aggregates agents count across projects', async () => {
      ;(mockProjectStorage.list as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: projId, name: 'P1' },
        { id: projId2, name: 'P2' },
      ])
      ;(mockAgentStorage.list as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: agentId, name: 'A1' },
        { id: agentId2, name: 'A2' },
      ])

      const summary = await dashboard.getSummary()
      // 2 agents per project × 2 projects = 4
      expect(summary.totalAgents).toBe(4)
    })

    it('counts total chats from conversations table', async () => {
      insertConversation('conv-1')
      insertConversation('conv-2')

      const summary = await dashboard.getSummary()
      expect(summary.totalChats).toBe(2)
    })

    it('sums tokens from token_records', async () => {
      tokenRecordStorage.save(projId, {
        agentId: agentId as string,
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        inputTokens: 1000,
        outputTokens: 500,
        source: 'chat',
      })
      tokenRecordStorage.save(projId, {
        agentId: agentId as string,
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        inputTokens: 2000,
        outputTokens: 800,
        source: 'chat',
      })

      const summary = await dashboard.getSummary()
      expect(summary.todayTokens.input).toBe(3000)
      expect(summary.todayTokens.output).toBe(1300)
      expect(summary.todayTokens.total).toBe(4300)
      expect(summary.todayTokens.callCount).toBe(2)
    })

    it('falls back to messages when no token_records exist', async () => {
      insertConversation('conv-1')
      insertMessage('msg-1', 'conv-1', { inputTokens: 500, outputTokens: 200 })

      const summary = await dashboard.getSummary()
      expect(summary.todayTokens.input).toBe(500)
      expect(summary.todayTokens.output).toBe(200)
    })

    it('does not double-count linked token_records and messages', async () => {
      insertConversation('conv-1')
      insertMessage('msg-1', 'conv-1', { inputTokens: 500, outputTokens: 200 })

      tokenRecordStorage.save(projId, {
        conversationId: 'conv-1',
        messageId: 'msg-1',
        agentId: agentId as string,
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        inputTokens: 500,
        outputTokens: 200,
        source: 'chat',
      })

      const summary = await dashboard.getSummary()
      expect(summary.todayTokens.input).toBe(500)
      expect(summary.todayTokens.output).toBe(200)
    })
  })

  describe('getSummary with timeRange', () => {
    it('filters by today range', async () => {
      // Record from today
      tokenRecordStorage.save(projId, {
        agentId: agentId as string,
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        inputTokens: 100,
        outputTokens: 50,
        source: 'chat',
      })

      const summary = await dashboard.getSummary('today')
      expect(summary.todayTokens.input).toBe(100)
      expect(summary.todayTokens.output).toBe(50)
    })

    it('returns all data with range=all', async () => {
      tokenRecordStorage.save(projId, {
        agentId: agentId as string,
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        inputTokens: 300,
        outputTokens: 150,
        source: 'chat',
      })

      const summary = await dashboard.getSummary('all')
      expect(summary.todayTokens.input).toBe(300)
    })
  })

  describe('getTokenByModel', () => {
    it('groups tokens by provider and model', async () => {
      tokenRecordStorage.save(projId, {
        agentId: agentId as string,
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        inputTokens: 1000,
        outputTokens: 500,
        source: 'chat',
      })
      tokenRecordStorage.save(projId, {
        agentId: agentId as string,
        provider: 'openai',
        model: 'gpt-4o',
        inputTokens: 800,
        outputTokens: 400,
        source: 'chat',
      })
      tokenRecordStorage.save(projId, {
        agentId: agentId as string,
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        inputTokens: 200,
        outputTokens: 100,
        source: 'cron',
      })

      const result = await dashboard.getTokenByModel()

      expect(result).toHaveLength(2)
      // Sorted by total tokens descending
      const anthropic = result.find(r => r.provider === 'anthropic')
      const openai = result.find(r => r.provider === 'openai')

      expect(anthropic).toBeDefined()
      expect(anthropic!.inputTokens).toBe(1200) // 1000 + 200
      expect(anthropic!.outputTokens).toBe(600) // 500 + 100
      expect(anthropic!.callCount).toBe(2)

      expect(openai).toBeDefined()
      expect(openai!.inputTokens).toBe(800)
      expect(openai!.outputTokens).toBe(400)
      expect(openai!.callCount).toBe(1)
    })

    it('returns empty array when no data', async () => {
      const result = await dashboard.getTokenByModel()
      expect(result).toEqual([])
    })

    it('sorts by total tokens descending', async () => {
      tokenRecordStorage.save(projId, {
        agentId: agentId as string,
        provider: 'small',
        model: 'small-model',
        inputTokens: 10,
        outputTokens: 5,
        source: 'chat',
      })
      tokenRecordStorage.save(projId, {
        agentId: agentId as string,
        provider: 'big',
        model: 'big-model',
        inputTokens: 10000,
        outputTokens: 5000,
        source: 'chat',
      })

      const result = await dashboard.getTokenByModel()
      expect(result[0].provider).toBe('big')
      expect(result[1].provider).toBe('small')
    })

    it('filters by time range', async () => {
      tokenRecordStorage.save(projId, {
        agentId: agentId as string,
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        inputTokens: 500,
        outputTokens: 250,
        source: 'chat',
      })

      const result = await dashboard.getTokenByModel('today')
      expect(result).toHaveLength(1)
      expect(result[0].inputTokens).toBe(500)
    })

    it('includes message fallback for unlinked messages', async () => {
      insertConversation('conv-1')
      insertMessage('msg-unlinked', 'conv-1', {
        inputTokens: 300,
        outputTokens: 150,
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
      })

      const result = await dashboard.getTokenByModel()
      expect(result).toHaveLength(1)
      expect(result[0].inputTokens).toBe(300)
    })
  })

  describe('getTokenByAgent', () => {
    it('groups tokens by agent with project info', async () => {
      tokenRecordStorage.save(projId, {
        agentId: agentId as string,
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        inputTokens: 1000,
        outputTokens: 500,
        source: 'chat',
      })

      const result = await dashboard.getTokenByAgent()

      expect(result).toHaveLength(1)
      expect(result[0].agentId).toBe(agentId)
      expect(result[0].agentName).toBe('Agent 1')
      expect(result[0].projectId).toBe(projId)
      expect(result[0].projectName).toBe('Project 1')
      expect(result[0].inputTokens).toBe(1000)
      expect(result[0].outputTokens).toBe(500)
      expect(result[0].callCount).toBe(1)
    })

    it('returns empty array when no data', async () => {
      const result = await dashboard.getTokenByAgent()
      expect(result).toEqual([])
    })

    it('aggregates multiple records for same agent', async () => {
      tokenRecordStorage.save(projId, {
        agentId: agentId as string,
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        inputTokens: 500,
        outputTokens: 200,
        source: 'chat',
      })
      tokenRecordStorage.save(projId, {
        agentId: agentId as string,
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        inputTokens: 300,
        outputTokens: 100,
        source: 'cron',
      })

      const result = await dashboard.getTokenByAgent()
      expect(result).toHaveLength(1)
      expect(result[0].inputTokens).toBe(800)
      expect(result[0].outputTokens).toBe(300)
      expect(result[0].callCount).toBe(2)
    })

    it('sorts by total tokens descending', async () => {
      ;(mockAgentStorage.list as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: agentId, name: 'Agent 1' },
        { id: agentId2, name: 'Agent 2' },
      ])

      tokenRecordStorage.save(projId, {
        agentId: agentId as string,
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        inputTokens: 100,
        outputTokens: 50,
        source: 'chat',
      })
      tokenRecordStorage.save(projId, {
        agentId: agentId2 as string,
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        inputTokens: 5000,
        outputTokens: 2000,
        source: 'chat',
      })

      const result = await dashboard.getTokenByAgent()
      expect(result[0].agentId).toBe(agentId2)
      expect(result[1].agentId).toBe(agentId)
    })

    it('filters by time range', async () => {
      tokenRecordStorage.save(projId, {
        agentId: agentId as string,
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        inputTokens: 500,
        outputTokens: 250,
        source: 'chat',
      })

      const result = await dashboard.getTokenByAgent('today')
      expect(result).toHaveLength(1)
    })
  })

  describe('getTokenTrend', () => {
    it('returns daily trend with correct number of days', async () => {
      const trend = await dashboard.getTokenTrend(7)
      expect(trend).toHaveLength(7)
    })

    it('returns zeros for days with no data', async () => {
      const trend = await dashboard.getTokenTrend(7)
      for (const entry of trend) {
        expect(entry.inputTokens).toBe(0)
        expect(entry.outputTokens).toBe(0)
      }
    })

    it('includes today token data in daily trend', async () => {
      tokenRecordStorage.save(projId, {
        agentId: agentId as string,
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        inputTokens: 1000,
        outputTokens: 500,
        source: 'chat',
      })

      const trend = await dashboard.getTokenTrend(7)
      // Last entry should be today
      const todayDate = todayLocal()
      const todayEntry = trend.find(t => t.date === todayDate)
      expect(todayEntry).toBeDefined()
      expect(todayEntry!.inputTokens).toBe(1000)
      expect(todayEntry!.outputTokens).toBe(500)
    })

    it('aggregates multiple records on same day', async () => {
      tokenRecordStorage.save(projId, {
        agentId: agentId as string,
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        inputTokens: 500,
        outputTokens: 200,
        source: 'chat',
      })
      tokenRecordStorage.save(projId, {
        agentId: agentId as string,
        provider: 'openai',
        model: 'gpt-4o',
        inputTokens: 300,
        outputTokens: 100,
        source: 'chat',
      })

      const trend = await dashboard.getTokenTrend(7)
      const todayDate = todayLocal()
      const todayEntry = trend.find(t => t.date === todayDate)
      expect(todayEntry!.inputTokens).toBe(800)
      expect(todayEntry!.outputTokens).toBe(300)
    })

    it('respects timeRange=7d', async () => {
      tokenRecordStorage.save(projId, {
        agentId: agentId as string,
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        inputTokens: 100,
        outputTokens: 50,
        source: 'chat',
      })

      const trend = await dashboard.getTokenTrend(14, '7d')
      // When timeRange is 7d, days is overridden to 7
      expect(trend).toHaveLength(7)
    })

    it('respects timeRange=30d', async () => {
      const trend = await dashboard.getTokenTrend(14, '30d')
      expect(trend).toHaveLength(30)
    })

    it('returns hourly trend for timeRange=today', async () => {
      tokenRecordStorage.save(projId, {
        agentId: agentId as string,
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        inputTokens: 500,
        outputTokens: 200,
        source: 'chat',
      })

      const trend = await dashboard.getTokenTrend(14, 'today')
      // Hourly trend: 24 entries (00-23)
      expect(trend).toHaveLength(24)

      // All entries have date as two-digit hour string
      for (const entry of trend) {
        expect(entry.date).toMatch(/^\d{2}$/)
      }

      // Current hour should have our token data
      const currentHour = String(new Date().getHours()).padStart(2, '0')
      const currentEntry = trend.find(t => t.date === currentHour)
      expect(currentEntry).toBeDefined()
      expect(currentEntry!.inputTokens).toBe(500)
      expect(currentEntry!.outputTokens).toBe(200)
    })

    it('hourly trend returns zeros for hours with no data', async () => {
      const trend = await dashboard.getTokenTrend(14, 'today')
      expect(trend).toHaveLength(24)

      for (const entry of trend) {
        expect(entry.inputTokens).toBe(0)
        expect(entry.outputTokens).toBe(0)
      }
    })

    it('falls back to messages for unlinked data in daily trend', async () => {
      insertConversation('conv-1')
      insertMessage('msg-1', 'conv-1', { inputTokens: 400, outputTokens: 200 })

      const trend = await dashboard.getTokenTrend(7)
      const todayDate = todayLocal()
      const todayEntry = trend.find(t => t.date === todayDate)
      expect(todayEntry!.inputTokens).toBe(400)
      expect(todayEntry!.outputTokens).toBe(200)
    })

    it('does not double-count linked records in daily trend', async () => {
      insertConversation('conv-1')
      insertMessage('msg-1', 'conv-1', { inputTokens: 400, outputTokens: 200 })

      tokenRecordStorage.save(projId, {
        conversationId: 'conv-1',
        messageId: 'msg-1',
        agentId: agentId as string,
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        inputTokens: 400,
        outputTokens: 200,
        source: 'chat',
      })

      const trend = await dashboard.getTokenTrend(7)
      const todayDate = todayLocal()
      const todayEntry = trend.find(t => t.date === todayDate)
      expect(todayEntry!.inputTokens).toBe(400)
      expect(todayEntry!.outputTokens).toBe(200)
    })
  })

  describe('multi-project aggregation', () => {
    it('aggregates tokens across multiple projects', async () => {
      // Both projects use the same DB in tests, but the service iterates over them
      ;(mockProjectStorage.list as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: projId, name: 'P1' },
        { id: projId2, name: 'P2' },
      ])

      tokenRecordStorage.save(projId, {
        agentId: agentId as string,
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        inputTokens: 500,
        outputTokens: 200,
        source: 'chat',
      })

      const summary = await dashboard.getSummary()
      // Since both project IDs resolve to the same test DB, tokens are counted twice
      // This tests the iteration logic works correctly
      expect(summary.todayTokens.input).toBe(1000) // 500 × 2 projects
    })
  })
})
