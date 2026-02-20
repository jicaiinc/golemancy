import { Hono } from 'hono'
import type { IGlobalDashboardService, TimeRange } from '@golemancy/shared'
import { logger } from '../logger'

const log = logger.child({ component: 'routes:global-dashboard' })

function parseTimeRange(raw?: string): TimeRange | undefined {
  if (raw === 'today' || raw === '7d' || raw === '30d' || raw === 'all') return raw
  return undefined
}

export function createGlobalDashboardRoutes(service: IGlobalDashboardService) {
  const app = new Hono()

  app.get('/summary', async (c) => {
    const timeRange = parseTimeRange(c.req.query('timeRange'))
    log.debug({ timeRange }, 'getting global dashboard summary')
    const summary = await service.getSummary(timeRange)
    return c.json(summary)
  })

  app.get('/token-by-model', async (c) => {
    const timeRange = parseTimeRange(c.req.query('timeRange'))
    log.debug({ timeRange }, 'getting global token by model')
    const data = await service.getTokenByModel(timeRange)
    return c.json(data)
  })

  app.get('/token-by-agent', async (c) => {
    const timeRange = parseTimeRange(c.req.query('timeRange'))
    log.debug({ timeRange }, 'getting global token by agent')
    const data = await service.getTokenByAgent(timeRange)
    return c.json(data)
  })

  app.get('/token-by-project', async (c) => {
    const timeRange = parseTimeRange(c.req.query('timeRange'))
    log.debug({ timeRange }, 'getting global token by project')
    const data = await service.getTokenByProject(timeRange)
    return c.json(data)
  })

  app.get('/token-trend', async (c) => {
    const days = parseInt(c.req.query('days') ?? '14', 10)
    const timeRange = parseTimeRange(c.req.query('timeRange'))
    log.debug({ days, timeRange }, 'getting global token trend')
    const trend = await service.getTokenTrend(days, timeRange)
    return c.json(trend)
  })

  app.get('/runtime-status', async (c) => {
    log.debug('getting global runtime status')
    const status = await service.getRuntimeStatus()
    return c.json(status)
  })

  return app
}
