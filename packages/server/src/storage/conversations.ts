import type {
  Conversation, ConversationId, ProjectId, AgentId, Message, MessageId,
  PaginationParams, PaginatedResult,
  IConversationService,
} from '@golemancy/shared'
import { eq, desc, sql } from 'drizzle-orm'
import type { AppDatabase } from '../db/client'
import * as schema from '../db/schema'
import { generateId } from '../utils/ids'
import { logger } from '../logger'

const log = logger.child({ component: 'storage:conversations' })

export class SqliteConversationStorage implements IConversationService {
  private getProjectDb: (projectId: ProjectId) => AppDatabase

  constructor(getProjectDb: (projectId: ProjectId) => AppDatabase) {
    this.getProjectDb = getProjectDb
  }

  async list(projectId: ProjectId, agentId?: AgentId): Promise<Conversation[]> {
    const db = this.getProjectDb(projectId)

    const rows = await db
      .select()
      .from(schema.conversations)
      .where(agentId ? eq(schema.conversations.agentId, agentId) : undefined)
      .orderBy(desc(schema.conversations.updatedAt))

    return rows.map(r => this.rowToConversation(r, projectId))
  }

  async getById(projectId: ProjectId, id: ConversationId): Promise<Conversation | null> {
    const db = this.getProjectDb(projectId)
    const rows = await db
      .select()
      .from(schema.conversations)
      .where(eq(schema.conversations.id, id))
      .limit(1)

    if (rows.length === 0) return null

    const messages = await this.loadMessages(db, id)
    log.debug({ conversationId: id, messageCount: messages.length }, 'getById loaded messages')
    return this.rowToConversation(rows[0], projectId, messages)
  }

  async create(projectId: ProjectId, agentId: AgentId, title: string): Promise<Conversation> {
    const db = this.getProjectDb(projectId)
    const id = generateId('conv')
    log.debug({ projectId, agentId, conversationId: id }, 'creating conversation')
    const now = new Date().toISOString()

    await db.insert(schema.conversations).values({
      id,
      agentId,
      title,
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
    })

    return {
      id,
      projectId,
      agentId,
      title,
      messages: [],
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
    }
  }

  async sendMessage(projectId: ProjectId, conversationId: ConversationId, content: string): Promise<void> {
    const db = this.getProjectDb(projectId)
    await this.verifyOwnership(db, conversationId)

    const now = new Date().toISOString()
    const msgId = generateId('msg')

    await db.insert(schema.messages).values({
      id: msgId,
      conversationId,
      role: 'user',
      parts: [{ type: 'text', text: content }],
      content,
      createdAt: now,
    })

    await db
      .update(schema.conversations)
      .set({ lastMessageAt: now, updatedAt: now })
      .where(eq(schema.conversations.id, conversationId))
  }

  async saveMessage(
    projectId: ProjectId,
    conversationId: ConversationId,
    data: { id: MessageId; role: string; parts: unknown[]; content: string; inputTokens?: number; outputTokens?: number; contextTokens?: number; provider?: string; model?: string; metadata?: Record<string, unknown> },
  ): Promise<void> {
    const db = this.getProjectDb(projectId)
    await this.verifyOwnership(db, conversationId)

    // Dedup: skip if message with this ID already exists
    const existing = await db
      .select({ id: schema.messages.id })
      .from(schema.messages)
      .where(eq(schema.messages.id, data.id))
      .limit(1)

    if (existing.length > 0) {
      log.debug({ messageId: data.id }, 'message already exists, skipping')
      return
    }

    const now = new Date().toISOString()
    await db.insert(schema.messages).values({
      id: data.id,
      conversationId,
      role: data.role,
      parts: data.parts,
      content: data.content,
      inputTokens: data.inputTokens ?? 0,
      outputTokens: data.outputTokens ?? 0,
      contextTokens: data.contextTokens ?? 0,
      provider: data.provider ?? '',
      model: data.model ?? '',
      metadata: data.metadata ?? null,
      createdAt: now,
    })

    await db
      .update(schema.conversations)
      .set({ lastMessageAt: now, updatedAt: now })
      .where(eq(schema.conversations.id, conversationId))

    log.debug({ projectId, conversationId, messageId: data.id, role: data.role }, 'saved message')
  }

  async update(projectId: ProjectId, id: ConversationId, data: { title?: string }): Promise<Conversation> {
    const db = this.getProjectDb(projectId)
    const now = new Date().toISOString()
    const updateFields: Record<string, string> = { updatedAt: now }
    if (data.title !== undefined) updateFields.title = data.title

    await db
      .update(schema.conversations)
      .set(updateFields)
      .where(eq(schema.conversations.id, id))

    const updated = await this.getById(projectId, id)
    if (!updated) throw new Error(`Conversation ${id} not found in project ${projectId}`)
    return updated
  }

  async delete(projectId: ProjectId, id: ConversationId): Promise<void> {
    const db = this.getProjectDb(projectId)
    log.debug({ projectId, conversationId: id }, 'deleting conversation')
    await db
      .delete(schema.conversations)
      .where(eq(schema.conversations.id, id))
  }

  async getMessages(
    projectId: ProjectId,
    conversationId: ConversationId,
    params: PaginationParams,
  ): Promise<PaginatedResult<Message>> {
    const db = this.getProjectDb(projectId)
    await this.verifyOwnership(db, conversationId)

    const { page, pageSize } = params
    const offset = (page - 1) * pageSize

    const [items, countResult] = await Promise.all([
      db
        .select()
        .from(schema.messages)
        .where(eq(schema.messages.conversationId, conversationId))
        .orderBy(desc(schema.messages.createdAt))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(schema.messages)
        .where(eq(schema.messages.conversationId, conversationId)),
    ])

    return {
      items: items.map(r => this.rowToMessage(r)),
      total: countResult[0].count,
      page,
      pageSize,
    }
  }

  async searchMessages(
    projectId: ProjectId,
    query: string,
    params: PaginationParams,
  ): Promise<PaginatedResult<Message>> {
    const db = this.getProjectDb(projectId)
    const { page, pageSize } = params
    const offset = (page - 1) * pageSize
    const sanitized = '"' + query.replace(/"/g, '""') + '"'

    interface FtsMessageRow {
      id: string
      conversation_id: string
      role: string
      parts: string
      content: string
      input_tokens: number
      output_tokens: number
      context_tokens: number
      provider: string
      model: string
      metadata: string | null
      created_at: string
    }

    const items = db.all<FtsMessageRow>(sql`
      SELECT m.*
      FROM messages_fts fts
      JOIN messages m ON m.rowid = fts.rowid
      WHERE fts.content MATCH ${sanitized}
      ORDER BY rank
      LIMIT ${pageSize}
      OFFSET ${offset}
    `)

    const countRows = db.all<{ cnt: number }>(sql`
      SELECT count(*) as cnt
      FROM messages_fts fts
      JOIN messages m ON m.rowid = fts.rowid
      WHERE fts.content MATCH ${sanitized}
    `)

    return {
      items: items.map((r): Message => ({
        id: r.id as MessageId,
        conversationId: r.conversation_id as ConversationId,
        role: r.role as Message['role'],
        parts: typeof r.parts === 'string' ? JSON.parse(r.parts) : r.parts,
        content: r.content,
        inputTokens: r.input_tokens ?? 0,
        outputTokens: r.output_tokens ?? 0,
        contextTokens: r.context_tokens ?? 0,
        provider: r.provider ?? '',
        model: r.model ?? '',
        ...(r.metadata != null ? { metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata } : {}),
        createdAt: r.created_at,
        updatedAt: r.created_at,
      })),
      total: countRows[0]?.cnt ?? 0,
      page,
      pageSize,
    }
  }

  private async verifyOwnership(
    db: AppDatabase,
    conversationId: ConversationId,
  ): Promise<void> {
    const rows = await db
      .select({ id: schema.conversations.id })
      .from(schema.conversations)
      .where(eq(schema.conversations.id, conversationId))
      .limit(1)
    if (rows.length === 0) {
      throw new Error(`Conversation ${conversationId} not found`)
    }
  }

  private async loadMessages(db: AppDatabase, conversationId: ConversationId): Promise<Message[]> {
    const rows = await db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.conversationId, conversationId))
      .orderBy(schema.messages.createdAt)

    return rows.map(r => this.rowToMessage(r))
  }

  private rowToConversation(row: typeof schema.conversations.$inferSelect, projectId: ProjectId, messages: Message[] = []): Conversation {
    return {
      id: row.id as ConversationId,
      projectId,
      agentId: row.agentId as AgentId,
      title: row.title,
      messages,
      lastMessageAt: row.lastMessageAt ?? row.createdAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }

  private rowToMessage(row: typeof schema.messages.$inferSelect): Message {
    return {
      id: row.id as MessageId,
      conversationId: row.conversationId as ConversationId,
      role: row.role as Message['role'],
      parts: row.parts as unknown[],
      content: row.content,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      contextTokens: row.contextTokens,
      provider: row.provider,
      model: row.model,
      ...(row.metadata != null ? { metadata: row.metadata as Record<string, unknown> } : {}),
      createdAt: row.createdAt,
      updatedAt: row.createdAt,
    }
  }
}
