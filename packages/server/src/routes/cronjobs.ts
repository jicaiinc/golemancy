import { Hono } from 'hono'
import type { ProjectId, CronJobId, ICronJobService } from '@solocraft/shared'
import { logger } from '../logger'

const log = logger.child({ component: 'routes:cronjobs' })

export function createCronJobRoutes(storage: ICronJobService) {
  const app = new Hono()

  app.get('/', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    log.debug({ projectId }, 'listing cron jobs')
    const jobs = await storage.list(projectId)
    log.debug({ projectId, count: jobs.length }, 'listed cron jobs')
    return c.json(jobs)
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
    const job = await storage.create(projectId, data)
    log.debug({ projectId, cronJobId: job.id }, 'created cron job')
    return c.json(job, 201)
  })

  app.patch('/:id', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const cronJobId = c.req.param('id') as CronJobId
    const data = await c.req.json()
    log.debug({ projectId, cronJobId }, 'updating cron job')
    const job = await storage.update(projectId, cronJobId, data)
    return c.json(job)
  })

  app.delete('/:id', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const cronJobId = c.req.param('id') as CronJobId
    log.debug({ projectId, cronJobId }, 'deleting cron job')
    await storage.delete(projectId, cronJobId)
    return c.json({ ok: true })
  })

  return app
}
