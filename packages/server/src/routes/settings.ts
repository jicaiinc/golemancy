import { Hono } from 'hono'
import type { ISettingsService } from '@golemancy/shared'
import { logger } from '../logger'

const log = logger.child({ component: 'routes:settings' })

export function createSettingsRoutes(storage: ISettingsService) {
  const app = new Hono()

  app.get('/', async (c) => {
    log.debug('getting settings')
    const settings = await storage.get()
    return c.json(settings)
  })

  app.patch('/', async (c) => {
    const data = await c.req.json()
    log.debug('updating settings')
    const updated = await storage.update(data)
    return c.json(updated)
  })

  return app
}
