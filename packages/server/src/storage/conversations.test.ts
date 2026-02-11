import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb } from '../test/helpers'
import { SqliteConversationStorage } from './conversations'
import type { AppDatabase } from '../db/client'
import type { ProjectId, AgentId, ConversationId, MessageId } from '@solocraft/shared'

describe('SqliteConversationStorage', () => {
  let db: AppDatabase
  let close: () => void
  let storage: SqliteConversationStorage

  const projId = 'proj-1' as ProjectId
  const projId2 = 'proj-2' as ProjectId
  const agentId1 = 'agent-1' as AgentId
  const agentId2 = 'agent-2' as AgentId

  beforeEach(() => {
    const test = createTestDb()
    db = test.db
    close = test.close
    // All projects share the same in-memory DB for test simplicity
    storage = new SqliteConversationStorage(() => db)
  })

  afterEach(() => {
    close()
  })

  describe('create', () => {
    it('creates conversation with generated id', async () => {
      const conv = await storage.create(projId, agentId1, 'Test Chat')
      expect(conv.id).toMatch(/^conv-/)
      expect(conv.projectId).toBe(projId)
      expect(conv.agentId).toBe(agentId1)
      expect(conv.title).toBe('Test Chat')
      expect(conv.messages).toEqual([])
      expect(conv.createdAt).toBeTruthy()
    })
  })

  describe('list', () => {
    it('filters by projectId', async () => {
      await storage.create(projId, agentId1, 'Chat 1')
      await storage.create(projId2, agentId1, 'Chat 2')

      const result = await storage.list(projId)
      expect(result).toHaveLength(1)
      expect(result[0].projectId).toBe(projId)
    })

    it('filters by agentId when provided', async () => {
      await storage.create(projId, agentId1, 'Agent1 Chat')
      await storage.create(projId, agentId2, 'Agent2 Chat')

      const result = await storage.list(projId, agentId1)
      expect(result).toHaveLength(1)
      expect(result[0].agentId).toBe(agentId1)
    })

    it('returns all conversations for project when no agentId', async () => {
      await storage.create(projId, agentId1, 'Chat 1')
      await storage.create(projId, agentId2, 'Chat 2')

      const result = await storage.list(projId)
      expect(result).toHaveLength(2)
    })

    it('returns empty for unknown project', async () => {
      const result = await storage.list('proj-999' as ProjectId)
      expect(result).toEqual([])
    })
  })

  describe('getById', () => {
    it('returns existing conversation', async () => {
      const created = await storage.create(projId, agentId1, 'My Chat')
      const found = await storage.getById(projId, created.id)
      expect(found).not.toBeNull()
      expect(found!.title).toBe('My Chat')
    })

    it('returns null for wrong projectId', async () => {
      const created = await storage.create(projId, agentId1, 'My Chat')
      const found = await storage.getById(projId2, created.id)
      expect(found).toBeNull()
    })

    it('returns null for unknown id', async () => {
      const found = await storage.getById(projId, 'conv-999' as ConversationId)
      expect(found).toBeNull()
    })
  })

  describe('sendMessage', () => {
    it('inserts a user message', async () => {
      const conv = await storage.create(projId, agentId1, 'Chat')
      await storage.sendMessage(projId, conv.id, 'Hello world')

      const msgs = await storage.getMessages(projId, conv.id, { page: 1, pageSize: 50 })
      expect(msgs.items).toHaveLength(1)
      expect(msgs.items[0].role).toBe('user')
      expect(msgs.items[0].content).toBe('Hello world')
    })

    it('updates conversation lastMessageAt', async () => {
      const conv = await storage.create(projId, agentId1, 'Chat')
      const originalTime = conv.lastMessageAt

      await new Promise(r => setTimeout(r, 15))
      await storage.sendMessage(projId, conv.id, 'Hello')

      const updated = await storage.getById(projId, conv.id)
      expect(new Date(updated!.lastMessageAt).getTime())
        .toBeGreaterThan(new Date(originalTime).getTime())
    })
  })

  describe('delete', () => {
    it('deletes conversation', async () => {
      const conv = await storage.create(projId, agentId1, 'To Delete')
      await storage.delete(projId, conv.id)

      const found = await storage.getById(projId, conv.id)
      expect(found).toBeNull()
    })

    it('cascades delete to messages', async () => {
      const conv = await storage.create(projId, agentId1, 'Chat')
      await storage.sendMessage(projId, conv.id, 'Msg 1')
      await storage.sendMessage(projId, conv.id, 'Msg 2')

      await storage.delete(projId, conv.id)

      // After deletion, conversation no longer exists so getMessages throws
      await expect(
        storage.getMessages(projId, conv.id, { page: 1, pageSize: 50 }),
      ).rejects.toThrow('not found')
    })

    it('does not delete conversation from different project', async () => {
      const conv = await storage.create(projId, agentId1, 'Keep Me')
      await storage.delete(projId2, conv.id)

      const found = await storage.getById(projId, conv.id)
      expect(found).not.toBeNull()
    })
  })

  describe('getMessages', () => {
    it('paginates messages', async () => {
      const conv = await storage.create(projId, agentId1, 'Chat')
      for (let i = 0; i < 5; i++) {
        await storage.sendMessage(projId, conv.id, `Msg ${i}`)
      }

      const page1 = await storage.getMessages(projId, conv.id, { page: 1, pageSize: 2 })
      expect(page1.items).toHaveLength(2)
      expect(page1.total).toBe(5)
      expect(page1.page).toBe(1)
      expect(page1.pageSize).toBe(2)

      const page2 = await storage.getMessages(projId, conv.id, { page: 2, pageSize: 2 })
      expect(page2.items).toHaveLength(2)

      const page3 = await storage.getMessages(projId, conv.id, { page: 3, pageSize: 2 })
      expect(page3.items).toHaveLength(1)
    })

    it('orders messages newest first', async () => {
      const conv = await storage.create(projId, agentId1, 'Chat')
      await storage.sendMessage(projId, conv.id, 'First')
      await new Promise(r => setTimeout(r, 15))
      await storage.sendMessage(projId, conv.id, 'Second')

      const result = await storage.getMessages(projId, conv.id, { page: 1, pageSize: 50 })
      expect(result.items[0].content).toBe('Second')
      expect(result.items[1].content).toBe('First')
    })

    it('returns empty for conversation with no messages', async () => {
      const conv = await storage.create(projId, agentId1, 'Empty')
      const result = await storage.getMessages(projId, conv.id, { page: 1, pageSize: 50 })
      expect(result.items).toEqual([])
      expect(result.total).toBe(0)
    })
  })

  describe('searchMessages (FTS5)', () => {
    it('finds messages matching query', async () => {
      const conv = await storage.create(projId, agentId1, 'Chat')
      await storage.sendMessage(projId, conv.id, 'The quick brown fox')
      await storage.sendMessage(projId, conv.id, 'Hello world')
      await storage.sendMessage(projId, conv.id, 'Another message here')

      const result = await storage.searchMessages(projId, 'brown', { page: 1, pageSize: 50 })
      expect(result.items).toHaveLength(1)
      expect(result.items[0].content).toBe('The quick brown fox')
    })

    it('scopes search to projectId', async () => {
      const conv1 = await storage.create(projId, agentId1, 'Chat 1')
      const conv2 = await storage.create(projId2, agentId1, 'Chat 2')
      await storage.sendMessage(projId, conv1.id, 'Alpha beta gamma')
      await storage.sendMessage(projId2, conv2.id, 'Alpha delta epsilon')

      const result = await storage.searchMessages(projId, 'Alpha', { page: 1, pageSize: 50 })
      expect(result.items).toHaveLength(1)
      expect(result.total).toBe(1)
    })

    it('returns empty for no matches', async () => {
      const conv = await storage.create(projId, agentId1, 'Chat')
      await storage.sendMessage(projId, conv.id, 'Hello world')

      const result = await storage.searchMessages(projId, 'nonexistent', { page: 1, pageSize: 50 })
      expect(result.items).toEqual([])
      expect(result.total).toBe(0)
    })

    it('paginates search results', async () => {
      const conv = await storage.create(projId, agentId1, 'Chat')
      for (let i = 0; i < 5; i++) {
        await storage.sendMessage(projId, conv.id, `Common keyword message ${i}`)
      }

      const page1 = await storage.searchMessages(projId, 'keyword', { page: 1, pageSize: 2 })
      expect(page1.items).toHaveLength(2)
      expect(page1.total).toBe(5)
    })
  })

  describe('saveMessage', () => {
    it('saves a message with explicit id and role', async () => {
      const conv = await storage.create(projId, agentId1, 'Chat')
      await storage.saveMessage(projId, conv.id, {
        id: 'msg-custom-1' as MessageId,
        role: 'assistant',
        content: 'Hello from AI',
      })

      const msgs = await storage.getMessages(projId, conv.id, { page: 1, pageSize: 50 })
      expect(msgs.items).toHaveLength(1)
      expect(msgs.items[0].id).toBe('msg-custom-1')
      expect(msgs.items[0].role).toBe('assistant')
      expect(msgs.items[0].content).toBe('Hello from AI')
    })

    it('deduplicates messages with same id', async () => {
      const conv = await storage.create(projId, agentId1, 'Chat')
      const msgId = 'msg-dedup-1' as MessageId

      await storage.saveMessage(projId, conv.id, { id: msgId, role: 'user', content: 'Original' })
      await storage.saveMessage(projId, conv.id, { id: msgId, role: 'user', content: 'Duplicate' })

      const msgs = await storage.getMessages(projId, conv.id, { page: 1, pageSize: 50 })
      expect(msgs.items).toHaveLength(1)
      expect(msgs.items[0].content).toBe('Original')
    })

    it('throws when conversation does not exist', async () => {
      await expect(
        storage.saveMessage(projId, 'conv-nonexistent' as ConversationId, {
          id: 'msg-1' as MessageId,
          role: 'user',
          content: 'test',
        }),
      ).rejects.toThrow('not found')
    })

    it('throws when conversation belongs to different project', async () => {
      const conv = await storage.create(projId, agentId1, 'Chat')
      await expect(
        storage.saveMessage(projId2, conv.id, {
          id: 'msg-1' as MessageId,
          role: 'user',
          content: 'test',
        }),
      ).rejects.toThrow('not found')
    })

    it('updates conversation lastMessageAt', async () => {
      const conv = await storage.create(projId, agentId1, 'Chat')
      const originalTime = conv.lastMessageAt

      await new Promise(r => setTimeout(r, 15))
      await storage.saveMessage(projId, conv.id, {
        id: 'msg-ts-1' as MessageId,
        role: 'assistant',
        content: 'response',
      })

      const updated = await storage.getById(projId, conv.id)
      expect(new Date(updated!.lastMessageAt).getTime())
        .toBeGreaterThan(new Date(originalTime).getTime())
    })

    it('saves messages with different roles', async () => {
      const conv = await storage.create(projId, agentId1, 'Chat')

      await storage.saveMessage(projId, conv.id, { id: 'msg-u' as MessageId, role: 'user', content: 'Hi' })
      await new Promise(r => setTimeout(r, 5))
      await storage.saveMessage(projId, conv.id, { id: 'msg-a' as MessageId, role: 'assistant', content: 'Hello!' })
      await new Promise(r => setTimeout(r, 5))
      await storage.saveMessage(projId, conv.id, { id: 'msg-s' as MessageId, role: 'system', content: 'System note' })
      await new Promise(r => setTimeout(r, 5))
      await storage.saveMessage(projId, conv.id, { id: 'msg-t' as MessageId, role: 'tool', content: 'Tool output' })

      const msgs = await storage.getMessages(projId, conv.id, { page: 1, pageSize: 50 })
      expect(msgs.items).toHaveLength(4)

      const roles = msgs.items.map(m => m.role)
      expect(roles).toContain('user')
      expect(roles).toContain('assistant')
      expect(roles).toContain('system')
      expect(roles).toContain('tool')
    })
  })

  describe('full persistence flow', () => {
    it('create → saveMessage → getMessages returns saved messages', async () => {
      const conv = await storage.create(projId, agentId1, 'Full Flow Chat')

      // Simulate a chat exchange
      await storage.saveMessage(projId, conv.id, {
        id: 'msg-flow-1' as MessageId,
        role: 'user',
        content: 'What is 2+2?',
      })
      await new Promise(r => setTimeout(r, 5))
      await storage.saveMessage(projId, conv.id, {
        id: 'msg-flow-2' as MessageId,
        role: 'assistant',
        content: 'The answer is 4.',
      })

      // Verify messages are retrievable
      const msgs = await storage.getMessages(projId, conv.id, { page: 1, pageSize: 50 })
      expect(msgs.items).toHaveLength(2)
      expect(msgs.total).toBe(2)

      // newest first
      expect(msgs.items[0].id).toBe('msg-flow-2')
      expect(msgs.items[0].content).toBe('The answer is 4.')
      expect(msgs.items[1].id).toBe('msg-flow-1')
      expect(msgs.items[1].content).toBe('What is 2+2?')
    })

    it('getById returns conversation with messages loaded', async () => {
      const conv = await storage.create(projId, agentId1, 'Chat')
      await storage.saveMessage(projId, conv.id, {
        id: 'msg-check-1' as MessageId,
        role: 'user',
        content: 'Hello',
      })
      await new Promise(r => setTimeout(r, 15))
      await storage.saveMessage(projId, conv.id, {
        id: 'msg-check-2' as MessageId,
        role: 'assistant',
        content: 'World',
      })

      const found = await storage.getById(projId, conv.id)
      expect(found).not.toBeNull()
      expect(found!.messages).toHaveLength(2)
      // messages ordered by createdAt ascending
      expect(found!.messages[0].id).toBe('msg-check-1')
      expect(found!.messages[0].content).toBe('Hello')
      expect(found!.messages[1].id).toBe('msg-check-2')
      expect(found!.messages[1].content).toBe('World')
    })

    it('list returns conversations with messages: [] (lightweight)', async () => {
      const conv = await storage.create(projId, agentId1, 'Chat')
      await storage.saveMessage(projId, conv.id, {
        id: 'msg-list-1' as MessageId,
        role: 'user',
        content: 'Hello',
      })

      const convs = await storage.list(projId)
      expect(convs).toHaveLength(1)
      expect(convs[0].messages).toEqual([])
    })

    it('sendMessage and saveMessage messages coexist in getMessages', async () => {
      const conv = await storage.create(projId, agentId1, 'Mixed Chat')

      // sendMessage creates a user message with auto-generated id
      await storage.sendMessage(projId, conv.id, 'User via sendMessage')
      await new Promise(r => setTimeout(r, 5))

      // saveMessage creates a message with explicit id/role
      await storage.saveMessage(projId, conv.id, {
        id: 'msg-explicit-1' as MessageId,
        role: 'assistant',
        content: 'Assistant via saveMessage',
      })

      const msgs = await storage.getMessages(projId, conv.id, { page: 1, pageSize: 50 })
      expect(msgs.items).toHaveLength(2)
      expect(msgs.total).toBe(2)
    })
  })

  describe('cross-project message isolation', () => {
    it('messages in one project are not visible in another', async () => {
      const conv1 = await storage.create(projId, agentId1, 'Proj1 Chat')
      const conv2 = await storage.create(projId2, agentId1, 'Proj2 Chat')

      await storage.saveMessage(projId, conv1.id, {
        id: 'msg-p1' as MessageId,
        role: 'user',
        content: 'Project 1 message',
      })
      await storage.saveMessage(projId2, conv2.id, {
        id: 'msg-p2' as MessageId,
        role: 'user',
        content: 'Project 2 message',
      })

      const msgs1 = await storage.getMessages(projId, conv1.id, { page: 1, pageSize: 50 })
      const msgs2 = await storage.getMessages(projId2, conv2.id, { page: 1, pageSize: 50 })

      expect(msgs1.items).toHaveLength(1)
      expect(msgs1.items[0].content).toBe('Project 1 message')
      expect(msgs2.items).toHaveLength(1)
      expect(msgs2.items[0].content).toBe('Project 2 message')
    })

    it('cannot access messages via getMessages with wrong projectId', async () => {
      const conv = await storage.create(projId, agentId1, 'Chat')
      await storage.saveMessage(projId, conv.id, {
        id: 'msg-cross-1' as MessageId,
        role: 'user',
        content: 'Secret message',
      })

      // getMessages with wrong projectId should throw (conversation not found)
      await expect(
        storage.getMessages(projId2, conv.id, { page: 1, pageSize: 50 }),
      ).rejects.toThrow('not found')
    })

    it('search is scoped to project after saveMessage', async () => {
      const conv1 = await storage.create(projId, agentId1, 'Chat 1')
      const conv2 = await storage.create(projId2, agentId1, 'Chat 2')

      await storage.saveMessage(projId, conv1.id, {
        id: 'msg-search-1' as MessageId,
        role: 'assistant',
        content: 'Unique keyword findme',
      })
      await storage.saveMessage(projId2, conv2.id, {
        id: 'msg-search-2' as MessageId,
        role: 'assistant',
        content: 'Another keyword findme',
      })

      const results = await storage.searchMessages(projId, 'findme', { page: 1, pageSize: 50 })
      expect(results.items).toHaveLength(1)
      expect(results.items[0].id).toBe('msg-search-1')
    })
  })

  describe('getMessages pagination with saveMessage', () => {
    it('paginates saveMessage messages correctly', async () => {
      const conv = await storage.create(projId, agentId1, 'Paginated Chat')

      for (let i = 0; i < 7; i++) {
        await new Promise(r => setTimeout(r, 5))
        await storage.saveMessage(projId, conv.id, {
          id: `msg-page-${i}` as MessageId,
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i}`,
        })
      }

      const page1 = await storage.getMessages(projId, conv.id, { page: 1, pageSize: 3 })
      expect(page1.items).toHaveLength(3)
      expect(page1.total).toBe(7)
      expect(page1.page).toBe(1)
      expect(page1.pageSize).toBe(3)

      const page2 = await storage.getMessages(projId, conv.id, { page: 2, pageSize: 3 })
      expect(page2.items).toHaveLength(3)

      const page3 = await storage.getMessages(projId, conv.id, { page: 3, pageSize: 3 })
      expect(page3.items).toHaveLength(1)

      // No overlap between pages
      const allIds = [
        ...page1.items.map(m => m.id),
        ...page2.items.map(m => m.id),
        ...page3.items.map(m => m.id),
      ]
      expect(new Set(allIds).size).toBe(7)
    })
  })
})
