import { sql } from 'drizzle-orm'
import type {
  IGlobalDashboardService, IProjectService, IAgentService, ICronJobService,
  ProjectId, AgentId,
  DashboardSummary, DashboardTokenTrend, DashboardTokenByModel, DashboardTokenByAgent, RuntimeStatus, TimeRange,
} from '@golemancy/shared'
import type { AppDatabase } from '../db/client'
import type { ActiveChatRegistry } from '../agent/active-chat-registry'
import type { SqliteCronJobRunStorage } from './cron-job-runs'
import { logger } from '../logger'

const log = logger.child({ component: 'storage:global-dashboard' })

export interface GlobalDashboardServiceDeps {
  projectStorage: IProjectService
  agentStorage: IAgentService
  getProjectDb: (projectId: ProjectId) => AppDatabase
  activeChatRegistry?: ActiveChatRegistry
  cronJobRunStorage?: SqliteCronJobRunStorage
  cronJobStorage?: ICronJobService
}

/** Local date string (YYYY-MM-DD) using system timezone. */
function toLocalDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Local midnight expressed as UTC ISO string, for comparing against UTC-stored timestamps. */
function localMidnightIso(d: Date = new Date()): string {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString()
}

/**
 * Convert a TimeRange enum to a UTC ISO boundary for filtering.
 * Uses local midnight so "today" means "since midnight local time".
 * Returns undefined for 'all' (no filtering).
 */
function timeRangeToDate(range?: TimeRange): string | undefined {
  if (!range || range === 'all') return undefined
  const now = new Date()
  switch (range) {
    case 'today':
      return localMidnightIso(now)
    case '7d': {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7)
      return d.toISOString()
    }
    case '30d': {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30)
      return d.toISOString()
    }
  }
}

export class GlobalDashboardService implements IGlobalDashboardService {
  private deps: GlobalDashboardServiceDeps

  constructor(deps: GlobalDashboardServiceDeps) {
    this.deps = deps
  }

  async getSummary(timeRange?: TimeRange): Promise<DashboardSummary> {
    const startDate = timeRangeToDate(timeRange)
    const dateCondition = startDate ? sql` AND created_at >= ${startDate}` : sql``
    const projects = await this.deps.projectStorage.list()

    let totalAgents = 0
    let activeChats = 0
    let totalChats = 0
    let tokenInput = 0
    let tokenOutput = 0
    let callCount = 0

    for (const project of projects) {
      const agents = await this.deps.agentStorage.list(project.id)
      totalAgents += agents.length

      try {
        const db = this.deps.getProjectDb(project.id)

        const convCount = db.all<{ cnt: number }>(
          sql`SELECT count(*) as cnt FROM conversations WHERE project_id = ${project.id}`,
        )
        totalChats += convCount[0]?.cnt ?? 0

        const activeCount = startDate
          ? db.all<{ cnt: number }>(
              sql`SELECT count(DISTINCT c.id) as cnt FROM conversations c
                  JOIN messages m ON m.conversation_id = c.id
                  WHERE c.project_id = ${project.id} AND m.created_at >= ${startDate}`,
            )
          : db.all<{ cnt: number }>(
              sql`SELECT count(DISTINCT c.id) as cnt FROM conversations c
                  JOIN messages m ON m.conversation_id = c.id
                  WHERE c.project_id = ${project.id}`,
            )
        activeChats += activeCount[0]?.cnt ?? 0

        const tokenSum = db.all<{ inp: number; out: number }>(
          sql`SELECT COALESCE(SUM(inp), 0) as inp, COALESCE(SUM(out), 0) as out FROM (
                SELECT input_tokens as inp, output_tokens as out FROM token_records WHERE 1=1${dateCondition}
                UNION ALL
                SELECT m.input_tokens as inp, m.output_tokens as out FROM messages m
                WHERE m.input_tokens > 0${dateCondition}
                  AND NOT EXISTS (SELECT 1 FROM token_records tr WHERE tr.message_id = m.id)
              )`,
        )
        tokenInput += tokenSum[0]?.inp ?? 0
        tokenOutput += tokenSum[0]?.out ?? 0

        const callCountResult = db.all<{ cnt: number }>(
          sql`SELECT count(*) as cnt FROM token_records WHERE 1=1${dateCondition}`,
        )
        callCount += callCountResult[0]?.cnt ?? 0
      } catch (err) {
        log.warn({ err, projectId: project.id }, 'failed to query project DB for global summary')
      }
    }

    return {
      todayTokens: { total: tokenInput + tokenOutput, input: tokenInput, output: tokenOutput, callCount },
      totalAgents,
      activeChats,
      totalChats,
    }
  }

  async getTokenByModel(timeRange?: TimeRange): Promise<DashboardTokenByModel[]> {
    const startDate = timeRangeToDate(timeRange)
    const projects = await this.deps.projectStorage.list()
    // Aggregate across all projects by (provider, model)
    const agg = new Map<string, { provider: string; model: string; inputTokens: number; outputTokens: number; callCount: number }>()

    for (const project of projects) {
      try {
        const db = this.deps.getProjectDb(project.id)
        const dateCondition = startDate ? sql` AND created_at >= ${startDate}` : sql``
        const rows = db.all<{ provider: string; model: string; inp: number; out: number; cnt: number }>(
          sql`SELECT provider, model, COALESCE(SUM(inp), 0) as inp, COALESCE(SUM(out), 0) as out, count(*) as cnt FROM (
                SELECT provider, model, input_tokens as inp, output_tokens as out FROM token_records WHERE 1=1${dateCondition}
                UNION ALL
                SELECT COALESCE(NULLIF(m.provider, ''), 'unknown'), COALESCE(NULLIF(m.model, ''), 'unknown'), m.input_tokens as inp, m.output_tokens as out
                FROM messages m
                WHERE m.input_tokens > 0${dateCondition}
                  AND NOT EXISTS (SELECT 1 FROM token_records tr WHERE tr.message_id = m.id)
              ) GROUP BY provider, model`,
        )
        for (const r of rows) {
          const key = `${r.provider}::${r.model}`
          const existing = agg.get(key)
          if (existing) {
            existing.inputTokens += r.inp
            existing.outputTokens += r.out
            existing.callCount += r.cnt
          } else {
            agg.set(key, { provider: r.provider, model: r.model, inputTokens: r.inp, outputTokens: r.out, callCount: r.cnt })
          }
        }
      } catch (err) {
        log.warn({ err, projectId: project.id }, 'failed to query token by model for global')
      }
    }

    const results = Array.from(agg.values())
    results.sort((a, b) => (b.inputTokens + b.outputTokens) - (a.inputTokens + a.outputTokens))
    return results
  }

  async getTokenByAgent(timeRange?: TimeRange): Promise<(DashboardTokenByAgent & { projectId: ProjectId; projectName: string })[]> {
    const startDate = timeRangeToDate(timeRange)
    const projects = await this.deps.projectStorage.list()
    const results: (DashboardTokenByAgent & { projectId: ProjectId; projectName: string })[] = []

    for (const project of projects) {
      try {
        const db = this.deps.getProjectDb(project.id)
        const agents = await this.deps.agentStorage.list(project.id)
        const agentMap = new Map(agents.map(a => [a.id as string, a.name]))

        const dateCondition = startDate ? sql` AND created_at >= ${startDate}` : sql``
        const rows = db.all<{ agent_id: string; inp: number; out: number; cnt: number }>(
          sql`SELECT agent_id, COALESCE(SUM(inp), 0) as inp, COALESCE(SUM(out), 0) as out, count(*) as cnt FROM (
                SELECT agent_id, input_tokens as inp, output_tokens as out FROM token_records WHERE 1=1${dateCondition}
                UNION ALL
                SELECT c.agent_id, m.input_tokens as inp, m.output_tokens as out
                FROM messages m
                JOIN conversations c ON c.id = m.conversation_id
                WHERE m.input_tokens > 0${dateCondition}
                  AND NOT EXISTS (SELECT 1 FROM token_records tr WHERE tr.message_id = m.id)
              ) GROUP BY agent_id ORDER BY (inp + out) DESC`,
        )
        for (const r of rows) {
          results.push({
            agentId: r.agent_id as AgentId,
            agentName: agentMap.get(r.agent_id) ?? 'Unknown',
            inputTokens: r.inp,
            outputTokens: r.out,
            callCount: r.cnt,
            projectId: project.id,
            projectName: project.name,
          })
        }
      } catch (err) {
        log.warn({ err, projectId: project.id }, 'failed to query token by agent for global')
      }
    }

    results.sort((a, b) => (b.inputTokens + b.outputTokens) - (a.inputTokens + a.outputTokens))
    return results
  }

  async getTokenByProject(timeRange?: TimeRange): Promise<{ projectId: ProjectId; projectName: string; inputTokens: number; outputTokens: number; callCount: number }[]> {
    const startDate = timeRangeToDate(timeRange)
    const projects = await this.deps.projectStorage.list()
    const results: { projectId: ProjectId; projectName: string; inputTokens: number; outputTokens: number; callCount: number }[] = []

    for (const project of projects) {
      try {
        const db = this.deps.getProjectDb(project.id)
        const dateCondition = startDate ? sql` AND created_at >= ${startDate}` : sql``
        const rows = db.all<{ inp: number; out: number; cnt: number }>(
          sql`SELECT COALESCE(SUM(inp), 0) as inp, COALESCE(SUM(out), 0) as out, count(*) as cnt FROM (
                SELECT input_tokens as inp, output_tokens as out FROM token_records WHERE 1=1${dateCondition}
                UNION ALL
                SELECT m.input_tokens as inp, m.output_tokens as out FROM messages m
                WHERE m.input_tokens > 0${dateCondition}
                  AND NOT EXISTS (SELECT 1 FROM token_records tr WHERE tr.message_id = m.id)
              )`,
        )
        const r = rows[0]
        results.push({
          projectId: project.id,
          projectName: project.name,
          inputTokens: r?.inp ?? 0,
          outputTokens: r?.out ?? 0,
          callCount: r?.cnt ?? 0,
        })
      } catch (err) {
        log.warn({ err, projectId: project.id }, 'failed to query token by project for global')
      }
    }

    // Sort by total tokens descending
    results.sort((a, b) => (b.inputTokens + b.outputTokens) - (a.inputTokens + a.outputTokens))
    return results
  }

  async getTokenTrend(days = 14, timeRange?: TimeRange): Promise<DashboardTokenTrend[]> {
    // Today: hourly (0-23) distribution in local time
    if (timeRange === 'today') {
      return this.getHourlyTrend()
    }

    if (timeRange === '7d') days = 7
    else if (timeRange === '30d') days = 30

    // Build date range using local dates
    const now = new Date()
    const dateMap = new Map<string, { inputTokens: number; outputTokens: number }>()
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
      dateMap.set(toLocalDate(d), { inputTokens: 0, outputTokens: 0 })
    }

    // Use local midnight of the earliest day as the UTC boundary
    const startDays = days - 1
    const startBoundary = new Date(now.getFullYear(), now.getMonth(), now.getDate() - startDays).toISOString()

    const projects = await this.deps.projectStorage.list()
    for (const project of projects) {
      try {
        const db = this.deps.getProjectDb(project.id)
        // Use 'localtime' modifier to bucket by local date
        const rows = db.all<{ day: string; inp: number; out: number }>(
          sql`SELECT day, COALESCE(SUM(inp), 0) as inp, COALESCE(SUM(out), 0) as out FROM (
                SELECT substr(datetime(created_at, 'localtime'), 1, 10) as day, input_tokens as inp, output_tokens as out
                FROM token_records WHERE created_at >= ${startBoundary}
                UNION ALL
                SELECT substr(datetime(m.created_at, 'localtime'), 1, 10) as day, m.input_tokens as inp, m.output_tokens as out
                FROM messages m
                WHERE m.created_at >= ${startBoundary} AND m.input_tokens > 0
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
        log.warn({ err, projectId: project.id }, 'failed to query token trend for global')
      }
    }

    return Array.from(dateMap.entries()).map(([date, tokens]) => ({
      date,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
    }))
  }

  private async getHourlyTrend(): Promise<DashboardTokenTrend[]> {
    // Use local midnight as the UTC boundary for "today"
    const todayBoundary = localMidnightIso()
    const hourMap = new Map<string, { inputTokens: number; outputTokens: number }>()
    for (let h = 0; h < 24; h++) {
      hourMap.set(String(h).padStart(2, '0'), { inputTokens: 0, outputTokens: 0 })
    }

    const projects = await this.deps.projectStorage.list()
    for (const project of projects) {
      try {
        const db = this.deps.getProjectDb(project.id)
        // Use 'localtime' modifier to extract local hour
        const rows = db.all<{ hr: string; inp: number; out: number }>(
          sql`SELECT hr, COALESCE(SUM(inp), 0) as inp, COALESCE(SUM(out), 0) as out FROM (
                SELECT substr(datetime(created_at, 'localtime'), 12, 2) as hr, input_tokens as inp, output_tokens as out
                FROM token_records WHERE created_at >= ${todayBoundary}
                UNION ALL
                SELECT substr(datetime(m.created_at, 'localtime'), 12, 2) as hr, m.input_tokens as inp, m.output_tokens as out
                FROM messages m
                WHERE m.created_at >= ${todayBoundary} AND m.input_tokens > 0
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
        log.warn({ err, projectId: project.id }, 'failed to query hourly trend for global')
      }
    }

    return Array.from(hourMap.entries()).map(([hr, tokens]) => ({
      date: hr,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
    }))
  }

  async getRuntimeStatus(): Promise<RuntimeStatus> {
    const projects = await this.deps.projectStorage.list()

    // Running chats from ActiveChatRegistry (all projects)
    const allEntries = this.deps.activeChatRegistry?.getAll() ?? []
    const runningChats: RuntimeStatus['runningChats'] = []

    // Build global lookup maps
    const globalAgentMap = new Map<string, string>()
    const projectNameMap = new Map<string, string>()
    for (const project of projects) {
      projectNameMap.set(project.id as string, project.name)
      const agents = await this.deps.agentStorage.list(project.id)
      for (const a of agents) {
        globalAgentMap.set(a.id as string, a.name)
      }
    }

    // Resolve running chat titles from each project DB
    const projectDbMap = new Map<string, ReturnType<typeof this.deps.getProjectDb>>()
    for (const entry of allEntries) {
      let title = ''
      try {
        let db = projectDbMap.get(entry.projectId)
        if (!db) {
          db = this.deps.getProjectDb(entry.projectId as ProjectId)
          projectDbMap.set(entry.projectId, db)
        }
        const rows = db.all<{ title: string }>(
          sql`SELECT title FROM conversations WHERE id = ${entry.conversationId}`,
        )
        title = rows[0]?.title ?? ''
      } catch { /* ignore */ }
      runningChats.push({
        conversationId: entry.conversationId as any,
        projectId: entry.projectId as ProjectId,
        projectName: projectNameMap.get(entry.projectId) ?? '',
        agentId: entry.agentId as AgentId,
        agentName: globalAgentMap.get(entry.agentId) ?? 'Unknown',
        title,
        startedAt: entry.startedAt,
      })
    }

    // Running crons (all projects)
    const runningCrons: RuntimeStatus['runningCrons'] = []
    for (const project of projects) {
      try {
        const db = this.deps.getProjectDb(project.id)
        const rows = db.all<{ id: string; cron_job_id: string; agent_id: string; created_at: string }>(
          sql`SELECT id, cron_job_id, agent_id, created_at FROM cron_job_runs
              WHERE project_id = ${project.id} AND status = 'running'
              ORDER BY created_at DESC`,
        )

        let cronMap = new Map<string, string>()
        if (this.deps.cronJobStorage && rows.length > 0) {
          const jobs = await this.deps.cronJobStorage.list(project.id)
          cronMap = new Map(jobs.map(j => [j.id as string, j.name]))
        }

        for (const row of rows) {
          runningCrons.push({
            cronJobId: row.cron_job_id as any,
            projectId: project.id,
            projectName: project.name,
            cronJobName: cronMap.get(row.cron_job_id) ?? 'Unknown',
            agentId: row.agent_id as AgentId,
            agentName: globalAgentMap.get(row.agent_id) ?? 'Unknown',
            runId: row.id,
            startedAt: row.created_at,
          })
        }
      } catch (err) {
        log.warn({ err, projectId: project.id }, 'failed to query running crons for global')
      }
    }

    // Upcoming crons (all projects)
    const upcoming: RuntimeStatus['upcoming'] = []
    if (this.deps.cronJobStorage) {
      for (const project of projects) {
        try {
          const jobs = await this.deps.cronJobStorage.list(project.id)
          for (const job of jobs) {
            if (job.enabled && job.nextRunAt) {
              upcoming.push({
                cronJobId: job.id,
                projectId: project.id,
                projectName: project.name,
                cronJobName: job.name,
                agentId: job.agentId,
                agentName: globalAgentMap.get(job.agentId as string) ?? 'Unknown',
                nextRunAt: job.nextRunAt,
              })
            }
          }
        } catch (err) {
          log.warn({ err, projectId: project.id }, 'failed to query upcoming crons for global')
        }
      }
      upcoming.sort((a, b) => a.nextRunAt.localeCompare(b.nextRunAt))
      upcoming.splice(10)
    }

    // Recent completed (all projects)
    const recentCompleted: RuntimeStatus['recentCompleted'] = []
    for (const project of projects) {
      try {
        const db = this.deps.getProjectDb(project.id)

        // Recent cron runs — include cron_job_id for navigation
        const cronRows = db.all<{ id: string; cron_job_id: string; agent_id: string; status: string; duration_ms: number | null; updated_at: string }>(
          sql`SELECT id, cron_job_id, agent_id, status, duration_ms, updated_at FROM cron_job_runs
              WHERE project_id = ${project.id} AND status IN ('success', 'error')
              ORDER BY updated_at DESC LIMIT 5`,
        )

        let recentCronMap = new Map<string, string>()
        if (this.deps.cronJobStorage && cronRows.length > 0) {
          const jobs = await this.deps.cronJobStorage.list(project.id)
          recentCronMap = new Map(jobs.map(j => [j.id as string, j.name]))
        }

        for (const row of cronRows) {
          recentCompleted.push({
            type: 'cron',
            id: row.id,
            projectId: project.id,
            projectName: project.name,
            agentName: globalAgentMap.get(row.agent_id) ?? 'Unknown',
            title: recentCronMap.get(row.cron_job_id) ?? 'Unknown',
            completedAt: row.updated_at,
            status: row.status as 'success' | 'error',
            durationMs: row.duration_ms ?? undefined,
            cronJobId: row.cron_job_id as any,
          })
        }

        // Recent conversations — include title
        const chatRows = db.all<{ id: string; agent_id: string; title: string; last_message_at: string | null; total_tokens: number }>(
          sql`SELECT c.id, c.agent_id, c.title, c.last_message_at,
                     COALESCE((SELECT SUM(input_tokens + output_tokens) FROM token_records WHERE conversation_id = c.id), 0) as total_tokens
              FROM conversations c
              WHERE c.project_id = ${project.id} AND c.last_message_at IS NOT NULL
              ORDER BY c.last_message_at DESC LIMIT 5`,
        )
        for (const row of chatRows) {
          recentCompleted.push({
            type: 'chat',
            id: row.id,
            projectId: project.id,
            projectName: project.name,
            agentName: globalAgentMap.get(row.agent_id) ?? 'Unknown',
            title: row.title || '',
            completedAt: row.last_message_at!,
            status: 'success',
            totalTokens: row.total_tokens,
          })
        }
      } catch (err) {
        log.warn({ err, projectId: project.id }, 'failed to query recent items for global')
      }
    }

    recentCompleted.sort((a, b) => b.completedAt.localeCompare(a.completedAt))
    recentCompleted.splice(20)

    return { runningChats, runningCrons, upcoming, recentCompleted }
  }
}
