import { embed, embedMany } from 'ai'
import type { GlobalSettings, ProjectConfig, EmbeddingProviderConfig, EmbeddingProviderType } from '@golemancy/shared'
import { logger } from '../logger'

const log = logger.child({ component: 'agent:embedding' })

/** Known embedding model dimensions */
const MODEL_DIMENSIONS: Record<string, number> = {
  'text-embedding-3-small': 1536,
  'text-embedding-3-large': 3072,
  'text-embedding-ada-002': 1536,
}

/** Default embedding model */
const DEFAULT_MODEL = 'text-embedding-3-small'

export function getEmbeddingDimensions(model: string): number {
  return MODEL_DIMENSIONS[model] ?? 1536
}

export interface ResolvedEmbeddingConfig {
  model: string
  apiKey: string
  baseUrl?: string
  providerType: EmbeddingProviderType
}

/**
 * Resolve embedding config from global settings + optional project override.
 * Returns null if embedding is not configured or test has not passed.
 */
export function resolveEmbeddingConfig(
  settings: GlobalSettings,
  projectConfig?: ProjectConfig,
): ResolvedEmbeddingConfig | null {
  // 1. Project has custom config → use it
  const pe = projectConfig?.embedding
  if (pe?.mode === 'custom' && pe.custom) {
    return resolveProvider(pe.custom)
  }
  // 2. Otherwise fallback to global
  const ge = settings.embedding
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

async function createEmbeddingModel(config: ResolvedEmbeddingConfig) {
  const { createOpenAI } = await import('@ai-sdk/openai')
  const openai = createOpenAI({
    apiKey: config.apiKey,
    ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
  })
  return openai.embedding(config.model)
}

/** Embed a single text string. */
export async function embedText(text: string, config: ResolvedEmbeddingConfig): Promise<number[]> {
  log.debug({ model: config.model, textLength: text.length }, 'embedding single text')
  const model = await createEmbeddingModel(config)
  const { embedding } = await embed({ model, value: text })
  return embedding
}

/** Max texts per embedMany call (OpenAI limit is 2048; use 256 for safety) */
const EMBED_BATCH_SIZE = 256

/** Embed multiple text strings in batch, splitting into sliding windows. */
export async function embedTexts(texts: string[], config: ResolvedEmbeddingConfig): Promise<number[][]> {
  if (texts.length === 0) return []
  log.debug({ model: config.model, count: texts.length, batches: Math.ceil(texts.length / EMBED_BATCH_SIZE) }, 'embedding batch texts')
  const model = await createEmbeddingModel(config)

  if (texts.length <= EMBED_BATCH_SIZE) {
    const { embeddings } = await embedMany({ model, values: texts })
    return embeddings
  }

  const allEmbeddings: number[][] = []
  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE)
    const { embeddings } = await embedMany({ model, values: batch })
    allEmbeddings.push(...embeddings)
  }
  return allEmbeddings
}
