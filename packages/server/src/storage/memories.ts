import type { MemoryEntry, MemoryCreateData, MemoryUpdateData, AgentId, MemoryId, ProjectId, IMemoryService } from '@golemancy/shared'
import { DEFAULT_MEMORY_PRIORITY } from '@golemancy/shared'
import { eq, and, desc, sql } from 'drizzle-orm'
import type { AppDatabase } from '../db/client'
import * as schema from '../db/schema'
import { generateId } from '../utils/ids'
import { logger } from '../logger'

const log = logger.child({ component: 'storage:memories' })

export class SqliteMemoryStorage implements IMemoryService {
  private getProjectDb: (projectId: ProjectId) => AppDatabase

  constructor(getProjectDb: (projectId: ProjectId) => AppDatabase) {
    this.getProjectDb = getProjectDb
  }

  async list(projectId: ProjectId, agentId: AgentId): Promise<MemoryEntry[]> {
    const db = this.getProjectDb(projectId)
    const rows = await db.select().from(schema.agentMemories)
      .where(eq(schema.agentMemories.agentId, agentId))
      .orderBy(
        desc(schema.agentMemories.pinned),
        desc(schema.agentMemories.priority),
        desc(schema.agentMemories.updatedAt),
      )
    return rows.map(r => this.rowToMemory(r))
  }

  async getById(projectId: ProjectId, id: MemoryId): Promise<MemoryEntry | null> {
    const db = this.getProjectDb(projectId)
    const rows = await db.select().from(schema.agentMemories)
      .where(eq(schema.agentMemories.id, id))
      .limit(1)
    if (rows.length === 0) return null
    return this.rowToMemory(rows[0])
  }

  async create(projectId: ProjectId, agentId: AgentId, data: MemoryCreateData): Promise<MemoryEntry> {
    const db = this.getProjectDb(projectId)
    const id = generateId('mem')
    const now = new Date().toISOString()

    const priority = Math.max(0, Math.min(5, data.priority ?? DEFAULT_MEMORY_PRIORITY))

    await db.insert(schema.agentMemories).values({
      id,
      agentId,
      content: data.content,
      pinned: data.pinned ? 1 : 0,
      priority,
      tags: data.tags ?? [],
      createdAt: now,
      updatedAt: now,
    })

    log.debug({ projectId, agentId, memoryId: id }, 'created agent memory')

    return {
      id,
      agentId,
      content: data.content,
      pinned: data.pinned ?? false,
      priority,
      tags: data.tags ?? [],
      createdAt: now,
      updatedAt: now,
    }
  }

  async update(projectId: ProjectId, agentId: AgentId, id: MemoryId, data: MemoryUpdateData): Promise<MemoryEntry> {
    const db = this.getProjectDb(projectId)
    const existing = await this.getById(projectId, id)
    if (!existing || existing.agentId !== agentId) throw new Error(`Memory ${id} not found`)

    const now = new Date().toISOString()
    const updateFields: Record<string, unknown> = { updatedAt: now }

    if (data.content !== undefined) updateFields.content = data.content
    if (data.pinned !== undefined) updateFields.pinned = data.pinned ? 1 : 0
    if (data.priority !== undefined) updateFields.priority = Math.max(0, Math.min(5, data.priority))
    if (data.tags !== undefined) updateFields.tags = data.tags

    await db.update(schema.agentMemories)
      .set(updateFields)
      .where(and(eq(schema.agentMemories.id, id), eq(schema.agentMemories.agentId, agentId)))

    log.debug({ projectId, memoryId: id, fields: Object.keys(updateFields) }, 'updated agent memory')

    return (await this.getById(projectId, id))!
  }

  async delete(projectId: ProjectId, agentId: AgentId, id: MemoryId): Promise<void> {
    const db = this.getProjectDb(projectId)
    await db.delete(schema.agentMemories)
      .where(and(eq(schema.agentMemories.id, id), eq(schema.agentMemories.agentId, agentId)))
    log.debug({ projectId, memoryId: id }, 'deleted agent memory')
  }

  /**
   * Load memories for auto-injection into agent context.
   * Returns { pinned, autoLoaded, totalCount }.
   */
  async loadForContext(projectId: ProjectId, agentId: AgentId, maxAutoLoad: number): Promise<{
    pinned: MemoryEntry[]
    autoLoaded: MemoryEntry[]
    totalCount: number
  }> {
    const db = this.getProjectDb(projectId)

    // All pinned memories (no limit)
    const pinned = await db.select().from(schema.agentMemories)
      .where(and(
        eq(schema.agentMemories.agentId, agentId),
        eq(schema.agentMemories.pinned, 1),
      ))
      .orderBy(desc(schema.agentMemories.priority), desc(schema.agentMemories.updatedAt))

    // Top N non-pinned memories by priority + recency
    const autoLoaded = await db.select().from(schema.agentMemories)
      .where(and(
        eq(schema.agentMemories.agentId, agentId),
        eq(schema.agentMemories.pinned, 0),
      ))
      .orderBy(desc(schema.agentMemories.priority), desc(schema.agentMemories.updatedAt))
      .limit(maxAutoLoad)

    // Total count
    const countResult = await db.select({ count: sql<number>`count(*)` }).from(schema.agentMemories)
      .where(eq(schema.agentMemories.agentId, agentId))
    const totalCount = countResult[0]?.count ?? 0

    return {
      pinned: pinned.map(r => this.rowToMemory(r)),
      autoLoaded: autoLoaded.map(r => this.rowToMemory(r)),
      totalCount,
    }
  }

  /**
   * Search memories by keyword and/or tags.
   */
  async search(projectId: ProjectId, agentId: AgentId, opts: {
    query?: string
    tags?: string[]
    pinnedOnly?: boolean
    minPriority?: number
  }): Promise<MemoryEntry[]> {
    const db = this.getProjectDb(projectId)

    // Fetch all agent memories and filter in JS (memory count per agent is typically small)
    let allRows = await db.select().from(schema.agentMemories)
      .where(eq(schema.agentMemories.agentId, agentId))
      .orderBy(desc(schema.agentMemories.pinned), desc(schema.agentMemories.priority), desc(schema.agentMemories.updatedAt))

    // Apply filters in JS (memory count per agent is typically small)
    if (opts.pinnedOnly) {
      allRows = allRows.filter(r => r.pinned === 1)
    }
    if (opts.minPriority !== undefined) {
      allRows = allRows.filter(r => r.priority >= opts.minPriority!)
    }
    if (opts.query) {
      const q = opts.query.toLowerCase()
      allRows = allRows.filter(r => r.content.toLowerCase().includes(q))
    }
    if (opts.tags && opts.tags.length > 0) {
      const searchTags = new Set(opts.tags.map(t => t.toLowerCase()))
      allRows = allRows.filter(r => {
        const memTags = (r.tags as string[]) ?? []
        return memTags.some(t => searchTags.has(t.toLowerCase()))
      })
    }

    return allRows.slice(0, 50).map(r => this.rowToMemory(r))
  }

  private rowToMemory(row: typeof schema.agentMemories.$inferSelect): MemoryEntry {
    return {
      id: row.id as MemoryId,
      agentId: row.agentId as AgentId,
      content: row.content,
      pinned: row.pinned === 1,
      priority: row.priority,
      tags: (row.tags as string[]) ?? [],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }
}
