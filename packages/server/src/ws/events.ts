import type { ConversationId, MessageId, AgentId, CronJobId } from '@golemancy/shared'

export interface WsMessageEvent {
  event: 'message:start' | 'message:delta' | 'message:tool_call' | 'message:end'
  conversationId: ConversationId
  messageId: MessageId
  delta?: string
  toolCall?: { toolName: string; input: unknown; output?: string; status: string }
  tokenUsage?: { promptTokens: number; completionTokens: number }
}

export interface WsAgentEvent {
  event: 'agent:status_changed'
  agentId: AgentId
  status: string
}

export interface WsRuntimeEvent {
  event: 'runtime:chat_started' | 'runtime:chat_ended' | 'runtime:cron_started' | 'runtime:cron_ended'
  projectId: string
  agentId: AgentId
  conversationId?: ConversationId
  cronJobId?: CronJobId
}

export interface WsTokenEvent {
  event: 'token:recorded'
  projectId: string
  agentId: AgentId
  model: string
  inputTokens: number
  outputTokens: number
}

export interface WsModeDegradedEvent {
  event: 'mode_degraded'
  requestedMode: string
  actualMode: string
  reason: string
}

export interface WsSystemEvent {
  event: 'server:ready' | 'server:error'
  message?: string
}

export type WsServerEvent = WsMessageEvent | WsAgentEvent | WsRuntimeEvent | WsTokenEvent | WsModeDegradedEvent | WsSystemEvent

export interface WsClientMessage {
  type: 'subscribe' | 'unsubscribe' | 'ping'
  channels?: string[]
}
