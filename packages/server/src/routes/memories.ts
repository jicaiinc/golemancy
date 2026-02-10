import { Hono } from 'hono'
import type { ProjectId, MemoryId, IMemoryService } from '@solocraft/shared'

export function createMemoryRoutes(storage: IMemoryService) {
  const app = new Hono()

  app.get('/', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const memories = await storage.list(projectId)
    return c.json(memories)
  })

  app.post('/', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const data = await c.req.json()
    const entry = await storage.create(projectId, data)
    return c.json(entry, 201)
  })

  app.patch('/:id', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const data = await c.req.json()
    const entry = await storage.update(projectId, c.req.param('id') as MemoryId, data)
    return c.json(entry)
  })

  app.delete('/:id', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    await storage.delete(projectId, c.req.param('id') as MemoryId)
    return c.json({ ok: true })
  })

  return app
}
