import { Hono } from 'hono'
import type { OAuthManager } from '../auth/oauth-manager'
import { logger } from '../logger'

const log = logger.child({ component: 'routes:oauth' })

export function createOAuthRoutes(oauthManager: OAuthManager) {
  const app = new Hono()

  // Start OAuth flow
  app.post('/providers/:slug/start', async (c) => {
    const slug = c.req.param('slug')
    log.info({ slug }, 'starting OAuth flow')
    try {
      const { authUrl } = await oauthManager.startFlow(slug)
      return c.json({ authUrl })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log.error({ slug, error: message }, 'failed to start OAuth flow')
      return c.json({ error: message }, 400)
    }
  })

  // Poll flow status
  app.get('/providers/:slug/status', (c) => {
    const slug = c.req.param('slug')
    const status = oauthManager.getFlowStatus(slug)
    return c.json(status)
  })

  // Cancel flow
  app.post('/providers/:slug/cancel', (c) => {
    const slug = c.req.param('slug')
    log.info({ slug }, 'cancelling OAuth flow')
    oauthManager.cancelFlow(slug)
    return c.json({ ok: true })
  })

  // Disconnect (clear tokens)
  app.post('/providers/:slug/disconnect', async (c) => {
    const slug = c.req.param('slug')
    log.info({ slug }, 'disconnecting OAuth')
    await oauthManager.disconnect(slug)
    return c.json({ ok: true })
  })

  return app
}
