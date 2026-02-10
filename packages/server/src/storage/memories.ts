import path from 'node:path'
import type { MemoryEntry, MemoryId, ProjectId, IMemoryService } from '@solocraft/shared'
import { readJson, writeJson, deleteFile, listJsonFiles } from './base'
import { getProjectPath, validateId } from '../utils/paths'
import { generateId } from '../utils/ids'

export class FileMemoryStorage implements IMemoryService {
  private memoryDir(projectId: string) {
    return path.join(getProjectPath(projectId), 'memory')
  }

  private memoryPath(projectId: string, id: string) {
    validateId(id)
    return path.join(this.memoryDir(projectId), `${id}.json`)
  }

  async list(projectId: ProjectId): Promise<MemoryEntry[]> {
    return listJsonFiles<MemoryEntry>(this.memoryDir(projectId))
  }

  async create(
    projectId: ProjectId,
    data: Pick<MemoryEntry, 'content' | 'source' | 'tags'>,
  ): Promise<MemoryEntry> {
    const id = generateId('mem')
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

    const updated: MemoryEntry = {
      ...existing,
      ...data,
      updatedAt: new Date().toISOString(),
    }
    await writeJson(this.memoryPath(projectId, id), updated)
    return updated
  }

  async delete(projectId: ProjectId, id: MemoryId): Promise<void> {
    await deleteFile(this.memoryPath(projectId, id))
  }
}
