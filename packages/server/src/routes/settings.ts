import { Hono } from 'hono'
import type { ISettingsService } from '@solocraft/shared'

export function createSettingsRoutes(storage: ISettingsService) {
  const app = new Hono()

  app.get('/', async (c) => {
    const settings = await storage.get()
    return c.json(settings)
  })

  app.patch('/', async (c) => {
    const data = await c.req.json()
    const updated = await storage.update(data)
    return c.json(updated)
  })

  return app
}
