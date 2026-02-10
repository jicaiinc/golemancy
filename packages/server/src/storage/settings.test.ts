import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createTmpDir } from '../test/helpers'

const state = vi.hoisted(() => ({ tmpDir: '' }))

vi.mock('../utils/paths', () => ({
  getDataDir: () => state.tmpDir,
  getProjectPath: (pid: string) => `${state.tmpDir}/projects/${pid}`,
}))

import { FileSettingsStorage } from './settings'

describe('FileSettingsStorage', () => {
  let storage: FileSettingsStorage
  let cleanup: () => Promise<void>

  beforeEach(async () => {
    const tmp = await createTmpDir()
    state.tmpDir = tmp.dir
    cleanup = tmp.cleanup
    storage = new FileSettingsStorage()
  })

  afterEach(async () => {
    await cleanup()
  })

  describe('get', () => {
    it('returns default settings when no file exists', async () => {
      const settings = await storage.get()
      expect(settings.defaultProvider).toBe('google')
      expect(settings.theme).toBe('dark')
      expect(settings.providers).toEqual([])
      expect(settings.userProfile.name).toBe('')
    })

    it('returns saved settings after update', async () => {
      await storage.update({ defaultProvider: 'anthropic' })

      const settings = await storage.get()
      expect(settings.defaultProvider).toBe('anthropic')
    })
  })

  describe('update', () => {
    it('merges with existing settings', async () => {
      const updated = await storage.update({ defaultProvider: 'openai' })
      expect(updated.defaultProvider).toBe('openai')
      expect(updated.theme).toBe('dark') // unchanged default
    })

    it('preserves previous updates', async () => {
      await storage.update({ defaultProvider: 'anthropic' })
      await storage.update({ theme: 'light' })

      const settings = await storage.get()
      expect(settings.defaultProvider).toBe('anthropic')
      expect(settings.theme).toBe('light')
    })

    it('updates nested fields', async () => {
      const updated = await storage.update({
        userProfile: { name: 'Test User', email: 'test@example.com' },
      })

      expect(updated.userProfile.name).toBe('Test User')
      expect(updated.userProfile.email).toBe('test@example.com')
    })

    it('updates providers list', async () => {
      const updated = await storage.update({
        providers: [
          { provider: 'google', apiKey: 'test-key', defaultModel: 'gemini-2.5-flash' },
        ],
      })

      expect(updated.providers).toHaveLength(1)
      expect(updated.providers[0].apiKey).toBe('test-key')
    })
  })
})
