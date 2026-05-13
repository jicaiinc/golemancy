import type { TranscriptionId, ProjectId, ConversationId } from './common'
import type { ProviderTestStatus } from './settings'

// --- STT Provider Config (stored in GlobalSettings.speechToText) ---

export type SttProviderType = 'openai' | 'openai-compatible'

export interface SpeechToTextSettings {
  enabled: boolean
  providerType: SttProviderType
  apiKey?: string
  baseUrl?: string
  model: string
  language?: string
  testStatus?: ProviderTestStatus
}

// --- Transcription Record ---

export type TranscriptionStatus = 'pending' | 'success' | 'failed'

export interface TranscriptionRecord {
  id: TranscriptionId
  createdAt: string // ISO 8601
  status: TranscriptionStatus
  audioFileId: string // UUID filename (no extension)
  audioDurationMs: number
  audioSizeBytes: number
  text?: string // transcribed text (present when status='success')
  error?: string // error message (present when status='failed')
  provider: string // e.g. 'openai', 'openai-compatible'
  model: string // e.g. 'gpt-4o-mini-transcribe'
  projectId?: ProjectId // optional context
  conversationId?: ConversationId // optional context
  usedInMessage: boolean // whether user sent the text as a chat message
}

// --- Storage Usage ---

export interface SpeechStorageUsage {
  totalBytes: number
  recordCount: number
}
