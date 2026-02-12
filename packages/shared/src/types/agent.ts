import type { AgentId, ProjectId, SkillId, TaskId, ToolId, Timestamped } from './common'
import type { AgentModelConfig } from './settings'

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
export type BuiltinToolId = 'bash' | 'browser' | 'os_control'

export interface BuiltinToolConfig {
  [key: string]: boolean
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
  currentTaskId?: TaskId
}
