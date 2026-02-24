import type { AgentId, ConversationId, MessageId, ProjectId, Timestamped } from './common'

export interface Message extends Timestamped {
  id: MessageId
  conversationId: ConversationId
  role: 'user' | 'assistant'
  parts: unknown[] // serialized UIMessage['parts'] — opaque to shared package
  content: string  // plain text for display/search (derived from parts)
  inputTokens: number
  outputTokens: number
  contextTokens: number // last-step totalTokens — actual context window size (includes reasoning etc)
  provider: string  // display only — e.g. 'anthropic'
  model: string     // display only — e.g. 'claude-sonnet-4-20250514'
  metadata?: Record<string, unknown> // e.g. { toolUsages: { [toolCallId]: { inputTokens, outputTokens } } }
}

export interface CompactRecord {
  id: string
  conversationId: ConversationId
  summary: string
  boundaryMessageId: MessageId
  inputTokens: number
  outputTokens: number
  trigger: 'auto' | 'manual'
  createdAt: string
}

export interface Conversation extends Timestamped {
  id: ConversationId
  projectId: ProjectId
  agentId: AgentId
  title: string
  messages: Message[]
  lastMessageAt: string
  compactRecords?: CompactRecord[]
}
