import { describe, it, expect } from 'vitest'
import type { GlobalSettings, ProjectConfig } from '@golemancy/shared'
import { resolveEmbeddingConfig } from './embedding'

const baseSettings: GlobalSettings = {
  providers: {
    openai: { name: 'OpenAI', sdkType: 'openai', apiKey: 'sk-test', models: ['gpt-4o'], testStatus: 'ok' },
  },
  theme: 'dark',
  embedding: { providerType: 'openai', model: 'text-embedding-3-small', apiKey: 'sk-embed-global', testStatus: 'ok' },
}

describe('resolveEmbeddingConfig', () => {
  it('returns null when settings is null', () => {
    expect(resolveEmbeddingConfig(null)).toBeNull()
  })

  it('returns null when settings is undefined', () => {
    expect(resolveEmbeddingConfig(undefined)).toBeNull()
  })

  it('returns null when embedding is not present', () => {
    const settings: GlobalSettings = { providers: {}, theme: 'dark' }
    expect(resolveEmbeddingConfig(settings)).toBeNull()
  })

  it('returns null when testStatus is not ok', () => {
    const settings: GlobalSettings = {
      ...baseSettings,
      embedding: { providerType: 'openai', model: 'text-embedding-3-small', apiKey: 'sk-key', testStatus: 'untested' },
    }
    expect(resolveEmbeddingConfig(settings)).toBeNull()
  })

  it('returns null when testStatus is error', () => {
    const settings: GlobalSettings = {
      ...baseSettings,
      embedding: { providerType: 'openai', model: 'text-embedding-3-small', apiKey: 'sk-key', testStatus: 'error' },
    }
    expect(resolveEmbeddingConfig(settings)).toBeNull()
  })

  it('returns null when testStatus is undefined', () => {
    const settings: GlobalSettings = {
      ...baseSettings,
      embedding: { providerType: 'openai', model: 'text-embedding-3-small', apiKey: 'sk-key' },
    }
    expect(resolveEmbeddingConfig(settings)).toBeNull()
  })

  it('returns null when apiKey is missing', () => {
    const settings: GlobalSettings = {
      ...baseSettings,
      embedding: { providerType: 'openai', model: 'text-embedding-3-small', testStatus: 'ok' },
    }
    expect(resolveEmbeddingConfig(settings)).toBeNull()
  })

  it('returns global config when fully configured', () => {
    expect(resolveEmbeddingConfig(baseSettings)).toEqual({
      model: 'text-embedding-3-small',
      apiKey: 'sk-embed-global',
      baseUrl: undefined,
      providerType: 'openai',
    })
  })

  it('uses default model when global model is empty', () => {
    const settings: GlobalSettings = {
      ...baseSettings,
      embedding: { providerType: 'openai', model: '', apiKey: 'sk-key', testStatus: 'ok' },
    }
    expect(resolveEmbeddingConfig(settings)).toEqual({
      model: 'text-embedding-3-small',
      apiKey: 'sk-key',
      baseUrl: undefined,
      providerType: 'openai',
    })
  })

  it('passes through baseUrl and providerType', () => {
    const settings: GlobalSettings = {
      ...baseSettings,
      embedding: { providerType: 'openai-compatible', model: 'custom-embed', apiKey: 'sk-key', baseUrl: 'https://my-api.com/v1', testStatus: 'ok' },
    }
    expect(resolveEmbeddingConfig(settings)).toEqual({
      model: 'custom-embed',
      apiKey: 'sk-key',
      baseUrl: 'https://my-api.com/v1',
      providerType: 'openai-compatible',
    })
  })

  // ── Project config overrides ──

  it('project mode=custom uses project config instead of global', () => {
    const projectConfig: ProjectConfig = {
      maxConcurrentAgents: 3,
      embedding: {
        mode: 'custom',
        custom: { providerType: 'openai', model: 'text-embedding-3-large', apiKey: 'sk-project-key', testStatus: 'ok' },
      },
    }
    expect(resolveEmbeddingConfig(baseSettings, projectConfig)).toEqual({
      model: 'text-embedding-3-large',
      apiKey: 'sk-project-key',
      baseUrl: undefined,
      providerType: 'openai',
    })
  })

  it('project mode=custom with untested testStatus returns null', () => {
    const projectConfig: ProjectConfig = {
      maxConcurrentAgents: 3,
      embedding: {
        mode: 'custom',
        custom: { providerType: 'openai', model: 'text-embedding-3-small', apiKey: 'sk-proj', testStatus: 'untested' },
      },
    }
    expect(resolveEmbeddingConfig(baseSettings, projectConfig)).toBeNull()
  })

  it('project mode=custom works even when global is not configured', () => {
    const settingsNoGlobal: GlobalSettings = { providers: {}, theme: 'dark' }
    const projectConfig: ProjectConfig = {
      maxConcurrentAgents: 3,
      embedding: {
        mode: 'custom',
        custom: { providerType: 'openai-compatible', model: 'my-model', apiKey: 'sk-proj', baseUrl: 'https://api.example.com', testStatus: 'ok' },
      },
    }
    expect(resolveEmbeddingConfig(settingsNoGlobal, projectConfig)).toEqual({
      model: 'my-model',
      apiKey: 'sk-proj',
      baseUrl: 'https://api.example.com',
      providerType: 'openai-compatible',
    })
  })

  it('project mode=default falls back to global', () => {
    const projectConfig: ProjectConfig = {
      maxConcurrentAgents: 3,
      embedding: { mode: 'default' },
    }
    expect(resolveEmbeddingConfig(baseSettings, projectConfig)).toEqual({
      model: 'text-embedding-3-small',
      apiKey: 'sk-embed-global',
      baseUrl: undefined,
      providerType: 'openai',
    })
  })

  it('falls back to global when project has no embedding config', () => {
    const projectConfig: ProjectConfig = {
      maxConcurrentAgents: 3,
    }
    expect(resolveEmbeddingConfig(baseSettings, projectConfig)).toEqual({
      model: 'text-embedding-3-small',
      apiKey: 'sk-embed-global',
      baseUrl: undefined,
      providerType: 'openai',
    })
  })
})
