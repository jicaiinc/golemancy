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
import { captureError } from './error-reporting'
import type { ConversationId, AgentId, TeamId, ProjectId, Message, TargetType } from '@golemancy/shared'

/** Convert app Message[] → UIMessage[] for Chat constructor. */
function messagesToUIMessages(messages: Message[]): UIMessage[] {
  return messages.map(m => ({
    id: m.id,
    role: m.role,
    parts: m.parts as UIMessage['parts'],
    ...(m.metadata != null ? { metadata: m.metadata } : {}),
  }))
}

export interface ChatInstanceConfig {
  conversationId: ConversationId
  projectId: ProjectId
  targetType: TargetType
  targetId: AgentId | TeamId
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
          targetType: config.targetType,
          targetId: config.targetId,
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
      captureError(error, { component: 'Chat', conversationId: config.conversationId })
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

/**
 * Sanitize a Chat instance after abort — strip incomplete tool-invocation parts
 * from the last assistant message. This prevents "Tool result is missing" errors
 * when the user sends the next message, because incomplete tool-calls would
 * otherwise be included in the POST body and rejected by the AI provider.
 *
 * Call this when chat status transitions from streaming/submitted → ready.
 */
export function sanitizeChatAfterAbort(conversationId: ConversationId): void {
  const chat = chatInstances.get(conversationId)
  if (!chat || chat.messages.length === 0) return

  const messages = [...chat.messages]
  let changed = false

  // Walk backwards — abort can leave incomplete parts in the last assistant message,
  // but also in earlier ones if multiple tool-call steps ran before abort.
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role !== 'assistant') continue

    const hasIncomplete = msg.parts.some(p => isIncompleteToolPart(p as any))
    if (!hasIncomplete) continue

    const cleanParts = msg.parts.filter(p => !isIncompleteToolPart(p as any))

    if (cleanParts.length > 0) {
      messages[i] = { ...msg, parts: cleanParts as UIMessage['parts'] }
    } else {
      messages.splice(i, 1)
    }
    changed = true
  }

  if (changed) {
    chat.messages = messages
  }
}

/** Tool-invocation states that indicate a completed (usable) tool call. */
const COMPLETED_TOOL_STATES = new Set(['result', 'output-available', 'output-error', 'output-denied', 'approval-responded'])

function isIncompleteToolPart(p: { type: string; state?: string; toolInvocation?: { state?: string } }): boolean {
  if (p.type.startsWith('tool-') || p.type === 'dynamic-tool') {
    return !COMPLETED_TOOL_STATES.has(p.state ?? '')
  }
  if (p.type === 'tool-invocation') {
    return !COMPLETED_TOOL_STATES.has(p.toolInvocation?.state ?? p.state ?? '')
  }
  return false
}

export function hasChat(conversationId: ConversationId): boolean {
  return chatInstances.has(conversationId)
}
