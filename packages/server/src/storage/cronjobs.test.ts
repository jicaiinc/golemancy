import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createTmpDir } from '../test/helpers'
import type { ProjectId, CronJobId, AgentId } from '@golemancy/shared'

const state = vi.hoisted(() => ({ tmpDir: '' }))

vi.mock('../utils/paths', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/paths')>()
  return {
    ...actual,
    getDataDir: () => state.tmpDir,
    getProjectPath: (pid: string) => `${state.tmpDir}/projects/${pid}`,
  }
})

import { FileCronJobStorage } from './cronjobs'

describe('FileCronJobStorage', () => {
  let storage: FileCronJobStorage
  let cleanup: () => Promise<void>

  const projId = 'proj-1' as ProjectId
  const projId2 = 'proj-2' as ProjectId

  beforeEach(async () => {
    const tmp = await createTmpDir()
    state.tmpDir = tmp.dir
    cleanup = tmp.cleanup
    storage = new FileCronJobStorage()

    await fs.mkdir(`${state.tmpDir}/projects/${projId}/cronjobs`, { recursive: true })
    await fs.mkdir(`${state.tmpDir}/projects/${projId2}/cronjobs`, { recursive: true })
  })

  afterEach(async () => {
    await cleanup()
  })

  describe('list', () => {
    it('returns empty when no jobs exist', async () => {
      const jobs = await storage.list(projId)
      expect(jobs).toEqual([])
    })

    it('returns created jobs', async () => {
      await storage.create(projId, {
        agentId: 'agent-1' as AgentId,
        name: 'Job A',
        cronExpression: '0 * * * *',
        enabled: true,
        instruction: 'do A',
        scheduleType: 'cron',
      })
      await storage.create(projId, {
        agentId: 'agent-1' as AgentId,
        name: 'Job B',
        cronExpression: '*/5 * * * *',
        enabled: false,
        instruction: 'do B',
        scheduleType: 'cron',
      })

      const jobs = await storage.list(projId)
      expect(jobs).toHaveLength(2)
    })
  })

  describe('create', () => {
    it('creates job with correct fields', async () => {
      const job = await storage.create(projId, {
        agentId: 'agent-1' as AgentId,
        name: 'Test Cron',
        cronExpression: '0 9 * * *',
        enabled: true,
        instruction: 'Run daily',
        scheduleType: 'cron',
      })

      expect(job.id).toMatch(/^cron-/)
      expect(job.projectId).toBe(projId)
      expect(job.name).toBe('Test Cron')
      expect(job.enabled).toBe(true)
      expect(job.cronExpression).toBe('0 9 * * *')
      expect(job.createdAt).toBeTruthy()
    })
  })

  describe('getById', () => {
    it('returns existing job', async () => {
      const created = await storage.create(projId, {
        agentId: 'agent-1' as AgentId,
        name: 'Find', cronExpression: '* * * * *',
        enabled: true, instruction: 'inst', scheduleType: 'cron',
      })

      const found = await storage.getById(projId, created.id)
      expect(found).not.toBeNull()
      expect(found!.name).toBe('Find')
    })

    it('returns null for non-existent job', async () => {
      const found = await storage.getById(projId, 'cron-missing' as CronJobId)
      expect(found).toBeNull()
    })
  })

  describe('update', () => {
    it('updates fields and preserves others', async () => {
      const created = await storage.create(projId, {
        agentId: 'agent-1' as AgentId,
        name: 'Old Name', cronExpression: '* * * * *',
        enabled: true, instruction: 'inst', scheduleType: 'cron',
      })

      const updated = await storage.update(projId, created.id, { name: 'New Name', enabled: false })
      expect(updated.name).toBe('New Name')
      expect(updated.enabled).toBe(false)
      expect(updated.cronExpression).toBe('* * * * *') // unchanged
    })

    it('throws for non-existent job', async () => {
      await expect(
        storage.update(projId, 'cron-missing' as CronJobId, { name: 'x' }),
      ).rejects.toThrow('not found')
    })
  })

  describe('delete', () => {
    it('removes job file', async () => {
      const created = await storage.create(projId, {
        agentId: 'agent-1' as AgentId,
        name: 'Del', cronExpression: '* * * * *',
        enabled: true, instruction: 'x', scheduleType: 'cron',
      })
      await storage.delete(projId, created.id)

      const found = await storage.getById(projId, created.id)
      expect(found).toBeNull()
    })

    it('ignores deleting non-existent job', async () => {
      await expect(
        storage.delete(projId, 'cron-missing' as CronJobId),
      ).resolves.toBeUndefined()
    })
  })

  describe('listAllEnabled', () => {
    it('returns enabled jobs across projects', async () => {
      await storage.create(projId, {
        agentId: 'agent-1' as AgentId,
        name: 'Enabled 1', cronExpression: '* * * * *',
        enabled: true, instruction: 'x', scheduleType: 'cron',
      })
      await storage.create(projId, {
        agentId: 'agent-1' as AgentId,
        name: 'Disabled', cronExpression: '* * * * *',
        enabled: false, instruction: 'x', scheduleType: 'cron',
      })
      await storage.create(projId2, {
        agentId: 'agent-2' as AgentId,
        name: 'Enabled 2', cronExpression: '0 * * * *',
        enabled: true, instruction: 'y', scheduleType: 'cron',
      })

      const enabled = await storage.listAllEnabled()
      expect(enabled).toHaveLength(2)
      expect(enabled.map(j => j.name).sort()).toEqual(['Enabled 1', 'Enabled 2'])
    })

    it('returns empty when no projects exist', async () => {
      // Remove the projects dir to simulate empty state
      await fs.rm(path.join(state.tmpDir, 'projects'), { recursive: true, force: true })

      const enabled = await storage.listAllEnabled()
      expect(enabled).toEqual([])
    })
  })

  describe('updateRunMeta', () => {
    it('updates run metadata on existing job', async () => {
      const created = await storage.create(projId, {
        agentId: 'agent-1' as AgentId,
        name: 'Meta', cronExpression: '* * * * *',
        enabled: true, instruction: 'x', scheduleType: 'cron',
      })

      await storage.updateRunMeta(projId, created.id, {
        lastRunAt: '2026-01-01T12:00:00Z',
        lastRunStatus: 'success',
      })

      const updated = await storage.getById(projId, created.id)
      expect((updated as any).lastRunAt).toBe('2026-01-01T12:00:00Z')
      expect((updated as any).lastRunStatus).toBe('success')
    })

    it('does nothing for non-existent job', async () => {
      await expect(
        storage.updateRunMeta(projId, 'cron-missing' as CronJobId, { lastRunAt: 'x' }),
      ).resolves.toBeUndefined()
    })
  })
})
