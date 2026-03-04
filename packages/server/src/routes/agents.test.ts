import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Agent, Project, AgentId, ProjectId } from '@golemancy/shared'
import { createTestApp, makeRequest, type MockStorage } from '../test/route-helpers'
import type { Hono } from 'hono'

const projId = 'proj-1' as ProjectId
const agentId = 'agent-1' as AgentId

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: agentId,
    projectId: projId,
    name: 'Test Agent',
    description: '',
    status: 'idle',
    systemPrompt: '',
    modelConfig: { provider: 'openai' },
    skillIds: [],
    tools: [],
    mcpServers: [],
    builtinTools: { bash: true },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: projId,
    name: 'Test Project',
    description: '',
    icon: 'sword',
    config: { maxConcurrentAgents: 3 },
    agentCount: 1,
    activeAgentCount: 0,
    lastActivityAt: '2026-01-01T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('Agents routes', () => {
  let app: Hono
  let mocks: MockStorage

  beforeEach(() => {
    ({ app, mocks } = createTestApp())
  })

  describe('GET /api/projects/:projectId/agents', () => {
    it('returns empty list', async () => {
      const res = await makeRequest(app, 'GET', `/api/projects/${projId}/agents`)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual([])
    })

    it('returns agents for a project', async () => {
      vi.mocked(mocks.agentStorage.list).mockResolvedValue([makeAgent()])

      const res = await makeRequest(app, 'GET', `/api/projects/${projId}/agents`)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveLength(1)
      expect(body[0].name).toBe('Test Agent')
    })
  })

  describe('GET /api/projects/:projectId/agents/:id', () => {
    it('returns agent when found', async () => {
      vi.mocked(mocks.agentStorage.getById).mockResolvedValue(makeAgent())

      const res = await makeRequest(app, 'GET', `/api/projects/${projId}/agents/${agentId}`)
      expect(res.status).toBe(200)
      expect((await res.json()).name).toBe('Test Agent')
    })

    it('returns 404 when not found', async () => {
      const res = await makeRequest(app, 'GET', `/api/projects/${projId}/agents/missing`)
      expect(res.status).toBe(404)
    })
  })

  describe('POST /api/projects/:projectId/agents', () => {
    it('creates agent and returns 201', async () => {
      const created = makeAgent({ name: 'New Agent' })
      vi.mocked(mocks.agentStorage.create).mockResolvedValue(created)

      const res = await makeRequest(app, 'POST', `/api/projects/${projId}/agents`, {
        name: 'New Agent',
        description: '',
        systemPrompt: '',
        modelConfig: { provider: 'openai' },
      })
      expect(res.status).toBe(201)
      expect((await res.json()).name).toBe('New Agent')
    })
  })

  describe('PATCH /api/projects/:projectId/agents/:id', () => {
    it('updates agent', async () => {
      const updated = makeAgent({ name: 'Updated' })
      vi.mocked(mocks.agentStorage.update).mockResolvedValue(updated)

      const res = await makeRequest(app, 'PATCH', `/api/projects/${projId}/agents/${agentId}`, { name: 'Updated' })
      expect(res.status).toBe(200)
      expect((await res.json()).name).toBe('Updated')
    })
  })

  describe('DELETE /api/projects/:projectId/agents/:id', () => {
    it('deletes agent and clears defaultAgentId if it matches', async () => {
      vi.mocked(mocks.projectStorage.getById).mockResolvedValue(makeProject({ defaultAgentId: agentId }))
      vi.mocked(mocks.projectStorage.update).mockResolvedValue(makeProject({ defaultAgentId: undefined }))

      const res = await makeRequest(app, 'DELETE', `/api/projects/${projId}/agents/${agentId}`)
      expect(res.status).toBe(200)
      expect((await res.json()).ok).toBe(true)
      expect(mocks.projectStorage.update).toHaveBeenCalledWith(projId, { defaultAgentId: undefined })
      expect(mocks.agentStorage.delete).toHaveBeenCalledWith(projId, agentId)
    })

    it('deletes agent without clearing defaultAgentId if different', async () => {
      vi.mocked(mocks.projectStorage.getById).mockResolvedValue(makeProject({ defaultAgentId: 'agent-other' as AgentId }))

      const res = await makeRequest(app, 'DELETE', `/api/projects/${projId}/agents/${agentId}`)
      expect(res.status).toBe(200)
      expect(mocks.projectStorage.update).not.toHaveBeenCalled()
      expect(mocks.agentStorage.delete).toHaveBeenCalledWith(projId, agentId)
    })
  })
})
