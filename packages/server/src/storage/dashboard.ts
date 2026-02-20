import { sql } from 'drizzle-orm'
import type {
  IDashboardService, IProjectService, IAgentService, ICronJobService,
  ProjectId, AgentId,
  DashboardSummary, DashboardAgentStats, DashboardRecentChat, DashboardTokenTrend,
  DashboardTokenByModel, DashboardTokenByAgent, RuntimeStatus, TimeRange,
} from '@golemancy/shared'
import type { AppDatabase } from '../db/client'
import type { ActiveChatRegistry } from '../agent/active-chat-registry'
import type { SqliteCronJobRunStorage } from './cron-job-runs'
import { logger } from '../logger'

const log = logger.child({ component: 'storage:dashboard' })

export interface DashboardServiceDeps {
  projectStorage: IProjectService
  agentStorage: IAgentService
  getProjectDb: (projectId: ProjectId) => AppDatabase
  activeChatRegistry?: ActiveChatRegistry
  cronJobRunStorage?: SqliteCronJobRunStorage
  cronJobStorage?: ICronJobService
}

/**
 * Convert a TimeRange enum to an ISO date string (start of range).
 * Returns undefined for 'all' (no filtering).
 */
function timeRangeToDate(range?: TimeRange): string | undefined {
  if (!range || range === 'all') return undefined
  const now = new Date()
  switch (range) {
    case 'today':
      return now.toISOString().slice(0, 10) // YYYY-MM-DD
    case '7d': {
      const d = new Date(now)
      d.setDate(d.getDate() - 7)
      return d.toISOString().slice(0, 10)
    }
    case '30d': {
      const d = new Date(now)
      d.setDate(d.getDate() - 30)
      return d.toISOString().slice(0, 10)
    }
  }
}

export class DashboardService implements IDashboardService {
  private deps: DashboardServiceDeps

  constructor(deps: DashboardServiceDeps) {
    this.deps = deps
  }

  async getSummary(projectId: ProjectId, timeRange?: TimeRange): Promise<DashboardSummary> {
    const startDate = timeRangeToDate(timeRange) ?? new Date().toISOString().slice(0, 10)

    const agents = await this.deps.agentStorage.list(projectId)
    const totalAgents = agents.length

    let activeChats = 0
    let totalChats = 0
    let tokenInput = 0
    let tokenOutput = 0
    let callCount = 0

    try {
      const db = this.deps.getProjectDb(projectId)

      // Count conversations
      const convCount = db.all<{ cnt: number }>(
        sql`SELECT count(*) as cnt FROM conversations WHERE project_id = ${projectId}`,
      )
      totalChats = convCount[0]?.cnt ?? 0

      // Count active chats (conversations with messages in range)
      const activeCount = db.all<{ cnt: number }>(
        sql`SELECT count(DISTINCT c.id) as cnt FROM conversations c
            JOIN messages m ON m.conversation_id = c.id
            WHERE c.project_id = ${projectId} AND m.created_at >= ${startDate}`,
      )
      activeChats = activeCount[0]?.cnt ?? 0

      // Sum tokens in range (from token_records + legacy messages fallback)
      const tokenSum = db.all<{ inp: number; out: number }>(
        sql`SELECT COALESCE(SUM(inp), 0) as inp, COALESCE(SUM(out), 0) as out FROM (
              SELECT input_tokens as inp, output_tokens as out FROM token_records WHERE created_at >= ${startDate}
              UNION ALL
              SELECT m.input_tokens as inp, m.output_tokens as out FROM messages m
              WHERE m.created_at >= ${startDate} AND m.input_tokens > 0
                AND NOT EXISTS (SELECT 1 FROM token_records tr WHERE tr.message_id = m.id)
            )`,
      )
      tokenInput = tokenSum[0]?.inp ?? 0
      tokenOutput = tokenSum[0]?.out ?? 0

      // Count API calls in range
      const callCountResult = db.all<{ cnt: number }>(
        sql`SELECT count(*) as cnt FROM token_records WHERE created_at >= ${startDate}`,
      )
      callCount = callCountResult[0]?.cnt ?? 0
    } catch (err) {
      log.warn({ err, projectId }, 'failed to query project DB for summary')
    }

    return {
      todayTokens: {
        total: tokenInput + tokenOutput,
        input: tokenInput,
        output: tokenOutput,
        callCount,
      },
      totalAgents,
      activeChats,
      totalChats,
    }
  }

  async getAgentStats(projectId: ProjectId, timeRange?: TimeRange): Promise<DashboardAgentStats[]> {
    const project = await this.deps.projectStorage.getById(projectId)
    if (!project) return []

    const agents = await this.deps.agentStorage.list(projectId)
    const stats: DashboardAgentStats[] = []
    const startDate = timeRangeToDate(timeRange)

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

      // Sum tokens for this agent (from token_records + legacy messages fallback)
      const tokenQuery = startDate
        ? sql`SELECT COALESCE(SUM(total), 0) as total FROM (
                SELECT (input_tokens + output_tokens) as total FROM token_records WHERE agent_id = ${agent.id} AND created_at >= ${startDate}
                UNION ALL
                SELECT (m.input_tokens + m.output_tokens) as total FROM messages m
                JOIN conversations c ON c.id = m.conversation_id
                WHERE c.project_id = ${projectId} AND c.agent_id = ${agent.id} AND m.input_tokens > 0 AND m.created_at >= ${startDate}
                  AND NOT EXISTS (SELECT 1 FROM token_records tr WHERE tr.message_id = m.id)
              )`
        : sql`SELECT COALESCE(SUM(total), 0) as total FROM (
                SELECT (input_tokens + output_tokens) as total FROM token_records WHERE agent_id = ${agent.id}
                UNION ALL
                SELECT (m.input_tokens + m.output_tokens) as total FROM messages m
                JOIN conversations c ON c.id = m.conversation_id
                WHERE c.project_id = ${projectId} AND c.agent_id = ${agent.id} AND m.input_tokens > 0
                  AND NOT EXISTS (SELECT 1 FROM token_records tr WHERE tr.message_id = m.id)
              )`
      const tokenRows = db.all<{ total: number }>(tokenQuery)
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
                   COALESCE((
                     SELECT SUM(total) FROM (
                       SELECT (input_tokens + output_tokens) as total FROM token_records WHERE conversation_id = c.id
                       UNION ALL
                       SELECT (m2.input_tokens + m2.output_tokens) as total FROM messages m2
                       WHERE m2.conversation_id = c.id AND m2.input_tokens > 0
                         AND NOT EXISTS (SELECT 1 FROM token_records tr WHERE tr.message_id = m2.id)
                     )
                   ), 0) as total_tokens
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

  async getTokenTrend(projectId: ProjectId, days = 14, timeRange?: TimeRange): Promise<DashboardTokenTrend[]> {
    // Today: hourly (0-23) distribution
    if (timeRange === 'today') {
      return this.getHourlyTrend(projectId)
    }

    // Align days with timeRange
    if (timeRange === '7d') days = 7
    else if (timeRange === '30d') days = 30

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
        sql`SELECT day, COALESCE(SUM(inp), 0) as inp, COALESCE(SUM(out), 0) as out FROM (
              SELECT substr(created_at, 1, 10) as day, input_tokens as inp, output_tokens as out
              FROM token_records WHERE created_at >= ${startDate}
              UNION ALL
              SELECT substr(m.created_at, 1, 10) as day, m.input_tokens as inp, m.output_tokens as out
              FROM messages m
              WHERE m.created_at >= ${startDate} AND m.input_tokens > 0
                AND NOT EXISTS (SELECT 1 FROM token_records tr WHERE tr.message_id = m.id)
            ) GROUP BY day`,
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

  private async getHourlyTrend(projectId: ProjectId): Promise<DashboardTokenTrend[]> {
    const today = new Date().toISOString().slice(0, 10)
    // Pre-fill 24 hours
    const hourMap = new Map<string, { inputTokens: number; outputTokens: number }>()
    for (let h = 0; h < 24; h++) {
      hourMap.set(String(h).padStart(2, '0'), { inputTokens: 0, outputTokens: 0 })
    }

    try {
      const db = this.deps.getProjectDb(projectId)
      const rows = db.all<{ hr: string; inp: number; out: number }>(
        sql`SELECT hr, COALESCE(SUM(inp), 0) as inp, COALESCE(SUM(out), 0) as out FROM (
              SELECT substr(created_at, 12, 2) as hr, input_tokens as inp, output_tokens as out
              FROM token_records WHERE created_at >= ${today}
              UNION ALL
              SELECT substr(m.created_at, 12, 2) as hr, m.input_tokens as inp, m.output_tokens as out
              FROM messages m
              WHERE m.created_at >= ${today} AND m.input_tokens > 0
                AND NOT EXISTS (SELECT 1 FROM token_records tr WHERE tr.message_id = m.id)
            ) GROUP BY hr`,
      )
      for (const row of rows) {
        const existing = hourMap.get(row.hr)
        if (existing) {
          existing.inputTokens += row.inp
          existing.outputTokens += row.out
        }
      }
    } catch (err) {
      log.warn({ err, projectId }, 'failed to query project DB for hourly trend')
    }

    return Array.from(hourMap.entries()).map(([hr, tokens]) => ({
      date: hr,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
    }))
  }

  async getTokenByModel(projectId: ProjectId, timeRange?: TimeRange): Promise<DashboardTokenByModel[]> {
    const startDate = timeRangeToDate(timeRange)
    try {
      const db = this.deps.getProjectDb(projectId)
      const dateCondition = startDate ? sql` AND created_at >= ${startDate}` : sql``
      const rows = db.all<{ provider: string; model: string; inp: number; out: number; cnt: number }>(
        sql`SELECT provider, model, COALESCE(SUM(input_tokens), 0) as inp, COALESCE(SUM(output_tokens), 0) as out, count(*) as cnt
                 FROM token_records WHERE 1=1${dateCondition} GROUP BY provider, model ORDER BY (inp + out) DESC`,
      )
      return rows.map(r => ({
        provider: r.provider,
        model: r.model,
        inputTokens: r.inp,
        outputTokens: r.out,
        callCount: r.cnt,
      }))
    } catch (err) {
      log.warn({ err, projectId }, 'failed to query project DB for token by model')
      return []
    }
  }

  async getTokenByAgent(projectId: ProjectId, timeRange?: TimeRange): Promise<DashboardTokenByAgent[]> {
    const startDate = timeRangeToDate(timeRange)
    try {
      const db = this.deps.getProjectDb(projectId)
      const dateCondition = startDate ? sql` AND created_at >= ${startDate}` : sql``
      const rows = db.all<{ agent_id: string; inp: number; out: number; cnt: number }>(
        sql`SELECT agent_id, COALESCE(SUM(input_tokens), 0) as inp, COALESCE(SUM(output_tokens), 0) as out, count(*) as cnt
                 FROM token_records WHERE 1=1${dateCondition} GROUP BY agent_id ORDER BY (inp + out) DESC`,
      )

      // Resolve agent names
      const agents = await this.deps.agentStorage.list(projectId)
      const agentMap = new Map(agents.map(a => [a.id as string, a.name]))

      return rows.map(r => ({
        agentId: r.agent_id as AgentId,
        agentName: agentMap.get(r.agent_id) ?? 'Unknown',
        inputTokens: r.inp,
        outputTokens: r.out,
        callCount: r.cnt,
      }))
    } catch (err) {
      log.warn({ err, projectId }, 'failed to query project DB for token by agent')
      return []
    }
  }

  async getRuntimeStatus(projectId: ProjectId): Promise<RuntimeStatus> {
    const agents = await this.deps.agentStorage.list(projectId)
    const agentMap = new Map(agents.map(a => [a.id as string, a.name]))

    // Running chats from ActiveChatRegistry
    const runningChats = (this.deps.activeChatRegistry?.getRunningForProject(projectId) ?? []).map(entry => {
      return {
        conversationId: entry.conversationId as any,
        agentId: entry.agentId as AgentId,
        agentName: agentMap.get(entry.agentId) ?? 'Unknown',
        title: '', // Chat title not stored in registry
        startedAt: entry.startedAt,
      }
    })

    // Running crons from cron_job_runs table
    const runningCrons: RuntimeStatus['runningCrons'] = []
    if (this.deps.cronJobRunStorage) {
      try {
        const db = this.deps.getProjectDb(projectId)
        const rows = db.all<{ id: string; cron_job_id: string; agent_id: string; created_at: string }>(
          sql`SELECT id, cron_job_id, agent_id, created_at FROM cron_job_runs
              WHERE project_id = ${projectId} AND status = 'running'
              ORDER BY created_at DESC`,
        )

        // Resolve cron job names
        let cronJobs: Array<{ id: string; name: string }> = []
        if (this.deps.cronJobStorage && rows.length > 0) {
          const jobs = await this.deps.cronJobStorage.list(projectId)
          cronJobs = jobs.map(j => ({ id: j.id as string, name: j.name }))
        }
        const cronMap = new Map(cronJobs.map(j => [j.id, j.name]))

        for (const row of rows) {
          runningCrons.push({
            cronJobId: row.cron_job_id as any,
            cronJobName: cronMap.get(row.cron_job_id) ?? 'Unknown',
            agentId: row.agent_id as AgentId,
            agentName: agentMap.get(row.agent_id) ?? 'Unknown',
            runId: row.id,
            startedAt: row.created_at,
          })
        }
      } catch (err) {
        log.warn({ err, projectId }, 'failed to query running crons')
      }
    }

    // Upcoming cron jobs
    const upcoming: RuntimeStatus['upcoming'] = []
    if (this.deps.cronJobStorage) {
      try {
        const jobs = await this.deps.cronJobStorage.list(projectId)
        const enabledWithNext = jobs
          .filter(j => j.enabled && j.nextRunAt)
          .sort((a, b) => (a.nextRunAt ?? '').localeCompare(b.nextRunAt ?? ''))
          .slice(0, 10)

        for (const job of enabledWithNext) {
          upcoming.push({
            cronJobId: job.id,
            cronJobName: job.name,
            agentId: job.agentId,
            agentName: agentMap.get(job.agentId as string) ?? 'Unknown',
            nextRunAt: job.nextRunAt!,
          })
        }
      } catch (err) {
        log.warn({ err, projectId }, 'failed to query upcoming crons')
      }
    }

    // Recent completed items (cron runs + conversations)
    const recentCompleted: RuntimeStatus['recentCompleted'] = []
    try {
      const db = this.deps.getProjectDb(projectId)

      // Recent cron runs (success/error)
      const cronRows = db.all<{ id: string; agent_id: string; status: string; duration_ms: number | null; updated_at: string }>(
        sql`SELECT id, agent_id, status, duration_ms, updated_at FROM cron_job_runs
            WHERE project_id = ${projectId} AND status IN ('success', 'error')
            ORDER BY updated_at DESC LIMIT 10`,
      )
      for (const row of cronRows) {
        recentCompleted.push({
          type: 'cron',
          id: row.id,
          agentName: agentMap.get(row.agent_id) ?? 'Unknown',
          completedAt: row.updated_at,
          status: row.status as 'success' | 'error',
          durationMs: row.duration_ms ?? undefined,
        })
      }

      // Recent conversations (as "chat" completed items)
      const chatRows = db.all<{ id: string; agent_id: string; last_message_at: string | null; total_tokens: number }>(
        sql`SELECT c.id, c.agent_id, c.last_message_at,
                   COALESCE((SELECT SUM(input_tokens + output_tokens) FROM token_records WHERE conversation_id = c.id), 0) as total_tokens
            FROM conversations c
            WHERE c.project_id = ${projectId} AND c.last_message_at IS NOT NULL
            ORDER BY c.last_message_at DESC LIMIT 10`,
      )
      for (const row of chatRows) {
        recentCompleted.push({
          type: 'chat',
          id: row.id,
          agentName: agentMap.get(row.agent_id) ?? 'Unknown',
          completedAt: row.last_message_at!,
          status: 'success',
          totalTokens: row.total_tokens,
        })
      }

      // Sort combined list by completedAt descending, limit to 20
      recentCompleted.sort((a, b) => b.completedAt.localeCompare(a.completedAt))
      recentCompleted.splice(20)
    } catch (err) {
      log.warn({ err, projectId }, 'failed to query recent completed items')
    }

    return { runningChats, runningCrons, upcoming, recentCompleted }
  }
}
