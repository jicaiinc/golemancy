import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb } from '../test/helpers'
import type { AppDatabase } from '../db/client'
import type { ProjectId, ConversationId } from '@golemancy/shared'
import * as schema from '../db/schema'
import { SqliteConversationTaskStorage } from '../storage/tasks'
import { createTaskTools } from './task-tools'

describe('createTaskTools', () => {
  let db: AppDatabase
  let closeDb: () => void
  let taskStorage: SqliteConversationTaskStorage
  let tools: ReturnType<typeof createTaskTools>

  const projId = 'proj-1' as ProjectId
  const convId = 'conv-1' as ConversationId

  beforeEach(() => {
    const testDb = createTestDb()
    db = testDb.db
    closeDb = testDb.close

    taskStorage = new SqliteConversationTaskStorage(() => db)

    // Seed a conversation (FK target)
    const now = new Date().toISOString()
    db.insert(schema.conversations).values({
      id: convId, projectId: projId, agentId: 'agent-1', title: 'Chat', createdAt: now, updatedAt: now,
    }).run()

    tools = createTaskTools({ projectId: projId, conversationId: convId, taskStorage })
  })

  afterEach(() => {
    closeDb()
  })

  describe('TaskCreate', () => {
    it('creates a task and returns it', async () => {
      const result = await tools.TaskCreate.execute!(
        { subject: 'Write tests', description: 'Unit tests for task tools', activeForm: 'Writing tests' },
        { toolCallId: 'tc-1', messages: [], abortSignal: new AbortController().signal },
      )
      expect(result).toMatchObject({
        subject: 'Write tests',
        description: 'Unit tests for task tools',
        status: 'pending',
        activeForm: 'Writing tests',
        conversationId: convId,
      })
      expect((result as any).id).toBeTruthy()
    })
  })

  describe('TaskGet', () => {
    it('returns task by ID', async () => {
      const created = await taskStorage.create(projId, convId, { subject: 'Fetchable' })
      const result = await tools.TaskGet.execute!(
        { taskId: created.id },
        { toolCallId: 'tc-2', messages: [], abortSignal: new AbortController().signal },
      )
      expect((result as any).subject).toBe('Fetchable')
    })

    it('returns error for non-existent task', async () => {
      const result = await tools.TaskGet.execute!(
        { taskId: 'task-missing' },
        { toolCallId: 'tc-3', messages: [], abortSignal: new AbortController().signal },
      )
      expect((result as any).error).toContain('not found')
    })
  })

  describe('TaskList', () => {
    it('lists tasks in current conversation excluding deleted', async () => {
      await taskStorage.create(projId, convId, { subject: 'Active' })
      const toDelete = await taskStorage.create(projId, convId, { subject: 'To delete' })
      await taskStorage.update(projId, toDelete.id, { status: 'deleted' })

      const result = await tools.TaskList.execute!(
        {},
        { toolCallId: 'tc-4', messages: [], abortSignal: new AbortController().signal },
      )
      const tasks = result as any[]
      expect(tasks).toHaveLength(1)
      expect(tasks[0].subject).toBe('Active')
    })

    it('filters blockedBy to only open tasks', async () => {
      const dep = await taskStorage.create(projId, convId, { subject: 'Dependency' })
      const task = await taskStorage.create(projId, convId, { subject: 'Blocked' })
      await taskStorage.update(projId, task.id, { addBlockedBy: [dep.id] })

      // Before completing dep — blockedBy should include dep
      let result = await tools.TaskList.execute!(
        {},
        { toolCallId: 'tc-5a', messages: [], abortSignal: new AbortController().signal },
      ) as any[]
      const blockedTask = result.find((t: any) => t.subject === 'Blocked')
      expect(blockedTask.blockedBy).toContain(dep.id)

      // Complete the dependency
      await taskStorage.update(projId, dep.id, { status: 'completed' })

      result = await tools.TaskList.execute!(
        {},
        { toolCallId: 'tc-5b', messages: [], abortSignal: new AbortController().signal },
      ) as any[]
      const unblocked = result.find((t: any) => t.subject === 'Blocked')
      expect(unblocked.blockedBy).toEqual([])
    })
  })

  describe('TaskUpdate', () => {
    it('updates task fields', async () => {
      const created = await taskStorage.create(projId, convId, { subject: 'Original' })
      const result = await tools.TaskUpdate.execute!(
        { taskId: created.id, status: 'in_progress', subject: 'Updated' },
        { toolCallId: 'tc-6', messages: [], abortSignal: new AbortController().signal },
      )
      expect((result as any).status).toBe('in_progress')
      expect((result as any).subject).toBe('Updated')
    })

    it('returns error for non-existent task', async () => {
      const result = await tools.TaskUpdate.execute!(
        { taskId: 'task-missing', status: 'completed' },
        { toolCallId: 'tc-7', messages: [], abortSignal: new AbortController().signal },
      )
      expect((result as any).error).toContain('not found')
    })
  })
})
