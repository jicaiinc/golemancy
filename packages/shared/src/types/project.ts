import type { ProjectId, ChatTarget, Timestamped } from './common'
import type { ProjectConfig } from './settings'

export interface Project extends Timestamped {
  id: ProjectId
  name: string
  description: string
  icon: string // pixel-art icon identifier
  config: ProjectConfig
  defaultTarget?: ChatTarget
  agentCount: number
  activeAgentCount: number
  lastActivityAt: string
}
