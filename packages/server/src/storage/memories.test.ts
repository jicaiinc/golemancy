import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import { createTmpDir } from '../test/helpers'
import type { ProjectId, MemoryId } from '@solocraft/shared'

const state = vi.hoisted(() => ({ tmpDir: '' }))

vi.mock('../utils/paths', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/paths')>()
  return {
    ...actual,
    getDataDir: () => state.tmpDir,
    getProjectPath: (pid: string) => `${state.tmpDir}/projects/${pid}`,
  }
})

import { FileMemoryStorage } from './memories'

describe('FileMemoryStorage', () => {
  let storage: FileMemoryStorage
  let cleanup: () => Promise<void>

  const projId = 'proj-1' as ProjectId

  beforeEach(async () => {
    const tmp = await createTmpDir()
    state.tmpDir = tmp.dir
    cleanup = tmp.cleanup
    storage = new FileMemoryStorage()

    await fs.mkdir(`${state.tmpDir}/projects/${projId}/memory`, { recursive: true })
  })

  afterEach(async () => {
    await cleanup()
  })

  describe('list', () => {
    it('returns empty for project with no memories', async () => {
      const memories = await storage.list(projId)
      expect(memories).toEqual([])
    })

    it('returns created memory entries', async () => {
      await storage.create(projId, { content: 'Mem 1', source: 'agent-1', tags: ['a'] })
      await storage.create(projId, { content: 'Mem 2', source: 'agent-2', tags: ['b'] })

      const memories = await storage.list(projId)
      expect(memories).toHaveLength(2)
    })

    it('returns empty for non-existent project', async () => {
      const memories = await storage.list('proj-missing' as ProjectId)
      expect(memories).toEqual([])
    })
  })

  describe('create', () => {
    it('creates memory entry with correct fields', async () => {
      const entry = await storage.create(projId, {
        content: 'User prefers bullet points',
        source: 'agent-1',
        tags: ['preference', 'format'],
      })

      expect(entry.id).toMatch(/^mem-/)
      expect(entry.projectId).toBe(projId)
      expect(entry.content).toBe('User prefers bullet points')
      expect(entry.source).toBe('agent-1')
      expect(entry.tags).toEqual(['preference', 'format'])
      expect(entry.createdAt).toBeTruthy()
    })
  })

  describe('update', () => {
    it('merges updated fields', async () => {
      const created = await storage.create(projId, {
        content: 'Original', source: 'agent-1', tags: ['a'],
      })

      const updated = await storage.update(projId, created.id, {
        content: 'Updated content',
      })

      expect(updated.content).toBe('Updated content')
      expect(updated.source).toBe('agent-1') // unchanged
    })

    it('updates tags', async () => {
      const created = await storage.create(projId, {
        content: 'Test', source: 'agent-1', tags: ['old'],
      })

      const updated = await storage.update(projId, created.id, {
        tags: ['new', 'tags'],
      })

      expect(updated.tags).toEqual(['new', 'tags'])
    })

    it('throws for non-existent memory', async () => {
      await expect(
        storage.update(projId, 'mem-missing' as MemoryId, { content: 'Nope' }),
      ).rejects.toThrow('not found')
    })

    it('persists changes to disk', async () => {
      const created = await storage.create(projId, {
        content: 'Before', source: 'test', tags: [],
      })
      await storage.update(projId, created.id, { content: 'After' })

      const memories = await storage.list(projId)
      const found = memories.find(m => m.id === created.id)
      expect(found!.content).toBe('After')
    })
  })

  describe('delete', () => {
    it('removes memory entry', async () => {
      const created = await storage.create(projId, {
        content: 'To delete', source: 'test', tags: [],
      })

      await storage.delete(projId, created.id)

      const memories = await storage.list(projId)
      expect(memories.find(m => m.id === created.id)).toBeUndefined()
    })

    it('ignores deleting non-existent memory', async () => {
      await expect(
        storage.delete(projId, 'mem-missing' as MemoryId),
      ).resolves.toBeUndefined()
    })
  })
})
