import type { ProjectId, AgentId, TeamId, TargetType, Timestamped } from './common'
import type { ProjectConfig } from './settings'

export interface Project extends Timestamped {
  id: ProjectId
  name: string
  description: string
  icon: string // pixel-art icon identifier
  config: ProjectConfig
  defaultTargetType?: TargetType
  defaultTargetId?: AgentId | TeamId
  agentCount: number
  activeAgentCount: number
  lastActivityAt: string
}
