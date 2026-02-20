import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createApp, type ServerDependencies } from './app'
import type { Hono } from 'hono'

// Mock AI SDK modules used by chat route
vi.mock('ai', () => ({
  streamText: vi.fn(),
  convertToModelMessages: vi.fn().mockResolvedValue([]),
  stepCountIs: vi.fn().mockReturnValue(undefined),
  createUIMessageStream: vi.fn().mockImplementation(({ execute }: any) => {
    // Execute the callback to trigger merges, then return a mock stream
    const writer = { write: vi.fn(), merge: vi.fn() }
    execute({ writer })
    return new ReadableStream()
  }),
  createUIMessageStreamResponse: vi.fn().mockImplementation(() =>
    new Response('', { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
  ),
}))

vi.mock('./agent/model', () => ({
  resolveModel: vi.fn().mockResolvedValue({ modelId: 'test-model' }),
}))

function createMockDeps() {
  return {
    projectStorage: {
      list: vi.fn().mockResolvedValue([
        { id: 'proj-1', name: 'Project One' },
        { id: 'proj-2', name: 'Project Two' },
      ]),
      getById: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((data: any) =>
        Promise.resolve({ id: 'proj-new', ...data, agentCount: 0, createdAt: '2024-01-01' }),
      ),
      update: vi.fn().mockImplementation((id: any, data: any) =>
        Promise.resolve({ id, ...data, updatedAt: '2024-01-02' }),
      ),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    agentStorage: {
      list: vi.fn().mockResolvedValue([
        { id: 'agent-1', projectId: 'proj-1', name: 'Writer', mcpServers: [] },
      ]),
      getById: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((_pid: any, data: any) =>
        Promise.resolve({ id: 'agent-new', projectId: _pid, ...data, status: 'idle' }),
      ),
      update: vi.fn().mockImplementation((_pid: any, id: any, data: any) =>
        Promise.resolve({ id, ...data }),
      ),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    conversationStorage: {
      list: vi.fn().mockResolvedValue([
        { id: 'conv-1', projectId: 'proj-1', title: 'Chat 1' },
      ]),
      getById: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((_pid: any, agentId: any, title: any) =>
        Promise.resolve({ id: 'conv-new', projectId: _pid, agentId, title, messages: [] }),
      ),
      sendMessage: vi.fn().mockResolvedValue(undefined),
      saveMessage: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      getMessages: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 }),
      searchMessages: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
    },
    taskStorage: {
      list: vi.fn().mockResolvedValue([
        { id: 'task-1', conversationId: 'conv-1', subject: 'Research', status: 'pending', blocks: [], blockedBy: [] },
      ]),
      getById: vi.fn().mockResolvedValue(null),
    },
    memoryStorage: {
      list: vi.fn().mockResolvedValue([
        { id: 'mem-1', content: 'Remember this' },
      ]),
      create: vi.fn().mockImplementation((_pid: any, data: any) =>
        Promise.resolve({ id: 'mem-new', projectId: _pid, ...data }),
      ),
      update: vi.fn().mockImplementation((_pid: any, id: any, data: any) =>
        Promise.resolve({ id, ...data }),
      ),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    settingsStorage: {
      get: vi.fn().mockResolvedValue({
        theme: 'dark', providers: {},
      }),
      update: vi.fn().mockImplementation((data: any) =>
        Promise.resolve({ theme: 'dark', providers: {}, ...data }),
      ),
    },
    dashboardService: {
      getSummary: vi.fn().mockResolvedValue({
        todayTokens: { total: 5000, input: 3000, output: 2000, callCount: 10 },
        totalAgents: 5, activeChats: 1, totalChats: 8,
      }),
      getAgentStats: vi.fn().mockResolvedValue([
        { agentId: 'agent-1', projectId: 'proj-1', projectName: 'P1', agentName: 'Writer', model: 'gpt-4o', status: 'running', totalTokens: 5000, conversationCount: 2, taskCount: 3, completedTasks: 2, failedTasks: 0, lastActiveAt: null },
      ]),
      getRecentChats: vi.fn().mockResolvedValue([]),
      getTokenTrend: vi.fn().mockResolvedValue([]),
    },
    mcpStorage: {
      list: vi.fn().mockResolvedValue([
        { name: 'filesystem', transportType: 'stdio', command: 'npx', enabled: true },
      ]),
      getByName: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((_pid: any, data: any) =>
        Promise.resolve({ ...data, enabled: data.enabled ?? true }),
      ),
      update: vi.fn().mockImplementation((_pid: any, name: any, data: any) =>
        Promise.resolve({ name, ...data }),
      ),
      delete: vi.fn().mockResolvedValue(undefined),
      resolveNames: vi.fn().mockResolvedValue([]),
    },
    skillStorage: {
      list: vi.fn().mockResolvedValue([]),
      getById: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    cronJobStorage: {
      list: vi.fn().mockResolvedValue([]),
      getById: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    cronJobRunStorage: {
      create: vi.fn().mockResolvedValue({ id: 'cronrun-1', status: 'running' }),
      updateStatus: vi.fn().mockResolvedValue(undefined),
      listByJob: vi.fn().mockResolvedValue([]),
      listByProject: vi.fn().mockResolvedValue([]),
    },
    permissionsConfigStorage: {
      list: vi.fn().mockResolvedValue([]),
      getById: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      duplicate: vi.fn(),
    },
    tokenRecordStorage: {
      save: vi.fn().mockReturnValue('tkr-1'),
      getConversationUsage: vi.fn().mockReturnValue({ total: { inputTokens: 0, outputTokens: 0 }, byAgent: [], byModel: [] }),
    },
    compactRecordStorage: {
      getLatest: vi.fn().mockResolvedValue(null),
      list: vi.fn().mockResolvedValue([]),
      save: vi.fn().mockResolvedValue({ id: 'compact-1' }),
    },
  } as unknown as ServerDependencies
}

function jsonRequest(path: string, options: RequestInit = {}) {
  return new Request(`http://localhost${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
}

describe('HTTP API routes', () => {
  let app: ReturnType<typeof createApp>
  let deps: ReturnType<typeof createMockDeps>

  beforeEach(() => {
    deps = createMockDeps()
    app = createApp(deps as unknown as ServerDependencies)
  })

  // ---- Health ----

  describe('GET /api/health', () => {
    it('returns ok status', async () => {
      const res = await app.request('/api/health')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.status).toBe('ok')
      expect(body.timestamp).toBeTruthy()
    })
  })

  // ---- Projects ----

  describe('projects routes', () => {
    it('GET /api/projects returns project list', async () => {
      const res = await app.request('/api/projects')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveLength(2)
      expect(deps.projectStorage.list).toHaveBeenCalledOnce()
    })

    it('GET /api/projects/:id returns 404 when not found', async () => {
      const res = await app.request('/api/projects/proj-missing')
      expect(res.status).toBe(404)
      const body = await res.json()
      expect(body.error).toBe('Not found')
    })

    it('GET /api/projects/:id returns project when found', async () => {
      const mockProject = { id: 'proj-1', name: 'Found' }
      ;(deps.projectStorage.getById as any).mockResolvedValueOnce(mockProject)

      const res = await app.request('/api/projects/proj-1')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.name).toBe('Found')
    })

    it('POST /api/projects creates project with 201', async () => {
      const res = await app.request(jsonRequest('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ name: 'New', description: 'desc', icon: 'star' }),
      }))
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.id).toBe('proj-new')
      expect(body.name).toBe('New')
      expect(deps.projectStorage.create).toHaveBeenCalledOnce()
    })

    it('PATCH /api/projects/:id updates project', async () => {
      const res = await app.request(jsonRequest('/api/projects/proj-1', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Updated' }),
      }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.name).toBe('Updated')
      expect(deps.projectStorage.update).toHaveBeenCalledWith('proj-1', { name: 'Updated' })
    })

    it('DELETE /api/projects/:id deletes project', async () => {
      const res = await app.request('/api/projects/proj-1', { method: 'DELETE' })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.ok).toBe(true)
      expect(deps.projectStorage.delete).toHaveBeenCalledWith('proj-1')
    })
  })

  // ---- Agents ----

  describe('agents routes', () => {
    it('GET /api/projects/:projectId/agents returns agents', async () => {
      const res = await app.request('/api/projects/proj-1/agents')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveLength(1)
      expect(deps.agentStorage.list).toHaveBeenCalledWith('proj-1')
    })

    it('GET /api/projects/:projectId/agents/:id returns 404 when not found', async () => {
      const res = await app.request('/api/projects/proj-1/agents/agent-missing')
      expect(res.status).toBe(404)
    })

    it('GET /api/projects/:projectId/agents/:id returns agent when found', async () => {
      ;(deps.agentStorage.getById as any).mockResolvedValueOnce({ id: 'agent-1', name: 'Writer' })

      const res = await app.request('/api/projects/proj-1/agents/agent-1')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.name).toBe('Writer')
      expect(deps.agentStorage.getById).toHaveBeenCalledWith('proj-1', 'agent-1')
    })

    it('POST /api/projects/:projectId/agents creates agent with 201', async () => {
      const res = await app.request(jsonRequest('/api/projects/proj-1/agents', {
        method: 'POST',
        body: JSON.stringify({ name: 'New Agent', description: 'd', systemPrompt: 'p', modelConfig: { provider: 'google' } }),
      }))
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.projectId).toBe('proj-1')
      expect(deps.agentStorage.create).toHaveBeenCalledWith('proj-1', expect.objectContaining({ name: 'New Agent' }))
    })

    it('PATCH /api/projects/:projectId/agents/:id updates agent', async () => {
      const res = await app.request(jsonRequest('/api/projects/proj-1/agents/agent-1', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Renamed' }),
      }))
      expect(res.status).toBe(200)
      expect(deps.agentStorage.update).toHaveBeenCalledWith('proj-1', 'agent-1', { name: 'Renamed' })
    })

    it('DELETE /api/projects/:projectId/agents/:id deletes agent', async () => {
      const res = await app.request('/api/projects/proj-1/agents/agent-1', { method: 'DELETE' })
      expect(res.status).toBe(200)
      expect(deps.agentStorage.delete).toHaveBeenCalledWith('proj-1', 'agent-1')
    })
  })

  // ---- Conversations ----

  describe('conversations routes', () => {
    it('GET list passes projectId', async () => {
      const res = await app.request('/api/projects/proj-1/conversations')
      expect(res.status).toBe(200)
      expect(deps.conversationStorage.list).toHaveBeenCalledWith('proj-1', undefined)
    })

    it('GET list passes agentId query param', async () => {
      await app.request('/api/projects/proj-1/conversations?agentId=agent-1')
      expect(deps.conversationStorage.list).toHaveBeenCalledWith('proj-1', 'agent-1')
    })

    it('GET /:id returns 404 when not found', async () => {
      const res = await app.request('/api/projects/proj-1/conversations/conv-missing')
      expect(res.status).toBe(404)
    })

    it('POST creates conversation with 201', async () => {
      const res = await app.request(jsonRequest('/api/projects/proj-1/conversations', {
        method: 'POST',
        body: JSON.stringify({ agentId: 'agent-1', title: 'New Chat' }),
      }))
      expect(res.status).toBe(201)
      expect(deps.conversationStorage.create).toHaveBeenCalledWith('proj-1', 'agent-1', 'New Chat')
    })

    it('DELETE deletes conversation', async () => {
      const res = await app.request('/api/projects/proj-1/conversations/conv-1', { method: 'DELETE' })
      expect(res.status).toBe(200)
      expect(deps.conversationStorage.delete).toHaveBeenCalledWith('proj-1', 'conv-1')
    })

    it('GET /:convId/messages parses pagination params', async () => {
      await app.request('/api/projects/proj-1/conversations/conv-1/messages?page=2&pageSize=10')
      expect(deps.conversationStorage.getMessages).toHaveBeenCalledWith('proj-1', 'conv-1', { page: 2, pageSize: 10 })
    })

    it('GET /:convId/messages uses default pagination', async () => {
      await app.request('/api/projects/proj-1/conversations/conv-1/messages')
      expect(deps.conversationStorage.getMessages).toHaveBeenCalledWith('proj-1', 'conv-1', { page: 1, pageSize: 50 })
    })

    it('GET /messages/search passes query and pagination', async () => {
      await app.request('/api/projects/proj-1/conversations/messages/search?q=hello&page=1&pageSize=10')
      expect(deps.conversationStorage.searchMessages).toHaveBeenCalledWith('proj-1', 'hello', { page: 1, pageSize: 10 })
    })

    it('GET /messages/search uses defaults when no params', async () => {
      await app.request('/api/projects/proj-1/conversations/messages/search')
      expect(deps.conversationStorage.searchMessages).toHaveBeenCalledWith('proj-1', '', { page: 1, pageSize: 20 })
    })
  })

  // ---- Tasks ----

  describe('tasks routes', () => {
    it('GET list returns tasks', async () => {
      const res = await app.request('/api/projects/proj-1/tasks')
      expect(res.status).toBe(200)
      expect(deps.taskStorage.list).toHaveBeenCalledWith('proj-1', undefined)
    })

    it('GET list passes conversationId filter', async () => {
      await app.request('/api/projects/proj-1/tasks?conversationId=conv-1')
      expect(deps.taskStorage.list).toHaveBeenCalledWith('proj-1', 'conv-1')
    })

    it('GET /:id returns 404 when not found', async () => {
      const res = await app.request('/api/projects/proj-1/tasks/task-missing')
      expect(res.status).toBe(404)
    })

    it('GET /:id returns task when found', async () => {
      ;(deps.taskStorage.getById as any).mockResolvedValueOnce({ id: 'task-1', subject: 'Research' })
      const res = await app.request('/api/projects/proj-1/tasks/task-1')
      expect(res.status).toBe(200)
      expect(deps.taskStorage.getById).toHaveBeenCalledWith('proj-1', 'task-1')
    })
  })

  // ---- Memories ----

  describe('memories routes', () => {
    it('GET list returns memories', async () => {
      const res = await app.request('/api/projects/proj-1/memories')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveLength(1)
      expect(deps.memoryStorage.list).toHaveBeenCalledWith('proj-1')
    })

    it('POST creates memory with 201', async () => {
      const res = await app.request(jsonRequest('/api/projects/proj-1/memories', {
        method: 'POST',
        body: JSON.stringify({ content: 'New memory', source: 'agent-1', tags: ['test'] }),
      }))
      expect(res.status).toBe(201)
      expect(deps.memoryStorage.create).toHaveBeenCalledWith('proj-1', { content: 'New memory', source: 'agent-1', tags: ['test'] })
    })

    it('PATCH /:id updates memory', async () => {
      const res = await app.request(jsonRequest('/api/projects/proj-1/memories/mem-1', {
        method: 'PATCH',
        body: JSON.stringify({ content: 'Updated' }),
      }))
      expect(res.status).toBe(200)
      expect(deps.memoryStorage.update).toHaveBeenCalledWith('proj-1', 'mem-1', { content: 'Updated' })
    })

    it('DELETE /:id deletes memory', async () => {
      const res = await app.request('/api/projects/proj-1/memories/mem-1', { method: 'DELETE' })
      expect(res.status).toBe(200)
      expect(deps.memoryStorage.delete).toHaveBeenCalledWith('proj-1', 'mem-1')
    })
  })

  // ---- Settings ----

  describe('settings routes', () => {
    it('GET /api/settings returns settings', async () => {
      const res = await app.request('/api/settings')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.theme).toBe('dark')
      expect(deps.settingsStorage.get).toHaveBeenCalledOnce()
    })

    it('PATCH /api/settings updates settings', async () => {
      const res = await app.request(jsonRequest('/api/settings', {
        method: 'PATCH',
        body: JSON.stringify({ theme: 'light' }),
      }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.theme).toBe('light')
      expect(deps.settingsStorage.update).toHaveBeenCalledWith({ theme: 'light' })
    })
  })

  // ---- Dashboard ----

  describe('dashboard routes', () => {
    it('GET /api/projects/:projectId/dashboard/summary returns summary', async () => {
      const res = await app.request('/api/projects/proj-1/dashboard/summary')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.totalAgents).toBe(5)
      expect(body.activeChats).toBe(1)
    })

    it('GET /api/projects/:projectId/dashboard/agent-stats returns stats', async () => {
      const res = await app.request('/api/projects/proj-1/dashboard/agent-stats')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveLength(1)
      expect(body[0].agentName).toBe('Writer')
    })

    it('GET /api/projects/:projectId/dashboard/recent-chats passes limit', async () => {
      await app.request('/api/projects/proj-1/dashboard/recent-chats?limit=5')
      expect(deps.dashboardService.getRecentChats).toHaveBeenCalledWith('proj-1', 5)
    })

    it('GET /api/projects/:projectId/dashboard/token-trend passes days', async () => {
      await app.request('/api/projects/proj-1/dashboard/token-trend?days=30')
      expect(deps.dashboardService.getTokenTrend).toHaveBeenCalledWith('proj-1', 30, undefined)
    })
  })

  // ---- MCP Servers ----

  describe('mcp-servers routes', () => {
    it('GET /api/projects/:projectId/mcp-servers returns list', async () => {
      const res = await app.request('/api/projects/proj-1/mcp-servers')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveLength(1)
      expect(body[0].name).toBe('filesystem')
      expect(deps.mcpStorage.list).toHaveBeenCalledWith('proj-1')
    })

    it('GET /api/projects/:projectId/mcp-servers/:name returns 404 when not found', async () => {
      const res = await app.request('/api/projects/proj-1/mcp-servers/missing')
      expect(res.status).toBe(404)
      const body = await res.json()
      expect(body.error).toBe('MCP server not found')
    })

    it('GET /api/projects/:projectId/mcp-servers/:name returns server when found', async () => {
      ;(deps.mcpStorage.getByName as any).mockResolvedValueOnce({ name: 'fs', transportType: 'stdio' })
      const res = await app.request('/api/projects/proj-1/mcp-servers/fs')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.name).toBe('fs')
    })

    it('POST /api/projects/:projectId/mcp-servers creates with 201', async () => {
      const res = await app.request(jsonRequest('/api/projects/proj-1/mcp-servers', {
        method: 'POST',
        body: JSON.stringify({ name: 'new-server', transportType: 'stdio', command: 'echo' }),
      }))
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.name).toBe('new-server')
    })

    it('POST /api/projects/:projectId/mcp-servers returns 400 for missing name', async () => {
      const res = await app.request(jsonRequest('/api/projects/proj-1/mcp-servers', {
        method: 'POST',
        body: JSON.stringify({ transportType: 'stdio' }),
      }))
      expect(res.status).toBe(400)
    })

    it('POST /api/projects/:projectId/mcp-servers returns 400 for invalid transport', async () => {
      const res = await app.request(jsonRequest('/api/projects/proj-1/mcp-servers', {
        method: 'POST',
        body: JSON.stringify({ name: 'test', transportType: 'invalid' }),
      }))
      expect(res.status).toBe(400)
    })

    it('POST /api/projects/:projectId/mcp-servers returns 409 for duplicate', async () => {
      ;(deps.mcpStorage.getByName as any).mockResolvedValueOnce({ name: 'dup', transportType: 'stdio' })
      const res = await app.request(jsonRequest('/api/projects/proj-1/mcp-servers', {
        method: 'POST',
        body: JSON.stringify({ name: 'dup', transportType: 'stdio', command: 'echo' }),
      }))
      expect(res.status).toBe(409)
    })

    it('PATCH /api/projects/:projectId/mcp-servers/:name updates server', async () => {
      const res = await app.request(jsonRequest('/api/projects/proj-1/mcp-servers/fs', {
        method: 'PATCH',
        body: JSON.stringify({ enabled: false }),
      }))
      expect(res.status).toBe(200)
      expect(deps.mcpStorage.update).toHaveBeenCalledWith('proj-1', 'fs', { enabled: false })
    })

    it('PATCH /api/projects/:projectId/mcp-servers/:name returns 404 when not found', async () => {
      ;(deps.mcpStorage.update as any).mockRejectedValueOnce(new Error('MCP server "missing" not found'))
      const res = await app.request(jsonRequest('/api/projects/proj-1/mcp-servers/missing', {
        method: 'PATCH',
        body: JSON.stringify({ enabled: false }),
      }))
      expect(res.status).toBe(404)
    })

    it('DELETE /api/projects/:projectId/mcp-servers/:name deletes server', async () => {
      const res = await app.request('/api/projects/proj-1/mcp-servers/fs', { method: 'DELETE' })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.ok).toBe(true)
    })

    it('DELETE /api/projects/:projectId/mcp-servers/:name returns 409 when referenced by agents', async () => {
      ;(deps.agentStorage.list as any).mockResolvedValueOnce([
        { id: 'agent-1', name: 'Writer', mcpServers: ['fs'] },
      ])
      const res = await app.request('/api/projects/proj-1/mcp-servers/fs', { method: 'DELETE' })
      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error).toBe('MCP server is referenced by agents')
    })

    it('DELETE /api/projects/:projectId/mcp-servers/:name returns 404 when not found', async () => {
      ;(deps.mcpStorage.delete as any).mockRejectedValueOnce(new Error('MCP server "missing" not found'))
      const res = await app.request('/api/projects/proj-1/mcp-servers/missing', { method: 'DELETE' })
      expect(res.status).toBe(404)
    })
  })

  // ---- Chat ----

  describe('chat route', () => {
    it('POST /api/chat returns 400 when projectId is missing', async () => {
      const res = await app.request(jsonRequest('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ messages: [{ id: '1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }] }),
      }))
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toBe('projectId is required')
    })

    it('POST /api/chat returns 400 when messages is empty', async () => {
      const res = await app.request(jsonRequest('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ projectId: 'proj-1', messages: [] }),
      }))
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toBe('messages is required')
    })

    it('POST /api/chat returns 400 when no agentId or conversationId', async () => {
      const res = await app.request(jsonRequest('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          projectId: 'proj-1',
          messages: [{ id: '1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }],
        }),
      }))
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toBe('agentId or conversationId is required')
    })

    it('POST /api/chat returns 404 when agent not found', async () => {
      const res = await app.request(jsonRequest('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          projectId: 'proj-1',
          agentId: 'agent-nonexistent',
          messages: [{ id: '1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }],
        }),
      }))
      expect(res.status).toBe(404)
      const body = await res.json()
      expect(body.error).toBe('Agent agent-nonexistent not found')
    })

    it('POST /api/chat resolves agentId from conversationId', async () => {
      deps.conversationStorage.getById.mockResolvedValueOnce({
        id: 'conv-1', projectId: 'proj-1', agentId: 'agent-missing', title: 'Test',
        messages: [], lastMessageAt: '', createdAt: '', updatedAt: '',
      })
      const res = await app.request(jsonRequest('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          projectId: 'proj-1',
          conversationId: 'conv-1',
          messages: [{ id: '1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }],
        }),
      }))
      // Agent lookup returns null by default → 404
      expect(res.status).toBe(404)
      expect(deps.conversationStorage.getById).toHaveBeenCalledWith('proj-1', 'conv-1')
      expect(deps.agentStorage.getById).toHaveBeenCalledWith('proj-1', 'agent-missing')
    })

    it('POST /api/chat returns streaming response when agent is found', async () => {
      const { streamText } = await import('ai')
      const { resolveModel } = await import('./agent/model')

      const mockAgent = {
        id: 'agent-1', projectId: 'proj-1', name: 'Writer',
        description: 'Test agent', status: 'idle',
        systemPrompt: 'You are helpful.',
        modelConfig: { provider: 'google', model: 'gemini-2.5-flash' },
        skills: [], tools: [], subAgents: [],
        createdAt: '2024-01-01', updatedAt: '2024-01-01',
      }
      ;(deps.agentStorage.getById as any).mockResolvedValueOnce(mockAgent)

      const mockResponse = new Response('data: {"type":"text"}\n\n', {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
      ;(streamText as any).mockReturnValue({
        toUIMessageStream: () => mockResponse,
      })

      const res = await app.request(jsonRequest('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          projectId: 'proj-1',
          agentId: 'agent-1',
          messages: [{ id: '1', role: 'user', parts: [{ type: 'text', text: 'hello' }] }],
        }),
      }))

      expect(res.status).toBe(200)
      expect(resolveModel).toHaveBeenCalled()
      expect(streamText).toHaveBeenCalledWith(expect.objectContaining({
        system: 'You are helpful.',
      }))
    })

    it('POST /api/chat passes convertToModelMessages result to streamText', async () => {
      const { streamText, convertToModelMessages } = await import('ai')

      const mockAgent = {
        id: 'agent-1', projectId: 'proj-1', name: 'Writer',
        description: 'Test agent', status: 'idle',
        systemPrompt: 'You are a writer.',
        modelConfig: { provider: 'google' },
        skills: [], tools: [], subAgents: [],
        createdAt: '2024-01-01', updatedAt: '2024-01-01',
      }
      ;(deps.agentStorage.getById as any).mockResolvedValueOnce(mockAgent)

      const mockModelMessages = [{ role: 'user', content: 'converted' }]
      ;(convertToModelMessages as any).mockResolvedValueOnce(mockModelMessages)
      ;(streamText as any).mockReturnValue({
        toUIMessageStream: () => new Response('', { status: 200 }),
      })

      await app.request(jsonRequest('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          projectId: 'proj-1',
          agentId: 'agent-1',
          messages: [{ id: '1', role: 'user', parts: [{ type: 'text', text: 'hello' }] }],
        }),
      }))

      expect(convertToModelMessages).toHaveBeenCalledWith([
        { id: '1', role: 'user', parts: [{ type: 'text', text: 'hello' }] },
      ])
      expect(streamText).toHaveBeenCalledWith(expect.objectContaining({
        messages: mockModelMessages,
      }))
    })
  })
})
