import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import { createTmpDir } from '../test/helpers'
import type { ProjectId, PermissionsConfigId } from '@golemancy/shared'

const state = vi.hoisted(() => ({ tmpDir: '' }))

vi.mock('../utils/paths', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/paths')>()
  return {
    ...actual,
    getDataDir: () => state.tmpDir,
  }
})

import { FilePermissionsConfigStorage } from './permissions-config'

describe('FilePermissionsConfigStorage', () => {
  let storage: FilePermissionsConfigStorage
  let cleanup: () => Promise<void>

  const projId = 'proj-1' as ProjectId

  beforeEach(async () => {
    const tmp = await createTmpDir()
    state.tmpDir = tmp.dir
    cleanup = tmp.cleanup
    storage = new FilePermissionsConfigStorage()

    // Ensure project permissions-config directory exists
    await fs.mkdir(`${state.tmpDir}/projects/${projId}/permissions-config`, { recursive: true })
  })

  afterEach(async () => {
    await cleanup()
  })

  describe('list', () => {
    it('always includes system default as first entry', async () => {
      const configs = await storage.list(projId)
      expect(configs).toHaveLength(1)
      expect(configs[0].id).toBe('default')
      expect(configs[0].title).toBe('Default')
      expect(configs[0].mode).toBe('sandbox')
    })

    it('includes user-created configs after default', async () => {
      await storage.create(projId, {
        title: 'Custom',
        mode: 'unrestricted',
        config: { allowWrite: [], denyRead: [], denyWrite: [], networkRestrictionsEnabled: false, allowedDomains: [], deniedDomains: [], deniedCommands: [] },
      })

      const configs = await storage.list(projId)
      expect(configs).toHaveLength(2)
      expect(configs[0].id).toBe('default')
      expect(configs[1].title).toBe('Custom')
    })
  })

  describe('getById', () => {
    it('returns system default for id "default"', async () => {
      const config = await storage.getById(projId, 'default' as PermissionsConfigId)
      expect(config).not.toBeNull()
      expect(config!.id).toBe('default')
      expect(config!.mode).toBe('sandbox')
    })

    it('returns user config by id', async () => {
      const created = await storage.create(projId, {
        title: 'Test',
        mode: 'restricted',
        config: { allowWrite: [], denyRead: [], denyWrite: [], networkRestrictionsEnabled: false, allowedDomains: [], deniedDomains: [], deniedCommands: [] },
      })

      const found = await storage.getById(projId, created.id)
      expect(found).not.toBeNull()
      expect(found!.title).toBe('Test')
    })

    it('returns null for non-existent config', async () => {
      const found = await storage.getById(projId, 'perm-missing' as PermissionsConfigId)
      expect(found).toBeNull()
    })
  })

  describe('create', () => {
    it('creates config with correct fields', async () => {
      const config = await storage.create(projId, {
        title: 'My Config',
        mode: 'sandbox',
        config: { allowWrite: ['/tmp'], denyRead: [], denyWrite: [], networkRestrictionsEnabled: false, allowedDomains: [], deniedDomains: [], deniedCommands: [] },
      })

      expect(config.id).toMatch(/^perm-/)
      expect(config.title).toBe('My Config')
      expect(config.mode).toBe('sandbox')
      expect(config.config.allowWrite).toEqual(['/tmp'])
      expect(config.createdAt).toBeTruthy()
    })
  })

  describe('update', () => {
    it('throws when trying to update system default', async () => {
      await expect(
        storage.update(projId, 'default' as PermissionsConfigId, { title: 'Renamed' }),
      ).rejects.toThrow('Cannot update system default config')
    })

    it('updates user config', async () => {
      const created = await storage.create(projId, {
        title: 'Old',
        mode: 'sandbox',
        config: { allowWrite: [], denyRead: [], denyWrite: [], networkRestrictionsEnabled: false, allowedDomains: [], deniedDomains: [], deniedCommands: [] },
      })

      const updated = await storage.update(projId, created.id, { title: 'New' })
      expect(updated.title).toBe('New')
      expect(updated.mode).toBe('sandbox') // unchanged
    })

    it('throws for non-existent config', async () => {
      await expect(
        storage.update(projId, 'perm-missing' as PermissionsConfigId, { title: 'x' }),
      ).rejects.toThrow('not found')
    })
  })

  describe('delete', () => {
    it('throws when trying to delete system default', async () => {
      await expect(
        storage.delete(projId, 'default' as PermissionsConfigId),
      ).rejects.toThrow('Cannot delete system default config')
    })

    it('deletes user config', async () => {
      const created = await storage.create(projId, {
        title: 'To Delete',
        mode: 'restricted',
        config: { allowWrite: [], denyRead: [], denyWrite: [], networkRestrictionsEnabled: false, allowedDomains: [], deniedDomains: [], deniedCommands: [] },
      })

      await storage.delete(projId, created.id)

      const found = await storage.getById(projId, created.id)
      expect(found).toBeNull()
    })
  })

  describe('duplicate', () => {
    it('duplicates system default config', async () => {
      const duped = await storage.duplicate(projId, 'default' as PermissionsConfigId, 'Copy of Default')
      expect(duped.id).toMatch(/^perm-/)
      expect(duped.title).toBe('Copy of Default')
      expect(duped.mode).toBe('sandbox')
      expect(duped.config.allowWrite).toBeTruthy()
    })

    it('duplicates user config', async () => {
      const original = await storage.create(projId, {
        title: 'Original',
        mode: 'unrestricted',
        config: { allowWrite: ['/home'], denyRead: ['/etc'], denyWrite: [], networkRestrictionsEnabled: true, allowedDomains: ['example.com'], deniedDomains: [], deniedCommands: ['rm'] },
      })

      const duped = await storage.duplicate(projId, original.id, 'Cloned')
      expect(duped.id).not.toBe(original.id)
      expect(duped.title).toBe('Cloned')
      expect(duped.mode).toBe('unrestricted')
      expect(duped.config.allowWrite).toEqual(['/home'])
      expect(duped.config.deniedCommands).toEqual(['rm'])
    })

    it('throws for non-existent source', async () => {
      await expect(
        storage.duplicate(projId, 'perm-missing' as PermissionsConfigId, 'Copy'),
      ).rejects.toThrow('not found')
    })
  })
})
