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
    vi.clearAllMocks()
    chatConstructorCalls.length = 0
    // Clear the module-level cache between tests
    destroyAllChats()
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
      // Simulate streaming state
      ;(chat as any).status = 'streaming'

      destroyChat(convId)

      expect(mockStop).toHaveBeenCalledOnce()
    })

    it('is a no-op for non-existent conversation', () => {
      // Should not throw
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
