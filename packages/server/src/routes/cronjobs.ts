import { Hono } from 'hono'
import { Cron } from 'croner'
import type { ProjectId, CronJobId, ICronJobService } from '@golemancy/shared'
import type { SqliteCronJobRunStorage } from '../storage/cron-job-runs'
import { cronScheduler } from '../scheduler'
import { logger } from '../logger'

const log = logger.child({ component: 'routes:cronjobs' })

function validateCronExpression(expression: string): boolean {
  try {
    const c = new Cron(expression)
    c.stop()
    return true
  } catch {
    return false
  }
}

export interface CronJobRouteDeps {
  storage: ICronJobService
  runStorage: SqliteCronJobRunStorage
}

export function createCronJobRoutes(deps: CronJobRouteDeps) {
  const { storage, runStorage } = deps
  const app = new Hono()

  app.get('/', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    log.debug({ projectId }, 'listing cron jobs')
    const jobs = await storage.list(projectId)
    log.debug({ projectId, count: jobs.length }, 'listed cron jobs')
    return c.json(jobs)
  })

  // GET /runs must be registered BEFORE /:id to avoid route conflict
  app.get('/runs', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const limit = parseInt(c.req.query('limit') ?? '50', 10)
    log.debug({ projectId, limit }, 'listing all cron job runs for project')
    const runs = await runStorage.listByProject(projectId, limit)
    return c.json(runs)
  })

  app.get('/:id', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const cronJobId = c.req.param('id') as CronJobId
    log.debug({ projectId, cronJobId }, 'getting cron job')
    const job = await storage.getById(projectId, cronJobId)
    if (!job) return c.json({ error: 'Not found' }, 404)
    return c.json(job)
  })

  app.post('/', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const data = await c.req.json()
    log.debug({ projectId }, 'creating cron job')

    // Default scheduleType to 'cron'
    if (!data.scheduleType) data.scheduleType = 'cron'

    if (data.scheduleType === 'once') {
      // Validate scheduledAt for one-time schedules
      if (!data.scheduledAt || isNaN(new Date(data.scheduledAt).getTime())) {
        return c.json({ error: 'scheduledAt is required and must be a valid date for one-time schedules' }, 400)
      }
    } else {
      // Validate cron expression for recurring schedules
      if (data.cronExpression && !validateCronExpression(data.cronExpression)) {
        return c.json({ error: 'Invalid cron expression' }, 400)
      }
    }

    const job = await storage.create(projectId, data)
    log.debug({ projectId, cronJobId: job.id }, 'created cron job')

    // Schedule the job if enabled
    cronScheduler.rescheduleJob(job)

    return c.json(job, 201)
  })

  app.patch('/:id', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const cronJobId = c.req.param('id') as CronJobId
    const data = await c.req.json()
    log.debug({ projectId, cronJobId }, 'updating cron job')

    if (data.scheduleType === 'once') {
      if (data.scheduledAt !== undefined && isNaN(new Date(data.scheduledAt).getTime())) {
        return c.json({ error: 'scheduledAt must be a valid date' }, 400)
      }
    } else if (data.scheduleType === 'cron' || data.cronExpression) {
      // Validate cron expression if provided
      if (data.cronExpression && !validateCronExpression(data.cronExpression)) {
        return c.json({ error: 'Invalid cron expression' }, 400)
      }
    }

    const job = await storage.update(projectId, cronJobId, data)

    // Reschedule the job
    cronScheduler.rescheduleJob(job)

    return c.json(job)
  })

  app.delete('/:id', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const cronJobId = c.req.param('id') as CronJobId
    log.debug({ projectId, cronJobId }, 'deleting cron job')
    await storage.delete(projectId, cronJobId)

    // Remove from scheduler
    cronScheduler.removeJob(cronJobId)

    return c.json({ ok: true })
  })

  app.post('/:id/trigger', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const cronJobId = c.req.param('id') as CronJobId
    log.debug({ projectId, cronJobId }, 'manually triggering cron job')

    try {
      await cronScheduler.triggerManual(projectId, cronJobId)
      return c.json({ ok: true, cronJobId })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log.error({ projectId, cronJobId, err }, 'failed to trigger cron job')
      return c.json({ error: message }, 500)
    }
  })

  app.get('/:id/runs', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const cronJobId = c.req.param('id') as CronJobId
    const limit = parseInt(c.req.query('limit') ?? '50', 10)
    log.debug({ projectId, cronJobId, limit }, 'listing cron job runs')
    const runs = await runStorage.listByJob(projectId, cronJobId, limit)
    return c.json(runs)
  })

  return app
}
