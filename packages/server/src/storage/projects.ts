import fs from 'node:fs/promises'
import path from 'node:path'
import type { Project, ProjectId, IProjectService } from '@solocraft/shared'
import { readJson, writeJson, deleteDir, isNodeError } from './base'
import { getDataDir, validateId } from '../utils/paths'
import { generateId } from '../utils/ids'
import { logger } from '../logger'

const log = logger.child({ component: 'storage:projects' })

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
        dirs.map(d => readJson<Project>(path.join(this.projectsDir, d.name, 'project.json')))
      )
      return projects.filter((p): p is Project => p !== null)
    } catch (e) {
      if (isNodeError(e) && e.code === 'ENOENT') return []
      throw e
    }
  }

  async getById(id: ProjectId): Promise<Project | null> {
    return readJson<Project>(this.projectJsonPath(id))
  }

  async create(data: Pick<Project, 'name' | 'description' | 'icon' | 'workingDirectory'>): Promise<Project> {
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
    await fs.mkdir(path.join(projectDir, 'artifacts'), { recursive: true })
    await fs.mkdir(path.join(projectDir, 'memory'), { recursive: true })
    await fs.mkdir(path.join(projectDir, 'skills'), { recursive: true })
    await fs.mkdir(path.join(projectDir, 'cronjobs'), { recursive: true })
    await writeJson(this.projectJsonPath(id), project)

    return project
  }

  async update(
    id: ProjectId,
    data: Partial<Pick<Project, 'name' | 'description' | 'icon' | 'workingDirectory' | 'config' | 'mainAgentId'>>,
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
}
