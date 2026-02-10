import type { AgentId, ProjectId, TaskId, Timestamped } from './common'

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface TaskLogEntry {
  timestamp: string
  type: 'start' | 'tool_call' | 'generation' | 'error' | 'completed'
  content: string
  metadata?: Record<string, unknown>
}

export interface Task extends Timestamped {
  id: TaskId
  projectId: ProjectId
  agentId: AgentId
  title: string
  description: string
  status: TaskStatus
  progress: number // 0-100
  tokenUsage: number
  log: TaskLogEntry[]
  startedAt?: string
  completedAt?: string
}
