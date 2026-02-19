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

export function getOrCreateChat(config: ChatInstanceConfig): Chat<UIMessage> {
  const existing = chatInstances.get(config.conversationId)
  if (existing) return existing

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
  return chat
}

export function destroyChat(conversationId: ConversationId): void {
  const chat = chatInstances.get(conversationId)
  if (chat && (chat.status === 'streaming' || chat.status === 'submitted')) {
    chat.stop()
  }
  chatInstances.delete(conversationId)
}

export function destroyAllChats(): void {
  for (const [id] of chatInstances) {
    destroyChat(id)
  }
}

/**
 * Release idle chats from cache while keeping active (streaming/submitted)
 * ones alive. Used on project switch so in-flight agent executions continue
 * running and their results are saved to DB via server-side onFinish.
 */
export function releaseIdleChats(): void {
  for (const [id, chat] of chatInstances) {
    if (chat.status === 'streaming' || chat.status === 'submitted') {
      continue // keep active chats alive
    }
    chatInstances.delete(id)
  }
}

export function hasChat(conversationId: ConversationId): boolean {
  return chatInstances.has(conversationId)
}
