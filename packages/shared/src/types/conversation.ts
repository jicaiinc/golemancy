import type { AgentId, ConversationId, MessageId, ProjectId, ToolId, Timestamped } from './common'

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool'

export interface ToolCallResult {
  toolId: ToolId
  toolName: string
  input: Record<string, unknown>
  output: string
  duration: number // ms
}

export interface Message extends Timestamped {
  id: MessageId
  conversationId: ConversationId
  role: MessageRole
  content: string
  toolCalls?: ToolCallResult[]
}

export interface Conversation extends Timestamped {
  id: ConversationId
  projectId: ProjectId
  agentId: AgentId
  title: string
  messages: Message[]
  lastMessageAt: string
}
