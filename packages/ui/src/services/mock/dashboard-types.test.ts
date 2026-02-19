import { describe, it, expect } from 'vitest'
import type {
  DashboardSummary,
  DashboardAgentSummary,
  ActivityType,
  ActivityEntry,
} from '@golemancy/shared'

describe('Dashboard types (compilation check)', () => {
  it('DashboardSummary has expected shape', () => {
    const summary: DashboardSummary = {
      totalProjects: 2,
      totalAgents: 5,
      activeAgents: 1,
      totalTokenUsageToday: 12000,
    }
    expect(summary.totalProjects).toBe(2)
    expect(summary.totalAgents).toBe(5)
    expect(summary.activeAgents).toBe(1)
    expect(summary.totalTokenUsageToday).toBe(12000)
  })

  it('DashboardAgentSummary has expected shape', () => {
    const agent: DashboardAgentSummary = {
      agentId: 'agent-1' as any,
      projectId: 'proj-1' as any,
      projectName: 'Content Biz',
      agentName: 'Writer',
      status: 'running',
    }
    expect(agent.agentId).toBe('agent-1')
    expect(agent.status).toBe('running')
  })

  it('ActivityEntry has expected shape', () => {
    const entry: ActivityEntry = {
      id: 'activity-1',
      type: 'agent_started',
      projectId: 'proj-1' as any,
      projectName: 'Content Biz',
      description: 'Writer agent started working',
      timestamp: new Date().toISOString(),
    }
    expect(entry.type).toBe('agent_started')
    expect(entry.description).toContain('Writer')
  })

  it('ActivityType covers all expected values', () => {
    const types: ActivityType[] = [
      'agent_started', 'agent_stopped',
      'message_sent', 'artifact_created',
    ]
    expect(types).toHaveLength(4)
  })
})
