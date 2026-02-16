import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Artifact, ProjectId, AgentId, ArtifactId } from '@golemancy/shared'
import { createTestApp, makeRequest, type MockStorage } from '../test/route-helpers'
import type { Hono } from 'hono'

const projId = 'proj-1' as ProjectId
const agentId = 'agent-1' as AgentId
const artId = 'art-1' as ArtifactId

function makeArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: artId,
    projectId: projId,
    agentId,
    title: 'test.py',
    type: 'code',
    content: 'print("hello")',
    size: 15,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('Artifacts routes', () => {
  let app: Hono
  let mocks: MockStorage

  beforeEach(() => {
    ({ app, mocks } = createTestApp())
  })

  describe('GET /api/projects/:projectId/artifacts', () => {
    it('returns empty list', async () => {
      const res = await makeRequest(app, 'GET', `/api/projects/${projId}/artifacts`)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual([])
    })

    it('returns artifacts list', async () => {
      vi.mocked(mocks.artifactStorage.list).mockResolvedValue([makeArtifact()])

      const res = await makeRequest(app, 'GET', `/api/projects/${projId}/artifacts`)
      expect(res.status).toBe(200)
      expect(await res.json()).toHaveLength(1)
    })

    it('filters by agentId query param', async () => {
      await makeRequest(app, 'GET', `/api/projects/${projId}/artifacts?agentId=${agentId}`)
      expect(mocks.artifactStorage.list).toHaveBeenCalledWith(projId, agentId)
    })
  })

  describe('GET /api/projects/:projectId/artifacts/:id', () => {
    it('returns artifact when found', async () => {
      vi.mocked(mocks.artifactStorage.getById).mockResolvedValue(makeArtifact())

      const res = await makeRequest(app, 'GET', `/api/projects/${projId}/artifacts/${artId}`)
      expect(res.status).toBe(200)
      expect((await res.json()).title).toBe('test.py')
    })

    it('returns 404 when not found', async () => {
      const res = await makeRequest(app, 'GET', `/api/projects/${projId}/artifacts/missing`)
      expect(res.status).toBe(404)
    })
  })

  describe('DELETE /api/projects/:projectId/artifacts/:id', () => {
    it('deletes artifact', async () => {
      const res = await makeRequest(app, 'DELETE', `/api/projects/${projId}/artifacts/${artId}`)
      expect(res.status).toBe(200)
      expect((await res.json()).ok).toBe(true)
      expect(mocks.artifactStorage.delete).toHaveBeenCalledWith(projId, artId)
    })
  })
})
