import type { AgentId, ProjectId, SkillId, ToolId, Timestamped } from './common'
import type { AgentModelConfig } from './settings'
import type { PermissionMode } from './permissions'

// Re-export for backward compatibility
export type { MCPTransportType, MCPServerConfig } from './mcp'

export type AgentStatus = 'idle' | 'running' | 'paused' | 'error'

export interface ToolCallSchema {
  id: ToolId
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface SubAgentRef {
  agentId: AgentId
  role: string
}

// Built-in tool configuration
export type BuiltinToolId = 'bash' | 'browser' | 'os_control' | 'task'

export interface BuiltinToolConfig {
  [key: string]: boolean | Record<string, unknown>
}

export interface SubAgentToolCallState {
  id: string
  name: string
  input: unknown
  output?: unknown
  state: 'running' | 'done' | 'error'
}

export interface SubAgentStreamState {
  agentName: string
  text: string
  toolCalls: SubAgentToolCallState[]
  status: 'running' | 'done'
}

// ── Agent Events ───────────────────────────────────────────────

/** Emitted when the effective permission mode degrades from requested to fallback */
export interface ModeDegradedEvent {
  type: 'mode_degraded'
  requestedMode: PermissionMode
  actualMode: PermissionMode
  reason: string
}

export interface Agent extends Timestamped {
  id: AgentId
  projectId: ProjectId
  name: string
  description: string
  status: AgentStatus
  systemPrompt: string
  modelConfig: AgentModelConfig
  skillIds: SkillId[]
  tools: ToolCallSchema[]
  subAgents: SubAgentRef[]
  mcpServers: string[]
  builtinTools: BuiltinToolConfig
}
