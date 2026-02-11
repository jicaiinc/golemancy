import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createApp, type ServerDependencies } from './app'
import type { Hono } from 'hono'

// Mock AI SDK modules used by chat route
vi.mock('ai', () => ({
  streamText: vi.fn(),
  convertToModelMessages: vi.fn().mockResolvedValue([]),
  stepCountIs: vi.fn().mockReturnValue(undefined),
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
        { id: 'agent-1', projectId: 'proj-1', name: 'Writer' },
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
        { id: 'task-1', projectId: 'proj-1', title: 'Research' },
      ]),
      getById: vi.fn().mockResolvedValue(null),
      cancel: vi.fn().mockResolvedValue(undefined),
      getLogs: vi.fn().mockResolvedValue([
        { timestamp: '2024-01-01', type: 'start', content: 'Started' },
      ]),
    },
    artifactStorage: {
      list: vi.fn().mockResolvedValue([]),
      getById: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(undefined),
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
        defaultProvider: 'google', theme: 'dark', providers: [],
        userProfile: { name: '', email: '' }, defaultWorkingDirectoryBase: '',
      }),
      update: vi.fn().mockImplementation((data: any) =>
        Promise.resolve({ defaultProvider: 'google', theme: 'dark', providers: [], userProfile: { name: '', email: '' }, defaultWorkingDirectoryBase: '', ...data }),
      ),
    },
    dashboardService: {
      getSummary: vi.fn().mockResolvedValue({
        totalProjects: 2, totalAgents: 5, activeAgents: 1,
        runningTasks: 1, completedTasksToday: 3, totalTokenUsageToday: 5000,
      }),
      getActiveAgents: vi.fn().mockResolvedValue([
        { agentId: 'agent-1', agentName: 'Writer', projectName: 'P1', status: 'running' },
      ]),
      getRecentTasks: vi.fn().mockResolvedValue([]),
      getActivityFeed: vi.fn().mockResolvedValue([]),
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
        body: JSON.stringify({ name: 'New', description: 'desc', icon: 'star', workingDirectory: '~/' }),
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

    it('GET list passes agentId filter', async () => {
      await app.request('/api/projects/proj-1/tasks?agentId=agent-1')
      expect(deps.taskStorage.list).toHaveBeenCalledWith('proj-1', 'agent-1')
    })

    it('GET /:id returns 404 when not found', async () => {
      const res = await app.request('/api/projects/proj-1/tasks/task-missing')
      expect(res.status).toBe(404)
    })

    it('GET /:id returns task when found', async () => {
      ;(deps.taskStorage.getById as any).mockResolvedValueOnce({ id: 'task-1', title: 'Research' })
      const res = await app.request('/api/projects/proj-1/tasks/task-1')
      expect(res.status).toBe(200)
      expect(deps.taskStorage.getById).toHaveBeenCalledWith('proj-1', 'task-1')
    })

    it('POST /:id/cancel cancels task', async () => {
      const res = await app.request('/api/projects/proj-1/tasks/task-1/cancel', { method: 'POST' })
      expect(res.status).toBe(200)
      expect(deps.taskStorage.cancel).toHaveBeenCalledWith('proj-1', 'task-1')
    })

    it('GET /:id/logs returns logs with cursor and limit', async () => {
      ;(deps.taskStorage.getById as any).mockResolvedValueOnce({ id: 'task-1', title: 'Research' })
      const res = await app.request('/api/projects/proj-1/tasks/task-1/logs?cursor=5&limit=50')
      expect(res.status).toBe(200)
      expect(deps.taskStorage.getById).toHaveBeenCalledWith('proj-1', 'task-1')
      expect(deps.taskStorage.getLogs).toHaveBeenCalledWith('task-1', 5, 50)
    })

    it('GET /:id/logs uses defaults when no params', async () => {
      ;(deps.taskStorage.getById as any).mockResolvedValueOnce({ id: 'task-1', title: 'Research' })
      await app.request('/api/projects/proj-1/tasks/task-1/logs')
      expect(deps.taskStorage.getLogs).toHaveBeenCalledWith('task-1', undefined, 100)
    })

    it('GET /:id/logs returns 404 when task not found', async () => {
      const res = await app.request('/api/projects/proj-1/tasks/task-missing/logs')
      expect(res.status).toBe(404)
    })
  })

  // ---- Artifacts ----

  describe('artifacts routes', () => {
    it('GET list returns artifacts', async () => {
      const res = await app.request('/api/projects/proj-1/artifacts')
      expect(res.status).toBe(200)
      expect(deps.artifactStorage.list).toHaveBeenCalledWith('proj-1', undefined)
    })

    it('GET list passes agentId filter', async () => {
      await app.request('/api/projects/proj-1/artifacts?agentId=agent-1')
      expect(deps.artifactStorage.list).toHaveBeenCalledWith('proj-1', 'agent-1')
    })

    it('GET /:id returns 404 when not found', async () => {
      const res = await app.request('/api/projects/proj-1/artifacts/art-missing')
      expect(res.status).toBe(404)
    })

    it('DELETE /:id deletes artifact', async () => {
      const res = await app.request('/api/projects/proj-1/artifacts/art-1', { method: 'DELETE' })
      expect(res.status).toBe(200)
      expect(deps.artifactStorage.delete).toHaveBeenCalledWith('proj-1', 'art-1')
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
      expect(body.defaultProvider).toBe('google')
      expect(deps.settingsStorage.get).toHaveBeenCalledOnce()
    })

    it('PATCH /api/settings updates settings', async () => {
      const res = await app.request(jsonRequest('/api/settings', {
        method: 'PATCH',
        body: JSON.stringify({ defaultProvider: 'anthropic' }),
      }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.defaultProvider).toBe('anthropic')
      expect(deps.settingsStorage.update).toHaveBeenCalledWith({ defaultProvider: 'anthropic' })
    })
  })

  // ---- Dashboard ----

  describe('dashboard routes', () => {
    it('GET /api/dashboard/summary returns summary', async () => {
      const res = await app.request('/api/dashboard/summary')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.totalProjects).toBe(2)
      expect(body.activeAgents).toBe(1)
    })

    it('GET /api/dashboard/active-agents returns agents', async () => {
      const res = await app.request('/api/dashboard/active-agents')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveLength(1)
      expect(body[0].agentName).toBe('Writer')
    })

    it('GET /api/dashboard/recent-tasks passes limit', async () => {
      await app.request('/api/dashboard/recent-tasks?limit=5')
      expect(deps.dashboardService.getRecentTasks).toHaveBeenCalledWith(5)
    })

    it('GET /api/dashboard/recent-tasks uses default limit', async () => {
      await app.request('/api/dashboard/recent-tasks')
      expect(deps.dashboardService.getRecentTasks).toHaveBeenCalledWith(10)
    })

    it('GET /api/dashboard/activity passes limit', async () => {
      await app.request('/api/dashboard/activity?limit=5')
      expect(deps.dashboardService.getActivityFeed).toHaveBeenCalledWith(5)
    })

    it('GET /api/dashboard/activity uses default limit', async () => {
      await app.request('/api/dashboard/activity')
      expect(deps.dashboardService.getActivityFeed).toHaveBeenCalledWith(20)
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
        modelConfig: { provider: 'google', temperature: 0.7, maxTokens: 1024 },
        skills: [], tools: [], subAgents: [],
        createdAt: '2024-01-01', updatedAt: '2024-01-01',
      }
      ;(deps.agentStorage.getById as any).mockResolvedValueOnce(mockAgent)

      const mockResponse = new Response('data: {"type":"text"}\n\n', {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
      ;(streamText as any).mockReturnValue({
        toUIMessageStreamResponse: () => mockResponse,
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
        temperature: 0.7,
        maxOutputTokens: 1024,
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
        toUIMessageStreamResponse: () => new Response('', { status: 200 }),
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
