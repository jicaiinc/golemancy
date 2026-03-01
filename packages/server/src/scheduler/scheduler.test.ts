import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest'
import type { CronJob, CronJobId, ProjectId, AgentId } from '@golemancy/shared'
import { CronScheduler } from './scheduler'
import type { FileCronJobStorage } from '../storage/cronjobs'
import type { CronJobExecutor } from './executor'

function makeCronJob(overrides: Partial<CronJob> = {}): CronJob {
  return {
    id: 'cron-1' as CronJobId,
    projectId: 'proj-1' as ProjectId,
    agentId: 'agent-1' as AgentId,
    name: 'Test Job',
    cronExpression: '*/5 * * * *',
    enabled: true,
    scheduleType: 'cron',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

function createMockStorage(jobs: CronJob[] = []): FileCronJobStorage {
  return {
    listAllEnabled: vi.fn().mockResolvedValue(jobs.filter(j => j.enabled)),
    getById: vi.fn().mockImplementation((_pid: string, id: string) =>
      Promise.resolve(jobs.find(j => j.id === id) ?? null),
    ),
    updateRunMeta: vi.fn().mockResolvedValue(undefined),
  } as unknown as FileCronJobStorage
}

function createMockExecutor(): CronJobExecutor & { execute: Mock } {
  return {
    execute: vi.fn().mockResolvedValue({ id: 'run-1', status: 'success' }),
  } as unknown as CronJobExecutor & { execute: Mock }
}

describe('CronScheduler', () => {
  let scheduler: CronScheduler

  beforeEach(() => {
    scheduler = new CronScheduler()
  })

  afterEach(async () => {
    await scheduler.shutdown()
  })

  describe('start', () => {
    it('loads enabled jobs and schedules them', async () => {
      const job = makeCronJob()
      const storage = createMockStorage([job])
      const executor = createMockExecutor()

      await scheduler.start({ cronJobStorage: storage, executor })

      expect(storage.listAllEnabled).toHaveBeenCalledOnce()
      // Job should be scheduled — getNextRun returns a Date
      const nextRun = scheduler.getNextRun(job.id)
      expect(nextRun).toBeInstanceOf(Date)
    })

    it('does not schedule disabled jobs', async () => {
      const job = makeCronJob({ enabled: false })
      const storage = createMockStorage([job])
      const executor = createMockExecutor()

      await scheduler.start({ cronJobStorage: storage, executor })

      // listAllEnabled already filters, so nothing scheduled
      expect(scheduler.getNextRun(job.id)).toBeNull()
    })
  })

  describe('reload', () => {
    it('clears old jobs and re-schedules from storage', async () => {
      const job1 = makeCronJob({ id: 'cron-1' as CronJobId })
      const job2 = makeCronJob({ id: 'cron-2' as CronJobId, cronExpression: '0 * * * *' })

      const storage = createMockStorage([job1])
      const executor = createMockExecutor()
      await scheduler.start({ cronJobStorage: storage, executor })

      expect(scheduler.getNextRun('cron-1' as CronJobId)).toBeInstanceOf(Date)

      // Update storage to return different jobs
      ;(storage.listAllEnabled as Mock).mockResolvedValue([job2])
      await scheduler.reload()

      // Old job removed, new job scheduled
      expect(scheduler.getNextRun('cron-1' as CronJobId)).toBeNull()
      expect(scheduler.getNextRun('cron-2' as CronJobId)).toBeInstanceOf(Date)
    })

    it('handles empty storage gracefully', async () => {
      const storage = createMockStorage([])
      const executor = createMockExecutor()
      await scheduler.start({ cronJobStorage: storage, executor })

      await scheduler.reload()
      // No errors, no entries
      expect(scheduler.getNextRun('nonexistent' as CronJobId)).toBeNull()
    })
  })

  describe('scheduleJob (via rescheduleJob)', () => {
    it('schedules a recurring cron job', async () => {
      const job = makeCronJob({ cronExpression: '0 12 * * *' })
      const storage = createMockStorage([job])
      const executor = createMockExecutor()
      await scheduler.start({ cronJobStorage: storage, executor })

      const nextRun = scheduler.getNextRun(job.id)
      expect(nextRun).toBeInstanceOf(Date)
      expect(nextRun!.getTime()).toBeGreaterThan(Date.now())
    })

    it('schedules a once-type job with future scheduledAt', async () => {
      const future = new Date(Date.now() + 60_000).toISOString()
      const job = makeCronJob({
        scheduleType: 'once',
        scheduledAt: future,
      })
      const storage = createMockStorage([job])
      const executor = createMockExecutor()
      await scheduler.start({ cronJobStorage: storage, executor })

      const nextRun = scheduler.getNextRun(job.id)
      expect(nextRun).toBeInstanceOf(Date)
    })

    it('skips once-type job with past scheduledAt', async () => {
      const past = new Date(Date.now() - 60_000).toISOString()
      const job = makeCronJob({
        scheduleType: 'once',
        scheduledAt: past,
      })
      const storage = createMockStorage([job])
      const executor = createMockExecutor()
      await scheduler.start({ cronJobStorage: storage, executor })

      // Job should not be scheduled because scheduledAt is in the past
      expect(scheduler.getNextRun(job.id)).toBeNull()
    })

    it('replaces existing job on rescheduleJob', async () => {
      const job = makeCronJob()
      const storage = createMockStorage([job])
      const executor = createMockExecutor()
      await scheduler.start({ cronJobStorage: storage, executor })

      const nextRun1 = scheduler.getNextRun(job.id)
      expect(nextRun1).toBeInstanceOf(Date)

      // Reschedule with new expression
      const updatedJob = makeCronJob({ cronExpression: '0 0 * * *' })
      scheduler.rescheduleJob(updatedJob)

      const nextRun2 = scheduler.getNextRun(job.id)
      expect(nextRun2).toBeInstanceOf(Date)
    })

    it('removes job on rescheduleJob when disabled', async () => {
      const job = makeCronJob()
      const storage = createMockStorage([job])
      const executor = createMockExecutor()
      await scheduler.start({ cronJobStorage: storage, executor })

      expect(scheduler.getNextRun(job.id)).toBeInstanceOf(Date)

      scheduler.rescheduleJob(makeCronJob({ enabled: false }))
      expect(scheduler.getNextRun(job.id)).toBeNull()
    })
  })

  describe('onTick', () => {
    it('executes job on tick', async () => {
      // Use a once-type job with a very near future time to trigger quickly
      const future = new Date(Date.now() + 200)
      const job = makeCronJob({
        scheduleType: 'once',
        scheduledAt: future.toISOString(),
      })
      const storage = createMockStorage([job])
      const executor = createMockExecutor()
      await scheduler.start({ cronJobStorage: storage, executor })

      // Wait for the tick to fire
      await new Promise(r => setTimeout(r, 500))

      expect(executor.execute).toHaveBeenCalledWith(job, 'schedule')
    })

    it('skips execution if job is already executing (concurrency guard)', async () => {
      // Use two once-type jobs scheduled very close together to test the guard
      // We'll simulate by using the internal executing set via a slow execution
      const future1 = new Date(Date.now() + 200)
      const future2 = new Date(Date.now() + 300)
      const job = makeCronJob({
        scheduleType: 'once',
        scheduledAt: future1.toISOString(),
      })

      let resolveExecution!: () => void
      const executor = createMockExecutor()
      executor.execute.mockImplementation(() =>
        new Promise<void>(resolve => {
          resolveExecution = resolve
        }),
      )

      const storage = createMockStorage([job])
      ;(storage.getById as Mock).mockResolvedValue(job)

      await scheduler.start({ cronJobStorage: storage, executor })

      // Wait for the first tick to fire and start executing
      await new Promise(r => setTimeout(r, 400))

      // First call should have started
      expect(executor.execute).toHaveBeenCalledTimes(1)

      // Now resolve and cleanup
      resolveExecution()
      await scheduler.shutdown()
    }, 10_000)

    it('skips if job is disabled in storage at tick time', async () => {
      const future = new Date(Date.now() + 200)
      const job = makeCronJob({
        scheduleType: 'once',
        scheduledAt: future.toISOString(),
      })
      const storage = createMockStorage([job])
      const executor = createMockExecutor()

      // Return disabled when re-read from storage at tick time
      ;(storage.getById as Mock).mockResolvedValue({ ...job, enabled: false })

      await scheduler.start({ cronJobStorage: storage, executor })

      await new Promise(r => setTimeout(r, 500))

      // Should not execute because re-read shows disabled
      expect(executor.execute).not.toHaveBeenCalled()
    })

    it('auto-disables once jobs after execution', async () => {
      const future = new Date(Date.now() + 200)
      const job = makeCronJob({
        scheduleType: 'once',
        scheduledAt: future.toISOString(),
      })
      const storage = createMockStorage([job])
      const executor = createMockExecutor()

      // Return enabled job when re-read from storage
      ;(storage.getById as Mock).mockResolvedValue(job)

      await scheduler.start({ cronJobStorage: storage, executor })

      await new Promise(r => setTimeout(r, 500))

      expect(executor.execute).toHaveBeenCalled()
      expect(storage.updateRunMeta).toHaveBeenCalledWith(
        job.projectId,
        job.id,
        expect.objectContaining({ enabled: false }),
      )
    })
  })

  describe('triggerManual', () => {
    it('executes job manually regardless of enabled state', async () => {
      const job = makeCronJob({ enabled: false })
      const storage = createMockStorage([job])
      const executor = createMockExecutor()

      // Return the disabled job from getById
      ;(storage.getById as Mock).mockResolvedValue(job)

      await scheduler.start({ cronJobStorage: storage, executor })
      await scheduler.triggerManual(job.projectId, job.id)

      expect(executor.execute).toHaveBeenCalledWith(job, 'manual')
    })

    it('throws when scheduler not started', async () => {
      await expect(
        scheduler.triggerManual('proj-1' as any, 'cron-1' as CronJobId),
      ).rejects.toThrow('Scheduler not started')
    })

    it('throws when job not found', async () => {
      const storage = createMockStorage([])
      const executor = createMockExecutor()
      ;(storage.getById as Mock).mockResolvedValue(null)

      await scheduler.start({ cronJobStorage: storage, executor })

      await expect(
        scheduler.triggerManual('proj-1' as any, 'nonexistent' as CronJobId),
      ).rejects.toThrow('not found')
    })
  })

  describe('getNextRun', () => {
    it('returns next run date for scheduled job', async () => {
      const job = makeCronJob({ cronExpression: '0 * * * *' })
      const storage = createMockStorage([job])
      const executor = createMockExecutor()
      await scheduler.start({ cronJobStorage: storage, executor })

      const nextRun = scheduler.getNextRun(job.id)
      expect(nextRun).toBeInstanceOf(Date)
      expect(nextRun!.getTime()).toBeGreaterThan(Date.now())
    })

    it('returns null for unknown job', () => {
      expect(scheduler.getNextRun('unknown' as CronJobId)).toBeNull()
    })
  })

  describe('shutdown', () => {
    it('stops all scheduled crons and clears entries', async () => {
      const job1 = makeCronJob({ id: 'cron-1' as CronJobId })
      const job2 = makeCronJob({ id: 'cron-2' as CronJobId, cronExpression: '0 * * * *' })
      const storage = createMockStorage([job1, job2])
      const executor = createMockExecutor()

      await scheduler.start({ cronJobStorage: storage, executor })

      expect(scheduler.getNextRun('cron-1' as CronJobId)).toBeInstanceOf(Date)
      expect(scheduler.getNextRun('cron-2' as CronJobId)).toBeInstanceOf(Date)

      await scheduler.shutdown()

      expect(scheduler.getNextRun('cron-1' as CronJobId)).toBeNull()
      expect(scheduler.getNextRun('cron-2' as CronJobId)).toBeNull()
    })
  })

  describe('error handling', () => {
    it('handles invalid cron expression gracefully', async () => {
      const job = makeCronJob({ cronExpression: 'invalid!!!cron' })
      const storage = createMockStorage([job])
      const executor = createMockExecutor()

      // Should not throw
      await scheduler.start({ cronJobStorage: storage, executor })

      // Job should not be scheduled
      expect(scheduler.getNextRun(job.id)).toBeNull()
    })
  })

  describe('removeJob', () => {
    it('stops and removes a scheduled job', async () => {
      const job = makeCronJob()
      const storage = createMockStorage([job])
      const executor = createMockExecutor()
      await scheduler.start({ cronJobStorage: storage, executor })

      expect(scheduler.getNextRun(job.id)).toBeInstanceOf(Date)

      scheduler.removeJob(job.id)
      expect(scheduler.getNextRun(job.id)).toBeNull()
    })

    it('is a no-op for unknown job ID', () => {
      // Should not throw
      scheduler.removeJob('unknown' as CronJobId)
    })
  })
})
