import type { KBCollectionId, KBDocumentId, Timestamped } from './common'

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

// Settings
export interface EmbeddingSettings {
  enabled: boolean
  model: string
  apiKey?: string
  testPassed?: boolean
}

export interface ProjectEmbeddingConfig {
  model?: string
  apiKey?: string
}
