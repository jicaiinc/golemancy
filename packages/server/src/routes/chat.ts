import { Hono } from 'hono'

export function createChatRoute() {
  const app = new Hono()

  app.post('/', async (c) => {
    // Placeholder — full implementation in Task #10 (Agent Runtime)
    return c.json({ error: 'Not implemented' }, 501)
  })

  return app
}
