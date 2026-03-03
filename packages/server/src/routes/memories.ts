import { Hono } from 'hono'
import type { ProjectId, AgentId, MemoryId } from '@golemancy/shared'
import type { SqliteMemoryStorage } from '../storage/memories'
import { logger } from '../logger'

const log = logger.child({ component: 'routes:memories' })

export function createMemoryRoutes(storage: SqliteMemoryStorage) {
  const app = new Hono()

  // GET / — list all memories for an agent
  app.get('/', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const agentId = c.req.param('agentId') as AgentId
    log.debug({ projectId, agentId }, 'listing agent memories')
    const memories = await storage.list(projectId, agentId)
    return c.json(memories)
  })

  // POST / — create a new memory
  app.post('/', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const agentId = c.req.param('agentId') as AgentId
    const body = await c.req.json<{
      content: string
      pinned?: boolean
      priority?: number
      tags?: string[]
    }>()

    if (!body.content?.trim()) {
      return c.json({ error: 'CONTENT_REQUIRED' }, 400)
    }
    if (body.priority !== undefined && (typeof body.priority !== 'number' || body.priority < 0 || body.priority > 5)) {
      return c.json({ error: 'INVALID_PRIORITY' }, 400)
    }

    const memory = await storage.create(projectId, agentId, {
      content: body.content.trim(),
      pinned: body.pinned,
      priority: body.priority,
      tags: body.tags,
    })
    log.debug({ projectId, agentId, memoryId: memory.id }, 'created agent memory')
    return c.json(memory, 201)
  })

  // PATCH /:id — update a memory
  app.patch('/:id', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const agentId = c.req.param('agentId') as AgentId
    const memoryId = c.req.param('id') as MemoryId
    const body = await c.req.json<{
      content?: string
      pinned?: boolean
      priority?: number
      tags?: string[]
    }>()

    try {
      const updated = await storage.update(projectId, agentId, memoryId, {
        content: body.content?.trim(),
        pinned: body.pinned,
        priority: body.priority,
        tags: body.tags,
      })
      log.debug({ projectId, memoryId }, 'updated agent memory')
      return c.json(updated)
    } catch (err) {
      if (err instanceof Error && err.message.includes('not found')) {
        return c.json({ error: 'NOT_FOUND' }, 404)
      }
      throw err
    }
  })

  // DELETE /:id — delete a memory
  app.delete('/:id', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const agentId = c.req.param('agentId') as AgentId
    const memoryId = c.req.param('id') as MemoryId
    await storage.delete(projectId, agentId, memoryId)
    log.debug({ projectId, memoryId }, 'deleted agent memory')
    return c.json({ ok: true })
  })

  return app
}
