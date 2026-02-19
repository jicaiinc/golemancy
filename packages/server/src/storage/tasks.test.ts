import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb } from '../test/helpers'
import type { AppDatabase } from '../db/client'
import type { ProjectId, ConversationId, TaskId } from '@golemancy/shared'
import * as schema from '../db/schema'
import { SqliteConversationTaskStorage } from './tasks'

describe('SqliteConversationTaskStorage', () => {
  let db: AppDatabase
  let closeDb: () => void
  let storage: SqliteConversationTaskStorage

  const projId = 'proj-1' as ProjectId
  const convId1 = 'conv-1' as ConversationId
  const convId2 = 'conv-2' as ConversationId

  beforeEach(() => {
    const testDb = createTestDb()
    db = testDb.db
    closeDb = testDb.close

    storage = new SqliteConversationTaskStorage(() => db)

    // Seed conversations (FK target for conversation_tasks)
    const now = new Date().toISOString()
    db.insert(schema.conversations).values([
      { id: convId1, projectId: projId, agentId: 'agent-1', title: 'Chat 1', createdAt: now, updatedAt: now },
      { id: convId2, projectId: projId, agentId: 'agent-2', title: 'Chat 2', createdAt: now, updatedAt: now },
    ]).run()
  })

  afterEach(() => {
    closeDb()
  })

  describe('create', () => {
    it('creates a task with correct fields', async () => {
      const task = await storage.create(projId, convId1, {
        subject: 'Draft blog post',
        description: 'Write a 500-word blog post',
        activeForm: 'Drafting blog post',
      })

      expect(task.id).toBeTruthy()
      expect(task.conversationId).toBe(convId1)
      expect(task.subject).toBe('Draft blog post')
      expect(task.description).toBe('Write a 500-word blog post')
      expect(task.status).toBe('pending')
      expect(task.activeForm).toBe('Drafting blog post')
      expect(task.blocks).toEqual([])
      expect(task.blockedBy).toEqual([])
      expect(task.createdAt).toBeTruthy()
      expect(task.updatedAt).toBeTruthy()
    })

    it('defaults description to empty string', async () => {
      const task = await storage.create(projId, convId1, { subject: 'Quick task' })
      expect(task.description).toBe('')
    })

    it('generates unique IDs', async () => {
      const t1 = await storage.create(projId, convId1, { subject: 'Task 1' })
      const t2 = await storage.create(projId, convId1, { subject: 'Task 2' })
      expect(t1.id).not.toBe(t2.id)
    })
  })

  describe('getById', () => {
    it('returns task by ID', async () => {
      const created = await storage.create(projId, convId1, { subject: 'Find me' })
      const found = await storage.getById(projId, created.id)
      expect(found).not.toBeNull()
      expect(found!.subject).toBe('Find me')
      expect(found!.id).toBe(created.id)
    })

    it('returns null for non-existent ID', async () => {
      const found = await storage.getById(projId, 'task-missing' as TaskId)
      expect(found).toBeNull()
    })
  })

  describe('list', () => {
    it('returns all tasks for project', async () => {
      await storage.create(projId, convId1, { subject: 'Task A' })
      await storage.create(projId, convId2, { subject: 'Task B' })

      const tasks = await storage.list(projId)
      expect(tasks).toHaveLength(2)
    })

    it('filters by conversationId', async () => {
      await storage.create(projId, convId1, { subject: 'Conv1 Task' })
      await storage.create(projId, convId2, { subject: 'Conv2 Task' })

      const conv1Tasks = await storage.list(projId, convId1)
      expect(conv1Tasks).toHaveLength(1)
      expect(conv1Tasks[0].subject).toBe('Conv1 Task')
      expect(conv1Tasks[0].conversationId).toBe(convId1)
    })

    it('returns empty for conversation with no tasks', async () => {
      const tasks = await storage.list(projId, 'conv-999' as ConversationId)
      expect(tasks).toEqual([])
    })

    it('returns tasks ordered by createdAt descending', async () => {
      // Insert directly with controlled timestamps to avoid same-millisecond issue
      const now = new Date().toISOString()
      const later = new Date(Date.now() + 1000).toISOString()

      db.insert(schema.conversationTasks).values([
        { id: 'task-first', conversationId: convId1, subject: 'First', description: '', status: 'pending', blocks: [], blockedBy: [], createdAt: now, updatedAt: now },
        { id: 'task-second', conversationId: convId1, subject: 'Second', description: '', status: 'pending', blocks: [], blockedBy: [], createdAt: later, updatedAt: later },
      ]).run()

      const tasks = await storage.list(projId, convId1)
      // Most recent first
      expect(tasks[0].subject).toBe('Second')
      expect(tasks[1].subject).toBe('First')
    })
  })

  describe('update', () => {
    it('updates status', async () => {
      const task = await storage.create(projId, convId1, { subject: 'Do it' })
      const updated = await storage.update(projId, task.id, { status: 'in_progress' })
      expect(updated.status).toBe('in_progress')
    })

    it('updates subject and description', async () => {
      const task = await storage.create(projId, convId1, { subject: 'Old', description: 'Old desc' })
      const updated = await storage.update(projId, task.id, {
        subject: 'New',
        description: 'New desc',
      })
      expect(updated.subject).toBe('New')
      expect(updated.description).toBe('New desc')
    })

    it('updates owner and activeForm', async () => {
      const task = await storage.create(projId, convId1, { subject: 'Task' })
      const updated = await storage.update(projId, task.id, {
        owner: 'agent-writer',
        activeForm: 'Writing article',
      })
      expect(updated.owner).toBe('agent-writer')
      expect(updated.activeForm).toBe('Writing article')
    })

    it('merges metadata', async () => {
      const task = await storage.create(projId, convId1, { subject: 'Task' })

      const u1 = await storage.update(projId, task.id, {
        metadata: { foo: 'bar', count: 1 },
      })
      expect(u1.metadata).toEqual({ foo: 'bar', count: 1 })

      // Second update merges
      const u2 = await storage.update(projId, task.id, {
        metadata: { count: 2, extra: true },
      })
      expect(u2.metadata).toEqual({ foo: 'bar', count: 2, extra: true })
    })

    it('removes metadata keys set to null', async () => {
      const task = await storage.create(projId, convId1, { subject: 'Task' })
      await storage.update(projId, task.id, { metadata: { a: 1, b: 2 } })
      const updated = await storage.update(projId, task.id, { metadata: { b: null } })
      expect(updated.metadata).toEqual({ a: 1 })
    })

    it('appends blocks (deduplicates)', async () => {
      const task = await storage.create(projId, convId1, { subject: 'Blocker' })
      const t2 = await storage.create(projId, convId1, { subject: 'Blocked 1' })
      const t3 = await storage.create(projId, convId1, { subject: 'Blocked 2' })

      const u1 = await storage.update(projId, task.id, { addBlocks: [t2.id] })
      expect(u1.blocks).toEqual([t2.id])

      // Append with duplicate
      const u2 = await storage.update(projId, task.id, { addBlocks: [t2.id, t3.id] })
      expect(u2.blocks).toEqual([t2.id, t3.id])
    })

    it('appends blockedBy (deduplicates)', async () => {
      const task = await storage.create(projId, convId1, { subject: 'Blocked task' })
      const dep1 = await storage.create(projId, convId1, { subject: 'Dep 1' })
      const dep2 = await storage.create(projId, convId1, { subject: 'Dep 2' })

      const u1 = await storage.update(projId, task.id, { addBlockedBy: [dep1.id] })
      expect(u1.blockedBy).toEqual([dep1.id])

      const u2 = await storage.update(projId, task.id, { addBlockedBy: [dep1.id, dep2.id] })
      expect(u2.blockedBy).toEqual([dep1.id, dep2.id])
    })

    it('updates updatedAt timestamp', async () => {
      const task = await storage.create(projId, convId1, { subject: 'Task' })
      const originalUpdatedAt = task.updatedAt

      // Small delay to ensure timestamp differs
      await new Promise(r => setTimeout(r, 10))

      const updated = await storage.update(projId, task.id, { status: 'completed' })
      expect(updated.updatedAt).not.toBe(originalUpdatedAt)
    })

    it('throws for non-existent task', async () => {
      await expect(
        storage.update(projId, 'task-missing' as TaskId, { status: 'completed' }),
      ).rejects.toThrow('not found')
    })
  })

  describe('delete', () => {
    it('soft-deletes by setting status to deleted', async () => {
      const task = await storage.create(projId, convId1, { subject: 'Delete me' })
      await storage.delete(projId, task.id)

      const found = await storage.getById(projId, task.id)
      expect(found).not.toBeNull()
      expect(found!.status).toBe('deleted')
    })

    it('throws for non-existent task', async () => {
      await expect(
        storage.delete(projId, 'task-missing' as TaskId),
      ).rejects.toThrow('not found')
    })
  })
})
