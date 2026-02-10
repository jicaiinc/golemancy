import type { AgentId, ProjectId, SkillId, TaskId, ToolId, Timestamped } from './common'
import type { AgentModelConfig } from './settings'

export type AgentStatus = 'idle' | 'running' | 'paused' | 'error'

export interface Skill {
  id: SkillId
  name: string
  description: string
}

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

export interface Agent extends Timestamped {
  id: AgentId
  projectId: ProjectId
  name: string
  description: string
  status: AgentStatus
  systemPrompt: string
  modelConfig: AgentModelConfig
  skills: Skill[]
  tools: ToolCallSchema[]
  subAgents: SubAgentRef[]
  currentTaskId?: TaskId
}
