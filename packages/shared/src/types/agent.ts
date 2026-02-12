import type { AgentId, ProjectId, SkillId, TaskId, ToolId, Timestamped } from './common'
import type { AgentModelConfig } from './settings'

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

// MCP Server configuration
export type MCPTransportType = 'stdio' | 'sse' | 'http'

export interface MCPServerConfig {
  /** Unique name for this MCP server */
  name: string
  /** Transport type */
  transportType: MCPTransportType
  /** For stdio: command to run */
  command?: string
  /** For stdio: command arguments */
  args?: string[]
  /** For stdio: environment variables */
  env?: Record<string, string>
  /** For sse/http: server URL */
  url?: string
  /** For sse/http: custom headers */
  headers?: Record<string, string>
  /** Whether this MCP server is enabled */
  enabled: boolean
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
  mcpServers: MCPServerConfig[]
  builtinTools: BuiltinToolConfig
  currentTaskId?: TaskId
}
