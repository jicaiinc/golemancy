import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { GlobalSettings } from '@golemancy/shared'
import { createTestApp, makeRequest, type MockStorage } from '../test/route-helpers'
import type { Hono } from 'hono'

const defaultSettings: GlobalSettings = {
  providers: [{ provider: 'openai', apiKey: 'sk-test', defaultModel: 'gpt-4o' }],
  defaultProvider: 'openai',
  theme: 'dark',
  userProfile: { name: 'Test', email: 'test@test.com' },
  defaultWorkingDirectoryBase: '/tmp',
}

describe('Settings routes', () => {
  let app: Hono
  let mocks: MockStorage

  beforeEach(() => {
    ({ app, mocks } = createTestApp())
    vi.mocked(mocks.settingsStorage.get).mockResolvedValue(defaultSettings)
  })

  describe('GET /api/settings', () => {
    it('returns global settings', async () => {
      const res = await makeRequest(app, 'GET', '/api/settings')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.defaultProvider).toBe('openai')
      expect(body.providers).toHaveLength(1)
    })
  })

  describe('PATCH /api/settings', () => {
    it('updates settings', async () => {
      const updated = { ...defaultSettings, theme: 'light' as const }
      vi.mocked(mocks.settingsStorage.update).mockResolvedValue(updated)

      const res = await makeRequest(app, 'PATCH', '/api/settings', { theme: 'light' })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.theme).toBe('light')
      expect(mocks.settingsStorage.update).toHaveBeenCalledWith({ theme: 'light' })
    })
  })
})
