import { Hono } from 'hono'
import type { ProjectId, AgentId, ConversationId, MessageId, IConversationService } from '@solocraft/shared'
import { logger } from '../logger'

const log = logger.child({ component: 'routes:conversations' })

export function createConversationRoutes(storage: IConversationService) {
  const app = new Hono()

  app.get('/', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const agentId = c.req.query('agentId') as AgentId | undefined
    log.debug({ projectId, agentId }, 'listing conversations')
    const conversations = await storage.list(projectId, agentId)
    log.debug({ projectId, count: conversations.length }, 'listed conversations')
    return c.json(conversations)
  })

  app.get('/:id', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const convId = c.req.param('id') as ConversationId
    log.debug({ projectId, conversationId: convId }, 'getting conversation')
    const conv = await storage.getById(projectId, convId)
    if (!conv) return c.json({ error: 'Not found' }, 404)
    return c.json(conv)
  })

  app.post('/', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const { agentId, title } = await c.req.json()
    log.debug({ projectId, agentId }, 'creating conversation')
    const conv = await storage.create(projectId, agentId, title)
    log.debug({ projectId, conversationId: conv.id }, 'created conversation')
    return c.json(conv, 201)
  })

  app.delete('/:id', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const convId = c.req.param('id') as ConversationId
    log.debug({ projectId, conversationId: convId }, 'deleting conversation')
    await storage.delete(projectId, convId)
    return c.json({ ok: true })
  })

  // Save a message (with dedup by ID)
  app.post('/:convId/messages', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const convId = c.req.param('convId') as ConversationId
    const { id, role, content } = await c.req.json<{ id: string; role: string; content: string }>()

    if (!id || !role || content == null) {
      return c.json({ error: 'id, role, and content are required' }, 400)
    }

    const ALLOWED_ROLES = ['user', 'assistant']
    if (!ALLOWED_ROLES.includes(role)) {
      return c.json({ error: `Invalid role: ${role}` }, 400)
    }

    log.debug({ projectId, conversationId: convId, messageId: id, role }, 'saving message')
    await storage.saveMessage(projectId, convId, { id: id as MessageId, role, content })
    return c.json({ ok: true }, 201)
  })

  // Paginated messages
  app.get('/:convId/messages', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const convId = c.req.param('convId') as ConversationId
    const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(c.req.query('pageSize') ?? '50', 10) || 50))
    log.debug({ projectId, conversationId: convId, page, pageSize }, 'listing messages')
    const result = await storage.getMessages(projectId, convId, { page, pageSize })
    return c.json(result)
  })

  // FTS5 message search
  app.get('/messages/search', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const q = c.req.query('q') ?? ''
    const page = parseInt(c.req.query('page') ?? '1', 10)
    const pageSize = parseInt(c.req.query('pageSize') ?? '20', 10)
    log.debug({ projectId, page, pageSize }, 'searching messages')
    const result = await storage.searchMessages(projectId, q, { page, pageSize })
    log.debug({ projectId, resultCount: result.items.length, total: result.total }, 'search results')
    return c.json(result)
  })

  return app
}
