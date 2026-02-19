import type { AgentId, ConversationId, MessageId, ProjectId, Timestamped } from './common'

export interface Message extends Timestamped {
  id: MessageId
  conversationId: ConversationId
  role: 'user' | 'assistant'
  parts: unknown[] // serialized UIMessage['parts'] — opaque to shared package
  content: string  // plain text for display/search (derived from parts)
  inputTokens: number
  outputTokens: number
  provider: string  // display only — e.g. 'anthropic'
  model: string     // display only — e.g. 'claude-sonnet-4-20250514'
}

export interface Conversation extends Timestamped {
  id: ConversationId
  projectId: ProjectId
  agentId: AgentId
  title: string
  messages: Message[]
  lastMessageAt: string
}
