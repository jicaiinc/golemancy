import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { DashboardSummary, DashboardAgentStats, DashboardRecentChat, DashboardTokenTrend, AgentId, ProjectId, ConversationId } from '@golemancy/shared'
import { createTestApp, makeRequest, type MockStorage } from '../test/route-helpers'
import type { Hono } from 'hono'

const PID = 'proj-1' as ProjectId

const summary: DashboardSummary = {
  todayTokens: { total: 48_520, input: 32_180, output: 16_340 },
  totalAgents: 5,
  activeChats: 2,
  totalChats: 8,
}

const agentStats: DashboardAgentStats[] = [
  {
    agentId: 'agent-1' as AgentId,
    projectId: PID,
    projectName: 'Project A',
    agentName: 'Agent One',
    model: 'gpt-4o',
    status: 'running',
    totalTokens: 125_430,
    conversationCount: 4,
    taskCount: 6,
    completedTasks: 4,
    failedTasks: 0,
    lastActiveAt: '2026-02-19T10:00:00Z',
  },
]

const recentChats: DashboardRecentChat[] = [
  {
    conversationId: 'conv-1' as ConversationId,
    projectId: PID,
    projectName: 'Project A',
    agentId: 'agent-1' as AgentId,
    agentName: 'Agent One',
    title: 'Test Chat',
    messageCount: 12,
    totalTokens: 24_500,
    lastMessageAt: '2026-02-19T10:00:00Z',
  },
]

const tokenTrend: DashboardTokenTrend[] = [
  { date: '2026-02-18', inputTokens: 15_000, outputTokens: 8_000 },
  { date: '2026-02-19', inputTokens: 17_000, outputTokens: 9_000 },
]

describe('Dashboard routes', () => {
  let app: Hono
  let mocks: MockStorage

  beforeEach(() => {
    ({ app, mocks } = createTestApp())
  })

  describe(`GET /api/projects/:projectId/dashboard/summary`, () => {
    it('returns dashboard summary', async () => {
      vi.mocked(mocks.dashboardService.getSummary).mockResolvedValue(summary)

      const res = await makeRequest(app, 'GET', `/api/projects/${PID}/dashboard/summary`)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.totalAgents).toBe(5)
      expect(body.activeChats).toBe(2)
    })
  })

  describe(`GET /api/projects/:projectId/dashboard/agent-stats`, () => {
    it('returns agent stats', async () => {
      vi.mocked(mocks.dashboardService.getAgentStats).mockResolvedValue(agentStats)

      const res = await makeRequest(app, 'GET', `/api/projects/${PID}/dashboard/agent-stats`)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveLength(1)
      expect(body[0].agentName).toBe('Agent One')
      expect(body[0].totalTokens).toBe(125_430)
    })
  })

  describe(`GET /api/projects/:projectId/dashboard/recent-chats`, () => {
    it('returns recent chats with default limit', async () => {
      vi.mocked(mocks.dashboardService.getRecentChats).mockResolvedValue(recentChats)

      const res = await makeRequest(app, 'GET', `/api/projects/${PID}/dashboard/recent-chats`)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveLength(1)
      expect(body[0].title).toBe('Test Chat')
      expect(mocks.dashboardService.getRecentChats).toHaveBeenCalledWith(PID, 10)
    })

    it('respects limit query param', async () => {
      vi.mocked(mocks.dashboardService.getRecentChats).mockResolvedValue([])

      await makeRequest(app, 'GET', `/api/projects/${PID}/dashboard/recent-chats?limit=5`)
      expect(mocks.dashboardService.getRecentChats).toHaveBeenCalledWith(PID, 5)
    })
  })

  describe(`GET /api/projects/:projectId/dashboard/token-trend`, () => {
    it('returns token trend with default days', async () => {
      vi.mocked(mocks.dashboardService.getTokenTrend).mockResolvedValue(tokenTrend)

      const res = await makeRequest(app, 'GET', `/api/projects/${PID}/dashboard/token-trend`)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveLength(2)
      expect(body[0].inputTokens).toBe(15_000)
      expect(mocks.dashboardService.getTokenTrend).toHaveBeenCalledWith(PID, 14)
    })

    it('respects days query param', async () => {
      vi.mocked(mocks.dashboardService.getTokenTrend).mockResolvedValue([])

      await makeRequest(app, 'GET', `/api/projects/${PID}/dashboard/token-trend?days=30`)
      expect(mocks.dashboardService.getTokenTrend).toHaveBeenCalledWith(PID, 30)
    })
  })
})
