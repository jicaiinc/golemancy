import { sql } from 'drizzle-orm'
import type {
  IDashboardService, IProjectService, IAgentService,
  ProjectId, DashboardSummary, DashboardAgentStats, DashboardRecentChat, DashboardTokenTrend,
} from '@golemancy/shared'
import type { AppDatabase } from '../db/client'
import { logger } from '../logger'

const log = logger.child({ component: 'storage:dashboard' })

export interface DashboardServiceDeps {
  projectStorage: IProjectService
  agentStorage: IAgentService
  getProjectDb: (projectId: ProjectId) => AppDatabase
}

export class DashboardService implements IDashboardService {
  private deps: DashboardServiceDeps

  constructor(deps: DashboardServiceDeps) {
    this.deps = deps
  }

  async getSummary(projectId: ProjectId): Promise<DashboardSummary> {
    const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

    const agents = await this.deps.agentStorage.list(projectId)
    const totalAgents = agents.length

    let activeChats = 0
    let totalChats = 0
    let todayInput = 0
    let todayOutput = 0

    try {
      const db = this.deps.getProjectDb(projectId)

      // Count conversations
      const convCount = db.all<{ cnt: number }>(
        sql`SELECT count(*) as cnt FROM conversations WHERE project_id = ${projectId}`,
      )
      totalChats = convCount[0]?.cnt ?? 0

      // Count active chats (conversations with messages today)
      const activeCount = db.all<{ cnt: number }>(
        sql`SELECT count(DISTINCT c.id) as cnt FROM conversations c
            JOIN messages m ON m.conversation_id = c.id
            WHERE c.project_id = ${projectId} AND m.created_at >= ${today}`,
      )
      activeChats = activeCount[0]?.cnt ?? 0

      // Sum today's tokens
      const tokenSum = db.all<{ inp: number; out: number }>(
        sql`SELECT COALESCE(SUM(input_tokens), 0) as inp, COALESCE(SUM(output_tokens), 0) as out
            FROM messages WHERE created_at >= ${today}`,
      )
      todayInput = tokenSum[0]?.inp ?? 0
      todayOutput = tokenSum[0]?.out ?? 0
    } catch (err) {
      log.warn({ err, projectId }, 'failed to query project DB for summary')
    }

    return {
      todayTokens: {
        total: todayInput + todayOutput,
        input: todayInput,
        output: todayOutput,
      },
      totalAgents,
      activeChats,
      totalChats,
    }
  }

  async getAgentStats(projectId: ProjectId): Promise<DashboardAgentStats[]> {
    const project = await this.deps.projectStorage.getById(projectId)
    if (!project) return []

    const agents = await this.deps.agentStorage.list(projectId)
    const stats: DashboardAgentStats[] = []

    let db: AppDatabase
    try {
      db = this.deps.getProjectDb(projectId)
    } catch (err) {
      log.warn({ err, projectId }, 'failed to open project DB for agent stats')
      // Still add agents with zero stats
      for (const agent of agents) {
        stats.push({
          agentId: agent.id,
          projectId,
          projectName: project.name,
          agentName: agent.name,
          model: agent.modelConfig.model ?? 'default',
          status: agent.status,
          totalTokens: 0,
          conversationCount: 0,
          taskCount: 0,
          completedTasks: 0,
          failedTasks: 0,
          lastActiveAt: null,
        })
      }
      return stats
    }

    for (const agent of agents) {
      // Count conversations for this agent
      const convRows = db.all<{ cnt: number }>(
        sql`SELECT count(*) as cnt FROM conversations
            WHERE project_id = ${projectId} AND agent_id = ${agent.id}`,
      )
      const conversationCount = convRows[0]?.cnt ?? 0

      // Sum tokens for this agent's conversations
      const tokenRows = db.all<{ total: number }>(
        sql`SELECT COALESCE(SUM(m.input_tokens + m.output_tokens), 0) as total
            FROM messages m
            JOIN conversations c ON c.id = m.conversation_id
            WHERE c.project_id = ${projectId} AND c.agent_id = ${agent.id}`,
      )
      const totalTokens = tokenRows[0]?.total ?? 0

      // Count tasks
      const taskRows = db.all<{ total: number; completed: number; failed: number }>(
        sql`SELECT
              count(*) as total,
              SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
              SUM(CASE WHEN status = 'deleted' THEN 1 ELSE 0 END) as failed
            FROM conversation_tasks ct
            JOIN conversations c ON c.id = ct.conversation_id
            WHERE c.project_id = ${projectId} AND c.agent_id = ${agent.id}`,
      )
      const taskCount = taskRows[0]?.total ?? 0
      const completedTasks = taskRows[0]?.completed ?? 0
      const failedTasks = taskRows[0]?.failed ?? 0

      // Last active (most recent message)
      const lastActiveRows = db.all<{ last: string | null }>(
        sql`SELECT MAX(m.created_at) as last
            FROM messages m
            JOIN conversations c ON c.id = m.conversation_id
            WHERE c.project_id = ${projectId} AND c.agent_id = ${agent.id}`,
      )
      const lastActiveAt = lastActiveRows[0]?.last ?? null

      stats.push({
        agentId: agent.id,
        projectId,
        projectName: project.name,
        agentName: agent.name,
        model: agent.modelConfig.model ?? 'default',
        status: agent.status,
        totalTokens,
        conversationCount,
        taskCount,
        completedTasks,
        failedTasks,
        lastActiveAt,
      })
    }

    // Sort by totalTokens descending
    stats.sort((a, b) => b.totalTokens - a.totalTokens)
    return stats
  }

  async getRecentChats(projectId: ProjectId, limit = 10): Promise<DashboardRecentChat[]> {
    const project = await this.deps.projectStorage.getById(projectId)
    if (!project) return []

    const chats: DashboardRecentChat[] = []

    try {
      const db = this.deps.getProjectDb(projectId)
      const agents = await this.deps.agentStorage.list(projectId)
      const agentMap = new Map(agents.map(a => [a.id, a.name]))

      const rows = db.all<{
        id: string
        agent_id: string
        title: string
        last_message_at: string | null
        msg_count: number
        total_tokens: number
      }>(
        sql`SELECT c.id, c.agent_id, c.title, c.last_message_at,
                   count(m.id) as msg_count,
                   COALESCE(SUM(m.input_tokens + m.output_tokens), 0) as total_tokens
            FROM conversations c
            LEFT JOIN messages m ON m.conversation_id = c.id
            WHERE c.project_id = ${projectId}
            GROUP BY c.id
            ORDER BY c.last_message_at DESC
            LIMIT ${limit}`,
      )

      for (const row of rows) {
        chats.push({
          conversationId: row.id as any,
          projectId,
          projectName: project.name,
          agentId: row.agent_id as any,
          agentName: agentMap.get(row.agent_id as any) ?? 'Unknown',
          title: row.title,
          messageCount: row.msg_count,
          totalTokens: row.total_tokens,
          lastMessageAt: row.last_message_at,
        })
      }
    } catch (err) {
      log.warn({ err, projectId }, 'failed to query project DB for recent chats')
    }

    return chats
  }

  async getTokenTrend(projectId: ProjectId, days = 14): Promise<DashboardTokenTrend[]> {
    // Build date range
    const today = new Date()
    const dateMap = new Map<string, { inputTokens: number; outputTokens: number }>()
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      dateMap.set(key, { inputTokens: 0, outputTokens: 0 })
    }

    const startDate = Array.from(dateMap.keys())[0]

    try {
      const db = this.deps.getProjectDb(projectId)
      const rows = db.all<{ day: string; inp: number; out: number }>(
        sql`SELECT substr(created_at, 1, 10) as day,
                   COALESCE(SUM(input_tokens), 0) as inp,
                   COALESCE(SUM(output_tokens), 0) as out
            FROM messages
            WHERE created_at >= ${startDate}
            GROUP BY day`,
      )

      for (const row of rows) {
        const existing = dateMap.get(row.day)
        if (existing) {
          existing.inputTokens += row.inp
          existing.outputTokens += row.out
        }
      }
    } catch (err) {
      log.warn({ err, projectId }, 'failed to query project DB for token trend')
    }

    return Array.from(dateMap.entries()).map(([date, tokens]) => ({
      date,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
    }))
  }
}
