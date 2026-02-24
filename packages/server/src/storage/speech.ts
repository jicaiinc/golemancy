import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { eq, desc, sql } from 'drizzle-orm'
import type { TranscriptionId, TranscriptionRecord, ProjectId, ConversationId } from '@golemancy/shared'
import type { SpeechDatabase } from '../db/speech-db'
import { transcriptionRecords } from '../db/speech-schema'
import { generateId } from '../utils/ids'
import { logger } from '../logger'

const log = logger.child({ component: 'storage:speech' })

function rowToRecord(row: typeof transcriptionRecords.$inferSelect): TranscriptionRecord {
  return {
    id: row.id as TranscriptionId,
    createdAt: row.createdAt,
    status: row.status as TranscriptionRecord['status'],
    audioFileId: row.audioFileId,
    audioDurationMs: row.audioDurationMs,
    audioSizeBytes: row.audioSizeBytes,
    text: row.text ?? undefined,
    error: row.error ?? undefined,
    provider: row.provider,
    model: row.model,
    projectId: row.projectId ? (row.projectId as ProjectId) : undefined,
    conversationId: row.conversationId ? (row.conversationId as ConversationId) : undefined,
    usedInMessage: row.usedInMessage === 1,
  }
}

export class SpeechStorage {
  constructor(
    private db: SpeechDatabase,
    private audioDir: string,
  ) {}

  async saveAudio(buffer: Buffer, extension: string): Promise<{ audioFileId: string; sizeBytes: number }> {
    const audioFileId = crypto.randomUUID()
    const filename = `${audioFileId}.${extension}`
    const filePath = path.join(this.audioDir, filename)

    await fs.mkdir(this.audioDir, { recursive: true })
    await fs.writeFile(filePath, buffer)
    log.debug({ audioFileId, size: buffer.length }, 'saved audio file')

    return { audioFileId, sizeBytes: buffer.length }
  }

  async createRecord(data: {
    status: TranscriptionRecord['status']
    audioFileId: string
    audioDurationMs: number
    audioSizeBytes: number
    provider: string
    model: string
    projectId?: string
    conversationId?: string
    usedInMessage: boolean
    createdAt: string
  }): Promise<TranscriptionRecord> {
    const id = generateId('trans')

    this.db.insert(transcriptionRecords).values({
      id,
      status: data.status,
      audioFileId: data.audioFileId,
      audioDurationMs: data.audioDurationMs,
      audioSizeBytes: data.audioSizeBytes,
      provider: data.provider,
      model: data.model,
      projectId: data.projectId ?? null,
      conversationId: data.conversationId ?? null,
      usedInMessage: data.usedInMessage ? 1 : 0,
      createdAt: data.createdAt,
    }).run()

    const row = this.db.select().from(transcriptionRecords).where(eq(transcriptionRecords.id, id)).get()
    return rowToRecord(row!)
  }

  async updateRecord(id: TranscriptionId, data: Partial<Pick<TranscriptionRecord, 'status' | 'text' | 'error' | 'usedInMessage'>>): Promise<TranscriptionRecord> {
    const updates: Record<string, unknown> = {}
    if (data.status !== undefined) updates.status = data.status
    if (data.text !== undefined) updates.text = data.text
    if (data.error !== undefined) updates.error = data.error
    if (data.usedInMessage !== undefined) updates.usedInMessage = data.usedInMessage ? 1 : 0

    if (Object.keys(updates).length > 0) {
      this.db.update(transcriptionRecords).set(updates).where(eq(transcriptionRecords.id, id)).run()
    }

    const row = this.db.select().from(transcriptionRecords).where(eq(transcriptionRecords.id, id)).get()
    if (!row) throw new Error(`Transcription record not found: ${id}`)
    return rowToRecord(row)
  }

  async getRecord(id: TranscriptionId): Promise<TranscriptionRecord | null> {
    const row = this.db.select().from(transcriptionRecords).where(eq(transcriptionRecords.id, id)).get()
    return row ? rowToRecord(row) : null
  }

  async listRecords(limit = 50, offset = 0): Promise<TranscriptionRecord[]> {
    const rows = this.db
      .select()
      .from(transcriptionRecords)
      .orderBy(desc(transcriptionRecords.createdAt))
      .limit(limit)
      .offset(offset)
      .all()

    return rows.map(rowToRecord)
  }

  async deleteRecord(id: TranscriptionId): Promise<number> {
    const record = await this.getRecord(id)
    if (!record) return 0

    let freedBytes = 0
    const audioPath = await this.findAudioFile(record.audioFileId)
    if (audioPath) {
      try {
        const stat = await fs.stat(audioPath)
        freedBytes = stat.size
        await fs.unlink(audioPath)
        log.debug({ audioFileId: record.audioFileId }, 'deleted audio file')
      } catch {
        log.warn({ audioFileId: record.audioFileId }, 'audio file not found during delete')
      }
    }

    this.db.delete(transcriptionRecords).where(eq(transcriptionRecords.id, id)).run()
    return freedBytes
  }

  async clearAll(): Promise<{ deletedCount: number; freedBytes: number }> {
    const records = this.db.select().from(transcriptionRecords).all()
    let freedBytes = 0

    for (const record of records) {
      const audioPath = await this.findAudioFile(record.audioFileId)
      if (audioPath) {
        try {
          const stat = await fs.stat(audioPath)
          freedBytes += stat.size
          await fs.unlink(audioPath)
        } catch {
          // File may already be deleted
        }
      }
    }

    this.db.delete(transcriptionRecords).run()
    log.info({ deletedCount: records.length, freedBytes }, 'cleared all speech history')

    return { deletedCount: records.length, freedBytes }
  }

  getAudioFilePath(audioFileId: string): string {
    // Find the actual file — extension may vary (webm, ogg, etc.)
    // Since we save as {uuid}.{ext}, try to find the file by prefix
    return path.join(this.audioDir, audioFileId)
  }

  async findAudioFile(audioFileId: string): Promise<string | null> {
    try {
      const files = await fs.readdir(this.audioDir)
      const match = files.find(f => f.startsWith(audioFileId))
      return match ? path.join(this.audioDir, match) : null
    } catch {
      return null
    }
  }

  async getStorageUsage(): Promise<{ totalBytes: number; recordCount: number }> {
    const result = this.db.all<{ cnt: number; bytes: number }>(
      sql`SELECT COUNT(*) as cnt, COALESCE(SUM(audio_size_bytes), 0) as bytes FROM transcription_records`
    )

    return {
      totalBytes: result[0]?.bytes ?? 0,
      recordCount: result[0]?.cnt ?? 0,
    }
  }
}
