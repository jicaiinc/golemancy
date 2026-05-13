import type {
  ISpeechService, TranscriptionId, TranscriptionRecord,
  SpeechToTextSettings, SpeechStorageUsage,
  ProjectId, ConversationId,
} from '@golemancy/shared'
import { fetchJson, getAuthToken } from './base'

export class HttpSpeechService implements ISpeechService {
  constructor(private baseUrl: string) {}

  async transcribe(
    audio: File | Blob,
    metadata: { audioDurationMs: number; projectId?: ProjectId; conversationId?: ConversationId },
  ): Promise<TranscriptionRecord> {
    const formData = new FormData()
    formData.append('audio', audio)
    formData.append('audioDurationMs', String(metadata.audioDurationMs))
    if (metadata.projectId) formData.append('projectId', metadata.projectId)
    if (metadata.conversationId) formData.append('conversationId', metadata.conversationId)

    // NOTE: Do NOT set Content-Type — browser sets multipart boundary automatically
    const headers: Record<string, string> = {}
    const token = getAuthToken()
    if (token) headers['Authorization'] = `Bearer ${token}`

    const res = await fetch(`${this.baseUrl}/api/speech/transcribe`, {
      method: 'POST',
      body: formData,
      headers,
    })
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
    return res.json()
  }

  listHistory(params?: { limit?: number; offset?: number }) {
    const qs = new URLSearchParams()
    if (params?.limit) qs.set('limit', String(params.limit))
    if (params?.offset) qs.set('offset', String(params.offset))
    const suffix = qs.toString() ? `?${qs}` : ''
    return fetchJson<TranscriptionRecord[]>(`${this.baseUrl}/api/speech/history${suffix}`)
  }

  getAudioUrl(audioFileId: string): string {
    return `${this.baseUrl}/api/speech/audio/${audioFileId}`
  }

  async deleteRecord(id: TranscriptionId) {
    await fetchJson(`${this.baseUrl}/api/speech/${id}`, { method: 'DELETE' })
  }

  clearHistory() {
    return fetchJson<{ deletedCount: number; freedBytes: number }>(
      `${this.baseUrl}/api/speech/history`,
      { method: 'DELETE' },
    )
  }

  retry(id: TranscriptionId) {
    return fetchJson<TranscriptionRecord>(
      `${this.baseUrl}/api/speech/${id}/retry`,
      { method: 'POST' },
    )
  }

  testProvider(config: SpeechToTextSettings) {
    return fetchJson<{ ok: boolean; error?: string; latencyMs?: number }>(
      `${this.baseUrl}/api/speech/test`,
      { method: 'POST', body: JSON.stringify(config) },
    )
  }

  getStorageUsage() {
    return fetchJson<SpeechStorageUsage>(`${this.baseUrl}/api/speech/storage`)
  }
}
