import { Hono } from 'hono'
import { convertToModelMessages, type UIMessage } from 'ai'
import type {
  ProjectId, AgentId, ConversationId, MessageId, TeamId,
  IConversationService, IAgentService, ISettingsService,
} from '@golemancy/shared'
import type { TokenRecordStorage } from '../storage/token-records'
import type { CompactRecordStorage } from '../storage/compact-records'
import { resolveModel } from '../agent/model'
import { compactConversation } from '../agent/compact'
import { resolveUploadsForClient, extractUploads } from '../utils/message-parts'
import { logger } from '../logger'

const log = logger.child({ component: 'routes:conversations' })

/** Derive the server's base URL from the incoming request for upload URL resolution */
function getBaseUrl(c: { req: { url: string } }): string {
  const url = new URL(c.req.url)
  return `${url.protocol}//${url.host}`
}

export interface ConversationRouteDeps {
  conversationStorage: IConversationService
  tokenRecordStorage: TokenRecordStorage
  compactRecordStorage: CompactRecordStorage
  agentStorage: IAgentService
  settingsStorage: ISettingsService
}

export function createConversationRoutes(deps: ConversationRouteDeps) {
  const { conversationStorage: storage, tokenRecordStorage, agentStorage } = deps
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
    if (!conv) return c.json({ error: 'NOT_FOUND' }, 404)
    // Resolve golemancy-upload: references to HTTP URLs for client rendering
    const baseUrl = getBaseUrl(c)
    const compactRecords = await deps.compactRecordStorage.list(projectId, convId)
    const resolved = {
      ...conv,
      compactRecords,
      messages: conv.messages.map(m => ({
        ...m,
        parts: resolveUploadsForClient(projectId, baseUrl, m.parts),
      })),
    }
    return c.json(resolved)
  })

  app.post('/', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const { agentId, title, teamId } = await c.req.json()
    log.debug({ projectId, agentId }, 'creating conversation')
    const conv = await storage.create(projectId, agentId, title, teamId)
    log.debug({ projectId, conversationId: conv.id }, 'created conversation')
    return c.json(conv, 201)
  })

  app.patch('/:id', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const convId = c.req.param('id') as ConversationId
    const data = await c.req.json<{ title?: string; agentId?: AgentId; teamId?: TeamId | null }>()
    log.debug({ projectId, conversationId: convId }, 'updating conversation')
    const conv = await storage.update(projectId, convId, data)
    return c.json(conv)
  })

  app.delete('/:id', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const convId = c.req.param('id') as ConversationId
    log.debug({ projectId, conversationId: convId }, 'deleting conversation')
    await storage.delete(projectId, convId)
    return c.json({ ok: true })
  })

  // Save a message (with dedup by ID) — extracts base64 uploads to disk
  app.post('/:convId/messages', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const convId = c.req.param('convId') as ConversationId
    const { id, role, parts, content } = await c.req.json<{ id: string; role: string; parts: unknown[]; content: string }>()

    if (!id || !role || !Array.isArray(parts)) {
      return c.json({ error: 'MESSAGE_FIELDS_REQUIRED' }, 400)
    }

    const ALLOWED_ROLES = ['user', 'assistant']
    if (!ALLOWED_ROLES.includes(role)) {
      return c.json({ error: 'INVALID_MESSAGE_ROLE' }, 400)
    }

    log.debug({ projectId, conversationId: convId, messageId: id, role }, 'saving message')
    const extractedParts = await extractUploads(projectId, parts)
    await storage.saveMessage(projectId, convId, { id: id as MessageId, role, parts: extractedParts, content: content ?? '' })
    return c.json({ ok: true }, 201)
  })

  // Paginated messages — resolve upload references to HTTP URLs
  app.get('/:convId/messages', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const convId = c.req.param('convId') as ConversationId
    const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(c.req.query('pageSize') ?? '50', 10) || 50))
    log.debug({ projectId, conversationId: convId, page, pageSize }, 'listing messages')
    const result = await storage.getMessages(projectId, convId, { page, pageSize })
    const baseUrl = getBaseUrl(c)
    return c.json({
      ...result,
      items: result.items.map(m => ({
        ...m,
        parts: resolveUploadsForClient(projectId, baseUrl, m.parts),
      })),
    })
  })

  // FTS5 message search — resolve upload references to HTTP URLs
  app.get('/messages/search', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const q = c.req.query('q') ?? ''
    const page = parseInt(c.req.query('page') ?? '1', 10)
    const pageSize = parseInt(c.req.query('pageSize') ?? '20', 10)
    log.debug({ projectId, page, pageSize }, 'searching messages')
    const result = await storage.searchMessages(projectId, q, { page, pageSize })
    log.debug({ projectId, resultCount: result.items.length, total: result.total }, 'search results')
    const baseUrl = getBaseUrl(c)
    return c.json({
      ...result,
      items: result.items.map(m => ({
        ...m,
        parts: resolveUploadsForClient(projectId, baseUrl, m.parts),
      })),
    })
  })

  // Manual compact
  app.post('/:convId/compact', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const convId = c.req.param('convId') as ConversationId
    log.info({ projectId, conversationId: convId }, 'manual compact requested')

    const conv = await storage.getById(projectId, convId)
    if (!conv) return c.json({ error: 'NOT_FOUND' }, 404)
    if (conv.messages.length === 0) return c.json({ error: 'NO_MESSAGES_TO_COMPACT' }, 400)

    const agent = await agentStorage.getById(projectId, conv.agentId)
    if (!agent) return c.json({ error: 'AGENT_NOT_FOUND' }, 404)

    const settings = await deps.settingsStorage.get()
    const model = await resolveModel(settings, agent.modelConfig)

    const uiMessages: UIMessage[] = conv.messages.map(m => ({
      id: m.id,
      role: m.role,
      parts: m.parts as UIMessage['parts'],
    }))
    const modelMessages = await convertToModelMessages(uiMessages)

    let result
    try {
      result = await compactConversation({
        messages: modelMessages,
        model,
        systemPrompt: agent.systemPrompt,
        signal: c.req.raw.signal,
      })
    } catch (err) {
      log.error({ err, conversationId: convId }, 'manual compact failed')
      const message = err instanceof Error ? err.message : 'Compact failed'
      return c.json({ error: message }, 500)
    }

    const lastMsg = conv.messages.at(-1)!
    const record = await deps.compactRecordStorage.save(projectId, {
      conversationId: convId,
      summary: result.summary,
      boundaryMessageId: lastMsg.id,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      trigger: 'manual',
    })

    // Record compact token usage
    deps.tokenRecordStorage.save(projectId, {
      conversationId: convId,
      agentId: agent.id,
      provider: agent.modelConfig.provider,
      model: agent.modelConfig.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      source: 'compact',
    })

    log.info({ conversationId: convId, compactId: record.id }, 'manual compact completed')
    return c.json(record, 201)
  })

  // Token usage breakdown for a conversation
  app.get('/:conversationId/token-usage', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const conversationId = c.req.param('conversationId') as ConversationId
    log.debug({ projectId, conversationId }, 'getting conversation token usage')

    const usage = tokenRecordStorage.getConversationUsage(projectId, conversationId)

    // Resolve agent names
    const agents = await agentStorage.list(projectId)
    const agentMap = new Map(agents.map(a => [a.id, a.name]))

    return c.json({
      total: usage.total,
      byAgent: usage.byAgent.map(a => ({
        ...a,
        name: agentMap.get(a.agentId as AgentId) ?? 'Unknown',
      })),
      byModel: usage.byModel,
    })
  })

  return app
}
