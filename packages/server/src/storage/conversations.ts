import type {
  Conversation, ConversationId, ProjectId, AgentId, Message, MessageId,
  PaginationParams, PaginatedResult, ToolCallResult,
  IConversationService,
} from '@solocraft/shared'
import { eq, and, desc, sql } from 'drizzle-orm'
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
    const conditions = agentId
      ? and(eq(schema.conversations.projectId, projectId), eq(schema.conversations.agentId, agentId))
      : eq(schema.conversations.projectId, projectId)

    const rows = await db
      .select()
      .from(schema.conversations)
      .where(conditions)
      .orderBy(desc(schema.conversations.updatedAt))

    return rows.map(r => this.rowToConversation(r))
  }

  async getById(projectId: ProjectId, id: ConversationId): Promise<Conversation | null> {
    const db = this.getProjectDb(projectId)
    const rows = await db
      .select()
      .from(schema.conversations)
      .where(and(eq(schema.conversations.id, id), eq(schema.conversations.projectId, projectId)))
      .limit(1)

    if (rows.length === 0) return null

    const messages = await this.loadMessages(db, id)
    log.debug({ conversationId: id, messageCount: messages.length }, 'getById loaded messages')
    return this.rowToConversation(rows[0], messages)
  }

  async create(projectId: ProjectId, agentId: AgentId, title: string): Promise<Conversation> {
    const db = this.getProjectDb(projectId)
    const id = generateId('conv')
    log.debug({ projectId, agentId, conversationId: id }, 'creating conversation')
    const now = new Date().toISOString()

    await db.insert(schema.conversations).values({
      id,
      projectId,
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
    // Verify conversationId belongs to projectId
    const conv = await this.getById(projectId, conversationId)
    if (!conv) throw new Error(`Conversation ${conversationId} not found in project ${projectId}`)

    const now = new Date().toISOString()
    const msgId = generateId('msg')

    await db.insert(schema.messages).values({
      id: msgId,
      conversationId,
      role: 'user',
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
    data: { id: MessageId; role: string; content: string },
  ): Promise<void> {
    const db = this.getProjectDb(projectId)
    // Verify conversationId belongs to projectId
    const conv = await this.getById(projectId, conversationId)
    if (!conv) throw new Error(`Conversation ${conversationId} not found in project ${projectId}`)

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
      content: data.content,
      createdAt: now,
    })

    await db
      .update(schema.conversations)
      .set({ lastMessageAt: now, updatedAt: now })
      .where(eq(schema.conversations.id, conversationId))

    log.debug({ projectId, conversationId, messageId: data.id, role: data.role }, 'saved message')
  }

  async delete(projectId: ProjectId, id: ConversationId): Promise<void> {
    const db = this.getProjectDb(projectId)
    log.debug({ projectId, conversationId: id }, 'deleting conversation')
    await db
      .delete(schema.conversations)
      .where(and(eq(schema.conversations.id, id), eq(schema.conversations.projectId, projectId)))
  }

  async getMessages(
    projectId: ProjectId,
    conversationId: ConversationId,
    params: PaginationParams,
  ): Promise<PaginatedResult<Message>> {
    const db = this.getProjectDb(projectId)
    // Verify conversationId belongs to projectId
    const conv = await this.getById(projectId, conversationId)
    if (!conv) throw new Error(`Conversation ${conversationId} not found in project ${projectId}`)

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
      content: string
      tool_calls: string | null
      token_usage: string | null
      created_at: string
    }

    const items = db.all<FtsMessageRow>(sql`
      SELECT m.*
      FROM messages_fts fts
      JOIN messages m ON m.rowid = fts.rowid
      JOIN conversations c ON c.id = m.conversation_id
      WHERE fts.content MATCH ${sanitized}
        AND c.project_id = ${projectId}
      ORDER BY rank
      LIMIT ${pageSize}
      OFFSET ${offset}
    `)

    const countRows = db.all<{ cnt: number }>(sql`
      SELECT count(*) as cnt
      FROM messages_fts fts
      JOIN messages m ON m.rowid = fts.rowid
      JOIN conversations c ON c.id = m.conversation_id
      WHERE fts.content MATCH ${sanitized}
        AND c.project_id = ${projectId}
    `)

    return {
      items: items.map((r) => this.rowToMessage(r as unknown as typeof schema.messages.$inferSelect)),
      total: countRows[0]?.cnt ?? 0,
      page,
      pageSize,
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

  private rowToConversation(row: typeof schema.conversations.$inferSelect, messages: Message[] = []): Conversation {
    return {
      id: row.id as ConversationId,
      projectId: row.projectId as ProjectId,
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
      content: row.content,
      toolCalls: (row.toolCalls as ToolCallResult[] | null) ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.createdAt,
    }
  }
}
