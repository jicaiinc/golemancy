import { Hono } from 'hono'
import type { IDashboardService, ProjectId } from '@golemancy/shared'
import { logger } from '../logger'
import { parseTimeRange } from '../utils/time-range'

const log = logger.child({ component: 'routes:dashboard' })

export function createDashboardRoutes(service: IDashboardService) {
  const app = new Hono()

  app.get('/summary', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const timeRange = parseTimeRange(c.req.query('timeRange'))
    log.debug({ projectId, timeRange }, 'getting dashboard summary')
    const summary = await service.getSummary(projectId, timeRange)
    return c.json(summary)
  })

  app.get('/agent-stats', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const timeRange = parseTimeRange(c.req.query('timeRange'))
    log.debug({ projectId, timeRange }, 'getting agent stats')
    const stats = await service.getAgentStats(projectId, timeRange)
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
    const timeRange = parseTimeRange(c.req.query('timeRange'))
    log.debug({ projectId, days, timeRange }, 'getting token trend')
    const trend = await service.getTokenTrend(projectId, days, timeRange)
    return c.json(trend)
  })

  app.get('/token-by-model', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const timeRange = parseTimeRange(c.req.query('timeRange'))
    log.debug({ projectId, timeRange }, 'getting token by model')
    const data = await service.getTokenByModel(projectId, timeRange)
    return c.json(data)
  })

  app.get('/token-by-agent', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const timeRange = parseTimeRange(c.req.query('timeRange'))
    log.debug({ projectId, timeRange }, 'getting token by agent')
    const data = await service.getTokenByAgent(projectId, timeRange)
    return c.json(data)
  })

  app.get('/runtime-status', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    log.debug({ projectId }, 'getting runtime status')
    const status = await service.getRuntimeStatus(projectId)
    return c.json(status)
  })

  return app
}
