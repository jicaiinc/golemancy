import type { ConversationTask, ConversationId, ProjectId, TaskId, ITaskService } from '@golemancy/shared'
import { eq, desc } from 'drizzle-orm'
import type { AppDatabase } from '../db/client'
import * as schema from '../db/schema'
import { generateId } from '../utils/ids'
import { logger } from '../logger'

const log = logger.child({ component: 'storage:tasks' })

export class SqliteConversationTaskStorage implements ITaskService {
  private getProjectDb: (projectId: ProjectId) => AppDatabase

  constructor(getProjectDb: (projectId: ProjectId) => AppDatabase) {
    this.getProjectDb = getProjectDb
  }

  async list(projectId: ProjectId, conversationId?: ConversationId): Promise<ConversationTask[]> {
    const db = this.getProjectDb(projectId)
    const query = db.select().from(schema.conversationTasks)

    let rows
    if (conversationId) {
      rows = await query.where(eq(schema.conversationTasks.conversationId, conversationId)).orderBy(desc(schema.conversationTasks.createdAt))
    } else {
      rows = await query.orderBy(desc(schema.conversationTasks.createdAt))
    }

    return rows.map(r => this.rowToTask(r))
  }

  async getById(projectId: ProjectId, id: TaskId): Promise<ConversationTask | null> {
    const db = this.getProjectDb(projectId)
    const rows = await db.select().from(schema.conversationTasks)
      .where(eq(schema.conversationTasks.id, id))
      .limit(1)
    if (rows.length === 0) return null
    return this.rowToTask(rows[0])
  }

  // --- Methods for built-in tools (not in ITaskService) ---

  async create(projectId: ProjectId, conversationId: ConversationId, data: {
    subject: string
    description?: string
    activeForm?: string
  }): Promise<ConversationTask> {
    const db = this.getProjectDb(projectId)
    const id = generateId('task')
    const now = new Date().toISOString()

    await db.insert(schema.conversationTasks).values({
      id,
      conversationId,
      subject: data.subject,
      description: data.description ?? '',
      status: 'pending',
      activeForm: data.activeForm,
      blocks: [],
      blockedBy: [],
      createdAt: now,
      updatedAt: now,
    })

    log.debug({ projectId, conversationId, taskId: id }, 'created conversation task')

    return {
      id,
      conversationId,
      subject: data.subject,
      description: data.description ?? '',
      status: 'pending',
      activeForm: data.activeForm,
      blocks: [],
      blockedBy: [],
      createdAt: now,
      updatedAt: now,
    }
  }

  async update(projectId: ProjectId, id: TaskId, data: {
    status?: string
    subject?: string
    description?: string
    activeForm?: string
    owner?: string
    metadata?: Record<string, unknown>
    addBlocks?: TaskId[]
    addBlockedBy?: TaskId[]
  }): Promise<ConversationTask> {
    const db = this.getProjectDb(projectId)
    const existing = await this.getById(projectId, id)
    if (!existing) throw new Error(`Task ${id} not found`)

    const now = new Date().toISOString()
    const updateFields: Record<string, unknown> = { updatedAt: now }

    if (data.status !== undefined) updateFields.status = data.status
    if (data.subject !== undefined) updateFields.subject = data.subject
    if (data.description !== undefined) updateFields.description = data.description
    if (data.activeForm !== undefined) updateFields.activeForm = data.activeForm
    if (data.owner !== undefined) updateFields.owner = data.owner

    // Merge metadata
    if (data.metadata !== undefined) {
      const merged = { ...(existing.metadata ?? {}), ...data.metadata }
      // Remove null keys
      for (const key of Object.keys(merged)) {
        if (merged[key] === null) delete merged[key]
      }
      updateFields.metadata = merged
    }

    // Append blocks (deduplicate)
    if (data.addBlocks?.length) {
      const merged = [...new Set([...existing.blocks, ...data.addBlocks])]
      updateFields.blocks = merged
    }

    // Append blockedBy (deduplicate)
    if (data.addBlockedBy?.length) {
      const merged = [...new Set([...existing.blockedBy, ...data.addBlockedBy])]
      updateFields.blockedBy = merged
    }

    await db.update(schema.conversationTasks)
      .set(updateFields)
      .where(eq(schema.conversationTasks.id, id))

    log.debug({ projectId, taskId: id, fields: Object.keys(updateFields) }, 'updated conversation task')

    return (await this.getById(projectId, id))!
  }

  async delete(projectId: ProjectId, id: TaskId): Promise<void> {
    await this.update(projectId, id, { status: 'deleted' })
  }

  private rowToTask(row: typeof schema.conversationTasks.$inferSelect): ConversationTask {
    return {
      id: row.id as TaskId,
      conversationId: row.conversationId as ConversationId,
      subject: row.subject,
      description: row.description,
      status: row.status as ConversationTask['status'],
      activeForm: row.activeForm ?? undefined,
      owner: row.owner ?? undefined,
      metadata: (row.metadata as Record<string, unknown>) ?? undefined,
      blocks: (row.blocks as TaskId[]) ?? [],
      blockedBy: (row.blockedBy as TaskId[]) ?? [],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }
}
