import type { KBCollectionId, KBDocumentId, Timestamped, ProviderTestStatus } from './common'

// Enums
export type KBCollectionTier = 'hot' | 'warm' | 'cold' | 'archive'
export type KBSourceType = 'manual' | 'upload' | 'agent'

// Entities
export interface KBCollection extends Timestamped {
  id: KBCollectionId
  name: string
  description: string
  tier: KBCollectionTier
  documentCount: number
  totalChars: number
}

export interface KBDocument extends Timestamped {
  id: KBDocumentId
  collectionId: KBCollectionId
  title: string
  content: string
  sourceType: KBSourceType
  sourceName: string
  metadata?: Record<string, unknown>
  tags?: string[]
  charCount: number
  chunkCount: number
}

export interface KBSearchResult {
  documentId: KBDocumentId
  collectionName: string
  chunkContent: string
  chunkIndex: number
  score: number
  sourceType: KBSourceType
  sourceName: string
}

// ── Embedding Settings ──

export type EmbeddingProviderType = 'openai' | 'openai-compatible'

/** Full embedding provider config (shared by global & project custom) */
export interface EmbeddingProviderConfig {
  providerType: EmbeddingProviderType
  apiKey?: string
  baseUrl?: string
  model: string
  testStatus?: ProviderTestStatus
}

/** Global embedding settings — no kill switch, config = available */
export type EmbeddingSettings = EmbeddingProviderConfig

/** Project-level embedding config — default inherits global, custom is independent */
export interface ProjectEmbeddingConfig {
  mode: 'default' | 'custom'
  custom?: EmbeddingProviderConfig
}
