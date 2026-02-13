import type { ConversationId, MessageId, TaskId, AgentId } from '@golemancy/shared'

export interface WsMessageEvent {
  event: 'message:start' | 'message:delta' | 'message:tool_call' | 'message:end'
  conversationId: ConversationId
  messageId: MessageId
  delta?: string
  toolCall?: { toolName: string; input: unknown; output?: string; status: string }
  tokenUsage?: { promptTokens: number; completionTokens: number }
}

export interface WsTaskEvent {
  event: 'task:started' | 'task:progress' | 'task:completed' | 'task:failed'
  taskId: TaskId
  agentId?: AgentId
  title?: string
  progress?: number
  log?: string
  result?: string
  error?: string
}

export interface WsAgentEvent {
  event: 'agent:status_changed'
  agentId: AgentId
  status: string
  currentTaskId?: TaskId
}

export interface WsSystemEvent {
  event: 'server:ready' | 'server:error'
  message?: string
}

export type WsServerEvent = WsMessageEvent | WsTaskEvent | WsAgentEvent | WsSystemEvent

export interface WsClientMessage {
  type: 'subscribe' | 'unsubscribe' | 'ping'
  channels?: string[]
}
