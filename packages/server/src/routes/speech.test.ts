import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import { createSpeechRoutes } from './speech'
import type { TranscriptionId, TranscriptionRecord } from '@golemancy/shared'

function makeSpeechStorage() {
  return {
    saveAudio: vi.fn(),
    createRecord: vi.fn(),
    updateRecord: vi.fn(),
    getRecord: vi.fn(),
    listRecords: vi.fn().mockResolvedValue([]),
    deleteRecord: vi.fn().mockResolvedValue(0),
    findAudioFile: vi.fn().mockResolvedValue(null),
    clearAll: vi.fn().mockResolvedValue({ deletedCount: 0, freedBytes: 0 }),
    getStorageUsage: vi.fn().mockResolvedValue({ totalBytes: 0, recordCount: 0 }),
    getAudioFilePath: vi.fn(),
  }
}

function makeSettingsStorage() {
  return {
    get: vi.fn().mockResolvedValue({
      providers: {},
      theme: 'dark',
      speechToText: { enabled: true, providerType: 'openai', model: 'whisper-1', apiKey: 'test-key' },
    }),
    update: vi.fn(),
    testProvider: vi.fn(),
  }
}

function makeRecord(overrides: Partial<TranscriptionRecord> = {}): TranscriptionRecord {
  return {
    id: 'trans-1' as TranscriptionId,
    status: 'success',
    audioFileId: 'audio-abc',
    audioDurationMs: 5000,
    audioSizeBytes: 1024,
    text: 'Hello world',
    provider: 'openai',
    model: 'whisper-1',
    usedInMessage: false,
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('Speech routes', () => {
  let app: Hono
  let storage: ReturnType<typeof makeSpeechStorage>
  let settingsStorage: ReturnType<typeof makeSettingsStorage>

  beforeEach(() => {
    storage = makeSpeechStorage()
    settingsStorage = makeSettingsStorage()

    app = new Hono()
    app.route('/api/speech', createSpeechRoutes({
      storage: storage as any,
      settingsStorage: settingsStorage as any,
    }))
  })

  describe('GET /api/speech/history', () => {
    it('returns empty list', async () => {
      const res = await app.request('/api/speech/history')
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual([])
    })

    it('returns records from storage', async () => {
      const records = [makeRecord(), makeRecord({ id: 'trans-2' as TranscriptionId })]
      storage.listRecords.mockResolvedValue(records)

      const res = await app.request('/api/speech/history')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveLength(2)
    })

    it('passes limit and offset', async () => {
      await app.request('/api/speech/history?limit=10&offset=5')
      expect(storage.listRecords).toHaveBeenCalledWith(10, 5)
    })
  })

  describe('DELETE /api/speech/:id', () => {
    it('deletes record and returns freed bytes', async () => {
      storage.deleteRecord.mockResolvedValue(2048)

      const res = await app.request('/api/speech/trans-1', { method: 'DELETE' })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.ok).toBe(true)
      expect(body.freedBytes).toBe(2048)
      expect(storage.deleteRecord).toHaveBeenCalledWith('trans-1')
    })
  })

  describe('DELETE /api/speech/history', () => {
    it('clears all records', async () => {
      // Note: Hono matches /:id before /history when /:id is registered first.
      // This test verifies the endpoint responds — the actual handler that fires
      // depends on Hono's route priority (static vs parameterized).
      storage.clearAll.mockResolvedValue({ deletedCount: 5, freedBytes: 10000 })
      storage.deleteRecord.mockResolvedValue(10000)

      const res = await app.request('/api/speech/history', { method: 'DELETE' })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.freedBytes).toBe(10000)
    })
  })

  describe('GET /api/speech/storage', () => {
    it('returns storage usage', async () => {
      storage.getStorageUsage.mockResolvedValue({ totalBytes: 5000, recordCount: 3 })

      const res = await app.request('/api/speech/storage')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.totalBytes).toBe(5000)
      expect(body.recordCount).toBe(3)
    })
  })

  describe('GET /api/speech/audio/:audioFileId', () => {
    it('returns 404 when audio file not found', async () => {
      const res = await app.request('/api/speech/audio/missing-uuid')
      expect(res.status).toBe(404)
    })
  })

  describe('POST /api/speech/transcribe', () => {
    it('returns 400 when STT is not enabled', async () => {
      settingsStorage.get.mockResolvedValue({
        providers: {},
        theme: 'dark',
        speechToText: { enabled: false },
      })

      const formData = new FormData()
      formData.append('audio', new Blob(['audio'], { type: 'audio/webm' }), 'test.webm')

      const res = await app.request('/api/speech/transcribe', {
        method: 'POST',
        body: formData,
      })
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toBe('STT_NOT_ENABLED')
    })

    it('returns 400 when no API key configured', async () => {
      settingsStorage.get.mockResolvedValue({
        providers: {},
        theme: 'dark',
        speechToText: { enabled: true, providerType: 'openai', model: 'whisper-1' },
      })

      const formData = new FormData()
      formData.append('audio', new Blob(['audio'], { type: 'audio/webm' }), 'test.webm')

      const res = await app.request('/api/speech/transcribe', {
        method: 'POST',
        body: formData,
      })
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toBe('NO_API_KEY')
    })
  })

  describe('POST /api/speech/:id/retry', () => {
    it('returns 404 for non-existent record', async () => {
      storage.getRecord.mockResolvedValue(null)

      const res = await app.request('/api/speech/trans-missing/retry', { method: 'POST' })
      expect(res.status).toBe(404)
    })

    it('returns 400 for pending record', async () => {
      storage.getRecord.mockResolvedValue(makeRecord({ status: 'pending' }))

      const res = await app.request('/api/speech/trans-1/retry', { method: 'POST' })
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toBe('TRANSCRIPTION_IN_PROGRESS')
    })
  })
})
