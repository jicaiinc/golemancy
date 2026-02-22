import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ConversationId, ProjectId, AgentId, MessageId, Message } from '@golemancy/shared'

// vi.hoisted ensures these are available when vi.mock factories run (hoisted)
const { mockStop, MockChat, chatConstructorCalls } = vi.hoisted(() => {
  const mockStop = vi.fn()
  const chatConstructorCalls: any[] = []
  // Must be a real class (used with `new Chat(...)`) but we track calls manually
  class MockChat {
    id: string
    messages: any[]
    transport: any
    status: string
    stop: typeof mockStop
    onError?: (error: Error) => void
    constructor(opts: any) {
      chatConstructorCalls.push(opts)
      this.id = opts.id
      this.messages = opts.messages ?? []
      this.transport = opts.transport
      this.status = 'ready'
      this.stop = mockStop
      this.onError = opts.onError
    }
  }
  return { mockStop, MockChat, chatConstructorCalls }
})

vi.mock('@ai-sdk/react', () => ({
  Chat: MockChat,
}))

vi.mock('ai', () => ({
  DefaultChatTransport: class MockTransport {
    constructor(public opts: any) {}
  },
}))

// Import AFTER mocks are registered
import {
  getOrCreateChat,
  destroyChat,
  destroyAllChats,
  releaseIdleChats,
  hasChat,
} from './chat-instances'

const now = '2024-06-01T10:00:00.000Z'

function makeMessage(overrides?: Partial<Message>): Message {
  return {
    id: 'msg-1' as MessageId,
    conversationId: 'conv-1' as ConversationId,
    role: 'user',
    parts: [{ type: 'text', text: 'Hello' }],
    content: 'Hello',
    inputTokens: 0,
    outputTokens: 0,
    contextTokens: 0,
    provider: '',
    model: '',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function makeConfig(overrides?: Partial<Parameters<typeof getOrCreateChat>[0]>) {
  return {
    conversationId: 'conv-1' as ConversationId,
    projectId: 'proj-1' as ProjectId,
    agentId: 'agent-1' as AgentId,
    initialMessages: [],
    serverConfig: null,
    ...overrides,
  }
}

describe('chat-instances', () => {
  beforeEach(() => {
    // Clear the module-level cache first (may call stop on streaming chats),
    // then reset mocks so stop calls from cleanup don't leak into next test.
    destroyAllChats()
    vi.clearAllMocks()
    chatConstructorCalls.length = 0
  })

  describe('getOrCreateChat', () => {
    it('creates a new Chat instance', () => {
      const chat = getOrCreateChat(makeConfig())

      expect(chatConstructorCalls).toHaveLength(1)
      expect(chat.id).toBe('conv-1')
    })

    it('returns cached instance on second call with same id', () => {
      const config = makeConfig()
      const first = getOrCreateChat(config)
      const second = getOrCreateChat(config)

      expect(first).toBe(second)
      expect(chatConstructorCalls).toHaveLength(1)
    })

    it('creates separate instances for different conversation ids', () => {
      const chat1 = getOrCreateChat(makeConfig({ conversationId: 'conv-1' as ConversationId }))
      const chat2 = getOrCreateChat(makeConfig({ conversationId: 'conv-2' as ConversationId }))

      expect(chat1).not.toBe(chat2)
      expect(chatConstructorCalls).toHaveLength(2)
    })

    it('creates transport when serverConfig is provided', () => {
      getOrCreateChat(makeConfig({
        serverConfig: { baseUrl: 'http://localhost:3001', token: 'test-token' },
      }))

      expect(chatConstructorCalls[0].transport).toBeDefined()
    })

    it('passes undefined transport in mock mode (no serverConfig)', () => {
      getOrCreateChat(makeConfig({ serverConfig: null }))

      expect(chatConstructorCalls[0].transport).toBeUndefined()
    })

    it('configures transport with correct API URL and auth header', () => {
      getOrCreateChat(makeConfig({
        projectId: 'proj-x' as ProjectId,
        agentId: 'agent-y' as AgentId,
        conversationId: 'conv-z' as ConversationId,
        serverConfig: { baseUrl: 'http://localhost:4000', token: 'my-token' },
      }))

      const transport = chatConstructorCalls[0].transport
      expect(transport.opts.api).toBe('http://localhost:4000/api/chat')
      expect(transport.opts.headers).toEqual({ Authorization: 'Bearer my-token' })
      expect(transport.opts.body).toEqual({
        projectId: 'proj-x',
        agentId: 'agent-y',
        conversationId: 'conv-z',
      })
    })

    it('converts initialMessages to UIMessages format', () => {
      const msgs: Message[] = [
        makeMessage({ id: 'msg-1' as any, role: 'user', parts: [{ type: 'text', text: 'Hi' }] }),
        makeMessage({ id: 'msg-2' as any, role: 'assistant', parts: [{ type: 'text', text: 'Hello' }] }),
      ]
      getOrCreateChat(makeConfig({ initialMessages: msgs }))

      const passedMessages = chatConstructorCalls[0].messages
      expect(passedMessages).toHaveLength(2)
      expect(passedMessages[0]).toEqual({ id: 'msg-1', role: 'user', parts: [{ type: 'text', text: 'Hi' }] })
      expect(passedMessages[1]).toEqual({ id: 'msg-2', role: 'assistant', parts: [{ type: 'text', text: 'Hello' }] })
    })

    it('sets onError callback on the Chat instance', () => {
      const chat = getOrCreateChat(makeConfig())
      // onError is set internally but typed as private in AbstractChat — access via any for testing
      expect((chat as any).onError).toBeDefined()
      expect(typeof (chat as any).onError).toBe('function')
    })

    it('creates fresh instance after destroy + re-create', () => {
      const convId = 'conv-recycle' as ConversationId
      const first = getOrCreateChat(makeConfig({ conversationId: convId }))
      destroyChat(convId)
      const second = getOrCreateChat(makeConfig({ conversationId: convId }))

      expect(first).not.toBe(second)
      expect(chatConstructorCalls).toHaveLength(2)
    })
  })

  describe('destroyChat', () => {
    it('removes a chat from cache', () => {
      const convId = 'conv-1' as ConversationId
      getOrCreateChat(makeConfig({ conversationId: convId }))
      expect(hasChat(convId)).toBe(true)

      destroyChat(convId)
      expect(hasChat(convId)).toBe(false)
    })

    it('stops a streaming chat before destroying', () => {
      const convId = 'conv-1' as ConversationId
      const chat = getOrCreateChat(makeConfig({ conversationId: convId }))
      ;(chat as any).status = 'streaming'

      destroyChat(convId)

      expect(mockStop).toHaveBeenCalledOnce()
    })

    it('stops a submitted chat before destroying', () => {
      const convId = 'conv-sub' as ConversationId
      const chat = getOrCreateChat(makeConfig({ conversationId: convId }))
      ;(chat as any).status = 'submitted'

      destroyChat(convId)

      expect(mockStop).toHaveBeenCalledOnce()
    })

    it('does NOT stop a ready chat', () => {
      const convId = 'conv-ready' as ConversationId
      const chat = getOrCreateChat(makeConfig({ conversationId: convId }))
      ;(chat as any).status = 'ready'

      destroyChat(convId)

      expect(mockStop).not.toHaveBeenCalled()
    })

    it('is a no-op for non-existent conversation', () => {
      destroyChat('nonexistent' as ConversationId)
    })
  })

  describe('destroyAllChats', () => {
    it('clears entire cache', () => {
      getOrCreateChat(makeConfig({ conversationId: 'conv-1' as ConversationId }))
      getOrCreateChat(makeConfig({ conversationId: 'conv-2' as ConversationId }))

      expect(hasChat('conv-1' as ConversationId)).toBe(true)
      expect(hasChat('conv-2' as ConversationId)).toBe(true)

      destroyAllChats()

      expect(hasChat('conv-1' as ConversationId)).toBe(false)
      expect(hasChat('conv-2' as ConversationId)).toBe(false)
    })
  })

  describe('releaseIdleChats', () => {
    it('removes idle chats from cache', () => {
      getOrCreateChat(makeConfig({ conversationId: 'conv-idle' as ConversationId }))
      expect(hasChat('conv-idle' as ConversationId)).toBe(true)

      releaseIdleChats()

      expect(hasChat('conv-idle' as ConversationId)).toBe(false)
    })

    it('keeps streaming chats alive', () => {
      const chat = getOrCreateChat(makeConfig({ conversationId: 'conv-active' as ConversationId }))
      ;(chat as any).status = 'streaming'

      releaseIdleChats()

      expect(hasChat('conv-active' as ConversationId)).toBe(true)
      expect(mockStop).not.toHaveBeenCalled()
    })

    it('keeps submitted chats alive', () => {
      const chat = getOrCreateChat(makeConfig({ conversationId: 'conv-sub' as ConversationId }))
      ;(chat as any).status = 'submitted'

      releaseIdleChats()

      expect(hasChat('conv-sub' as ConversationId)).toBe(true)
      expect(mockStop).not.toHaveBeenCalled()
    })

    it('removes idle chats while keeping active ones', () => {
      const idle = getOrCreateChat(makeConfig({ conversationId: 'conv-idle' as ConversationId }))
      ;(idle as any).status = 'ready'
      const active = getOrCreateChat(makeConfig({ conversationId: 'conv-active' as ConversationId }))
      ;(active as any).status = 'streaming'

      releaseIdleChats()

      expect(hasChat('conv-idle' as ConversationId)).toBe(false)
      expect(hasChat('conv-active' as ConversationId)).toBe(true)
    })
  })

  describe('hasChat', () => {
    it('returns true for existing chat', () => {
      getOrCreateChat(makeConfig({ conversationId: 'conv-1' as ConversationId }))
      expect(hasChat('conv-1' as ConversationId)).toBe(true)
    })

    it('returns false for non-existing chat', () => {
      expect(hasChat('conv-999' as ConversationId)).toBe(false)
    })
  })
})
