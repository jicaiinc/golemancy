import { Hono } from 'hono'
import type { IDashboardService, ProjectId } from '@golemancy/shared'
import { logger } from '../logger'

const log = logger.child({ component: 'routes:dashboard' })

export function createDashboardRoutes(service: IDashboardService) {
  const app = new Hono()

  app.get('/summary', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    log.debug({ projectId }, 'getting dashboard summary')
    const summary = await service.getSummary(projectId)
    return c.json(summary)
  })

  app.get('/agent-stats', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    log.debug({ projectId }, 'getting agent stats')
    const stats = await service.getAgentStats(projectId)
    return c.json(stats)
  })

  app.get('/recent-chats', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const limit = parseInt(c.req.query('limit') ?? '10', 10)
    log.debug({ projectId, limit }, 'getting recent chats')
    const chats = await service.getRecentChats(projectId, limit)
    return c.json(chats)
  })

  app.get('/token-trend', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const days = parseInt(c.req.query('days') ?? '14', 10)
    log.debug({ projectId, days }, 'getting token trend')
    const trend = await service.getTokenTrend(projectId, days)
    return c.json(trend)
  })

  return app
}
