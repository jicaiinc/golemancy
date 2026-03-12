import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Conversation, Message, ProjectId, AgentId, ConversationId, MessageId } from '@golemancy/shared'
import { createTestApp, makeRequest, type MockStorage } from '../test/route-helpers'
import type { Hono } from 'hono'

const projId = 'proj-1' as ProjectId
const agentId = 'agent-1' as AgentId
const convId = 'conv-1' as ConversationId
const msgId = 'msg-1' as MessageId

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: convId,
    projectId: projId,
    agentId,
    title: 'Test Conversation',
    messages: [],
    lastMessageAt: '2026-01-01T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: msgId,
    conversationId: convId,
    role: 'user',
    parts: [{ type: 'text', text: 'hello' }],
    content: 'hello',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('Conversations routes', () => {
  let app: Hono
  let mocks: MockStorage

  beforeEach(() => {
    ({ app, mocks } = createTestApp())
  })

  describe('GET /api/projects/:projectId/conversations', () => {
    it('returns empty list', async () => {
      const res = await makeRequest(app, 'GET', `/api/projects/${projId}/conversations`)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual([])
    })

    it('returns conversations', async () => {
      vi.mocked(mocks.conversationStorage.list).mockResolvedValue([makeConversation()])

      const res = await makeRequest(app, 'GET', `/api/projects/${projId}/conversations`)
      expect(res.status).toBe(200)
      expect(await res.json()).toHaveLength(1)
    })

    it('filters by agentId query param', async () => {
      await makeRequest(app, 'GET', `/api/projects/${projId}/conversations?agentId=${agentId}`)
      expect(mocks.conversationStorage.list).toHaveBeenCalledWith(projId, agentId)
    })
  })

  describe('GET /api/projects/:projectId/conversations/:id', () => {
    it('returns conversation when found', async () => {
      vi.mocked(mocks.conversationStorage.getById).mockResolvedValue(makeConversation())

      const res = await makeRequest(app, 'GET', `/api/projects/${projId}/conversations/${convId}`)
      expect(res.status).toBe(200)
      expect((await res.json()).title).toBe('Test Conversation')
    })

    it('returns 404 when not found', async () => {
      const res = await makeRequest(app, 'GET', `/api/projects/${projId}/conversations/missing`)
      expect(res.status).toBe(404)
    })
  })

  describe('POST /api/projects/:projectId/conversations', () => {
    it('creates conversation and returns 201', async () => {
      vi.mocked(mocks.conversationStorage.create).mockResolvedValue(makeConversation())

      const res = await makeRequest(app, 'POST', `/api/projects/${projId}/conversations`, {
        agentId,
        title: 'Test Conversation',
      })
      expect(res.status).toBe(201)
      expect((await res.json()).title).toBe('Test Conversation')
    })
  })

  describe('PATCH /api/projects/:projectId/conversations/:id', () => {
    it('updates conversation title', async () => {
      const updated = makeConversation({ title: 'Renamed' })
      vi.mocked(mocks.conversationStorage.update).mockResolvedValue(updated)

      const res = await makeRequest(app, 'PATCH', `/api/projects/${projId}/conversations/${convId}`, {
        title: 'Renamed',
      })
      expect(res.status).toBe(200)
      expect((await res.json()).title).toBe('Renamed')
    })
  })

  describe('DELETE /api/projects/:projectId/conversations/:id', () => {
    it('deletes conversation', async () => {
      const res = await makeRequest(app, 'DELETE', `/api/projects/${projId}/conversations/${convId}`)
      expect(res.status).toBe(200)
      expect((await res.json()).ok).toBe(true)
      expect(mocks.conversationStorage.delete).toHaveBeenCalledWith(projId, convId)
    })
  })

  describe('POST /api/projects/:projectId/conversations/:convId/messages', () => {
    it('saves message and returns 201', async () => {
      const res = await makeRequest(app, 'POST', `/api/projects/${projId}/conversations/${convId}/messages`, {
        id: msgId,
        role: 'user',
        parts: [{ type: 'text', text: 'hello' }],
        content: 'hello',
      })
      expect(res.status).toBe(201)
      expect((await res.json()).ok).toBe(true)
      expect(mocks.conversationStorage.saveMessage).toHaveBeenCalledWith(
        projId, convId,
        { id: msgId, role: 'user', parts: [{ type: 'text', text: 'hello' }], content: 'hello' },
      )
    })

    it('returns 400 when id is missing', async () => {
      const res = await makeRequest(app, 'POST', `/api/projects/${projId}/conversations/${convId}/messages`, {
        role: 'user',
        parts: [{ type: 'text', text: 'hello' }],
      })
      expect(res.status).toBe(400)
    })

    it('returns 400 when parts is not an array', async () => {
      const res = await makeRequest(app, 'POST', `/api/projects/${projId}/conversations/${convId}/messages`, {
        id: msgId,
        role: 'user',
        parts: 'not-array',
      })
      expect(res.status).toBe(400)
    })

    it('returns 400 for invalid role', async () => {
      const res = await makeRequest(app, 'POST', `/api/projects/${projId}/conversations/${convId}/messages`, {
        id: msgId,
        role: 'system',
        parts: [],
      })
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('INVALID_MESSAGE_ROLE')
    })
  })

  describe('GET /api/projects/:projectId/conversations/:convId/messages', () => {
    it('returns paginated messages', async () => {
      vi.mocked(mocks.conversationStorage.getMessages).mockResolvedValue({
        items: [makeMessage()],
        total: 1,
        page: 1,
        pageSize: 50,
      })

      const res = await makeRequest(app, 'GET', `/api/projects/${projId}/conversations/${convId}/messages`)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.items).toHaveLength(1)
      expect(body.total).toBe(1)
    })

    it('passes pagination params', async () => {
      vi.mocked(mocks.conversationStorage.getMessages).mockResolvedValue({
        items: [],
        total: 0,
        page: 2,
        pageSize: 10,
      })

      await makeRequest(app, 'GET', `/api/projects/${projId}/conversations/${convId}/messages?page=2&pageSize=10`)
      expect(mocks.conversationStorage.getMessages).toHaveBeenCalledWith(projId, convId, { page: 2, pageSize: 10 })
    })

    it('clamps pageSize to 1-100', async () => {
      vi.mocked(mocks.conversationStorage.getMessages).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 })

      await makeRequest(app, 'GET', `/api/projects/${projId}/conversations/${convId}/messages?pageSize=999`)
      expect(mocks.conversationStorage.getMessages).toHaveBeenCalledWith(projId, convId, { page: 1, pageSize: 100 })
    })
  })

  describe('GET /api/projects/:projectId/conversations/messages/search', () => {
    it('searches messages with FTS5', async () => {
      vi.mocked(mocks.conversationStorage.searchMessages).mockResolvedValue({
        items: [makeMessage()],
        total: 1,
        page: 1,
        pageSize: 20,
      })

      const res = await makeRequest(app, 'GET', `/api/projects/${projId}/conversations/messages/search?q=hello`)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.items).toHaveLength(1)
      expect(mocks.conversationStorage.searchMessages).toHaveBeenCalledWith(projId, 'hello', { page: 1, pageSize: 20 })
    })

    it('passes pagination to search', async () => {
      vi.mocked(mocks.conversationStorage.searchMessages).mockResolvedValue({ items: [], total: 0, page: 2, pageSize: 10 })

      await makeRequest(app, 'GET', `/api/projects/${projId}/conversations/messages/search?q=test&page=2&pageSize=10`)
      expect(mocks.conversationStorage.searchMessages).toHaveBeenCalledWith(projId, 'test', { page: 2, pageSize: 10 })
    })
  })
})
