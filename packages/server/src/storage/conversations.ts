import type {
  Conversation, ConversationId, ProjectId, AgentId, Message,
  PaginationParams, PaginatedResult,
  IConversationService,
} from '@solocraft/shared'
import { eq, and, desc, sql } from 'drizzle-orm'
import type { AppDatabase } from '../db/client'
import * as schema from '../db/schema'
import { generateId } from '../utils/ids'

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
    await this.db
      .delete(schema.conversations)
      .where(and(eq(schema.conversations.id, id), eq(schema.conversations.projectId, projectId)))
  }

  async getMessages(
    projectId: ProjectId,
    conversationId: ConversationId,
    params: PaginationParams,
  ): Promise<PaginatedResult<Message>> {
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

    const items = this.db.all<any>(sql`
      SELECT m.*, c.project_id, c.agent_id
      FROM messages_fts fts
      JOIN messages m ON m.rowid = fts.rowid
      JOIN conversations c ON c.id = m.conversation_id
      WHERE fts.content MATCH ${query}
        AND c.project_id = ${projectId}
      ORDER BY rank
      LIMIT ${pageSize}
      OFFSET ${offset}
    `)

    const countRows = this.db.all<any>(sql`
      SELECT count(*) as cnt
      FROM messages_fts fts
      JOIN messages m ON m.rowid = fts.rowid
      JOIN conversations c ON c.id = m.conversation_id
      WHERE fts.content MATCH ${query}
        AND c.project_id = ${projectId}
    `)

    return {
      items: items.map((r: any) => this.rowToMessage(r)),
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
      id: row.id as any,
      conversationId: row.conversationId as ConversationId,
      role: row.role as Message['role'],
      content: row.content,
      toolCalls: row.toolCalls as any,
      createdAt: row.createdAt,
      updatedAt: row.createdAt,
    }
  }
}
