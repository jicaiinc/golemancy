import type { AgentId, ConversationId, ProjectId } from './common'
import type { AgentStatus } from './agent'

export interface DashboardSummary {
  todayTokens: { total: number; input: number; output: number }
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
  date: string // YYYY-MM-DD
  inputTokens: number
  outputTokens: number
}
