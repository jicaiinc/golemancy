import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { ProjectId } from '@golemancy/shared'
import { createTmpDir } from '../test/helpers'
import { ActiveChatRegistry } from '../agent/active-chat-registry'
import { FileProjectStorage } from '../storage/projects'
import { clearProjectDeletion, isProjectBlocked, markProjectDeleting, resetProjectDeletionStateForTests } from '../project-deletion'

const state = vi.hoisted(() => ({ tmpDir: '' }))

vi.mock('../utils/paths', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/paths')>()
  return {
    ...actual,
    getDataDir: () => state.tmpDir,
    getProjectPath: (pid: string) => `${state.tmpDir}/projects/${pid}`,
  }
})

// Stub sentry to avoid real calls
vi.mock('../sentry', () => ({
  captureException: vi.fn(),
  initSentry: vi.fn(),
  flush: vi.fn(),
}))

describe('Project deletion integration', () => {
  let storage: FileProjectStorage
  let registry: ActiveChatRegistry
  let cleanup: () => Promise<void>

  beforeEach(async () => {
    const tmp = await createTmpDir()
    state.tmpDir = tmp.dir
    cleanup = tmp.cleanup
    storage = new FileProjectStorage()
    registry = new ActiveChatRegistry()
    resetProjectDeletionStateForTests()
  })

  afterEach(async () => {
    resetProjectDeletionStateForTests()
    await cleanup()
  })

  describe('basic delete flow', () => {
    it('creates and deletes a project — project.json removed, not in list()', async () => {
      const project = await storage.create({ name: 'ToDelete', description: '', icon: 's' })
      const projectDir = path.join(state.tmpDir, 'projects', project.id)

      // Confirm project exists
      expect(await storage.getById(project.id)).not.toBeNull()
      expect(await fs.stat(path.join(projectDir, 'project.json'))).toBeTruthy()

      // Delete
      await storage.delete(project.id)

      // project.json should be gone
      await expect(fs.access(path.join(projectDir, 'project.json'))).rejects.toThrow()

      // Not in list
      const list = await storage.list()
      expect(list.find(p => p.id === project.id)).toBeUndefined()

      // getById returns null
      expect(await storage.getById(project.id)).toBeNull()
    })

    it('project.json is deleted even if directory removal would be retried', async () => {
      const project = await storage.create({ name: 'Sticky', description: '', icon: 's' })
      const projectDir = path.join(state.tmpDir, 'projects', project.id)
      const projectJsonPath = path.join(projectDir, 'project.json')

      // Confirm file exists
      expect(await fs.stat(projectJsonPath)).toBeTruthy()

      await storage.delete(project.id)

      // project.json specifically should be gone
      await expect(fs.access(projectJsonPath)).rejects.toThrow()

      // list() should NOT return this project
      const list = await storage.list()
      expect(list.find(p => p.id === project.id)).toBeUndefined()
    })
  })

  describe('abort with active chat', () => {
    it('abort signal is delivered to active chats during deletion', async () => {
      const project = await storage.create({ name: 'ActiveChat', description: '', icon: 's' })
      const projectId = project.id

      // Simulate a long-running chat
      const controller = new AbortController()
      registry.register('conv-1', {
        agentId: 'agent-1',
        projectId,
        abortController: controller,
      })

      expect(registry.getRunningForProject(projectId)).toHaveLength(1)
      expect(controller.signal.aborted).toBe(false)

      // Simulate the abort-retry loop from onProjectDeleting
      const ABORT_ROUNDS = 3
      const ABORT_INTERVAL_MS = 50 // shortened for test speed

      // Simulate chat stopping after the first abort (with a small delay)
      controller.signal.addEventListener('abort', () => {
        setTimeout(() => registry.unregister('conv-1'), 30)
      })

      for (let round = 0; round < ABORT_ROUNDS; round++) {
        registry.abortProject(projectId)
        await new Promise(r => setTimeout(r, ABORT_INTERVAL_MS))
        const remaining = registry.getRunningForProject(projectId)
        if (remaining.length === 0) break
      }

      // Abort signal was sent
      expect(controller.signal.aborted).toBe(true)

      // Chat was unregistered
      expect(registry.getRunningForProject(projectId)).toHaveLength(0)

      // Now delete should succeed
      await storage.delete(project.id)
      expect(await storage.getById(project.id)).toBeNull()
    })

    it('retries abort when chat does not stop on first attempt', async () => {
      const project = await storage.create({ name: 'SlowChat', description: '', icon: 's' })
      const projectId = project.id

      const controller = new AbortController()
      registry.register('conv-slow', {
        agentId: 'agent-1',
        projectId,
        abortController: controller,
      })

      // Chat only stops after 120ms (will require 2+ rounds at 50ms interval)
      controller.signal.addEventListener('abort', () => {
        setTimeout(() => registry.unregister('conv-slow'), 120)
      })

      const ABORT_ROUNDS = 3
      const ABORT_INTERVAL_MS = 50
      let roundsExecuted = 0

      for (let round = 0; round < ABORT_ROUNDS; round++) {
        registry.abortProject(projectId)
        await new Promise(r => setTimeout(r, ABORT_INTERVAL_MS))
        roundsExecuted = round + 1
        const remaining = registry.getRunningForProject(projectId)
        if (remaining.length === 0) break
      }

      // Should have taken more than 1 round
      expect(roundsExecuted).toBeGreaterThan(1)
      expect(controller.signal.aborted).toBe(true)
      expect(registry.getRunningForProject(projectId)).toHaveLength(0)
    })

    it('proceeds after max rounds even if chat is still active', async () => {
      const project = await storage.create({ name: 'StuckChat', description: '', icon: 's' })
      const projectId = project.id

      const controller = new AbortController()
      registry.register('conv-stuck', {
        agentId: 'agent-1',
        projectId,
        abortController: controller,
      })

      // Chat never stops (simulates a stuck chat)
      const ABORT_ROUNDS = 3
      const ABORT_INTERVAL_MS = 20 // very short for test speed

      for (let round = 0; round < ABORT_ROUNDS; round++) {
        registry.abortProject(projectId)
        await new Promise(r => setTimeout(r, ABORT_INTERVAL_MS))
        const remaining = registry.getRunningForProject(projectId)
        if (remaining.length === 0) break
      }

      // Abort was sent but chat is still registered (stuck)
      expect(controller.signal.aborted).toBe(true)
      expect(registry.getRunningForProject(projectId)).toHaveLength(1)

      // Deletion should still proceed — project.json removed, not in list
      await storage.delete(project.id)
      expect(await storage.getById(project.id)).toBeNull()
      const list = await storage.list()
      expect(list.find(p => p.id === project.id)).toBeUndefined()
    })
  })

  describe('deletion guard (markProjectDeleting)', () => {
    it('markProjectDeleting blocks the project, clearProjectDeletion unblocks', async () => {
      const project = await storage.create({ name: 'Guard', description: '', icon: 's' })

      markProjectDeleting(project.id)
      expect(isProjectBlocked(project.id)).toBe(true)

      clearProjectDeletion(project.id)
      expect(isProjectBlocked(project.id)).toBe(false)
    })
  })
})
