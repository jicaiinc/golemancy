import type {
  ISpeechService, TranscriptionId, TranscriptionRecord,
  SpeechToTextSettings, SpeechStorageUsage,
  ProjectId, ConversationId,
} from '@golemancy/shared'
import { SEED_TRANSCRIPTION_RECORDS } from './data'

const delay = (ms = 50) => new Promise(r => setTimeout(r, ms))
let nextId = 200

function genId(prefix: string): string {
  return `${prefix}-${++nextId}`
}

export class MockSpeechService implements ISpeechService {
  private records = new Map<TranscriptionId, TranscriptionRecord>(
    SEED_TRANSCRIPTION_RECORDS.map(r => [r.id, { ...r }])
  )

  async transcribe(
    _audio: File | Blob,
    metadata: { audioDurationMs: number; projectId?: ProjectId; conversationId?: ConversationId },
  ): Promise<TranscriptionRecord> {
    await delay(500)
    const record: TranscriptionRecord = {
      id: genId('trans') as TranscriptionId,
      status: 'success',
      audioFileId: genId('audio'),
      audioDurationMs: metadata.audioDurationMs,
      audioSizeBytes: 24000,
      text: 'This is a mock transcription of the audio recording.',
      provider: 'openai',
      model: 'whisper-1',
      projectId: metadata.projectId,
      conversationId: metadata.conversationId,
      usedInMessage: false,
      createdAt: new Date().toISOString(),
    }
    this.records.set(record.id, record)
    return record
  }

  async listHistory(): Promise<TranscriptionRecord[]> {
    await delay()
    return [...this.records.values()].sort(
      (a, b) => b.createdAt.localeCompare(a.createdAt),
    )
  }

  getAudioUrl(_audioFileId: string): string {
    // Return a silent audio data URL for mock
    return 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA='
  }

  async deleteRecord(id: TranscriptionId): Promise<void> {
    await delay()
    this.records.delete(id)
  }

  async clearHistory(): Promise<{ deletedCount: number; freedBytes: number }> {
    await delay()
    const count = this.records.size
    this.records.clear()
    return { deletedCount: count, freedBytes: count * 24000 }
  }

  async retry(id: TranscriptionId): Promise<TranscriptionRecord> {
    await delay(300)
    const existing = this.records.get(id)
    if (!existing) throw new Error('Record not found')
    const updated: TranscriptionRecord = { ...existing, status: 'success', text: 'Retried mock transcription.', error: undefined }
    this.records.set(id, updated)
    return updated
  }

  async testProvider(_config: SpeechToTextSettings): Promise<{ ok: boolean; error?: string; latencyMs?: number }> {
    await delay(200)
    return { ok: true, latencyMs: 150 }
  }

  async getStorageUsage(): Promise<SpeechStorageUsage> {
    await delay()
    return { totalBytes: this.records.size * 24000, recordCount: this.records.size }
  }
}
