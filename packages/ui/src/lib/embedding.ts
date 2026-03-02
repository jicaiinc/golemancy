import type { GlobalSettings, ProjectConfig } from '@golemancy/shared'

const DEFAULT_MODEL = 'text-embedding-3-small'

export interface ResolvedEmbeddingConfig {
  model: string
  apiKey: string
}

/**
 * Mirror of server-side resolveEmbeddingConfig.
 * Resolves embedding config with project override → global default priority.
 * Returns null if embedding is not available for this project.
 */
export function resolveEmbeddingConfig(
  settings: GlobalSettings | null | undefined,
  projectConfig?: ProjectConfig,
): ResolvedEmbeddingConfig | null {
  const globalEmbed = settings?.embedding
  if (!globalEmbed?.enabled) return null
  if (!globalEmbed.testPassed) return null

  const model = projectConfig?.embedding?.model || globalEmbed.model || DEFAULT_MODEL
  const apiKey = projectConfig?.embedding?.apiKey || globalEmbed.apiKey
  if (!apiKey) return null

  return { model, apiKey }
}
