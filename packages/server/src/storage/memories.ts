import path from 'node:path'
import type { MemoryEntry, MemoryId, ProjectId, IMemoryService } from '@solocraft/shared'
import { readJson, writeJson, deleteFile, listJsonFiles } from './base'
import { getProjectPath, validateId } from '../utils/paths'
import { generateId } from '../utils/ids'
import { logger } from '../logger'

const log = logger.child({ component: 'storage:memories' })

export class FileMemoryStorage implements IMemoryService {
  private memoryDir(projectId: string) {
    return path.join(getProjectPath(projectId), 'memory')
  }

  private memoryPath(projectId: string, id: string) {
    validateId(id)
    return path.join(this.memoryDir(projectId), `${id}.json`)
  }

  async list(projectId: ProjectId): Promise<MemoryEntry[]> {
    const entries = await listJsonFiles<MemoryEntry>(this.memoryDir(projectId))
    log.debug({ projectId, count: entries.length }, 'listed memories')
    return entries
  }

  async create(
    projectId: ProjectId,
    data: Pick<MemoryEntry, 'content' | 'source' | 'tags'>,
  ): Promise<MemoryEntry> {
    const id = generateId('mem')
    log.debug({ projectId, memoryId: id }, 'creating memory entry')
    const now = new Date().toISOString()

    const entry: MemoryEntry = {
      id,
      projectId,
      ...data,
      createdAt: now,
      updatedAt: now,
    }

    await writeJson(this.memoryPath(projectId, id), entry)
    return entry
  }

  async update(
    projectId: ProjectId,
    id: MemoryId,
    data: Partial<Pick<MemoryEntry, 'content' | 'tags'>>,
  ): Promise<MemoryEntry> {
    const existing = await readJson<MemoryEntry>(this.memoryPath(projectId, id))
    if (!existing) throw new Error(`Memory ${id} not found`)

    log.debug({ projectId, memoryId: id }, 'updating memory entry')
    const updated: MemoryEntry = {
      ...existing,
      ...data,
      updatedAt: new Date().toISOString(),
    }
    await writeJson(this.memoryPath(projectId, id), updated)
    return updated
  }

  async delete(projectId: ProjectId, id: MemoryId): Promise<void> {
    log.debug({ projectId, memoryId: id }, 'deleting memory entry')
    await deleteFile(this.memoryPath(projectId, id))
  }
}
