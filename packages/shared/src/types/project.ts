import type { ProjectId, AgentId, TeamId, Timestamped } from './common'
import type { ProjectConfig } from './settings'

export interface Project extends Timestamped {
  id: ProjectId
  name: string
  description: string
  icon: string // pixel-art icon identifier
  config: ProjectConfig
  defaultAgentId?: AgentId
  defaultTeamId?: TeamId
  agentCount: number
  activeAgentCount: number
  lastActivityAt: string
}
