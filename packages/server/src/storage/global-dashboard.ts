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

/**
 * Convert a TimeRange enum to an ISO date string (start of range).
 * Returns undefined for 'all' (no filtering).
 */
function timeRangeToDate(range?: TimeRange): string | undefined {
  if (!range || range === 'all') return undefined
  const now = new Date()
  switch (range) {
    case 'today':
      return now.toISOString().slice(0, 10)
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

export class GlobalDashboardService implements IGlobalDashboardService {
  private deps: GlobalDashboardServiceDeps

  constructor(deps: GlobalDashboardServiceDeps) {
    this.deps = deps
  }

  async getSummary(timeRange?: TimeRange): Promise<DashboardSummary> {
    const startDate = timeRangeToDate(timeRange) ?? new Date().toISOString().slice(0, 10)
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

        const activeCount = db.all<{ cnt: number }>(
          sql`SELECT count(DISTINCT c.id) as cnt FROM conversations c
              JOIN messages m ON m.conversation_id = c.id
              WHERE c.project_id = ${project.id} AND m.created_at >= ${startDate}`,
        )
        activeChats += activeCount[0]?.cnt ?? 0

        const tokenSum = db.all<{ inp: number; out: number }>(
          sql`SELECT COALESCE(SUM(inp), 0) as inp, COALESCE(SUM(out), 0) as out FROM (
                SELECT input_tokens as inp, output_tokens as out FROM token_records WHERE created_at >= ${startDate}
                UNION ALL
                SELECT m.input_tokens as inp, m.output_tokens as out FROM messages m
                WHERE m.created_at >= ${startDate} AND m.input_tokens > 0
                  AND NOT EXISTS (SELECT 1 FROM token_records tr WHERE tr.message_id = m.id)
              )`,
        )
        tokenInput += tokenSum[0]?.inp ?? 0
        tokenOutput += tokenSum[0]?.out ?? 0

        const callCountResult = db.all<{ cnt: number }>(
          sql`SELECT count(*) as cnt FROM token_records WHERE created_at >= ${startDate}`,
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

  async getTokenByModel(timeRange?: TimeRange): Promise<(DashboardTokenByModel & { projectId: ProjectId; projectName: string })[]> {
    const startDate = timeRangeToDate(timeRange)
    const projects = await this.deps.projectStorage.list()
    const results: (DashboardTokenByModel & { projectId: ProjectId; projectName: string })[] = []

    for (const project of projects) {
      try {
        const db = this.deps.getProjectDb(project.id)
        const dateCondition = startDate ? sql` AND created_at >= ${startDate}` : sql``
        const rows = db.all<{ provider: string; model: string; inp: number; out: number; cnt: number }>(
          sql`SELECT provider, model, COALESCE(SUM(input_tokens), 0) as inp, COALESCE(SUM(output_tokens), 0) as out, count(*) as cnt
                   FROM token_records WHERE 1=1${dateCondition} GROUP BY provider, model ORDER BY (inp + out) DESC`,
        )
        for (const r of rows) {
          results.push({
            provider: r.provider,
            model: r.model,
            inputTokens: r.inp,
            outputTokens: r.out,
            callCount: r.cnt,
            projectId: project.id,
            projectName: project.name,
          })
        }
      } catch (err) {
        log.warn({ err, projectId: project.id }, 'failed to query token by model for global')
      }
    }

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
          sql`SELECT agent_id, COALESCE(SUM(input_tokens), 0) as inp, COALESCE(SUM(output_tokens), 0) as out, count(*) as cnt
                   FROM token_records WHERE 1=1${dateCondition} GROUP BY agent_id ORDER BY (inp + out) DESC`,
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
          sql`SELECT COALESCE(SUM(input_tokens), 0) as inp, COALESCE(SUM(output_tokens), 0) as out, count(*) as cnt
                   FROM token_records WHERE 1=1${dateCondition}`,
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
    // Today: hourly
    if (timeRange === 'today') {
      return this.getHourlyTrend()
    }

    if (timeRange === '7d') days = 7
    else if (timeRange === '30d') days = 30

    const today = new Date()
    const dateMap = new Map<string, { inputTokens: number; outputTokens: number }>()
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      dateMap.set(d.toISOString().slice(0, 10), { inputTokens: 0, outputTokens: 0 })
    }
    const startDate = Array.from(dateMap.keys())[0]

    const projects = await this.deps.projectStorage.list()
    for (const project of projects) {
      try {
        const db = this.deps.getProjectDb(project.id)
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
    const today = new Date().toISOString().slice(0, 10)
    const hourMap = new Map<string, { inputTokens: number; outputTokens: number }>()
    for (let h = 0; h < 24; h++) {
      hourMap.set(String(h).padStart(2, '0'), { inputTokens: 0, outputTokens: 0 })
    }

    const projects = await this.deps.projectStorage.list()
    for (const project of projects) {
      try {
        const db = this.deps.getProjectDb(project.id)
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

    // Build a global agent name map
    const globalAgentMap = new Map<string, string>()
    for (const project of projects) {
      const agents = await this.deps.agentStorage.list(project.id)
      for (const a of agents) {
        globalAgentMap.set(a.id as string, a.name)
      }
    }

    for (const entry of allEntries) {
      runningChats.push({
        conversationId: entry.conversationId as any,
        agentId: entry.agentId as AgentId,
        agentName: globalAgentMap.get(entry.agentId) ?? 'Unknown',
        title: '',
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

        const cronRows = db.all<{ id: string; agent_id: string; status: string; duration_ms: number | null; updated_at: string }>(
          sql`SELECT id, agent_id, status, duration_ms, updated_at FROM cron_job_runs
              WHERE project_id = ${project.id} AND status IN ('success', 'error')
              ORDER BY updated_at DESC LIMIT 5`,
        )
        for (const row of cronRows) {
          recentCompleted.push({
            type: 'cron',
            id: row.id,
            agentName: globalAgentMap.get(row.agent_id) ?? 'Unknown',
            completedAt: row.updated_at,
            status: row.status as 'success' | 'error',
            durationMs: row.duration_ms ?? undefined,
          })
        }

        const chatRows = db.all<{ id: string; agent_id: string; last_message_at: string | null; total_tokens: number }>(
          sql`SELECT c.id, c.agent_id, c.last_message_at,
                     COALESCE((SELECT SUM(input_tokens + output_tokens) FROM token_records WHERE conversation_id = c.id), 0) as total_tokens
              FROM conversations c
              WHERE c.project_id = ${project.id} AND c.last_message_at IS NOT NULL
              ORDER BY c.last_message_at DESC LIMIT 5`,
        )
        for (const row of chatRows) {
          recentCompleted.push({
            type: 'chat',
            id: row.id,
            agentName: globalAgentMap.get(row.agent_id) ?? 'Unknown',
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
