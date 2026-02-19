import { Cron } from 'croner'
import type { CronJob, CronJobId } from '@golemancy/shared'
import type { FileCronJobStorage } from '../storage/cronjobs'
import type { CronJobExecutor } from './executor'
import { logger } from '../logger'

const log = logger.child({ component: 'scheduler' })

export class CronScheduler {
  private entries = new Map<CronJobId, { cron: Cron; cronJob: CronJob }>()
  private executor: CronJobExecutor | null = null
  private cronJobStorage: FileCronJobStorage | null = null
  private executing = new Set<CronJobId>()

  async start(deps: { cronJobStorage: FileCronJobStorage; executor: CronJobExecutor }) {
    this.cronJobStorage = deps.cronJobStorage
    this.executor = deps.executor
    await this.reload()
    log.info({ count: this.entries.size }, 'scheduler started')
  }

  async reload() {
    // Stop all existing
    for (const entry of this.entries.values()) {
      entry.cron.stop()
    }
    this.entries.clear()

    if (!this.cronJobStorage) return

    const jobs = await this.cronJobStorage.listAllEnabled()
    for (const job of jobs) {
      this.scheduleJob(job)
    }
    log.info({ count: this.entries.size }, 'scheduler reloaded')
  }

  rescheduleJob(cronJob: CronJob) {
    this.removeJob(cronJob.id)
    if (cronJob.enabled) {
      this.scheduleJob(cronJob)
    }
  }

  removeJob(cronJobId: CronJobId) {
    const entry = this.entries.get(cronJobId)
    if (entry) {
      entry.cron.stop()
      this.entries.delete(cronJobId)
      log.debug({ cronJobId }, 'removed job from scheduler')
    }
  }

  private scheduleJob(cronJob: CronJob) {
    try {
      let cron: Cron
      if (cronJob.scheduleType === 'once' && cronJob.scheduledAt) {
        const scheduledDate = new Date(cronJob.scheduledAt)
        if (scheduledDate.getTime() <= Date.now()) {
          log.debug({ cronJobId: cronJob.id }, 'skipping once job — scheduledAt is in the past')
          return
        }
        cron = new Cron(scheduledDate, () => {
          this.onTick(cronJob)
        })
      } else {
        cron = new Cron(cronJob.cronExpression, () => {
          this.onTick(cronJob)
        })
      }
      this.entries.set(cronJob.id, { cron, cronJob })
      log.debug({ cronJobId: cronJob.id, expression: cronJob.cronExpression, scheduleType: cronJob.scheduleType, nextRun: cron.nextRun()?.toISOString() }, 'scheduled job')
    } catch (err) {
      log.warn({ cronJobId: cronJob.id, err }, 'failed to schedule job — invalid expression')
    }
  }

  private async onTick(cronJob: CronJob) {
    if (!this.executor || !this.cronJobStorage) return

    // Skip if already executing
    if (this.executing.has(cronJob.id)) {
      log.warn({ cronJobId: cronJob.id }, 'skipping — job already executing')
      return
    }

    // Re-read from storage to verify still enabled
    const current = await this.cronJobStorage.getById(cronJob.projectId, cronJob.id)
    if (!current || !current.enabled) {
      log.debug({ cronJobId: cronJob.id }, 'skipping — job disabled or deleted')
      return
    }

    this.executing.add(cronJob.id)
    try {
      await this.executor.execute(current, 'schedule')
    } catch (err) {
      log.error({ cronJobId: cronJob.id, err }, 'cron job execution failed')
    } finally {
      this.executing.delete(cronJob.id)
      // Auto-disable once jobs after execution
      if (current.scheduleType === 'once' && this.cronJobStorage) {
        await this.cronJobStorage.updateRunMeta(current.projectId, current.id, { enabled: false })
        this.removeJob(current.id)
        log.info({ cronJobId: current.id }, 'once job auto-disabled after execution')
      }
    }
  }

  async triggerManual(projectId: string, cronJobId: CronJobId): Promise<void> {
    if (!this.executor || !this.cronJobStorage) {
      throw new Error('Scheduler not started')
    }
    const job = await this.cronJobStorage.getById(projectId as any, cronJobId)
    if (!job) throw new Error(`CronJob ${cronJobId} not found`)

    // Don't check enabled — manual trigger always works
    await this.executor.execute(job, 'manual')
  }

  getNextRun(cronJobId: CronJobId): Date | null {
    const entry = this.entries.get(cronJobId)
    return entry?.cron.nextRun() ?? null
  }

  async shutdown() {
    for (const entry of this.entries.values()) {
      entry.cron.stop()
    }
    this.entries.clear()
    log.info('scheduler shut down')
  }
}

export const cronScheduler = new CronScheduler()
