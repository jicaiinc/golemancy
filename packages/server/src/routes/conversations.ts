import { Hono } from 'hono'
import type { ProjectId, AgentId, ConversationId } from '@solocraft/shared'
import type { SqliteConversationStorage } from '../storage/conversations'

export function createConversationRoutes(storage: SqliteConversationStorage) {
  const app = new Hono()

  app.get('/', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const agentId = c.req.query('agentId') as AgentId | undefined
    const conversations = await storage.list(projectId, agentId)
    return c.json(conversations)
  })

  app.get('/:id', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const conv = await storage.getById(projectId, c.req.param('id') as ConversationId)
    if (!conv) return c.json({ error: 'Not found' }, 404)
    return c.json(conv)
  })

  app.post('/', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const { agentId, title } = await c.req.json()
    const conv = await storage.create(projectId, agentId, title)
    return c.json(conv, 201)
  })

  app.delete('/:id', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    await storage.delete(projectId, c.req.param('id') as ConversationId)
    return c.json({ ok: true })
  })

  // Paginated messages
  app.get('/:convId/messages', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const convId = c.req.param('convId') as ConversationId
    const page = parseInt(c.req.query('page') ?? '1', 10)
    const pageSize = parseInt(c.req.query('pageSize') ?? '50', 10)
    const result = await storage.getMessages(projectId, convId, { page, pageSize })
    return c.json(result)
  })

  // FTS5 message search
  app.get('/messages/search', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const q = c.req.query('q') ?? ''
    const page = parseInt(c.req.query('page') ?? '1', 10)
    const pageSize = parseInt(c.req.query('pageSize') ?? '20', 10)
    const result = await storage.searchMessages(projectId, q, { page, pageSize })
    return c.json(result)
  })

  return app
}
