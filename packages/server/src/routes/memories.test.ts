import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { MemoryEntry, ProjectId, MemoryId } from '@golemancy/shared'
import { createTestApp, makeRequest, type MockStorage } from '../test/route-helpers'
import type { Hono } from 'hono'

const projId = 'proj-1' as ProjectId
const memId = 'mem-1' as MemoryId

function makeMemory(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: memId,
    projectId: projId,
    content: 'User prefers dark theme',
    source: 'agent-1',
    tags: ['preference'],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('Memories routes', () => {
  let app: Hono
  let mocks: MockStorage

  beforeEach(() => {
    ({ app, mocks } = createTestApp())
  })

  describe('GET /api/projects/:projectId/memories', () => {
    it('returns empty list', async () => {
      const res = await makeRequest(app, 'GET', `/api/projects/${projId}/memories`)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual([])
    })

    it('returns memories list', async () => {
      vi.mocked(mocks.memoryStorage.list).mockResolvedValue([makeMemory()])

      const res = await makeRequest(app, 'GET', `/api/projects/${projId}/memories`)
      expect(res.status).toBe(200)
      expect(await res.json()).toHaveLength(1)
    })
  })

  describe('POST /api/projects/:projectId/memories', () => {
    it('creates memory and returns 201', async () => {
      const created = makeMemory()
      vi.mocked(mocks.memoryStorage.create).mockResolvedValue(created)

      const res = await makeRequest(app, 'POST', `/api/projects/${projId}/memories`, {
        content: 'User prefers dark theme',
        source: 'agent-1',
        tags: ['preference'],
      })
      expect(res.status).toBe(201)
      expect((await res.json()).content).toBe('User prefers dark theme')
    })
  })

  describe('PATCH /api/projects/:projectId/memories/:id', () => {
    it('updates memory', async () => {
      const updated = makeMemory({ content: 'Updated content' })
      vi.mocked(mocks.memoryStorage.update).mockResolvedValue(updated)

      const res = await makeRequest(app, 'PATCH', `/api/projects/${projId}/memories/${memId}`, {
        content: 'Updated content',
      })
      expect(res.status).toBe(200)
      expect((await res.json()).content).toBe('Updated content')
    })
  })

  describe('DELETE /api/projects/:projectId/memories/:id', () => {
    it('deletes memory', async () => {
      const res = await makeRequest(app, 'DELETE', `/api/projects/${projId}/memories/${memId}`)
      expect(res.status).toBe(200)
      expect((await res.json()).ok).toBe(true)
      expect(mocks.memoryStorage.delete).toHaveBeenCalledWith(projId, memId)
    })
  })
})
