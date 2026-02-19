import type { AgentId, ProjectId } from './common'
import type { AgentStatus } from './agent'

export interface DashboardSummary {
  totalProjects: number
  totalAgents: number
  activeAgents: number
  totalTokenUsageToday: number
}

export interface DashboardAgentSummary {
  agentId: AgentId
  projectId: ProjectId
  projectName: string
  agentName: string
  status: AgentStatus
}

export type ActivityType =
  | 'agent_started'
  | 'agent_stopped'
  | 'message_sent'
  | 'artifact_created'

export interface ActivityEntry {
  id: string
  type: ActivityType
  projectId: ProjectId
  projectName: string
  agentId?: AgentId
  agentName?: string
  description: string
  timestamp: string
}
