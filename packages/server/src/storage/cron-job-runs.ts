import { eq, desc } from 'drizzle-orm'
import type { CronJobRun, CronJobRunStatus, CronJobId, ProjectId } from '@golemancy/shared'
import type { AppDatabase } from '../db/client'
import { cronJobRuns } from '../db/schema'
import { generateId } from '../utils/ids'
import { logger } from '../logger'

const log = logger.child({ component: 'storage:cron-job-runs' })

export class SqliteCronJobRunStorage {
  constructor(private getProjectDb: (projectId: ProjectId) => AppDatabase) {}

  async create(projectId: ProjectId, data: Omit<CronJobRun, 'id' | 'createdAt' | 'updatedAt'>): Promise<CronJobRun> {
    const db = this.getProjectDb(projectId)
    const now = new Date().toISOString()
    const id = generateId('cronrun')
    const run: CronJobRun = {
      id,
      ...data,
      createdAt: now,
      updatedAt: now,
    }
    db.insert(cronJobRuns).values({
      id: run.id,
      cronJobId: run.cronJobId,
      projectId: run.projectId,
      agentId: run.agentId,
      conversationId: run.conversationId,
      status: run.status,
      durationMs: run.durationMs,
      error: run.error,
      triggeredBy: run.triggeredBy,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
    }).run()
    log.debug({ projectId, runId: id }, 'created cron job run')
    return run
  }

  async updateStatus(projectId: ProjectId, runId: string, status: CronJobRunStatus, extra?: { durationMs?: number; error?: string; conversationId?: string }): Promise<void> {
    const db = this.getProjectDb(projectId)
    const now = new Date().toISOString()
    db.update(cronJobRuns)
      .set({
        status,
        updatedAt: now,
        ...(extra?.durationMs !== undefined ? { durationMs: extra.durationMs } : {}),
        ...(extra?.error !== undefined ? { error: extra.error } : {}),
        ...(extra?.conversationId !== undefined ? { conversationId: extra.conversationId } : {}),
      })
      .where(eq(cronJobRuns.id, runId))
      .run()
    log.debug({ projectId, runId, status }, 'updated cron job run status')
  }

  async listByJob(projectId: ProjectId, cronJobId: CronJobId, limit = 50): Promise<CronJobRun[]> {
    const db = this.getProjectDb(projectId)
    const rows = db.select().from(cronJobRuns)
      .where(eq(cronJobRuns.cronJobId, cronJobId))
      .orderBy(desc(cronJobRuns.createdAt))
      .limit(limit)
      .all()
    return rows as CronJobRun[]
  }

  async listByProject(projectId: ProjectId, limit = 50): Promise<CronJobRun[]> {
    const db = this.getProjectDb(projectId)
    const rows = db.select().from(cronJobRuns)
      .where(eq(cronJobRuns.projectId, projectId))
      .orderBy(desc(cronJobRuns.createdAt))
      .limit(limit)
      .all()
    return rows as CronJobRun[]
  }
}
