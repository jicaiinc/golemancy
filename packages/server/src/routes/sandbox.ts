import { Hono } from 'hono'
import { checkSandboxReadiness } from '../agent/sandbox-readiness'
import { logger } from '../logger'

const log = logger.child({ component: 'routes:sandbox' })

export function createSandboxRoutes() {
  const app = new Hono()

  // GET /readiness?projectId=xxx — Check sandbox mode prerequisites
  app.get('/readiness', async (c) => {
    const projectId = c.req.query('projectId')
    log.debug({ projectId }, 'checking sandbox readiness')

    try {
      const result = await checkSandboxReadiness(projectId)
      return c.json(result)
    } catch (err) {
      log.error({ err, projectId }, 'failed to check sandbox readiness')
      return c.json({ error: 'Readiness check failed', detail: String(err) }, 500)
    }
  })

  return app
}
