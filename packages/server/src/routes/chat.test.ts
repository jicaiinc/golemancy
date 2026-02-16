import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import type {
  Agent, Project, Conversation, GlobalSettings,
  ProjectId, AgentId, ConversationId, IMCPService, IAgentService,
  IProjectService, IConversationService, ISettingsService, IPermissionsConfigService,
} from '@golemancy/shared'
import { createChatRoutes, type ChatRouteDeps } from './chat'

// Mock heavy dependencies — we don't want real AI calls
vi.mock('../agent/model', () => ({
  resolveModel: vi.fn().mockReturnValue({ modelId: 'mock-model' }),
}))

vi.mock('../agent/tools', () => ({
  loadAgentTools: vi.fn().mockResolvedValue({
    tools: {},
    instructions: '',
    warnings: [],
    cleanup: vi.fn(),
  }),
}))

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>()
  return {
    ...actual,
    streamText: vi.fn().mockReturnValue({
      toUIMessageStream: vi.fn().mockReturnValue(new ReadableStream({
        start(controller) {
          controller.close()
        },
      })),
    }),
    convertToModelMessages: vi.fn().mockReturnValue([]),
    createUIMessageStream: vi.fn().mockImplementation(({ execute }) => {
      // Create a stream and execute immediately
      return new ReadableStream({
        start(controller) {
          const writer = {
            write: vi.fn(),
            merge: vi.fn(), // no-op: don't try to consume the merged stream
          }
          execute({ writer })
          controller.close()
        },
      })
    }),
    createUIMessageStreamResponse: vi.fn().mockImplementation(({ stream }) => {
      return new Response(stream, {
        headers: { 'Content-Type': 'text/event-stream' },
      })
    }),
    stepCountIs: actual.stepCountIs,
  }
})

const projId = 'proj-1' as ProjectId
const agentId = 'agent-1' as AgentId
const convId = 'conv-1' as ConversationId

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: agentId,
    projectId: projId,
    name: 'Test Agent',
    description: '',
    status: 'idle',
    systemPrompt: 'You are helpful',
    modelConfig: { provider: 'openai' },
    skillIds: [],
    tools: [],
    subAgents: [],
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
    workingDirectory: '/tmp/test',
    config: { maxConcurrentAgents: 3 },
    agentCount: 1,
    activeAgentCount: 0,
    lastActivityAt: '2026-01-01T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

const defaultSettings: GlobalSettings = {
  providers: [{ provider: 'openai', apiKey: 'sk-test', defaultModel: 'gpt-4o' }],
  defaultProvider: 'openai',
  theme: 'dark',
  userProfile: { name: 'Test', email: 'test@test.com' },
  defaultWorkingDirectoryBase: '/tmp',
}

function createMocks(): ChatRouteDeps {
  return {
    agentStorage: {
      list: vi.fn().mockResolvedValue([]),
      getById: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    projectStorage: {
      list: vi.fn().mockResolvedValue([]),
      getById: vi.fn().mockResolvedValue(makeProject()),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    conversationStorage: {
      list: vi.fn().mockResolvedValue([]),
      getById: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      sendMessage: vi.fn().mockResolvedValue(undefined),
      saveMessage: vi.fn().mockResolvedValue(undefined),
      getMessages: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      searchMessages: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      update: vi.fn(),
      delete: vi.fn(),
    },
    settingsStorage: {
      get: vi.fn().mockResolvedValue(defaultSettings),
      update: vi.fn(),
    },
    mcpStorage: {
      list: vi.fn().mockResolvedValue([]),
      getByName: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      resolveNames: vi.fn().mockResolvedValue([]),
    },
    permissionsConfigStorage: {
      list: vi.fn().mockResolvedValue([]),
      getById: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      duplicate: vi.fn(),
    },
  }
}

function createChatApp(mocks: ChatRouteDeps) {
  const app = new Hono()
  app.route('/api/chat', createChatRoutes(mocks))
  return app
}

describe('Chat routes', () => {
  let mocks: ChatRouteDeps
  let app: Hono

  beforeEach(() => {
    vi.clearAllMocks()
    mocks = createMocks()
    app = createChatApp(mocks)
  })

  const validBody = {
    projectId: projId,
    agentId,
    conversationId: convId,
    messages: [
      { id: 'msg-1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] },
    ],
  }

  describe('validation errors', () => {
    it('returns 400 when projectId is missing', async () => {
      const res = await app.request('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validBody, projectId: '' }),
      })
      expect(res.status).toBe(400)
      expect((await res.json()).error).toContain('projectId')
    })

    it('returns 400 when messages is empty', async () => {
      const res = await app.request('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validBody, messages: [] }),
      })
      expect(res.status).toBe(400)
      expect((await res.json()).error).toContain('messages')
    })

    it('returns 400 when messages is not an array', async () => {
      const res = await app.request('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validBody, messages: 'not-array' }),
      })
      expect(res.status).toBe(400)
    })

    it('returns 400 when message has missing role', async () => {
      const res = await app.request('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...validBody,
          messages: [{ id: 'msg-1', parts: [{ type: 'text', text: 'Hello' }] }],
        }),
      })
      expect(res.status).toBe(400)
      expect((await res.json()).error).toContain('role')
    })

    it('returns 400 for invalid message role', async () => {
      const res = await app.request('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...validBody,
          messages: [{ id: 'msg-1', role: 'system', parts: [{ type: 'text', text: 'x' }] }],
        }),
      })
      expect(res.status).toBe(400)
      expect((await res.json()).error).toContain('Invalid message role')
    })

    it('returns 400 when neither agentId nor conversationId provided', async () => {
      const res = await app.request('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: projId,
          messages: [{ id: 'msg-1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }],
        }),
      })
      expect(res.status).toBe(400)
      expect((await res.json()).error).toContain('agentId')
    })
  })

  describe('agent resolution', () => {
    it('returns 404 when agent not found', async () => {
      const res = await app.request('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validBody),
      })
      expect(res.status).toBe(404)
      expect((await res.json()).error).toContain('not found')
    })

    it('resolves agentId from conversation when not provided directly', async () => {
      vi.mocked(mocks.conversationStorage.getById).mockResolvedValue({
        id: convId,
        projectId: projId,
        agentId,
        title: 'Test',
        messages: [],
        lastMessageAt: '2026-01-01T00:00:00Z',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      })
      vi.mocked(mocks.agentStorage.getById).mockResolvedValue(makeAgent())

      const res = await app.request('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: projId,
          conversationId: convId,
          messages: [{ id: 'msg-1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }],
        }),
      })
      // Should not be a 400 — agent resolved from conversation
      expect(res.status).not.toBe(400)
      expect(mocks.conversationStorage.getById).toHaveBeenCalledWith(projId, convId)
    })
  })

  describe('successful stream', () => {
    it('returns streaming response', async () => {
      vi.mocked(mocks.agentStorage.getById).mockResolvedValue(makeAgent())

      const res = await app.request('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validBody),
      })
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toContain('text/event-stream')
    })

    it('saves user message before streaming when conversationId is provided', async () => {
      vi.mocked(mocks.agentStorage.getById).mockResolvedValue(makeAgent())

      await app.request('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validBody),
      })

      expect(mocks.conversationStorage.saveMessage).toHaveBeenCalledWith(
        projId, convId,
        expect.objectContaining({
          id: 'msg-1',
          role: 'user',
          content: 'Hello',
        }),
      )
    })

    it('does not save user message when conversationId is not provided', async () => {
      vi.mocked(mocks.agentStorage.getById).mockResolvedValue(makeAgent())

      await app.request('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validBody, conversationId: undefined }),
      })

      expect(mocks.conversationStorage.saveMessage).not.toHaveBeenCalled()
    })
  })
})
