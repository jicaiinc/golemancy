import type { CronJobId, ProjectId, AgentId, TeamId, ConversationId, Timestamped } from './common'

export type CronJobRunStatus = 'running' | 'success' | 'error'

export interface CronJob extends Timestamped {
  id: CronJobId
  projectId: ProjectId
  agentId: AgentId
  teamId?: TeamId
  name: string
  cronExpression: string
  enabled: boolean
  instruction?: string
  scheduleType: 'cron' | 'once'
  scheduledAt?: string
  lastRunAt?: string
  nextRunAt?: string
  lastRunStatus?: CronJobRunStatus
  lastRunId?: string
}

export interface CronJobRun extends Timestamped {
  id: string
  cronJobId: CronJobId
  projectId: ProjectId
  agentId: AgentId
  conversationId?: ConversationId
  status: CronJobRunStatus
  durationMs?: number
  error?: string
  triggeredBy: 'schedule' | 'manual'
}
