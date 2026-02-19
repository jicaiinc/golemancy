import path from 'node:path'
import fs from 'node:fs/promises'
import type { CronJob, CronJobId, CronJobRunStatus, ProjectId, ICronJobService } from '@golemancy/shared'
import { readJson, writeJson, deleteFile, listJsonFiles } from './base'
import { getProjectPath, getDataDir, validateId } from '../utils/paths'
import { generateId } from '../utils/ids'
import { logger } from '../logger'

const log = logger.child({ component: 'storage:cronjobs' })

export class FileCronJobStorage implements ICronJobService {
  private cronJobsDir(projectId: string) {
    return path.join(getProjectPath(projectId), 'cronjobs')
  }

  private cronJobPath(projectId: string, id: string) {
    validateId(id)
    return path.join(this.cronJobsDir(projectId), `${id}.json`)
  }

  async list(projectId: ProjectId): Promise<CronJob[]> {
    const jobs = await listJsonFiles<CronJob>(this.cronJobsDir(projectId))
    log.debug({ projectId, count: jobs.length }, 'listed cron jobs')
    return jobs
  }

  async getById(projectId: ProjectId, id: CronJobId): Promise<CronJob | null> {
    return readJson<CronJob>(this.cronJobPath(projectId, id))
  }

  async create(
    projectId: ProjectId,
    data: Pick<CronJob, 'agentId' | 'name' | 'cronExpression' | 'enabled' | 'instruction' | 'scheduleType' | 'scheduledAt'>,
  ): Promise<CronJob> {
    const id = generateId('cron')
    log.debug({ projectId, cronJobId: id }, 'creating cron job')
    const now = new Date().toISOString()

    const job: CronJob = {
      id,
      projectId,
      ...data,
      createdAt: now,
      updatedAt: now,
    }

    await writeJson(this.cronJobPath(projectId, id), job)
    return job
  }

  async update(
    projectId: ProjectId,
    id: CronJobId,
    data: Partial<Pick<CronJob, 'agentId' | 'name' | 'cronExpression' | 'enabled' | 'instruction' | 'scheduleType' | 'scheduledAt'>>,
  ): Promise<CronJob> {
    const existing = await this.getById(projectId, id)
    if (!existing) throw new Error(`CronJob ${id} not found in project ${projectId}`)

    log.debug({ projectId, cronJobId: id }, 'updating cron job')
    const updated: CronJob = {
      ...existing,
      ...data,
      id,
      projectId,
      updatedAt: new Date().toISOString(),
    }
    await writeJson(this.cronJobPath(projectId, id), updated)
    return updated
  }

  async delete(projectId: ProjectId, id: CronJobId): Promise<void> {
    log.debug({ projectId, cronJobId: id }, 'deleting cron job')
    await deleteFile(this.cronJobPath(projectId, id))
  }

  async listAllEnabled(): Promise<CronJob[]> {
    const dataDir = getDataDir()
    const projectsDir = path.join(dataDir, 'projects')
    try {
      const entries = await fs.readdir(projectsDir, { withFileTypes: true })
      const allJobs: CronJob[] = []
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const cronDir = path.join(projectsDir, entry.name, 'cronjobs')
        const jobs = await listJsonFiles<CronJob>(cronDir)
        allJobs.push(...jobs.filter(j => j.enabled))
      }
      return allJobs
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw e
    }
  }

  async updateRunMeta(
    projectId: ProjectId,
    id: CronJobId,
    meta: { lastRunAt?: string; lastRunStatus?: CronJobRunStatus; nextRunAt?: string; lastRunId?: string; enabled?: boolean },
  ): Promise<void> {
    const existing = await this.getById(projectId, id)
    if (!existing) return
    const updated = { ...existing, ...meta, updatedAt: new Date().toISOString() }
    await writeJson(this.cronJobPath(projectId, id), updated)
  }
}
