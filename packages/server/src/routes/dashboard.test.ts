import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { DashboardSummary, DashboardAgentSummary, DashboardTaskSummary, ActivityEntry, AgentId, ProjectId, TaskId } from '@golemancy/shared'
import { createTestApp, makeRequest, type MockStorage } from '../test/route-helpers'
import type { Hono } from 'hono'

const summary: DashboardSummary = {
  totalProjects: 5,
  totalAgents: 12,
  activeAgents: 3,
  runningTasks: 2,
  completedTasksToday: 8,
  totalTokenUsageToday: 15000,
}

const activeAgent: DashboardAgentSummary = {
  agentId: 'agent-1' as AgentId,
  projectId: 'proj-1' as ProjectId,
  projectName: 'Project A',
  agentName: 'Agent One',
  status: 'running',
  currentTaskTitle: 'Generating report',
}

const recentTask: DashboardTaskSummary = {
  taskId: 'task-1' as TaskId,
  projectId: 'proj-1' as ProjectId,
  projectName: 'Project A',
  agentId: 'agent-1' as AgentId,
  agentName: 'Agent One',
  title: 'Generate daily report',
  status: 'completed',
  progress: 100,
  updatedAt: '2026-01-01T12:00:00Z',
}

const activity: ActivityEntry = {
  id: 'act-1',
  type: 'task_completed',
  projectId: 'proj-1' as ProjectId,
  projectName: 'Project A',
  agentId: 'agent-1' as AgentId,
  agentName: 'Agent One',
  description: 'Completed task: Generate daily report',
  timestamp: '2026-01-01T12:00:00Z',
}

describe('Dashboard routes', () => {
  let app: Hono
  let mocks: MockStorage

  beforeEach(() => {
    ({ app, mocks } = createTestApp())
  })

  describe('GET /api/dashboard/summary', () => {
    it('returns dashboard summary', async () => {
      vi.mocked(mocks.dashboardService.getSummary).mockResolvedValue(summary)

      const res = await makeRequest(app, 'GET', '/api/dashboard/summary')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.totalProjects).toBe(5)
      expect(body.activeAgents).toBe(3)
    })
  })

  describe('GET /api/dashboard/active-agents', () => {
    it('returns active agents', async () => {
      vi.mocked(mocks.dashboardService.getActiveAgents).mockResolvedValue([activeAgent])

      const res = await makeRequest(app, 'GET', '/api/dashboard/active-agents')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveLength(1)
      expect(body[0].agentName).toBe('Agent One')
    })
  })

  describe('GET /api/dashboard/recent-tasks', () => {
    it('returns recent tasks with default limit', async () => {
      vi.mocked(mocks.dashboardService.getRecentTasks).mockResolvedValue([recentTask])

      const res = await makeRequest(app, 'GET', '/api/dashboard/recent-tasks')
      expect(res.status).toBe(200)
      expect(await res.json()).toHaveLength(1)
      expect(mocks.dashboardService.getRecentTasks).toHaveBeenCalledWith(10)
    })

    it('respects limit query param', async () => {
      vi.mocked(mocks.dashboardService.getRecentTasks).mockResolvedValue([])

      await makeRequest(app, 'GET', '/api/dashboard/recent-tasks?limit=5')
      expect(mocks.dashboardService.getRecentTasks).toHaveBeenCalledWith(5)
    })
  })

  describe('GET /api/dashboard/activity', () => {
    it('returns activity feed with default limit', async () => {
      vi.mocked(mocks.dashboardService.getActivityFeed).mockResolvedValue([activity])

      const res = await makeRequest(app, 'GET', '/api/dashboard/activity')
      expect(res.status).toBe(200)
      expect(await res.json()).toHaveLength(1)
      expect(mocks.dashboardService.getActivityFeed).toHaveBeenCalledWith(20)
    })

    it('respects limit query param', async () => {
      vi.mocked(mocks.dashboardService.getActivityFeed).mockResolvedValue([])

      await makeRequest(app, 'GET', '/api/dashboard/activity?limit=50')
      expect(mocks.dashboardService.getActivityFeed).toHaveBeenCalledWith(50)
    })
  })
})
