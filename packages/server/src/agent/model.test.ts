import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { GlobalSettings, AgentModelConfig } from '@golemancy/shared'
import { ConfigurationError } from './errors'

const mocks = vi.hoisted(() => {
  const anthropicModel = { id: 'anthropic-model' }
  const anthropicFactory = vi.fn(() => anthropicModel)
  const createAnthropic = vi.fn(() => anthropicFactory)

  const openaiModel = { id: 'openai-model' }
  const openaiResponsesModel = { id: 'openai-responses-model' }
  const openaiChatModel = { id: 'openai-chat-model' }
  const openaiFactory = vi.fn(() => openaiModel)
  openaiFactory.responses = vi.fn(() => openaiResponsesModel)
  openaiFactory.chat = vi.fn(() => openaiChatModel)
  const createOpenAI = vi.fn(() => openaiFactory)

  const googleModel = { id: 'google-model' }
  const googleFactory = vi.fn(() => googleModel)
  const createGoogleGenerativeAI = vi.fn(() => googleFactory)

  return {
    createAnthropic, anthropicFactory, anthropicModel,
    createOpenAI, openaiFactory, openaiModel, openaiResponsesModel, openaiChatModel,
    createGoogleGenerativeAI, googleFactory, googleModel,
  }
})

vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: mocks.createAnthropic }))
vi.mock('@ai-sdk/openai', () => ({ createOpenAI: mocks.createOpenAI }))
vi.mock('@ai-sdk/google', () => ({ createGoogleGenerativeAI: mocks.createGoogleGenerativeAI }))

import { resolveModel, buildSystemPromptOptions, type ResolvedModel } from './model'

function makeSettings(overrides: Partial<GlobalSettings> = {}): GlobalSettings {
  return {
    providers: {
      google: { name: 'Google', sdkType: 'google', apiKey: 'google-key', models: ['gemini-2.5-flash'] },
      openai: { name: 'OpenAI', sdkType: 'openai', apiKey: 'openai-key', models: ['gpt-4o-mini'] },
      anthropic: { name: 'Anthropic', sdkType: 'anthropic', apiKey: 'anthropic-key', models: ['claude-haiku-4-5'] },
    },
    theme: 'dark',
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
      expect(result.model).toBe(mocks.googleModel)
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
      expect(result.model).toBe(mocks.openaiModel)
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
      expect(result.model).toBe(mocks.anthropicModel)
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
      expect(mocks.openaiFactory.chat).toHaveBeenCalledWith('llama3')
      expect(result.model).toBe(mocks.openaiChatModel)
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
    it('throws ConfigurationError(PROVIDER_NOT_CONFIGURED) when provider not found', async () => {
      const settings = makeSettings({ providers: {} })
      const agentConfig: AgentModelConfig = { provider: 'google', model: 'gemini-2.5-flash' }

      await expect(resolveModel(settings, agentConfig)).rejects.toThrow(ConfigurationError)
      try {
        await resolveModel(settings, agentConfig)
      } catch (err) {
        expect((err as ConfigurationError).code).toBe('PROVIDER_NOT_CONFIGURED')
        expect((err as ConfigurationError).message).toContain('google')
      }
    })

    it('throws ConfigurationError(PROVIDER_NOT_CONFIGURED) for non-existent provider key', async () => {
      const settings = makeSettings()
      const agentConfig: AgentModelConfig = { provider: 'nonexistent', model: 'some-model' }

      await expect(resolveModel(settings, agentConfig)).rejects.toThrow(ConfigurationError)
      try {
        await resolveModel(settings, agentConfig)
      } catch (err) {
        expect((err as ConfigurationError).code).toBe('PROVIDER_NOT_CONFIGURED')
      }
    })

    it('throws ConfigurationError(API_KEY_MISSING) when apiKey is empty string', async () => {
      const settings = makeSettings({
        providers: {
          openai: { name: 'OpenAI', sdkType: 'openai', apiKey: '', models: ['gpt-4o'] },
        },
      })
      const agentConfig: AgentModelConfig = { provider: 'openai', model: 'gpt-4o' }

      await expect(resolveModel(settings, agentConfig)).rejects.toThrow(ConfigurationError)
      try {
        await resolveModel(settings, agentConfig)
      } catch (err) {
        expect((err as ConfigurationError).code).toBe('API_KEY_MISSING')
      }
    })

    it('throws ConfigurationError(API_KEY_MISSING) when apiKey is undefined', async () => {
      const settings = makeSettings({
        providers: {
          openai: { name: 'OpenAI', sdkType: 'openai', apiKey: undefined as any, models: ['gpt-4o'] },
        },
      })
      const agentConfig: AgentModelConfig = { provider: 'openai', model: 'gpt-4o' }

      await expect(resolveModel(settings, agentConfig)).rejects.toThrow(ConfigurationError)
      try {
        await resolveModel(settings, agentConfig)
      } catch (err) {
        expect((err as ConfigurationError).code).toBe('API_KEY_MISSING')
      }
    })

    it('does not throw when baseUrl contains localhost and apiKey is missing', async () => {
      const settings = makeSettings({
        providers: {
          ollama: {
            name: 'Ollama',
            sdkType: 'openai-compatible',
            apiKey: '',
            baseUrl: 'http://localhost:11434/v1',
            models: ['llama3'],
          },
        },
      })
      const agentConfig: AgentModelConfig = { provider: 'ollama', model: 'llama3' }

      const resolved = await resolveModel(settings, agentConfig)
      expect(resolved.model).toBeDefined()
    })
  })

  describe('defaultModel fallback', () => {
    it('falls back to defaultModel when agent provider is empty string', async () => {
      const settings = makeSettings({ defaultModel: { provider: 'google', model: 'gemini-2.5-flash' } })
      const agentConfig: AgentModelConfig = { provider: '', model: '' }

      const resolved = await resolveModel(settings, agentConfig)
      expect(resolved.model).toBe(mocks.googleModel)
    })

    it('falls back to defaultModel when agent provider was deleted from settings', async () => {
      const settings = makeSettings({
        providers: {
          google: { name: 'Google', sdkType: 'google', apiKey: 'key', models: ['gemini-2.5-flash'] },
        },
        defaultModel: { provider: 'google', model: 'gemini-2.5-flash' },
      })
      // Agent still references deleted "openai" provider
      const agentConfig: AgentModelConfig = { provider: 'openai', model: 'gpt-4o' }

      const resolved = await resolveModel(settings, agentConfig)
      expect(resolved.model).toBe(mocks.googleModel)
    })

    it('throws NO_PROVIDER_CONFIGURED when both agent provider and defaultModel are empty', async () => {
      const settings = makeSettings({ providers: {} })
      const agentConfig: AgentModelConfig = { provider: '', model: '' }

      await expect(resolveModel(settings, agentConfig)).rejects.toThrow(ConfigurationError)
      try { await resolveModel(settings, agentConfig) } catch (err) {
        expect((err as ConfigurationError).code).toBe('NO_PROVIDER_CONFIGURED')
      }
    })

    it('throws PROVIDER_NOT_CONFIGURED when defaultModel also references deleted provider', async () => {
      const settings = makeSettings({
        providers: {},
        defaultModel: { provider: 'deleted', model: 'some-model' },
      })
      const agentConfig: AgentModelConfig = { provider: 'also-deleted', model: 'some-model' }

      await expect(resolveModel(settings, agentConfig)).rejects.toThrow(ConfigurationError)
      try { await resolveModel(settings, agentConfig) } catch (err) {
        expect((err as ConfigurationError).code).toBe('PROVIDER_NOT_CONFIGURED')
      }
    })
  })

  describe('OAuth model resolution', () => {
    it('resolves OAuth provider via .responses() with useInstructionsParam', async () => {
      const settings = makeSettings({
        providers: {
          codex: {
            name: 'OpenAI Codex',
            sdkType: 'openai',
            models: ['gpt-5.3-codex'],
            oauth: {
              accessToken: 'test-access-token',
              refreshToken: 'test-refresh-token',
              expiresAt: new Date(Date.now() + 3600_000).toISOString(),
            },
            oauthConfig: {
              flowType: 'authorization_code',
              clientId: 'app_test',
              authEndpoint: 'https://auth.openai.com/oauth/authorize',
              tokenEndpoint: 'https://auth.openai.com/oauth/token',
              scope: 'openid',
              apiBaseUrl: 'https://chatgpt.com/backend-api/codex',
              sdkType: 'codex',
            },
          },
        },
      })
      const agentConfig: AgentModelConfig = { provider: 'codex', model: 'gpt-5.3-codex' }
      const result = await resolveModel(settings, agentConfig)

      expect(mocks.createOpenAI).toHaveBeenCalledWith({
        apiKey: 'test-access-token',
        baseURL: 'https://chatgpt.com/backend-api/codex',
        headers: undefined,
      })
      expect(mocks.openaiFactory.responses).toHaveBeenCalledWith('gpt-5.3-codex')
      expect(result.model).toBe(mocks.openaiResponsesModel)
      expect(result.useInstructionsParam).toBe(true)
      expect(result.providerOptions).toEqual({ openai: { store: false } })
    })

    it('passes ChatGPT-Account-Id header when accountId is present', async () => {
      const settings = makeSettings({
        providers: {
          codex: {
            name: 'OpenAI Codex',
            sdkType: 'openai',
            models: ['gpt-5.3-codex'],
            oauth: {
              accessToken: 'test-access-token',
              refreshToken: 'test-refresh-token',
              expiresAt: new Date(Date.now() + 3600_000).toISOString(),
              accountId: 'account-123',
            },
            oauthConfig: {
              flowType: 'authorization_code',
              clientId: 'app_test',
              authEndpoint: 'https://auth.openai.com/oauth/authorize',
              tokenEndpoint: 'https://auth.openai.com/oauth/token',
              scope: 'openid',
              apiBaseUrl: 'https://chatgpt.com/backend-api/codex',
              sdkType: 'codex',
            },
          },
        },
      })
      const agentConfig: AgentModelConfig = { provider: 'codex', model: 'gpt-5.3-codex' }
      await resolveModel(settings, agentConfig)

      expect(mocks.createOpenAI).toHaveBeenCalledWith({
        apiKey: 'test-access-token',
        baseURL: 'https://chatgpt.com/backend-api/codex',
        headers: { 'ChatGPT-Account-Id': 'account-123' },
      })
    })

    it('prefers OAuth path over API key when both exist', async () => {
      const settings = makeSettings({
        providers: {
          codex: {
            name: 'OpenAI Codex',
            sdkType: 'openai',
            apiKey: 'should-not-use-this',
            models: ['gpt-5.3-codex'],
            oauth: {
              accessToken: 'oauth-token',
              refreshToken: 'refresh',
              expiresAt: new Date(Date.now() + 3600_000).toISOString(),
            },
            oauthConfig: {
              flowType: 'authorization_code',
              clientId: 'app_test',
              authEndpoint: 'https://auth.openai.com/oauth/authorize',
              tokenEndpoint: 'https://auth.openai.com/oauth/token',
              scope: 'openid',
              apiBaseUrl: 'https://chatgpt.com/backend-api/codex',
              sdkType: 'codex',
            },
          },
        },
      })
      const agentConfig: AgentModelConfig = { provider: 'codex', model: 'gpt-5.3-codex' }
      const result = await resolveModel(settings, agentConfig)

      // Should use OAuth token, not API key
      expect(mocks.createOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'oauth-token' }),
      )
      expect(result.useInstructionsParam).toBe(true)
    })

    it('falls back to API key when OAuth has no accessToken', async () => {
      const settings = makeSettings({
        providers: {
          openai: {
            name: 'OpenAI',
            sdkType: 'openai',
            apiKey: 'api-key',
            models: ['gpt-4o'],
            oauth: {
              accessToken: '',
              refreshToken: 'refresh',
              expiresAt: new Date(Date.now() + 3600_000).toISOString(),
            },
            oauthConfig: {
              flowType: 'authorization_code',
              clientId: 'app_test',
              authEndpoint: 'https://auth.openai.com/oauth/authorize',
              tokenEndpoint: 'https://auth.openai.com/oauth/token',
              scope: 'openid',
              apiBaseUrl: 'https://chatgpt.com/backend-api/codex',
              sdkType: 'codex',
            },
          },
        },
      })
      const agentConfig: AgentModelConfig = { provider: 'openai', model: 'gpt-4o' }
      const result = await resolveModel(settings, agentConfig)

      // Should fall back to API key path
      expect(mocks.createOpenAI).toHaveBeenCalledWith({
        apiKey: 'api-key',
        baseURL: undefined,
      })
      expect(result.useInstructionsParam).toBeUndefined()
    })

    it('resolves openai-compat OAuth via .chat() — Golemancy runtime path', async () => {
      const settings = makeSettings({
        providers: {
          'golemancy-auto': {
            name: 'Golemancy',
            sdkType: 'openai',
            models: ['golemancy/auto'],
            oauth: {
              accessToken: 'sb-access-token',
              refreshToken: 'sb-refresh-token',
              expiresAt: new Date(Date.now() + 3600_000).toISOString(),
            },
            oauthConfig: {
              flowType: 'authorization_code',
              clientId: 'golemancy-desktop',
              authEndpoint: 'https://www.golemancy.ai/auth/desktop/authorize',
              tokenEndpoint: 'https://www.golemancy.ai/api/auth/desktop/token',
              scope: 'api',
              apiBaseUrl: 'https://runtime.golemancy.ai/v1',
              sdkType: 'openai-compat',
            },
          },
        },
      })
      const agentConfig: AgentModelConfig = { provider: 'golemancy-auto', model: 'golemancy/auto' }
      const result = await resolveModel(settings, agentConfig)

      // Golemancy must NOT touch the Codex Responses API.
      expect(mocks.openaiFactory.responses).not.toHaveBeenCalled()
      // Standard OpenAI chat completions, no headers, baseURL = runtime data plane.
      expect(mocks.createOpenAI).toHaveBeenCalledWith({
        apiKey: 'sb-access-token',
        baseURL: 'https://runtime.golemancy.ai/v1',
      })
      expect(mocks.openaiFactory.chat).toHaveBeenCalledWith('golemancy/auto')
      expect(result.model).toBe(mocks.openaiChatModel)
      // Crucially: no providerOptions.openai.store, no useInstructionsParam.
      expect(result.useInstructionsParam).toBeUndefined()
      expect(result.providerOptions).toBeUndefined()
    })

    it('falls back to codex sdkType for legacy persisted configs without sdkType (back-compat)', async () => {
      const settings = makeSettings({
        providers: {
          codex: {
            name: 'OpenAI Codex',
            sdkType: 'openai',
            models: ['gpt-5.3-codex'],
            oauth: {
              accessToken: 'legacy-token',
              refreshToken: 'r',
              expiresAt: new Date(Date.now() + 3600_000).toISOString(),
            },
            // Legacy oauthConfig: real Codex clientId, no sdkType field.
            oauthConfig: {
              flowType: 'authorization_code',
              clientId: 'app_EMoamEEZ73f0CkXaXp7hrann',
              authEndpoint: 'https://auth.openai.com/oauth/authorize',
              tokenEndpoint: 'https://auth.openai.com/oauth/token',
              scope: 'openid',
              apiBaseUrl: 'https://chatgpt.com/backend-api/codex',
            },
          },
        },
      })
      const agentConfig: AgentModelConfig = { provider: 'codex', model: 'gpt-5.3-codex' }
      const result = await resolveModel(settings, agentConfig)

      // Should still hit Codex Responses API via clientId-based fallback.
      expect(mocks.openaiFactory.responses).toHaveBeenCalledWith('gpt-5.3-codex')
      expect(result.useInstructionsParam).toBe(true)
      expect(result.providerOptions).toEqual({ openai: { store: false } })
    })
  })
})

describe('buildSystemPromptOptions', () => {
  it('returns system + providerOptions for standard models', () => {
    const resolved: ResolvedModel = { model: {} as any }
    const result = buildSystemPromptOptions(resolved, 'You are helpful.')
    expect(result.system).toBe('You are helpful.')
    expect(result.providerOptions).toBeUndefined()
  })

  it('returns providerOptions with providerOptions passthrough for standard models', () => {
    const resolved: ResolvedModel = {
      model: {} as any,
      providerOptions: { anthropic: { cacheControl: true } } as any,
    }
    const result = buildSystemPromptOptions(resolved, 'Hello')
    expect(result.system).toBe('Hello')
    expect(result.providerOptions).toEqual({ anthropic: { cacheControl: true } })
  })

  it('returns instructions in providerOptions for Codex models', () => {
    const resolved: ResolvedModel = {
      model: {} as any,
      providerOptions: { openai: { store: false } } as any,
      useInstructionsParam: true,
    }
    const result = buildSystemPromptOptions(resolved, 'You are a coding assistant.')
    expect(result.system).toBeUndefined()
    expect(result.providerOptions).toEqual({
      openai: { store: false, instructions: 'You are a coding assistant.' },
    })
  })

  it('provides default instructions when systemPrompt is empty for Codex models', () => {
    const resolved: ResolvedModel = {
      model: {} as any,
      providerOptions: { openai: { store: false } } as any,
      useInstructionsParam: true,
    }
    const result = buildSystemPromptOptions(resolved, '')
    expect(result.system).toBeUndefined()
    expect(result.providerOptions).toEqual({
      openai: { store: false, instructions: 'You are a helpful assistant.' },
    })
  })

  it('provides default instructions when systemPrompt is undefined for Codex models', () => {
    const resolved: ResolvedModel = {
      model: {} as any,
      providerOptions: { openai: { store: false } } as any,
      useInstructionsParam: true,
    }
    const result = buildSystemPromptOptions(resolved, undefined)
    expect(result.system).toBeUndefined()
    expect(result.providerOptions).toEqual({
      openai: { store: false, instructions: 'You are a helpful assistant.' },
    })
  })

  it('preserves existing providerOptions when adding instructions', () => {
    const resolved: ResolvedModel = {
      model: {} as any,
      providerOptions: { openai: { store: false, user: 'test-user' } } as any,
      useInstructionsParam: true,
    }
    const result = buildSystemPromptOptions(resolved, 'Custom prompt')
    expect(result.providerOptions).toEqual({
      openai: { store: false, user: 'test-user', instructions: 'Custom prompt' },
    })
  })
})
