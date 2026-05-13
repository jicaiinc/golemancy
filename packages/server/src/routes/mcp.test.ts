import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import type { ProjectId, AgentId, IMCPService, IAgentService, IProjectService, IPermissionsConfigService, MCPServerConfig, Agent } from '@golemancy/shared'
import { createMCPRoutes } from './mcp'

const projId = 'proj-1' as ProjectId

function makeServer(overrides: Partial<MCPServerConfig> = {}): MCPServerConfig {
  return {
    name: 'test-server',
    transportType: 'stdio',
    command: 'echo',
    enabled: true,
    ...overrides,
  }
}

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'agent-1' as AgentId,
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
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

function createMocks() {
  const mcpStorage: IMCPService = {
    list: vi.fn().mockResolvedValue([]),
    getByName: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    resolveNames: vi.fn().mockResolvedValue([]),
  }
  const agentStorage: IAgentService = {
    list: vi.fn().mockResolvedValue([]),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  }
  const projectStorage: IProjectService = {
    list: vi.fn().mockResolvedValue([]),
    getById: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  }
  const permissionsConfigStorage: IPermissionsConfigService = {
    list: vi.fn().mockResolvedValue([]),
    getById: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    duplicate: vi.fn(),
  }
  return { mcpStorage, agentStorage, projectStorage, permissionsConfigStorage }
}

function createTestApp(mocks: ReturnType<typeof createMocks>) {
  const app = new Hono()
  app.route('/api/projects/:projectId/mcp-servers', createMCPRoutes(mocks))
  return app
}

describe('MCP routes', () => {
  let mocks: ReturnType<typeof createMocks>
  let app: Hono

  beforeEach(() => {
    mocks = createMocks()
    app = createTestApp(mocks)
  })

  describe('GET /', () => {
    it('returns list of all servers', async () => {
      const servers = [makeServer({ name: 'a' }), makeServer({ name: 'b' })]
      vi.mocked(mocks.mcpStorage.list).mockResolvedValue(servers)

      const res = await app.request(`/api/projects/${projId}/mcp-servers`)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveLength(2)
      expect(body[0].name).toBe('a')
      expect(body[1].name).toBe('b')
    })
  })

  describe('GET /:name', () => {
    it('returns server when found', async () => {
      vi.mocked(mocks.mcpStorage.getByName).mockResolvedValue(makeServer({ name: 'found' }))

      const res = await app.request(`/api/projects/${projId}/mcp-servers/found`)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.name).toBe('found')
    })

    it('returns 404 when not found', async () => {
      vi.mocked(mocks.mcpStorage.getByName).mockResolvedValue(null)

      const res = await app.request(`/api/projects/${projId}/mcp-servers/missing`)
      expect(res.status).toBe(404)
    })
  })

  describe('POST /', () => {
    it('creates server and returns 201', async () => {
      const created = makeServer({ name: 'new-server' })
      vi.mocked(mocks.mcpStorage.getByName).mockResolvedValue(null) // no duplicate
      vi.mocked(mocks.mcpStorage.create).mockResolvedValue(created)

      const res = await app.request(`/api/projects/${projId}/mcp-servers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'new-server', transportType: 'stdio', command: 'echo' }),
      })

      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.name).toBe('new-server')
      expect(mocks.mcpStorage.create).toHaveBeenCalled()
    })

    it('returns 409 on duplicate name', async () => {
      vi.mocked(mocks.mcpStorage.getByName).mockResolvedValue(makeServer({ name: 'dup' }))

      const res = await app.request(`/api/projects/${projId}/mcp-servers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'dup', transportType: 'stdio', command: 'echo' }),
      })

      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error).toBe('MCP_SERVER_DUPLICATE')
    })

    it('returns 400 when name is missing', async () => {
      const res = await app.request(`/api/projects/${projId}/mcp-servers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transportType: 'stdio' }),
      })

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toBe('NAME_REQUIRED')
    })

    it('returns 400 for invalid transportType', async () => {
      const res = await app.request(`/api/projects/${projId}/mcp-servers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'test', transportType: 'invalid' }),
      })

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toBe('INVALID_TRANSPORT_TYPE')
    })
  })

  describe('PATCH /:name', () => {
    it('updates server', async () => {
      const updated = makeServer({ name: 'upd', command: 'new-cmd' })
      vi.mocked(mocks.mcpStorage.update).mockResolvedValue(updated)

      const res = await app.request(`/api/projects/${projId}/mcp-servers/upd`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'new-cmd' }),
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.command).toBe('new-cmd')
    })

    it('returns 404 when not found', async () => {
      vi.mocked(mocks.mcpStorage.update).mockRejectedValue(new Error('not found'))

      const res = await app.request(`/api/projects/${projId}/mcp-servers/missing`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      })

      expect(res.status).toBe(404)
    })
  })

  describe('DELETE /:name', () => {
    it('deletes server when no agents reference it', async () => {
      vi.mocked(mocks.agentStorage.list).mockResolvedValue([])
      vi.mocked(mocks.mcpStorage.delete).mockResolvedValue(undefined)

      const res = await app.request(`/api/projects/${projId}/mcp-servers/del-me`, {
        method: 'DELETE',
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.ok).toBe(true)
    })

    it('returns 409 when agents reference the server', async () => {
      const agent = makeAgent({ mcpServers: ['referenced'] })
      vi.mocked(mocks.agentStorage.list).mockResolvedValue([agent])

      const res = await app.request(`/api/projects/${projId}/mcp-servers/referenced`, {
        method: 'DELETE',
      })

      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error).toBe('MCP_SERVER_IN_USE')
      expect(body.agents).toHaveLength(1)
    })

    it('returns 404 when server does not exist', async () => {
      vi.mocked(mocks.agentStorage.list).mockResolvedValue([])
      vi.mocked(mocks.mcpStorage.delete).mockRejectedValue(new Error('not found'))

      const res = await app.request(`/api/projects/${projId}/mcp-servers/missing`, {
        method: 'DELETE',
      })

      expect(res.status).toBe(404)
    })
  })
})
