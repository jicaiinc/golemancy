import { describe, it, expect } from 'vitest'
import type {
  DashboardSummary,
  DashboardAgentStats,
  DashboardRecentChat,
  DashboardTokenTrend,
} from '@golemancy/shared'

describe('Dashboard types (compilation check)', () => {
  it('DashboardSummary has expected shape', () => {
    const summary: DashboardSummary = {
      todayTokens: { total: 48_520, input: 32_180, output: 16_340 },
      totalAgents: 5,
      activeChats: 2,
      totalChats: 8,
    }
    expect(summary.todayTokens.total).toBe(48_520)
    expect(summary.totalAgents).toBe(5)
    expect(summary.activeChats).toBe(2)
    expect(summary.totalChats).toBe(8)
  })

  it('DashboardAgentStats has expected shape', () => {
    const agent: DashboardAgentStats = {
      agentId: 'agent-1' as any,
      projectId: 'proj-1' as any,
      projectName: 'Content Biz',
      agentName: 'Writer',
      model: 'gpt-4o',
      status: 'running',
      totalTokens: 125_430,
      conversationCount: 4,
      taskCount: 6,
      completedTasks: 4,
      failedTasks: 0,
      lastActiveAt: new Date().toISOString(),
    }
    expect(agent.agentId).toBe('agent-1')
    expect(agent.status).toBe('running')
    expect(agent.totalTokens).toBe(125_430)
  })

  it('DashboardRecentChat has expected shape', () => {
    const chat: DashboardRecentChat = {
      conversationId: 'conv-1' as any,
      projectId: 'proj-1' as any,
      projectName: 'Content Biz',
      agentId: 'agent-1' as any,
      agentName: 'Writer',
      title: 'Blog Draft',
      messageCount: 12,
      totalTokens: 24_500,
      lastMessageAt: new Date().toISOString(),
    }
    expect(chat.title).toBe('Blog Draft')
    expect(chat.messageCount).toBe(12)
  })

  it('DashboardTokenTrend has expected shape', () => {
    const trend: DashboardTokenTrend = {
      date: '2026-02-19',
      inputTokens: 15_000,
      outputTokens: 8_000,
    }
    expect(trend.date).toBe('2026-02-19')
    expect(trend.inputTokens).toBe(15_000)
    expect(trend.outputTokens).toBe(8_000)
  })
})
