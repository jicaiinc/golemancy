import type { CompactRecord, ConversationId, MessageId, ProjectId } from '@golemancy/shared'
import { eq, asc, desc } from 'drizzle-orm'
import type { AppDatabase } from '../db/client'
import * as schema from '../db/schema'
import { generateId } from '../utils/ids'

export class CompactRecordStorage {
  constructor(private getProjectDb: (projectId: ProjectId) => AppDatabase) {}

  async getLatest(projectId: ProjectId, conversationId: ConversationId): Promise<CompactRecord | null> {
    const db = this.getProjectDb(projectId)
    const rows = await db
      .select()
      .from(schema.compactRecords)
      .where(eq(schema.compactRecords.conversationId, conversationId))
      .orderBy(desc(schema.compactRecords.createdAt))
      .limit(1)

    if (rows.length === 0) return null
    return this.rowToCompactRecord(rows[0])
  }

  async list(projectId: ProjectId, conversationId: ConversationId): Promise<CompactRecord[]> {
    const db = this.getProjectDb(projectId)
    const rows = await db
      .select()
      .from(schema.compactRecords)
      .where(eq(schema.compactRecords.conversationId, conversationId))
      .orderBy(asc(schema.compactRecords.createdAt))

    return rows.map(r => this.rowToCompactRecord(r))
  }

  async save(
    projectId: ProjectId,
    data: {
      conversationId: ConversationId
      summary: string
      boundaryMessageId: MessageId
      inputTokens: number
      outputTokens: number
      trigger: 'auto' | 'manual'
    },
  ): Promise<CompactRecord> {
    const db = this.getProjectDb(projectId)
    const id = generateId('compact')
    const now = new Date().toISOString()

    await db.insert(schema.compactRecords).values({
      id,
      conversationId: data.conversationId,
      summary: data.summary,
      boundaryMessageId: data.boundaryMessageId,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      trigger: data.trigger,
      createdAt: now,
    })

    return {
      id,
      conversationId: data.conversationId,
      summary: data.summary,
      boundaryMessageId: data.boundaryMessageId,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      trigger: data.trigger,
      createdAt: now,
    }
  }

  private rowToCompactRecord(row: typeof schema.compactRecords.$inferSelect): CompactRecord {
    return {
      id: row.id,
      conversationId: row.conversationId as ConversationId,
      summary: row.summary,
      boundaryMessageId: row.boundaryMessageId as MessageId,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      trigger: row.trigger as CompactRecord['trigger'],
      createdAt: row.createdAt,
    }
  }
}
