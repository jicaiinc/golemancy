import path from 'node:path'
import type { CronJob, CronJobId, ProjectId, ICronJobService } from '@solocraft/shared'
import { readJson, writeJson, deleteFile, listJsonFiles } from './base'
import { getProjectPath, validateId } from '../utils/paths'
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
    data: Pick<CronJob, 'agentId' | 'name' | 'description' | 'cronExpression' | 'enabled'>,
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
    data: Partial<Pick<CronJob, 'agentId' | 'name' | 'description' | 'cronExpression' | 'enabled'>>,
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
}
