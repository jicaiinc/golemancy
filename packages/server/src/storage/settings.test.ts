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
      expect(settings.theme).toBe('dark')
      expect(settings.providers).toEqual({})
      expect(settings.userProfile.name).toBe('')
    })

    it('returns saved settings after update', async () => {
      await storage.update({ theme: 'light' })

      const settings = await storage.get()
      expect(settings.theme).toBe('light')
    })
  })

  describe('update', () => {
    it('merges with existing settings', async () => {
      const updated = await storage.update({ theme: 'light' })
      expect(updated.theme).toBe('light')
      expect(updated.providers).toEqual({}) // unchanged default
    })

    it('preserves previous updates', async () => {
      await storage.update({
        providers: {
          google: { name: 'Google', sdkType: 'google', apiKey: 'key', models: ['gemini-2.5-flash'] },
        },
      })
      await storage.update({ theme: 'light' })

      const settings = await storage.get()
      expect(Object.keys(settings.providers)).toContain('google')
      expect(settings.theme).toBe('light')
    })

    it('updates nested fields', async () => {
      const updated = await storage.update({
        userProfile: { name: 'Test User', email: 'test@example.com' },
      })

      expect(updated.userProfile.name).toBe('Test User')
      expect(updated.userProfile.email).toBe('test@example.com')
    })

    it('updates providers record', async () => {
      const updated = await storage.update({
        providers: {
          google: { name: 'Google', sdkType: 'google', apiKey: 'test-key', models: ['gemini-2.5-flash'] },
        },
      })

      expect(Object.keys(updated.providers)).toHaveLength(1)
      expect(updated.providers.google.apiKey).toBe('test-key')
    })
  })
})
