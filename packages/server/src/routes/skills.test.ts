import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Skill, Agent, ProjectId, AgentId, SkillId } from '@golemancy/shared'
import { createTestApp, makeRequest, type MockStorage } from '../test/route-helpers'
import type { Hono } from 'hono'

const projId = 'proj-1' as ProjectId
const skillId = 'skill-1' as SkillId
const agentId = 'agent-1' as AgentId

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: skillId,
    projectId: projId,
    name: 'Code Review',
    description: 'Reviews code for issues',
    instructions: 'Review the code thoroughly',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

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

describe('Skills routes', () => {
  let app: Hono
  let mocks: MockStorage

  beforeEach(() => {
    ({ app, mocks } = createTestApp())
  })

  describe('GET /api/projects/:projectId/skills', () => {
    it('returns empty list', async () => {
      vi.mocked(mocks.skillStorage.list).mockResolvedValue([])

      const res = await makeRequest(app, 'GET', `/api/projects/${projId}/skills`)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual([])
    })

    it('returns skills', async () => {
      vi.mocked(mocks.skillStorage.list).mockResolvedValue([makeSkill()])

      const res = await makeRequest(app, 'GET', `/api/projects/${projId}/skills`)
      expect(res.status).toBe(200)
      expect(await res.json()).toHaveLength(1)
    })
  })

  describe('GET /api/projects/:projectId/skills/:id', () => {
    it('returns skill when found', async () => {
      vi.mocked(mocks.skillStorage.getById).mockResolvedValue(makeSkill())

      const res = await makeRequest(app, 'GET', `/api/projects/${projId}/skills/${skillId}`)
      expect(res.status).toBe(200)
      expect((await res.json()).name).toBe('Code Review')
    })

    it('returns 404 when not found', async () => {
      const res = await makeRequest(app, 'GET', `/api/projects/${projId}/skills/missing`)
      expect(res.status).toBe(404)
    })
  })

  describe('POST /api/projects/:projectId/skills', () => {
    it('creates skill and returns 201', async () => {
      vi.mocked(mocks.skillStorage.create).mockResolvedValue(makeSkill())

      const res = await makeRequest(app, 'POST', `/api/projects/${projId}/skills`, {
        name: 'Code Review',
        description: 'Reviews code',
        instructions: 'Review thoroughly',
      })
      expect(res.status).toBe(201)
      expect((await res.json()).name).toBe('Code Review')
    })

    it('returns 400 when name is empty', async () => {
      const res = await makeRequest(app, 'POST', `/api/projects/${projId}/skills`, {
        name: '',
        description: '',
        instructions: '',
      })
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('NAME_REQUIRED')
    })

    it('returns 400 when name is whitespace only', async () => {
      const res = await makeRequest(app, 'POST', `/api/projects/${projId}/skills`, {
        name: '   ',
        description: '',
        instructions: '',
      })
      expect(res.status).toBe(400)
    })
  })

  describe('PATCH /api/projects/:projectId/skills/:id', () => {
    it('updates skill', async () => {
      const updated = makeSkill({ name: 'Updated' })
      vi.mocked(mocks.skillStorage.update).mockResolvedValue(updated)

      const res = await makeRequest(app, 'PATCH', `/api/projects/${projId}/skills/${skillId}`, {
        name: 'Updated',
      })
      expect(res.status).toBe(200)
      expect((await res.json()).name).toBe('Updated')
    })

    it('returns 400 when name is empty string', async () => {
      const res = await makeRequest(app, 'PATCH', `/api/projects/${projId}/skills/${skillId}`, {
        name: '  ',
      })
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('NAME_EMPTY')
    })
  })

  describe('DELETE /api/projects/:projectId/skills/:id', () => {
    it('deletes skill when no agents reference it', async () => {
      vi.mocked(mocks.agentStorage.list).mockResolvedValue([])

      const res = await makeRequest(app, 'DELETE', `/api/projects/${projId}/skills/${skillId}`)
      expect(res.status).toBe(200)
      expect((await res.json()).ok).toBe(true)
      expect(mocks.skillStorage.delete).toHaveBeenCalledWith(projId, skillId)
    })

    it('returns 409 when agents reference the skill', async () => {
      vi.mocked(mocks.agentStorage.list).mockResolvedValue([
        makeAgent({ skillIds: [skillId] }),
      ])

      const res = await makeRequest(app, 'DELETE', `/api/projects/${projId}/skills/${skillId}`)
      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error).toBe('SKILL_IN_USE')
      expect(body.agents).toHaveLength(1)
    })
  })
})
