import { describe, it, expect } from 'vitest'
import { resolveEmbeddingConfig } from './embedding'
import type { GlobalSettings, ProjectConfig } from '@golemancy/shared'

function makeSettings(embedding?: GlobalSettings['embedding']): GlobalSettings {
  return {
    providers: {
      openai: { name: 'OpenAI', sdkType: 'openai', apiKey: 'sk-test', models: ['gpt-4o'], testStatus: 'ok' },
    },
    theme: 'dark',
    embedding,
  }
}

describe('resolveEmbeddingConfig', () => {
  it('returns null when embedding is undefined', () => {
    const result = resolveEmbeddingConfig(makeSettings(undefined))
    expect(result).toBeNull()
  })

  it('returns null when testStatus is not ok', () => {
    const result = resolveEmbeddingConfig(makeSettings({
      providerType: 'openai',
      model: 'text-embedding-3-small',
      apiKey: 'sk-embed',
      testStatus: 'untested',
    }))
    expect(result).toBeNull()
  })

  it('returns null when testStatus is error', () => {
    const result = resolveEmbeddingConfig(makeSettings({
      providerType: 'openai',
      model: 'text-embedding-3-small',
      apiKey: 'sk-embed',
      testStatus: 'error',
    }))
    expect(result).toBeNull()
  })

  it('returns null when testStatus is undefined', () => {
    const result = resolveEmbeddingConfig(makeSettings({
      providerType: 'openai',
      model: 'text-embedding-3-small',
      apiKey: 'sk-embed',
    }))
    expect(result).toBeNull()
  })

  it('returns null when apiKey is missing', () => {
    const result = resolveEmbeddingConfig(makeSettings({
      providerType: 'openai',
      model: 'text-embedding-3-small',
      testStatus: 'ok',
    }))
    expect(result).toBeNull()
  })

  it('returns config when testStatus is ok with apiKey', () => {
    const result = resolveEmbeddingConfig(makeSettings({
      providerType: 'openai',
      model: 'text-embedding-3-small',
      apiKey: 'sk-embed',
      testStatus: 'ok',
    }))
    expect(result).toEqual({
      model: 'text-embedding-3-small',
      apiKey: 'sk-embed',
      baseUrl: undefined,
      providerType: 'openai',
    })
  })

  it('passes through baseUrl and providerType', () => {
    const result = resolveEmbeddingConfig(makeSettings({
      providerType: 'openai-compatible',
      model: 'custom-embed',
      apiKey: 'sk-embed',
      baseUrl: 'https://my-api.com/v1',
      testStatus: 'ok',
    }))
    expect(result).toEqual({
      model: 'custom-embed',
      apiKey: 'sk-embed',
      baseUrl: 'https://my-api.com/v1',
      providerType: 'openai-compatible',
    })
  })

  it('uses project custom config when mode is custom', () => {
    const projectConfig: ProjectConfig = {
      maxConcurrentAgents: 3,
      embedding: {
        mode: 'custom',
        custom: { providerType: 'openai', model: 'text-embedding-3-large', apiKey: 'sk-proj', testStatus: 'ok' },
      },
    }
    const result = resolveEmbeddingConfig(
      makeSettings({
        providerType: 'openai',
        model: 'text-embedding-3-small',
        apiKey: 'sk-embed',
        testStatus: 'ok',
      }),
      projectConfig,
    )
    expect(result).toEqual({
      model: 'text-embedding-3-large',
      apiKey: 'sk-proj',
      baseUrl: undefined,
      providerType: 'openai',
    })
  })

  it('uses project custom apiKey', () => {
    const projectConfig: ProjectConfig = {
      maxConcurrentAgents: 3,
      embedding: {
        mode: 'custom',
        custom: { providerType: 'openai', model: 'text-embedding-3-small', apiKey: 'sk-project-key', testStatus: 'ok' },
      },
    }
    const result = resolveEmbeddingConfig(
      makeSettings({
        providerType: 'openai',
        model: 'text-embedding-3-small',
        apiKey: 'sk-embed',
        testStatus: 'ok',
      }),
      projectConfig,
    )
    expect(result).toEqual({
      model: 'text-embedding-3-small',
      apiKey: 'sk-project-key',
      baseUrl: undefined,
      providerType: 'openai',
    })
  })

  it('falls back to global when project mode is default', () => {
    const projectConfig: ProjectConfig = {
      maxConcurrentAgents: 3,
      embedding: { mode: 'default' },
    }
    const result = resolveEmbeddingConfig(
      makeSettings({
        providerType: 'openai',
        model: 'text-embedding-3-small',
        apiKey: 'sk-embed',
        testStatus: 'ok',
      }),
      projectConfig,
    )
    expect(result).toEqual({
      model: 'text-embedding-3-small',
      apiKey: 'sk-embed',
      baseUrl: undefined,
      providerType: 'openai',
    })
  })

  it('defaults model to text-embedding-3-small when not specified', () => {
    const result = resolveEmbeddingConfig(makeSettings({
      providerType: 'openai',
      model: '',
      apiKey: 'sk-embed',
      testStatus: 'ok',
    }))
    expect(result).toEqual({
      model: 'text-embedding-3-small',
      apiKey: 'sk-embed',
      baseUrl: undefined,
      providerType: 'openai',
    })
  })
})
