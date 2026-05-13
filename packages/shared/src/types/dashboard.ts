import type { AgentId, ConversationId, CronJobId, ProjectId } from './common'
import type { AgentStatus } from './agent'

export type TimeRange = 'today' | '7d' | '30d' | 'all'

export interface DashboardSummary {
  todayTokens: { total: number; input: number; output: number; callCount: number }
  totalAgents: number
  activeChats: number
  totalChats: number
}

export interface DashboardAgentStats {
  agentId: AgentId
  projectId: ProjectId
  projectName: string
  agentName: string
  model: string
  status: AgentStatus
  totalTokens: number
  conversationCount: number
  taskCount: number
  completedTasks: number
  failedTasks: number
  lastActiveAt: string | null
}

export interface DashboardRecentChat {
  conversationId: ConversationId
  projectId: ProjectId
  projectName: string
  agentId: AgentId
  agentName: string
  title: string
  messageCount: number
  totalTokens: number
  lastMessageAt: string | null
}

export interface DashboardTokenTrend {
  date: string // YYYY-MM-DD or HH (for today)
  inputTokens: number
  outputTokens: number
}

export interface DashboardTokenByModel {
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  callCount: number
}

export interface DashboardTokenByAgent {
  agentId: AgentId
  agentName: string
  inputTokens: number
  outputTokens: number
  callCount: number
}

export interface RuntimeChatSession {
  conversationId: ConversationId
  projectId: ProjectId
  projectName?: string
  agentId: AgentId
  agentName: string
  title: string
  startedAt: string
}

export interface RuntimeCronRun {
  cronJobId: CronJobId
  projectId: ProjectId
  projectName?: string
  cronJobName: string
  agentId: AgentId
  agentName: string
  runId: string
  startedAt: string
}

export interface RuntimeUpcoming {
  cronJobId: CronJobId
  projectId: ProjectId
  projectName?: string
  cronJobName: string
  agentId: AgentId
  agentName: string
  nextRunAt: string
}

export interface RuntimeRecentItem {
  type: 'chat' | 'cron'
  id: string
  projectId: ProjectId
  projectName?: string
  agentName: string
  title: string
  completedAt: string
  status: 'success' | 'error'
  durationMs?: number
  totalTokens?: number
  cronJobId?: CronJobId
}

export interface RuntimeStatus {
  runningChats: RuntimeChatSession[]
  runningCrons: RuntimeCronRun[]
  upcoming: RuntimeUpcoming[]
  recentCompleted: RuntimeRecentItem[]
}
