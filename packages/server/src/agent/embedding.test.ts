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

  it('returns null when not enabled', () => {
    const result = resolveEmbeddingConfig(makeSettings({
      enabled: false,
      model: 'text-embedding-3-small',
      apiKey: 'sk-embed',
      testPassed: true,
    }))
    expect(result).toBeNull()
  })

  it('returns null when testPassed is false', () => {
    const result = resolveEmbeddingConfig(makeSettings({
      enabled: true,
      model: 'text-embedding-3-small',
      apiKey: 'sk-embed',
      testPassed: false,
    }))
    expect(result).toBeNull()
  })

  it('returns null when testPassed is undefined', () => {
    const result = resolveEmbeddingConfig(makeSettings({
      enabled: true,
      model: 'text-embedding-3-small',
      apiKey: 'sk-embed',
    }))
    expect(result).toBeNull()
  })

  it('returns null when apiKey is missing', () => {
    const result = resolveEmbeddingConfig(makeSettings({
      enabled: true,
      model: 'text-embedding-3-small',
      testPassed: true,
    }))
    expect(result).toBeNull()
  })

  it('returns config when enabled and testPassed with apiKey', () => {
    const result = resolveEmbeddingConfig(makeSettings({
      enabled: true,
      model: 'text-embedding-3-small',
      apiKey: 'sk-embed',
      testPassed: true,
    }))
    expect(result).toEqual({
      model: 'text-embedding-3-small',
      apiKey: 'sk-embed',
    })
  })

  it('uses project override for model', () => {
    const projectConfig: ProjectConfig = {
      maxConcurrentAgents: 3,
      embedding: { model: 'text-embedding-3-large' },
    }
    const result = resolveEmbeddingConfig(
      makeSettings({
        enabled: true,
        model: 'text-embedding-3-small',
        apiKey: 'sk-embed',
        testPassed: true,
      }),
      projectConfig,
    )
    expect(result).toEqual({
      model: 'text-embedding-3-large',
      apiKey: 'sk-embed',
    })
  })

  it('uses project override for apiKey', () => {
    const projectConfig: ProjectConfig = {
      maxConcurrentAgents: 3,
      embedding: { apiKey: 'sk-project-key' },
    }
    const result = resolveEmbeddingConfig(
      makeSettings({
        enabled: true,
        model: 'text-embedding-3-small',
        apiKey: 'sk-embed',
        testPassed: true,
      }),
      projectConfig,
    )
    expect(result).toEqual({
      model: 'text-embedding-3-small',
      apiKey: 'sk-project-key',
    })
  })

  it('defaults model to text-embedding-3-small when not specified', () => {
    const result = resolveEmbeddingConfig(makeSettings({
      enabled: true,
      model: '',
      apiKey: 'sk-embed',
      testPassed: true,
    }))
    expect(result).toEqual({
      model: 'text-embedding-3-small',
      apiKey: 'sk-embed',
    })
  })
})
