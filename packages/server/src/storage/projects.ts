import fs from 'node:fs/promises'
import path from 'node:path'
import type { Project, ProjectId, ProjectConfig, IProjectService } from '@golemancy/shared'
import { readJson, writeJson, deleteDir, isNodeError } from './base'
import { getDataDir, validateId } from '../utils/paths'
import { generateId } from '../utils/ids'
import { logger } from '../logger'

const log = logger.child({ component: 'storage:projects' })

/** Migrate old project embedding format { model?, apiKey? } → new { mode, custom? } */
function migrateProjectEmbedding(config: ProjectConfig): boolean {
  const emb = config.embedding as Record<string, unknown> | undefined
  if (!emb) return false
  // Already migrated if 'mode' exists
  if ('mode' in emb) return false
  // Old format: { model?, apiKey? } without mode
  const hasCustom = emb.model || emb.apiKey
  if (hasCustom) {
    config.embedding = {
      mode: 'custom',
      custom: {
        providerType: 'openai',
        model: (emb.model as string) || 'text-embedding-3-small',
        apiKey: emb.apiKey as string | undefined,
        testStatus: 'untested',
      },
    }
  } else {
    config.embedding = { mode: 'default' }
  }
  return true
}

export class FileProjectStorage implements IProjectService {
  private get projectsDir() {
    return path.join(getDataDir(), 'projects')
  }

  private projectJsonPath(id: string) {
    validateId(id)
    return path.join(this.projectsDir, id, 'project.json')
  }

  async list(): Promise<Project[]> {
    try {
      const entries = await fs.readdir(this.projectsDir, { withFileTypes: true })
      const dirs = entries.filter(e => e.isDirectory())
      const projects = await Promise.all(
        dirs.map(async (d) => {
          const p = await readJson<Project>(path.join(this.projectsDir, d.name, 'project.json'))
          if (p && migrateProjectEmbedding(p.config)) {
            await writeJson(path.join(this.projectsDir, d.name, 'project.json'), p)
            log.info({ projectId: p.id }, 'migrated project embedding config')
          }
          return p
        })
      )
      return projects.filter((p): p is Project => p !== null)
    } catch (e) {
      if (isNodeError(e) && e.code === 'ENOENT') return []
      throw e
    }
  }

  async getById(id: ProjectId): Promise<Project | null> {
    const project = await readJson<Project>(this.projectJsonPath(id))
    if (project && migrateProjectEmbedding(project.config)) {
      await writeJson(this.projectJsonPath(id), project)
      log.info({ projectId: id }, 'migrated project embedding config')
    }
    return project
  }

  async create(data: Pick<Project, 'name' | 'description' | 'icon'>): Promise<Project> {
    const id = generateId('proj')
    log.debug({ projectId: id }, 'creating project')
    const now = new Date().toISOString()

    const project: Project = {
      id,
      ...data,
      config: { maxConcurrentAgents: 3 },
      agentCount: 0,
      activeAgentCount: 0,
      lastActivityAt: now,
      createdAt: now,
      updatedAt: now,
    }

    const projectDir = path.join(this.projectsDir, id)
    await fs.mkdir(path.join(projectDir, 'agents'), { recursive: true })
    await fs.mkdir(path.join(projectDir, 'tasks'), { recursive: true })
    await fs.mkdir(path.join(projectDir, 'workspace'), { recursive: true })
    await fs.mkdir(path.join(projectDir, 'memory'), { recursive: true })
    await fs.mkdir(path.join(projectDir, 'skills'), { recursive: true })
    await fs.mkdir(path.join(projectDir, 'cronjobs'), { recursive: true })
    await fs.mkdir(path.join(projectDir, 'permissions-config'), { recursive: true })
    await writeJson(this.projectJsonPath(id), project)

    return project
  }

  async update(
    id: ProjectId,
    data: Partial<Pick<Project, 'name' | 'description' | 'icon' | 'config' | 'mainAgentId'>>,
  ): Promise<Project> {
    const existing = await this.getById(id)
    if (!existing) throw new Error(`Project ${id} not found`)

    const updated: Project = {
      ...existing,
      ...data,
      updatedAt: new Date().toISOString(),
    }
    await writeJson(this.projectJsonPath(id), updated)
    return updated
  }

  async delete(id: ProjectId): Promise<void> {
    validateId(id)
    log.debug({ projectId: id }, 'deleting project')
    await deleteDir(path.join(this.projectsDir, id))
  }

  private topologyLayoutPath(id: string) {
    validateId(id)
    return path.join(this.projectsDir, id, 'topology-layout.json')
  }

  async getTopologyLayout(projectId: ProjectId): Promise<Record<string, { x: number; y: number }>> {
    return await readJson<Record<string, { x: number; y: number }>>(this.topologyLayoutPath(projectId)) ?? {}
  }

  async saveTopologyLayout(projectId: ProjectId, layout: Record<string, { x: number; y: number }>): Promise<void> {
    await writeJson(this.topologyLayoutPath(projectId), layout)
  }
}
