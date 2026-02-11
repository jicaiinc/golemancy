import type { CronJobId, ProjectId, AgentId, Timestamped } from './common'

export interface CronJob extends Timestamped {
  id: CronJobId
  projectId: ProjectId
  agentId: AgentId
  name: string
  description: string
  cronExpression: string
  enabled: boolean
}
