import { Hono } from 'hono'
import type { ProjectId, MemoryId, IMemoryService } from '@golemancy/shared'
import { logger } from '../logger'

const log = logger.child({ component: 'routes:memories' })

export function createMemoryRoutes(storage: IMemoryService) {
  const app = new Hono()

  app.get('/', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    log.debug({ projectId }, 'listing memories')
    const memories = await storage.list(projectId)
    log.debug({ projectId, count: memories.length }, 'listed memories')
    return c.json(memories)
  })

  app.post('/', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const data = await c.req.json()
    log.debug({ projectId }, 'creating memory entry')
    const entry = await storage.create(projectId, data)
    log.debug({ projectId, memoryId: entry.id }, 'created memory entry')
    return c.json(entry, 201)
  })

  app.patch('/:id', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const memoryId = c.req.param('id') as MemoryId
    const data = await c.req.json()
    log.debug({ projectId, memoryId }, 'updating memory entry')
    const entry = await storage.update(projectId, memoryId, data)
    return c.json(entry)
  })

  app.delete('/:id', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const memoryId = c.req.param('id') as MemoryId
    log.debug({ projectId, memoryId }, 'deleting memory entry')
    await storage.delete(projectId, memoryId)
    return c.json({ ok: true })
  })

  return app
}
