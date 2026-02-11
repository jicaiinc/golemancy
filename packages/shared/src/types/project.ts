import type { ProjectId, AgentId, Timestamped } from './common'
import type { ProjectConfig } from './settings'

export interface Project extends Timestamped {
  id: ProjectId
  name: string
  description: string
  icon: string // pixel-art icon identifier
  workingDirectory: string
  config: ProjectConfig
  mainAgentId?: AgentId
  agentCount: number
  activeAgentCount: number
  lastActivityAt: string
}
