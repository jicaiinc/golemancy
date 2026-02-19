import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Project, ProjectId } from '@golemancy/shared'
import { createTestApp, makeRequest, type MockStorage } from '../test/route-helpers'
import type { Hono } from 'hono'

const projId = 'proj-1' as ProjectId

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: projId,
    name: 'Test Project',
    description: 'A test project',
    icon: 'sword',
    config: { maxConcurrentAgents: 3 },
    agentCount: 0,
    activeAgentCount: 0,
    lastActivityAt: '2026-01-01T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('Projects routes', () => {
  let app: Hono
  let mocks: MockStorage

  beforeEach(() => {
    ({ app, mocks } = createTestApp())
  })

  describe('GET /api/projects', () => {
    it('returns empty list', async () => {
      const res = await makeRequest(app, 'GET', '/api/projects')
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual([])
    })

    it('returns list of projects', async () => {
      const projects = [makeProject({ name: 'A' }), makeProject({ id: 'proj-2' as ProjectId, name: 'B' })]
      vi.mocked(mocks.projectStorage.list).mockResolvedValue(projects)

      const res = await makeRequest(app, 'GET', '/api/projects')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveLength(2)
      expect(body[0].name).toBe('A')
      expect(body[1].name).toBe('B')
    })
  })

  describe('GET /api/projects/:id', () => {
    it('returns project when found', async () => {
      vi.mocked(mocks.projectStorage.getById).mockResolvedValue(makeProject())

      const res = await makeRequest(app, 'GET', `/api/projects/${projId}`)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.name).toBe('Test Project')
    })

    it('returns 404 when not found', async () => {
      const res = await makeRequest(app, 'GET', '/api/projects/missing')
      expect(res.status).toBe(404)
    })
  })

  describe('POST /api/projects', () => {
    it('creates project and returns 201', async () => {
      const created = makeProject({ name: 'New' })
      vi.mocked(mocks.projectStorage.create).mockResolvedValue(created)

      const res = await makeRequest(app, 'POST', '/api/projects', {
        name: 'New',
        description: 'desc',
        icon: 'sword',
      })
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.name).toBe('New')
      expect(mocks.projectStorage.create).toHaveBeenCalled()
    })
  })

  describe('PATCH /api/projects/:id', () => {
    it('updates project', async () => {
      const updated = makeProject({ name: 'Updated' })
      vi.mocked(mocks.projectStorage.update).mockResolvedValue(updated)

      const res = await makeRequest(app, 'PATCH', `/api/projects/${projId}`, { name: 'Updated' })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.name).toBe('Updated')
    })
  })

  describe('DELETE /api/projects/:id', () => {
    it('deletes project', async () => {
      const res = await makeRequest(app, 'DELETE', `/api/projects/${projId}`)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.ok).toBe(true)
      expect(mocks.projectStorage.delete).toHaveBeenCalledWith(projId)
    })
  })
})
