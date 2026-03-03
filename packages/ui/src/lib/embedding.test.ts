import { describe, it, expect } from 'vitest'
import type { GlobalSettings, ProjectConfig } from '@golemancy/shared'
import { resolveEmbeddingConfig } from './embedding'

const baseSettings: GlobalSettings = {
  providers: {
    openai: { name: 'OpenAI', sdkType: 'openai', apiKey: 'sk-test', models: ['gpt-4o'], testStatus: 'ok' },
  },
  theme: 'dark',
  embedding: { enabled: true, model: 'text-embedding-3-small', apiKey: 'sk-embed-global', testPassed: true },
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

  it('returns null when embedding is disabled', () => {
    const settings: GlobalSettings = {
      ...baseSettings,
      embedding: { enabled: false, model: 'text-embedding-3-small', apiKey: 'sk-key' },
    }
    expect(resolveEmbeddingConfig(settings)).toBeNull()
  })

  it('returns null when testPassed is false', () => {
    const settings: GlobalSettings = {
      ...baseSettings,
      embedding: { enabled: true, model: 'text-embedding-3-small', apiKey: 'sk-key', testPassed: false },
    }
    expect(resolveEmbeddingConfig(settings)).toBeNull()
  })

  it('returns null when testPassed is undefined', () => {
    const settings: GlobalSettings = {
      ...baseSettings,
      embedding: { enabled: true, model: 'text-embedding-3-small', apiKey: 'sk-key' },
    }
    expect(resolveEmbeddingConfig(settings)).toBeNull()
  })

  it('returns null when apiKey is missing', () => {
    const settings: GlobalSettings = {
      ...baseSettings,
      embedding: { enabled: true, model: 'text-embedding-3-small', testPassed: true },
    }
    expect(resolveEmbeddingConfig(settings)).toBeNull()
  })

  it('returns global config when fully configured', () => {
    expect(resolveEmbeddingConfig(baseSettings)).toEqual({
      model: 'text-embedding-3-small',
      apiKey: 'sk-embed-global',
    })
  })

  it('uses default model when global model is empty', () => {
    const settings: GlobalSettings = {
      ...baseSettings,
      embedding: { enabled: true, model: '', apiKey: 'sk-key', testPassed: true },
    }
    expect(resolveEmbeddingConfig(settings)).toEqual({
      model: 'text-embedding-3-small',
      apiKey: 'sk-key',
    })
  })

  // ── Project config overrides ──

  it('project model overrides global model', () => {
    const projectConfig: ProjectConfig = {
      maxConcurrentAgents: 3,
      embedding: { model: 'text-embedding-3-large' },
    }
    expect(resolveEmbeddingConfig(baseSettings, projectConfig)).toEqual({
      model: 'text-embedding-3-large',
      apiKey: 'sk-embed-global',
    })
  })

  it('project apiKey overrides global apiKey', () => {
    const projectConfig: ProjectConfig = {
      maxConcurrentAgents: 3,
      embedding: { apiKey: 'sk-project-key' },
    }
    expect(resolveEmbeddingConfig(baseSettings, projectConfig)).toEqual({
      model: 'text-embedding-3-small',
      apiKey: 'sk-project-key',
    })
  })

  it('project config can override both model and apiKey', () => {
    const projectConfig: ProjectConfig = {
      maxConcurrentAgents: 3,
      embedding: { model: 'text-embedding-3-large', apiKey: 'sk-project-key' },
    }
    expect(resolveEmbeddingConfig(baseSettings, projectConfig)).toEqual({
      model: 'text-embedding-3-large',
      apiKey: 'sk-project-key',
    })
  })

  it('falls back to global when project embedding is empty object', () => {
    const projectConfig: ProjectConfig = {
      maxConcurrentAgents: 3,
      embedding: {},
    }
    expect(resolveEmbeddingConfig(baseSettings, projectConfig)).toEqual({
      model: 'text-embedding-3-small',
      apiKey: 'sk-embed-global',
    })
  })

  it('falls back to global when project has no embedding config', () => {
    const projectConfig: ProjectConfig = {
      maxConcurrentAgents: 3,
    }
    expect(resolveEmbeddingConfig(baseSettings, projectConfig)).toEqual({
      model: 'text-embedding-3-small',
      apiKey: 'sk-embed-global',
    })
  })
})
