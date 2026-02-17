/**
 * Chat Instance Manager
 *
 * Module-level cache for AI SDK Chat instances, keyed by ConversationId.
 * Survives React component mount/unmount cycles so messages persist
 * across navigation.
 */
import { Chat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import type { UIMessage, ChatTransport } from 'ai'
import type { ConversationId, AgentId, ProjectId, Message } from '@golemancy/shared'

/** Convert app Message[] → UIMessage[] for Chat constructor. */
function messagesToUIMessages(messages: Message[]): UIMessage[] {
  return messages.map(m => ({
    id: m.id,
    role: m.role,
    parts: m.parts as UIMessage['parts'],
  }))
}

export interface ChatInstanceConfig {
  conversationId: ConversationId
  projectId: ProjectId
  agentId: AgentId
  initialMessages: Message[]
  serverConfig: { baseUrl: string; token: string } | null
}

// Module-level cache (same pattern as service container)
const chatInstances = new Map<ConversationId, Chat<UIMessage>>()

// LRU access order: most recently accessed ID is at the end
const lruOrder: ConversationId[] = []
const MAX_CHAT_INSTANCES = 5

/** Move a conversation ID to the end of the LRU list (most recently used). */
function touchLRU(id: ConversationId): void {
  const idx = lruOrder.indexOf(id)
  if (idx !== -1) lruOrder.splice(idx, 1)
  lruOrder.push(id)
}

/** Evict oldest chat instances exceeding MAX_CHAT_INSTANCES, skipping active ones. */
function evictLRU(): void {
  while (chatInstances.size > MAX_CHAT_INSTANCES && lruOrder.length > 0) {
    const oldestId = lruOrder[0]
    const chat = chatInstances.get(oldestId)
    // Never evict a chat that is currently streaming or submitted
    if (chat && (chat.status === 'streaming' || chat.status === 'submitted')) {
      // Move it to end (protect it) and try the next oldest
      lruOrder.shift()
      lruOrder.push(oldestId)
      // If we've cycled through all entries without evicting, stop
      if (lruOrder[0] === oldestId) break
      continue
    }
    lruOrder.shift()
    if (chat) {
      chatInstances.delete(oldestId)
    }
  }
}

export function getOrCreateChat(config: ChatInstanceConfig): Chat<UIMessage> {
  const existing = chatInstances.get(config.conversationId)
  if (existing) {
    touchLRU(config.conversationId)
    return existing
  }

  const transport: ChatTransport<UIMessage> | undefined = config.serverConfig
    ? new DefaultChatTransport({
        api: `${config.serverConfig.baseUrl}/api/chat`,
        body: {
          projectId: config.projectId,
          agentId: config.agentId,
          conversationId: config.conversationId,
        },
        headers: { Authorization: `Bearer ${config.serverConfig.token}` },
      })
    : undefined // mock mode — no transport

  // onError must be set here — useChat({ chat }) Mode A ignores callbacks
  const chat = new Chat<UIMessage>({
    id: config.conversationId,
    messages: messagesToUIMessages(config.initialMessages),
    transport,
    onError: (error) => {
      console.error('[Chat]', config.conversationId, error)
    },
  })

  chatInstances.set(config.conversationId, chat)
  touchLRU(config.conversationId)
  evictLRU()
  return chat
}

export function destroyChat(conversationId: ConversationId): void {
  const chat = chatInstances.get(conversationId)
  if (chat && (chat.status === 'streaming' || chat.status === 'submitted')) {
    chat.stop()
  }
  chatInstances.delete(conversationId)
  const idx = lruOrder.indexOf(conversationId)
  if (idx !== -1) lruOrder.splice(idx, 1)
}

export function destroyAllChats(): void {
  for (const [id] of chatInstances) {
    destroyChat(id)
  }
  lruOrder.length = 0
}

export function hasChat(conversationId: ConversationId): boolean {
  return chatInstances.has(conversationId)
}
