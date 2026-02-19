import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ConversationTask, ProjectId, ConversationId, TaskId } from '@golemancy/shared'
import { createTestApp, makeRequest, type MockStorage } from '../test/route-helpers'
import type { Hono } from 'hono'

const projId = 'proj-1' as ProjectId
const convId = 'conv-1' as ConversationId
const taskId = 'task-1' as TaskId

function makeTask(overrides: Partial<ConversationTask> = {}): ConversationTask {
  return {
    id: taskId,
    conversationId: convId,
    subject: 'Test Task',
    description: 'A test task',
    status: 'pending',
    blocks: [],
    blockedBy: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
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

    it('filters by conversationId', async () => {
      await makeRequest(app, 'GET', `/api/projects/${projId}/tasks?conversationId=${convId}`)
      expect(mocks.taskStorage.list).toHaveBeenCalledWith(projId, convId)
    })

    it('passes undefined when no conversationId', async () => {
      await makeRequest(app, 'GET', `/api/projects/${projId}/tasks`)
      expect(mocks.taskStorage.list).toHaveBeenCalledWith(projId, undefined)
    })
  })

  describe('GET /api/projects/:projectId/tasks/:id', () => {
    it('returns task when found', async () => {
      vi.mocked(mocks.taskStorage.getById).mockResolvedValue(makeTask())

      const res = await makeRequest(app, 'GET', `/api/projects/${projId}/tasks/${taskId}`)
      expect(res.status).toBe(200)
      expect((await res.json()).subject).toBe('Test Task')
    })

    it('returns 404 when not found', async () => {
      const res = await makeRequest(app, 'GET', `/api/projects/${projId}/tasks/missing`)
      expect(res.status).toBe(404)
    })
  })
})
