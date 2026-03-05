import type { AgentId, ProjectId, SkillId, ToolId, Timestamped } from './common'
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

// Built-in tool configuration
export type BuiltinToolId = 'bash' | 'browser' | 'computer_use' | 'task' | 'memory'

/** Default-enabled state for each built-in tool (when key is absent from agent.builtinTools) */
export const BUILTIN_TOOL_DEFAULTS: Record<BuiltinToolId, boolean> = {
  bash: true,
  browser: false,
  computer_use: false,
  task: true,
  memory: true,
}

export interface BuiltinToolConfig {
  [key: string]: boolean | Record<string, unknown>
}

/** Resolve which built-in tools are enabled, accounting for defaults */
export function getEnabledBuiltinTools(config: BuiltinToolConfig): BuiltinToolId[] {
  return (Object.keys(BUILTIN_TOOL_DEFAULTS) as BuiltinToolId[]).filter(id => {
    const v = config[id]
    return v !== undefined ? !!v : BUILTIN_TOOL_DEFAULTS[id]
  })
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
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number }
  sessionId?: string
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
  mcpServers: string[]
  builtinTools: BuiltinToolConfig
  compactThreshold?: number
}
