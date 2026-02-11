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
  constructor(private db: AppDatabase) {}

  async list(projectId: ProjectId, agentId?: AgentId): Promise<Conversation[]> {
    const conditions = agentId
      ? and(eq(schema.conversations.projectId, projectId), eq(schema.conversations.agentId, agentId))
      : eq(schema.conversations.projectId, projectId)

    const rows = await this.db
      .select()
      .from(schema.conversations)
      .where(conditions)
      .orderBy(desc(schema.conversations.updatedAt))

    return rows.map(r => this.rowToConversation(r))
  }

  async getById(projectId: ProjectId, id: ConversationId): Promise<Conversation | null> {
    const rows = await this.db
      .select()
      .from(schema.conversations)
      .where(and(eq(schema.conversations.id, id), eq(schema.conversations.projectId, projectId)))
      .limit(1)

    if (rows.length === 0) return null
    return this.rowToConversation(rows[0])
  }

  async create(projectId: ProjectId, agentId: AgentId, title: string): Promise<Conversation> {
    const id = generateId('conv')
    log.debug({ projectId, agentId, conversationId: id }, 'creating conversation')
    const now = new Date().toISOString()

    await this.db.insert(schema.conversations).values({
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
    // Verify conversationId belongs to projectId
    const conv = await this.getById(projectId, conversationId)
    if (!conv) throw new Error(`Conversation ${conversationId} not found in project ${projectId}`)

    const now = new Date().toISOString()
    const msgId = generateId('msg')

    await this.db.insert(schema.messages).values({
      id: msgId,
      conversationId,
      role: 'user',
      content,
      createdAt: now,
    })

    await this.db
      .update(schema.conversations)
      .set({ lastMessageAt: now, updatedAt: now })
      .where(eq(schema.conversations.id, conversationId))
  }

  async delete(projectId: ProjectId, id: ConversationId): Promise<void> {
    log.debug({ projectId, conversationId: id }, 'deleting conversation')
    await this.db
      .delete(schema.conversations)
      .where(and(eq(schema.conversations.id, id), eq(schema.conversations.projectId, projectId)))
  }

  async getMessages(
    projectId: ProjectId,
    conversationId: ConversationId,
    params: PaginationParams,
  ): Promise<PaginatedResult<Message>> {
    // Verify conversationId belongs to projectId
    const conv = await this.getById(projectId, conversationId)
    if (!conv) throw new Error(`Conversation ${conversationId} not found in project ${projectId}`)

    const { page, pageSize } = params
    const offset = (page - 1) * pageSize

    const [items, countResult] = await Promise.all([
      this.db
        .select()
        .from(schema.messages)
        .where(eq(schema.messages.conversationId, conversationId))
        .orderBy(desc(schema.messages.createdAt))
        .limit(pageSize)
        .offset(offset),
      this.db
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

    const items = this.db.all<FtsMessageRow>(sql`
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

    const countRows = this.db.all<{ cnt: number }>(sql`
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

  private rowToConversation(row: typeof schema.conversations.$inferSelect): Conversation {
    return {
      id: row.id as ConversationId,
      projectId: row.projectId as ProjectId,
      agentId: row.agentId as AgentId,
      title: row.title,
      messages: [],
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
