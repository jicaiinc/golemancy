import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as speechSchema from '../db/speech-schema'
import { migrateSpeechDatabase } from '../db/speech-migrate'
import { createTmpDir } from '../test/helpers'
import { SpeechStorage } from './speech'
import type { TranscriptionId } from '@golemancy/shared'

function createTestSpeechDb() {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema: speechSchema })
  migrateSpeechDatabase(db)
  return { db, close: () => sqlite.close() }
}

describe('SpeechStorage', () => {
  let storage: SpeechStorage
  let closeDb: () => void
  let audioDir: string
  let cleanup: () => Promise<void>

  beforeEach(async () => {
    const tmp = await createTmpDir()
    audioDir = path.join(tmp.dir, 'audio')
    cleanup = tmp.cleanup
    await fs.mkdir(audioDir, { recursive: true })

    const { db, close } = createTestSpeechDb()
    closeDb = close
    storage = new SpeechStorage(db, audioDir)
  })

  afterEach(async () => {
    closeDb()
    await cleanup()
  })

  describe('saveAudio', () => {
    it('saves audio buffer and returns file id and size', async () => {
      const buffer = Buffer.from('fake-audio-data')
      const result = await storage.saveAudio(buffer, 'webm')

      expect(result.audioFileId).toBeTruthy()
      expect(result.sizeBytes).toBe(buffer.length)

      // Verify file exists on disk
      const files = await fs.readdir(audioDir)
      expect(files).toHaveLength(1)
      expect(files[0]).toMatch(/\.webm$/)
    })

    it('creates audioDir if not exists', async () => {
      await fs.rm(audioDir, { recursive: true, force: true })
      const buffer = Buffer.from('data')
      await storage.saveAudio(buffer, 'ogg')

      const files = await fs.readdir(audioDir)
      expect(files).toHaveLength(1)
    })
  })

  describe('createRecord + getRecord', () => {
    it('creates and retrieves a transcription record', async () => {
      const record = await storage.createRecord({
        status: 'pending',
        audioFileId: 'audio-123',
        audioDurationMs: 5000,
        audioSizeBytes: 1024,
        provider: 'openai',
        model: 'whisper-1',
        usedInMessage: false,
        createdAt: '2026-01-01T00:00:00Z',
      })

      expect(record.id).toMatch(/^trans-/)
      expect(record.status).toBe('pending')
      expect(record.audioFileId).toBe('audio-123')
      expect(record.audioDurationMs).toBe(5000)
      expect(record.usedInMessage).toBe(false)

      const found = await storage.getRecord(record.id)
      expect(found).not.toBeNull()
      expect(found!.id).toBe(record.id)
    })

    it('returns null for non-existent record', async () => {
      const found = await storage.getRecord('trans-missing' as TranscriptionId)
      expect(found).toBeNull()
    })
  })

  describe('updateRecord', () => {
    it('updates status and text', async () => {
      const record = await storage.createRecord({
        status: 'pending',
        audioFileId: 'audio-456',
        audioDurationMs: 3000,
        audioSizeBytes: 512,
        provider: 'openai',
        model: 'whisper-1',
        usedInMessage: false,
        createdAt: '2026-01-01T00:00:00Z',
      })

      const updated = await storage.updateRecord(record.id, {
        status: 'success',
        text: 'Hello world',
      })

      expect(updated.status).toBe('success')
      expect(updated.text).toBe('Hello world')
    })

    it('throws for non-existent record', async () => {
      await expect(
        storage.updateRecord('trans-missing' as TranscriptionId, { status: 'failed' }),
      ).rejects.toThrow('not found')
    })
  })

  describe('listRecords', () => {
    it('lists records ordered by createdAt desc', async () => {
      await storage.createRecord({
        status: 'success', audioFileId: 'a1', audioDurationMs: 100, audioSizeBytes: 10,
        provider: 'openai', model: 'whisper-1', usedInMessage: false, createdAt: '2026-01-01T00:00:00Z',
      })
      await storage.createRecord({
        status: 'success', audioFileId: 'a2', audioDurationMs: 200, audioSizeBytes: 20,
        provider: 'openai', model: 'whisper-1', usedInMessage: false, createdAt: '2026-01-02T00:00:00Z',
      })

      const records = await storage.listRecords()
      expect(records).toHaveLength(2)
      // Most recent first
      expect(records[0].audioFileId).toBe('a2')
      expect(records[1].audioFileId).toBe('a1')
    })

    it('respects limit and offset', async () => {
      for (let i = 0; i < 5; i++) {
        await storage.createRecord({
          status: 'success', audioFileId: `a${i}`, audioDurationMs: 100, audioSizeBytes: 10,
          provider: 'openai', model: 'whisper-1', usedInMessage: false, createdAt: `2026-01-0${i + 1}T00:00:00Z`,
        })
      }

      const page = await storage.listRecords(2, 1)
      expect(page).toHaveLength(2)
    })
  })

  describe('deleteRecord', () => {
    it('deletes record and audio file, returns freed bytes', async () => {
      const audioBuffer = Buffer.from('audio-content-here')
      const { audioFileId } = await storage.saveAudio(audioBuffer, 'webm')

      const record = await storage.createRecord({
        status: 'success', audioFileId, audioDurationMs: 100, audioSizeBytes: audioBuffer.length,
        provider: 'openai', model: 'whisper-1', usedInMessage: false, createdAt: '2026-01-01T00:00:00Z',
      })

      const freedBytes = await storage.deleteRecord(record.id)
      expect(freedBytes).toBe(audioBuffer.length)

      const found = await storage.getRecord(record.id)
      expect(found).toBeNull()
    })

    it('returns 0 for non-existent record', async () => {
      const freedBytes = await storage.deleteRecord('trans-missing' as TranscriptionId)
      expect(freedBytes).toBe(0)
    })
  })

  describe('findAudioFile', () => {
    it('finds audio file by prefix', async () => {
      const { audioFileId } = await storage.saveAudio(Buffer.from('data'), 'mp3')
      const found = await storage.findAudioFile(audioFileId)
      expect(found).not.toBeNull()
      expect(found).toContain(audioFileId)
    })

    it('returns null for missing audio', async () => {
      const found = await storage.findAudioFile('nonexistent-uuid')
      expect(found).toBeNull()
    })
  })

  describe('clearAll', () => {
    it('deletes all records and audio files', async () => {
      const { audioFileId: a1 } = await storage.saveAudio(Buffer.from('data1'), 'webm')
      const { audioFileId: a2 } = await storage.saveAudio(Buffer.from('data2'), 'ogg')

      await storage.createRecord({
        status: 'success', audioFileId: a1, audioDurationMs: 100, audioSizeBytes: 5,
        provider: 'openai', model: 'whisper-1', usedInMessage: false, createdAt: '2026-01-01T00:00:00Z',
      })
      await storage.createRecord({
        status: 'failed', audioFileId: a2, audioDurationMs: 200, audioSizeBytes: 5,
        provider: 'openai', model: 'whisper-1', usedInMessage: false, createdAt: '2026-01-02T00:00:00Z',
      })

      const result = await storage.clearAll()
      expect(result.deletedCount).toBe(2)
      expect(result.freedBytes).toBeGreaterThan(0)

      const records = await storage.listRecords()
      expect(records).toHaveLength(0)
    })
  })

  describe('getStorageUsage', () => {
    it('returns total bytes and record count', async () => {
      await storage.createRecord({
        status: 'success', audioFileId: 'a1', audioDurationMs: 100, audioSizeBytes: 1000,
        provider: 'openai', model: 'whisper-1', usedInMessage: false, createdAt: '2026-01-01T00:00:00Z',
      })
      await storage.createRecord({
        status: 'success', audioFileId: 'a2', audioDurationMs: 100, audioSizeBytes: 2000,
        provider: 'openai', model: 'whisper-1', usedInMessage: false, createdAt: '2026-01-02T00:00:00Z',
      })

      const usage = await storage.getStorageUsage()
      expect(usage.recordCount).toBe(2)
      expect(usage.totalBytes).toBe(3000)
    })

    it('returns zeros when empty', async () => {
      const usage = await storage.getStorageUsage()
      expect(usage.recordCount).toBe(0)
      expect(usage.totalBytes).toBe(0)
    })
  })
})
