import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Task, TaskLogEntry, ProjectId, AgentId, TaskId } from '@golemancy/shared'
import { createTestApp, makeRequest, type MockStorage } from '../test/route-helpers'
import type { Hono } from 'hono'

const projId = 'proj-1' as ProjectId
const agentId = 'agent-1' as AgentId
const taskId = 'task-1' as TaskId

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: taskId,
    projectId: projId,
    agentId,
    title: 'Test Task',
    description: 'A test task',
    status: 'running',
    progress: 50,
    tokenUsage: 1000,
    log: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeLogEntry(overrides: Partial<TaskLogEntry> = {}): TaskLogEntry {
  return {
    timestamp: '2026-01-01T00:00:00Z',
    type: 'generation',
    content: 'Generated text',
    ...overrides,
  }
}

describe('Tasks routes', () => {
  let app: Hono
  let mocks: MockStorage

  beforeEach(() => {
    ({ app, mocks } = createTestApp())
  })

  describe('GET /api/projects/:projectId/tasks', () => {
    it('returns empty list', async () => {
      const res = await makeRequest(app, 'GET', `/api/projects/${projId}/tasks`)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual([])
    })

    it('returns tasks', async () => {
      vi.mocked(mocks.taskStorage.list).mockResolvedValue([makeTask()])

      const res = await makeRequest(app, 'GET', `/api/projects/${projId}/tasks`)
      expect(res.status).toBe(200)
      expect(await res.json()).toHaveLength(1)
    })

    it('filters by agentId', async () => {
      await makeRequest(app, 'GET', `/api/projects/${projId}/tasks?agentId=${agentId}`)
      expect(mocks.taskStorage.list).toHaveBeenCalledWith(projId, agentId)
    })
  })

  describe('GET /api/projects/:projectId/tasks/:id', () => {
    it('returns task when found', async () => {
      vi.mocked(mocks.taskStorage.getById).mockResolvedValue(makeTask())

      const res = await makeRequest(app, 'GET', `/api/projects/${projId}/tasks/${taskId}`)
      expect(res.status).toBe(200)
      expect((await res.json()).title).toBe('Test Task')
    })

    it('returns 404 when not found', async () => {
      const res = await makeRequest(app, 'GET', `/api/projects/${projId}/tasks/missing`)
      expect(res.status).toBe(404)
    })
  })

  describe('POST /api/projects/:projectId/tasks/:id/cancel', () => {
    it('cancels task', async () => {
      const res = await makeRequest(app, 'POST', `/api/projects/${projId}/tasks/${taskId}/cancel`)
      expect(res.status).toBe(200)
      expect((await res.json()).ok).toBe(true)
      expect(mocks.taskStorage.cancel).toHaveBeenCalledWith(projId, taskId)
    })
  })

  describe('GET /api/projects/:projectId/tasks/:id/logs', () => {
    it('returns logs when task exists', async () => {
      vi.mocked(mocks.taskStorage.getById).mockResolvedValue(makeTask())
      vi.mocked(mocks.taskStorage.getLogs).mockResolvedValue([makeLogEntry()])

      const res = await makeRequest(app, 'GET', `/api/projects/${projId}/tasks/${taskId}/logs`)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveLength(1)
      expect(body[0].type).toBe('generation')
    })

    it('returns 404 when task not found', async () => {
      const res = await makeRequest(app, 'GET', `/api/projects/${projId}/tasks/missing/logs`)
      expect(res.status).toBe(404)
    })

    it('passes cursor and limit', async () => {
      vi.mocked(mocks.taskStorage.getById).mockResolvedValue(makeTask())
      vi.mocked(mocks.taskStorage.getLogs).mockResolvedValue([])

      await makeRequest(app, 'GET', `/api/projects/${projId}/tasks/${taskId}/logs?cursor=5&limit=20`)
      expect(mocks.taskStorage.getLogs).toHaveBeenCalledWith(taskId, 5, 20)
    })
  })
})
