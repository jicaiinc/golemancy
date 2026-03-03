import type { GlobalSettings, ProjectConfig, EmbeddingProviderConfig, EmbeddingProviderType } from '@golemancy/shared'

const DEFAULT_MODEL = 'text-embedding-3-small'

export interface ResolvedEmbeddingConfig {
  model: string
  apiKey: string
  baseUrl?: string
  providerType: EmbeddingProviderType
}

/**
 * Mirror of server-side resolveEmbeddingConfig.
 * Resolves embedding config with project custom → global default priority.
 * Returns null if embedding is not available for this project.
 */
export function resolveEmbeddingConfig(
  settings: GlobalSettings | null | undefined,
  projectConfig?: ProjectConfig,
): ResolvedEmbeddingConfig | null {
  // 1. Project has custom config → use it
  const pe = projectConfig?.embedding
  if (pe?.mode === 'custom' && pe.custom) {
    return resolveProvider(pe.custom)
  }
  // 2. Otherwise fallback to global
  const ge = settings?.embedding
  if (!ge) return null
  return resolveProvider(ge)
}

function resolveProvider(config: EmbeddingProviderConfig): ResolvedEmbeddingConfig | null {
  if (config.testStatus !== 'ok') return null
  const apiKey = config.apiKey
  if (!apiKey) return null
  return {
    model: config.model || DEFAULT_MODEL,
    apiKey,
    baseUrl: config.baseUrl,
    providerType: config.providerType || 'openai',
  }
}
