import { Hono } from 'hono'
import type { IDashboardService } from '@golemancy/shared'
import { logger } from '../logger'

const log = logger.child({ component: 'routes:dashboard' })

export function createDashboardRoutes(service: IDashboardService) {
  const app = new Hono()

  app.get('/summary', async (c) => {
    log.debug('getting dashboard summary')
    const summary = await service.getSummary()
    return c.json(summary)
  })

  app.get('/active-agents', async (c) => {
    log.debug('getting active agents')
    const agents = await service.getActiveAgents()
    return c.json(agents)
  })

  app.get('/recent-tasks', async (c) => {
    const limit = parseInt(c.req.query('limit') ?? '10', 10)
    log.debug({ limit }, 'getting recent tasks')
    const tasks = await service.getRecentTasks(limit)
    return c.json(tasks)
  })

  app.get('/activity', async (c) => {
    const limit = parseInt(c.req.query('limit') ?? '20', 10)
    log.debug({ limit }, 'getting activity feed')
    const feed = await service.getActivityFeed(limit)
    return c.json(feed)
  })

  return app
}
