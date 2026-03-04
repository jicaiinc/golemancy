import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Team, ProjectId, TeamId } from '@golemancy/shared'
import { createTestApp, makeRequest, type MockStorage } from '../test/route-helpers'
import type { Hono } from 'hono'

const projId = 'proj-1' as ProjectId
const teamId = 'team-1' as TeamId

function makeTeam(overrides: Partial<Team> = {}): Team {
  return {
    id: teamId,
    projectId: projId,
    name: 'Test Team',
    description: 'A test team',
    members: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('Teams routes', () => {
  let app: Hono
  let mocks: MockStorage

  beforeEach(() => {
    ({ app, mocks } = createTestApp())
  })

  describe('GET /api/projects/:projectId/teams', () => {
    it('returns empty list', async () => {
      const res = await makeRequest(app, 'GET', `/api/projects/${projId}/teams`)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual([])
    })

    it('returns list of teams', async () => {
      const teams = [makeTeam({ name: 'A' }), makeTeam({ id: 'team-2' as TeamId, name: 'B' })]
      vi.mocked(mocks.teamStorage.list).mockResolvedValue(teams)

      const res = await makeRequest(app, 'GET', `/api/projects/${projId}/teams`)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveLength(2)
      expect(body[0].name).toBe('A')
      expect(body[1].name).toBe('B')
    })
  })

  describe('GET /api/projects/:projectId/teams/:teamId', () => {
    it('returns team when found', async () => {
      vi.mocked(mocks.teamStorage.getById).mockResolvedValue(makeTeam())

      const res = await makeRequest(app, 'GET', `/api/projects/${projId}/teams/${teamId}`)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.name).toBe('Test Team')
    })

    it('returns 404 when not found', async () => {
      const res = await makeRequest(app, 'GET', `/api/projects/${projId}/teams/missing`)
      expect(res.status).toBe(404)
    })
  })

  describe('POST /api/projects/:projectId/teams', () => {
    it('creates team and returns 201', async () => {
      const created = makeTeam({ name: 'New Team' })
      vi.mocked(mocks.teamStorage.create).mockResolvedValue(created)

      const res = await makeRequest(app, 'POST', `/api/projects/${projId}/teams`, {
        name: 'New Team',
        description: 'desc',
        members: [],
      })
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.name).toBe('New Team')
    })
  })

  describe('PATCH /api/projects/:projectId/teams/:teamId', () => {
    it('updates team', async () => {
      const updated = makeTeam({ name: 'Updated' })
      vi.mocked(mocks.teamStorage.update).mockResolvedValue(updated)

      const res = await makeRequest(app, 'PATCH', `/api/projects/${projId}/teams/${teamId}`, {
        name: 'Updated',
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.name).toBe('Updated')
    })
  })

  describe('DELETE /api/projects/:projectId/teams/:teamId', () => {
    it('deletes team and clears defaultTeamId if matching', async () => {
      vi.mocked(mocks.projectStorage.getById).mockResolvedValue({
        id: projId,
        name: 'Project',
        description: '',
        icon: 'sword',
        config: {},
        agentCount: 0,
        activeAgentCount: 0,
        lastActivityAt: '',
        createdAt: '',
        updatedAt: '',
        defaultTeamId: teamId,
      })
      vi.mocked(mocks.teamStorage.delete).mockResolvedValue(undefined)
      vi.mocked(mocks.projectStorage.update).mockResolvedValue({} as any)

      const res = await makeRequest(app, 'DELETE', `/api/projects/${projId}/teams/${teamId}`)
      expect(res.status).toBe(200)
      expect(mocks.projectStorage.update).toHaveBeenCalledWith(projId, { defaultTeamId: undefined })
      expect(mocks.teamStorage.delete).toHaveBeenCalledWith(projId, teamId)
    })

    it('deletes team without clearing defaultTeamId if not matching', async () => {
      vi.mocked(mocks.projectStorage.getById).mockResolvedValue({
        id: projId,
        name: 'Project',
        description: '',
        icon: 'sword',
        config: {},
        agentCount: 0,
        activeAgentCount: 0,
        lastActivityAt: '',
        createdAt: '',
        updatedAt: '',
        defaultTeamId: 'team-other' as TeamId,
      })
      vi.mocked(mocks.teamStorage.delete).mockResolvedValue(undefined)

      const res = await makeRequest(app, 'DELETE', `/api/projects/${projId}/teams/${teamId}`)
      expect(res.status).toBe(200)
      expect(mocks.projectStorage.update).not.toHaveBeenCalled()
    })
  })

  describe('GET /api/projects/:projectId/teams/:teamId/layout', () => {
    it('returns empty layout by default', async () => {
      const res = await makeRequest(app, 'GET', `/api/projects/${projId}/teams/${teamId}/layout`)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({})
    })

    it('returns saved layout', async () => {
      const layout = { 'agent-1': { x: 100, y: 200 }, 'agent-2': { x: 300, y: 400 } }
      vi.mocked(mocks.teamStorage.getLayout).mockResolvedValue(layout)

      const res = await makeRequest(app, 'GET', `/api/projects/${projId}/teams/${teamId}/layout`)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual(layout)
    })
  })

  describe('PUT /api/projects/:projectId/teams/:teamId/layout', () => {
    it('saves layout', async () => {
      const layout = { 'agent-1': { x: 50, y: 75 } }

      const res = await makeRequest(app, 'PUT', `/api/projects/${projId}/teams/${teamId}/layout`, layout)
      expect(res.status).toBe(200)
      expect(mocks.teamStorage.saveLayout).toHaveBeenCalledWith(projId, teamId, layout)
    })
  })
})
