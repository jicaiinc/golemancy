import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { GlobalSettings, AgentModelConfig } from '@golemancy/shared'

const mocks = vi.hoisted(() => {
  const anthropicModel = { id: 'anthropic-model' }
  const anthropicFactory = vi.fn(() => anthropicModel)
  const createAnthropic = vi.fn(() => anthropicFactory)

  const openaiModel = { id: 'openai-model' }
  const openaiFactory = vi.fn(() => openaiModel)
  const createOpenAI = vi.fn(() => openaiFactory)

  const googleModel = { id: 'google-model' }
  const googleFactory = vi.fn(() => googleModel)
  const createGoogleGenerativeAI = vi.fn(() => googleFactory)

  const gatewayModel = { id: 'gateway-model' }
  const gatewayFn = vi.fn(() => gatewayModel)

  return {
    createAnthropic, anthropicFactory, anthropicModel,
    createOpenAI, openaiFactory, openaiModel,
    createGoogleGenerativeAI, googleFactory, googleModel,
    gateway: gatewayFn, gatewayModel,
  }
})

vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: mocks.createAnthropic }))
vi.mock('@ai-sdk/openai', () => ({ createOpenAI: mocks.createOpenAI }))
vi.mock('@ai-sdk/google', () => ({ createGoogleGenerativeAI: mocks.createGoogleGenerativeAI }))
vi.mock('ai', () => ({ gateway: mocks.gateway }))

import { resolveModel } from './model'

function makeSettings(overrides: Partial<GlobalSettings> = {}): GlobalSettings {
  return {
    providers: [
      { provider: 'google', apiKey: 'google-key', defaultModel: 'gemini-2.5-flash' },
      { provider: 'openai', apiKey: 'openai-key', defaultModel: 'gpt-4o-mini' },
      { provider: 'anthropic', apiKey: 'anthropic-key', defaultModel: 'claude-haiku-4-5' },
    ],
    defaultProvider: 'google',
    theme: 'dark',
    userProfile: { name: '', email: '' },
    defaultWorkingDirectoryBase: '',
    ...overrides,
  }
}

describe('resolveModel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('direct provider mode', () => {
    it('resolves google provider with default model', async () => {
      const settings = makeSettings()
      const result = await resolveModel(settings)

      expect(mocks.createGoogleGenerativeAI).toHaveBeenCalledWith({
        apiKey: 'google-key',
        baseURL: undefined,
      })
      expect(mocks.googleFactory).toHaveBeenCalledWith('gemini-2.5-flash')
      expect(result).toBe(mocks.googleModel)
    })

    it('resolves openai provider', async () => {
      const settings = makeSettings({ defaultProvider: 'openai' })
      const result = await resolveModel(settings)

      expect(mocks.createOpenAI).toHaveBeenCalledWith({
        apiKey: 'openai-key',
        baseURL: undefined,
      })
      expect(mocks.openaiFactory).toHaveBeenCalledWith('gpt-4o-mini')
      expect(result).toBe(mocks.openaiModel)
    })

    it('resolves anthropic provider', async () => {
      const settings = makeSettings({ defaultProvider: 'anthropic' })
      const result = await resolveModel(settings)

      expect(mocks.createAnthropic).toHaveBeenCalledWith({
        apiKey: 'anthropic-key',
        baseURL: undefined,
      })
      expect(mocks.anthropicFactory).toHaveBeenCalledWith('claude-haiku-4-5')
      expect(result).toBe(mocks.anthropicModel)
    })

    it('uses agent config provider override', async () => {
      const settings = makeSettings()
      const agentConfig: AgentModelConfig = { provider: 'anthropic', model: 'claude-sonnet-4-5' }
      await resolveModel(settings, agentConfig)

      expect(mocks.createAnthropic).toHaveBeenCalled()
      expect(mocks.anthropicFactory).toHaveBeenCalledWith('claude-sonnet-4-5')
    })

    it('uses agent config model override', async () => {
      const settings = makeSettings()
      const agentConfig: AgentModelConfig = { model: 'gemini-2.5-pro' }
      await resolveModel(settings, agentConfig)

      expect(mocks.googleFactory).toHaveBeenCalledWith('gemini-2.5-pro')
    })

    it('passes baseURL when provider has one', async () => {
      const settings = makeSettings({
        providers: [
          { provider: 'openai', apiKey: 'key', defaultModel: 'gpt-4o', baseUrl: 'https://custom.api.com/v1' },
        ],
        defaultProvider: 'openai',
      })
      await resolveModel(settings)

      expect(mocks.createOpenAI).toHaveBeenCalledWith({
        apiKey: 'key',
        baseURL: 'https://custom.api.com/v1',
      })
    })

    it('resolves custom provider as OpenAI-compatible', async () => {
      const settings = makeSettings({
        providers: [
          { provider: 'custom', apiKey: 'ollama-key', defaultModel: 'llama3', baseUrl: 'http://localhost:11434/v1' },
        ],
        defaultProvider: 'custom',
      })
      await resolveModel(settings)

      expect(mocks.createOpenAI).toHaveBeenCalledWith({
        apiKey: 'ollama-key',
        baseURL: 'http://localhost:11434/v1',
      })
      expect(mocks.openaiFactory).toHaveBeenCalledWith('llama3')
    })
  })

  describe('gateway mode', () => {
    it('uses gateway when provider is custom and model contains slash', async () => {
      const settings = makeSettings()
      const agentConfig: AgentModelConfig = { provider: 'custom', model: 'google/gemini-2.5-flash' }
      const result = await resolveModel(settings, agentConfig)

      expect(mocks.gateway).toHaveBeenCalledWith('google/gemini-2.5-flash')
      expect(result).toBe(mocks.gatewayModel)
    })

    it('does not use gateway when provider is not custom', async () => {
      const settings = makeSettings()
      const agentConfig: AgentModelConfig = { provider: 'google', model: 'google/gemini-2.5-flash' }
      await resolveModel(settings, agentConfig)

      expect(mocks.gateway).not.toHaveBeenCalled()
      expect(mocks.createGoogleGenerativeAI).toHaveBeenCalled()
    })
  })

  describe('error handling', () => {
    it('throws when provider is not configured', async () => {
      const settings = makeSettings({ providers: [] })

      await expect(resolveModel(settings)).rejects.toThrow('Provider "google" not configured')
    })

    it('throws for unknown provider', async () => {
      const settings = makeSettings({
        defaultProvider: 'unknown' as any,
        providers: [{ provider: 'unknown' as any, apiKey: 'k', defaultModel: 'm' }],
      })

      await expect(resolveModel(settings)).rejects.toThrow('Unknown provider')
    })
  })

  describe('default model fallbacks', () => {
    it('falls back to DEFAULT_MODELS when provider config defaultModel is nullish', async () => {
      const settings = makeSettings({
        providers: [{ provider: 'google', apiKey: 'key', defaultModel: undefined as any }],
      })
      await resolveModel(settings)

      // ?? only falls through for null/undefined, not empty string
      expect(mocks.googleFactory).toHaveBeenCalledWith('gemini-2.5-flash')
    })

    it('falls back to global default when no agent config model', async () => {
      const settings = makeSettings({
        providers: [{ provider: 'anthropic', apiKey: 'key', defaultModel: 'claude-sonnet-4-5' }],
        defaultProvider: 'anthropic',
      })
      await resolveModel(settings)

      expect(mocks.anthropicFactory).toHaveBeenCalledWith('claude-sonnet-4-5')
    })
  })
})
