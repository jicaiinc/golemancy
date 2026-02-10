import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import { sql } from 'drizzle-orm'
import { createTestDb, createTmpDir } from '../test/helpers'
import type { AppDatabase } from '../db/client'
import type { ProjectId, AgentId, TaskId, Task } from '@solocraft/shared'

const state = vi.hoisted(() => ({ tmpDir: '' }))

vi.mock('../utils/paths', () => ({
  getDataDir: () => state.tmpDir,
  getProjectPath: (pid: string) => `${state.tmpDir}/projects/${pid}`,
}))

import { FileTaskStorage } from './tasks'

describe('FileTaskStorage', () => {
  let db: AppDatabase
  let closeDb: () => void
  let storage: FileTaskStorage
  let cleanup: () => Promise<void>

  const projId = 'proj-1' as ProjectId
  const agentId1 = 'agent-1' as AgentId
  const agentId2 = 'agent-2' as AgentId

  // Helper to create a task JSON file on disk
  async function seedTask(task: Task) {
    const dir = `${state.tmpDir}/projects/${task.projectId}/tasks`
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(
      `${dir}/${task.id}.json`,
      JSON.stringify(task, null, 2),
    )
  }

  function makeTask(overrides: Partial<Task> = {}): Task {
    return {
      id: 'task-1' as TaskId,
      projectId: projId,
      agentId: agentId1,
      title: 'Test Task',
      description: 'A test task',
      status: 'running',
      progress: 50,
      tokenUsage: 1000,
      log: [],
      startedAt: '2024-01-01T00:00:00Z',
      completedAt: undefined,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      ...overrides,
    } as Task
  }

  beforeEach(async () => {
    const tmp = await createTmpDir()
    state.tmpDir = tmp.dir
    cleanup = tmp.cleanup

    const testDb = createTestDb()
    db = testDb.db
    closeDb = testDb.close

    storage = new FileTaskStorage(db)

    await fs.mkdir(`${state.tmpDir}/projects/${projId}/tasks`, { recursive: true })
  })

  afterEach(async () => {
    closeDb()
    await cleanup()
  })

  describe('list', () => {
    it('returns tasks for project', async () => {
      await seedTask(makeTask({ id: 'task-1' as TaskId }))
      await seedTask(makeTask({ id: 'task-2' as TaskId, title: 'Second' }))

      const tasks = await storage.list(projId)
      expect(tasks).toHaveLength(2)
    })

    it('filters by agentId when provided', async () => {
      await seedTask(makeTask({ id: 'task-1' as TaskId, agentId: agentId1 }))
      await seedTask(makeTask({ id: 'task-2' as TaskId, agentId: agentId2 }))

      const tasks = await storage.list(projId, agentId1)
      expect(tasks).toHaveLength(1)
      expect(tasks[0].agentId).toBe(agentId1)
    })

    it('returns empty for project with no tasks', async () => {
      const tasks = await storage.list(projId)
      expect(tasks).toEqual([])
    })

    it('returns empty for non-existent project', async () => {
      const tasks = await storage.list('proj-missing' as ProjectId)
      expect(tasks).toEqual([])
    })

    it('attaches logs from SQLite', async () => {
      await seedTask(makeTask({ id: 'task-1' as TaskId }))

      db.run(sql`INSERT INTO task_logs (task_id, type, content, timestamp)
        VALUES ('task-1', 'start', 'Started task', '2024-01-01T00:00:00Z')`)

      const tasks = await storage.list(projId)
      expect(tasks[0].log).toHaveLength(1)
      expect(tasks[0].log[0].type).toBe('start')
    })
  })

  describe('getById', () => {
    it('returns task with logs attached', async () => {
      await seedTask(makeTask())

      db.run(sql`INSERT INTO task_logs (task_id, type, content, timestamp)
        VALUES ('task-1', 'start', 'Starting', '2024-01-01T00:00:00Z')`)
      db.run(sql`INSERT INTO task_logs (task_id, type, content, timestamp)
        VALUES ('task-1', 'generation', 'Working', '2024-01-01T00:00:01Z')`)

      const task = await storage.getById(projId, 'task-1' as TaskId)
      expect(task).not.toBeNull()
      expect(task!.title).toBe('Test Task')
      expect(task!.log).toHaveLength(2)
    })

    it('returns null for non-existent task', async () => {
      const task = await storage.getById(projId, 'task-missing' as TaskId)
      expect(task).toBeNull()
    })
  })

  describe('cancel', () => {
    it('sets status to cancelled', async () => {
      await seedTask(makeTask({ status: 'running' }))

      await storage.cancel(projId, 'task-1' as TaskId)

      const task = await storage.getById(projId, 'task-1' as TaskId)
      expect(task!.status).toBe('cancelled')
      expect(task!.completedAt).toBeTruthy()
    })

    it('throws for non-existent task', async () => {
      await expect(
        storage.cancel(projId, 'task-missing' as TaskId),
      ).rejects.toThrow('not found')
    })
  })

  describe('getLogs', () => {
    it('returns logs for a task', async () => {
      db.run(sql`INSERT INTO task_logs (task_id, type, content, timestamp)
        VALUES ('task-1', 'start', 'Started', '2024-01-01T00:00:00Z')`)
      db.run(sql`INSERT INTO task_logs (task_id, type, content, timestamp)
        VALUES ('task-1', 'tool_call', 'Called tool X', '2024-01-01T00:00:01Z')`)
      db.run(sql`INSERT INTO task_logs (task_id, type, content, timestamp)
        VALUES ('task-1', 'completed', 'Done', '2024-01-01T00:00:02Z')`)

      const logs = await storage.getLogs('task-1' as TaskId)
      expect(logs).toHaveLength(3)
      expect(logs[0].type).toBe('start')
      expect(logs[2].type).toBe('completed')
    })

    it('supports cursor-based pagination', async () => {
      for (let i = 0; i < 5; i++) {
        db.run(sql`INSERT INTO task_logs (task_id, type, content, timestamp)
          VALUES ('task-1', 'generation', ${`Step ${i}`}, ${`2024-01-01T00:00:0${i}Z`})`)
      }

      const first = await storage.getLogs('task-1' as TaskId, undefined, 2)
      expect(first).toHaveLength(2)

      // Get cursor from last entry — need the id from DB
      const allRows = db.all<any>(sql`SELECT id FROM task_logs ORDER BY id LIMIT 2`)
      const cursor = allRows[1].id

      const next = await storage.getLogs('task-1' as TaskId, cursor, 2)
      expect(next).toHaveLength(2)
      expect(next[0].content).not.toBe(first[0].content)
    })

    it('returns logs with metadata', async () => {
      db.run(sql`INSERT INTO task_logs (task_id, type, content, metadata, timestamp)
        VALUES ('task-1', 'completed', 'Done', '{"tokenUsage":2500}', '2024-01-01T00:00:00Z')`)

      const logs = await storage.getLogs('task-1' as TaskId)
      expect(logs[0].metadata).toEqual({ tokenUsage: 2500 })
    })

    it('returns empty for task with no logs', async () => {
      const logs = await storage.getLogs('task-missing' as TaskId)
      expect(logs).toEqual([])
    })
  })
})
