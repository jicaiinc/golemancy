/**
 * Model resolution live tests — real API calls to AI providers.
 *
 * These tests call real provider APIs (Google, OpenAI, Anthropic).
 * They require API keys in the root `.env` file.
 * Run via: pnpm --filter @golemancy/server test:live
 *
 * Each provider test is wrapped in describeWithApiKey so it auto-skips
 * when the corresponding key is missing.
 */
import { it, expect } from 'vitest'
import { generateText } from 'ai'
import { resolveModel } from './model'
import { loadLiveSettings, describeWithApiKey } from '../test/live-settings'
import type { GlobalSettings } from '@golemancy/shared'

// ── Helper ────────────────────────────────────────────────────

function hasProvider(settings: GlobalSettings, provider: string): boolean {
  return provider in settings.providers
}

// ── Google ────────────────────────────────────────────────────

describeWithApiKey('model.live — Google (Gemini)', (settings) => {
  it.skipIf(!hasProvider(settings, 'google'))(
    'resolves and generates text with gemini-2.5-flash',
    async () => {
      const model = await resolveModel(settings, { provider: 'google', model: 'gemini-2.5-flash' })
      expect(model).toBeDefined()
      expect(model.modelId).toContain('gemini')

      const result = await generateText({
        model,
        prompt: 'Reply with exactly: HELLO_TEST',
        maxOutputTokens: 50,
      })

      expect(result.text).toBeTruthy()
      expect(result.text.length).toBeGreaterThan(0)
    },
    20_000,
  )
})

// ── OpenAI ────────────────────────────────────────────────────

describeWithApiKey('model.live — OpenAI', (settings) => {
  it.skipIf(!hasProvider(settings, 'openai'))(
    'resolves and generates text with gpt-4o-mini',
    async () => {
      const model = await resolveModel(settings, { provider: 'openai', model: 'gpt-4o-mini' })
      expect(model).toBeDefined()

      const result = await generateText({
        model,
        prompt: 'Reply with exactly: HELLO_TEST',
        maxOutputTokens: 50,
      })

      expect(result.text).toBeTruthy()
      expect(result.text.length).toBeGreaterThan(0)
    },
    20_000,
  )
})

// ── Anthropic ─────────────────────────────────────────────────

describeWithApiKey('model.live — Anthropic', (settings) => {
  it.skipIf(!hasProvider(settings, 'anthropic'))(
    'resolves and generates text with claude-haiku-4-5',
    async () => {
      const model = await resolveModel(settings, { provider: 'anthropic', model: 'claude-haiku-4-5' })
      expect(model).toBeDefined()

      const result = await generateText({
        model,
        prompt: 'Reply with exactly: HELLO_TEST',
        maxOutputTokens: 50,
      })

      expect(result.text).toBeTruthy()
      expect(result.text.length).toBeGreaterThan(0)
    },
    20_000,
  )
})

// ── Error Handling ────────────────────────────────────────────

describeWithApiKey('model.live — error handling', (settings) => {
  it('throws for unknown provider', async () => {
    await expect(
      resolveModel(settings, { provider: 'nonexistent', model: 'some-model' }),
    ).rejects.toThrow()
  })

  it('throws for provider not in settings', async () => {
    const emptySettings: GlobalSettings = {
      ...settings,
      providers: {},
    }
    await expect(
      resolveModel(emptySettings, { provider: 'google', model: 'gemini-2.5-flash' }),
    ).rejects.toThrow('not configured')
  })
})
