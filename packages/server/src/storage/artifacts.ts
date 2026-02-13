import fs from 'node:fs/promises'
import path from 'node:path'
import type { Artifact, ArtifactId, ProjectId, AgentId, IArtifactService } from '@golemancy/shared'
import { readJson, writeJson, deleteFile, isNodeError } from './base'
import { getProjectPath, validateId, validateFilePath } from '../utils/paths'
import { logger } from '../logger'

const log = logger.child({ component: 'storage:artifacts' })

export class FileArtifactStorage implements IArtifactService {
  private artifactsDir(projectId: string) {
    return path.join(getProjectPath(projectId), 'artifacts')
  }

  private metaPath(projectId: string, id: string) {
    validateId(id)
    return path.join(this.artifactsDir(projectId), `${id}.meta.json`)
  }

  async list(projectId: ProjectId, agentId?: AgentId): Promise<Artifact[]> {
    const dir = this.artifactsDir(projectId)
    try {
      const entries = await fs.readdir(dir)
      const metaFiles = entries.filter(e => e.endsWith('.meta.json'))
      const items = await Promise.all(
        metaFiles.map(f => readJson<Artifact>(path.join(dir, f)))
      )
      const artifacts = items.filter((a): a is Artifact => a !== null)
      const filtered = agentId ? artifacts.filter(a => a.agentId === agentId) : artifacts
      log.debug({ projectId, agentId, count: filtered.length }, 'listed artifacts')
      return filtered
    } catch (e) {
      if (isNodeError(e) && e.code === 'ENOENT') return []
      throw e
    }
  }

  async getById(projectId: ProjectId, id: ArtifactId): Promise<Artifact | null> {
    return readJson<Artifact>(this.metaPath(projectId, id))
  }

  async delete(projectId: ProjectId, id: ArtifactId): Promise<void> {
    log.debug({ projectId, artifactId: id }, 'deleting artifact')
    const meta = await this.getById(projectId, id)
    if (meta?.filePath) {
      const base = this.artifactsDir(projectId)
      const safe = validateFilePath(base, meta.filePath)
      await deleteFile(safe)
    }
    await deleteFile(this.metaPath(projectId, id))
  }
}
