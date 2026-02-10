import type { AgentId, ProjectId, TaskId } from './common'
import type { AgentStatus } from './agent'
import type { TaskStatus } from './task'

export interface DashboardSummary {
  totalProjects: number
  totalAgents: number
  activeAgents: number
  runningTasks: number
  completedTasksToday: number
  totalTokenUsageToday: number
}

export interface DashboardAgentSummary {
  agentId: AgentId
  projectId: ProjectId
  projectName: string
  agentName: string
  status: AgentStatus
  currentTaskTitle?: string
}

export interface DashboardTaskSummary {
  taskId: TaskId
  projectId: ProjectId
  projectName: string
  agentId: AgentId
  agentName: string
  title: string
  status: TaskStatus
  progress: number
  updatedAt: string
}

export type ActivityType =
  | 'agent_started'
  | 'agent_stopped'
  | 'task_created'
  | 'task_completed'
  | 'task_failed'
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
