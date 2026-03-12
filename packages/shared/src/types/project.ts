import type { ProjectId, Timestamped } from './common'
import type { ProjectConfig } from './settings'
import type { TargetRef } from './target'

export interface Project extends Timestamped {
  id: ProjectId
  name: string
  description: string
  icon: string // pixel-art icon identifier
  config: ProjectConfig
  defaultTarget: TargetRef | null
  agentCount: number
  activeAgentCount: number
  lastActivityAt: string
}
