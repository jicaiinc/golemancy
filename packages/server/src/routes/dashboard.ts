import { Hono } from 'hono'
import type { IDashboardService } from '@solocraft/shared'

export function createDashboardRoutes(service: IDashboardService) {
  const app = new Hono()

  app.get('/summary', async (c) => {
    const summary = await service.getSummary()
    return c.json(summary)
  })

  app.get('/active-agents', async (c) => {
    const agents = await service.getActiveAgents()
    return c.json(agents)
  })

  app.get('/recent-tasks', async (c) => {
    const limit = parseInt(c.req.query('limit') ?? '10', 10)
    const tasks = await service.getRecentTasks(limit)
    return c.json(tasks)
  })

  app.get('/activity', async (c) => {
    const limit = parseInt(c.req.query('limit') ?? '20', 10)
    const feed = await service.getActivityFeed(limit)
    return c.json(feed)
  })

  return app
}
