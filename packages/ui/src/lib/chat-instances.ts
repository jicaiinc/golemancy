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
import type { ConversationId, AgentId, ProjectId, Message } from '@solocraft/shared'

/**
 * Convert app Message[] → UIMessage[] for Chat constructor initial messages.
 * Note: Only converts text content. ToolCalls from stored messages are not
 * included because tool-invocation parts require the full streaming state
 * machine which isn't available for historical messages.
 */
export function toUIMessages(messages: Message[]): UIMessage[] {
  return messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({
      id: m.id,
      role: m.role as 'user' | 'assistant',
      parts: [{ type: 'text' as const, text: m.content }],
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
    messages: toUIMessages(config.initialMessages),
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

export function hasChat(conversationId: ConversationId): boolean {
  return chatInstances.has(conversationId)
}
