import { describe, it, expect } from 'vitest'
import type {
  DashboardSummary,
  DashboardAgentSummary,
  DashboardTaskSummary,
  ActivityType,
  ActivityEntry,
} from '@golemancy/shared'

describe('Dashboard types (compilation check)', () => {
  it('DashboardSummary has expected shape', () => {
    const summary: DashboardSummary = {
      totalProjects: 2,
      totalAgents: 5,
      activeAgents: 1,
      runningTasks: 1,
      completedTasksToday: 3,
      totalTokenUsageToday: 12000,
    }
    expect(summary.totalProjects).toBe(2)
    expect(summary.totalAgents).toBe(5)
    expect(summary.activeAgents).toBe(1)
    expect(summary.runningTasks).toBe(1)
    expect(summary.completedTasksToday).toBe(3)
    expect(summary.totalTokenUsageToday).toBe(12000)
  })

  it('DashboardAgentSummary has expected shape', () => {
    const agent: DashboardAgentSummary = {
      agentId: 'agent-1' as any,
      projectId: 'proj-1' as any,
      projectName: 'Content Biz',
      agentName: 'Writer',
      status: 'running',
      currentTaskTitle: 'Draft blog post',
    }
    expect(agent.agentId).toBe('agent-1')
    expect(agent.status).toBe('running')
    expect(agent.currentTaskTitle).toBe('Draft blog post')
  })

  it('DashboardTaskSummary has expected shape', () => {
    const task: DashboardTaskSummary = {
      taskId: 'task-1' as any,
      projectId: 'proj-1' as any,
      projectName: 'Content Biz',
      agentId: 'agent-1' as any,
      agentName: 'Writer',
      title: 'Draft blog post',
      status: 'running',
      progress: 60,
      updatedAt: new Date().toISOString(),
    }
    expect(task.title).toBe('Draft blog post')
    expect(task.progress).toBe(60)
  })

  it('ActivityEntry has expected shape', () => {
    const entry: ActivityEntry = {
      id: 'activity-1',
      type: 'task_completed',
      projectId: 'proj-1' as any,
      projectName: 'Content Biz',
      description: 'Completed: Draft blog post',
      timestamp: new Date().toISOString(),
    }
    expect(entry.type).toBe('task_completed')
    expect(entry.description).toContain('Completed')
  })

  it('ActivityType covers all expected values', () => {
    const types: ActivityType[] = [
      'agent_started', 'agent_stopped',
      'task_created', 'task_completed', 'task_failed',
      'message_sent', 'artifact_created',
    ]
    expect(types).toHaveLength(7)
  })
})
