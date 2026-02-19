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

  return {
    createAnthropic, anthropicFactory, anthropicModel,
    createOpenAI, openaiFactory, openaiModel,
    createGoogleGenerativeAI, googleFactory, googleModel,
  }
})

vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: mocks.createAnthropic }))
vi.mock('@ai-sdk/openai', () => ({ createOpenAI: mocks.createOpenAI }))
vi.mock('@ai-sdk/google', () => ({ createGoogleGenerativeAI: mocks.createGoogleGenerativeAI }))

import { resolveModel } from './model'

function makeSettings(overrides: Partial<GlobalSettings> = {}): GlobalSettings {
  return {
    providers: {
      google: { name: 'Google', sdkType: 'google', apiKey: 'google-key', models: ['gemini-2.5-flash'] },
      openai: { name: 'OpenAI', sdkType: 'openai', apiKey: 'openai-key', models: ['gpt-4o-mini'] },
      anthropic: { name: 'Anthropic', sdkType: 'anthropic', apiKey: 'anthropic-key', models: ['claude-haiku-4-5'] },
    },
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

  describe('sdkType routing', () => {
    it('resolves google sdkType via Google SDK', async () => {
      const settings = makeSettings()
      const agentConfig: AgentModelConfig = { provider: 'google', model: 'gemini-2.5-flash' }
      const result = await resolveModel(settings, agentConfig)

      expect(mocks.createGoogleGenerativeAI).toHaveBeenCalledWith({
        apiKey: 'google-key',
        baseURL: undefined,
      })
      expect(mocks.googleFactory).toHaveBeenCalledWith('gemini-2.5-flash')
      expect(result).toBe(mocks.googleModel)
    })

    it('resolves openai sdkType via OpenAI SDK', async () => {
      const settings = makeSettings()
      const agentConfig: AgentModelConfig = { provider: 'openai', model: 'gpt-4o' }
      const result = await resolveModel(settings, agentConfig)

      expect(mocks.createOpenAI).toHaveBeenCalledWith({
        apiKey: 'openai-key',
        baseURL: undefined,
      })
      expect(mocks.openaiFactory).toHaveBeenCalledWith('gpt-4o')
      expect(result).toBe(mocks.openaiModel)
    })

    it('resolves anthropic sdkType via Anthropic SDK', async () => {
      const settings = makeSettings()
      const agentConfig: AgentModelConfig = { provider: 'anthropic', model: 'claude-sonnet-4-5' }
      const result = await resolveModel(settings, agentConfig)

      expect(mocks.createAnthropic).toHaveBeenCalledWith({
        apiKey: 'anthropic-key',
        baseURL: undefined,
      })
      expect(mocks.anthropicFactory).toHaveBeenCalledWith('claude-sonnet-4-5')
      expect(result).toBe(mocks.anthropicModel)
    })

    it('resolves openai-compatible sdkType via OpenAI SDK', async () => {
      const settings = makeSettings({
        providers: {
          ollama: {
            name: 'Ollama',
            sdkType: 'openai-compatible',
            apiKey: 'ollama-key',
            baseUrl: 'http://localhost:11434/v1',
            models: ['llama3'],
          },
        },
      })
      const agentConfig: AgentModelConfig = { provider: 'ollama', model: 'llama3' }
      const result = await resolveModel(settings, agentConfig)

      expect(mocks.createOpenAI).toHaveBeenCalledWith({
        apiKey: 'ollama-key',
        baseURL: 'http://localhost:11434/v1',
      })
      expect(mocks.openaiFactory).toHaveBeenCalledWith('llama3')
      expect(result).toBe(mocks.openaiModel)
    })
  })

  describe('apiKey and baseUrl passthrough', () => {
    it('passes baseUrl to SDK factory when configured', async () => {
      const settings = makeSettings({
        providers: {
          openai: {
            name: 'OpenAI',
            sdkType: 'openai',
            apiKey: 'key',
            baseUrl: 'https://custom.api.com/v1',
            models: ['gpt-4o'],
          },
        },
      })
      const agentConfig: AgentModelConfig = { provider: 'openai', model: 'gpt-4o' }
      await resolveModel(settings, agentConfig)

      expect(mocks.createOpenAI).toHaveBeenCalledWith({
        apiKey: 'key',
        baseURL: 'https://custom.api.com/v1',
      })
    })

    it('passes undefined baseUrl when not configured', async () => {
      const settings = makeSettings()
      const agentConfig: AgentModelConfig = { provider: 'google', model: 'gemini-2.5-flash' }
      await resolveModel(settings, agentConfig)

      expect(mocks.createGoogleGenerativeAI).toHaveBeenCalledWith({
        apiKey: 'google-key',
        baseURL: undefined,
      })
    })
  })

  describe('error handling', () => {
    it('throws when provider is not configured', async () => {
      const settings = makeSettings({ providers: {} })
      const agentConfig: AgentModelConfig = { provider: 'google', model: 'gemini-2.5-flash' }

      await expect(resolveModel(settings, agentConfig)).rejects.toThrow(
        'Provider "google" not configured in settings',
      )
    })

    it('throws when referencing a non-existent provider key', async () => {
      const settings = makeSettings()
      const agentConfig: AgentModelConfig = { provider: 'nonexistent', model: 'some-model' }

      await expect(resolveModel(settings, agentConfig)).rejects.toThrow(
        'Provider "nonexistent" not configured in settings',
      )
    })
  })
})
