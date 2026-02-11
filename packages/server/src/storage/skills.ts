import fs from 'node:fs/promises'
import path from 'node:path'
import matter from 'gray-matter'
import type { Skill, SkillId, ProjectId, SkillCreateData, SkillUpdateData, ISkillService, IAgentService } from '@solocraft/shared'
import { deleteDir, isNodeError } from './base'
import { getProjectPath, validateId } from '../utils/paths'
import { generateId } from '../utils/ids'
import { logger } from '../logger'

const log = logger.child({ component: 'storage:skills' })

interface SkillMetadata {
  id: SkillId
  projectId: ProjectId
  createdAt: string
  updatedAt: string
}

function parseSkillMd(content: string): { name: string; description: string; instructions: string } {
  const { data, content: body } = matter(content)
  return {
    name: (data.name as string) ?? '',
    description: (data.description as string) ?? '',
    instructions: body.trim(),
  }
}

function buildSkillMd(name: string, description: string, instructions: string): string {
  return matter.stringify(instructions, { name, description })
}

export class FileSkillStorage implements ISkillService {
  constructor(private agentStorage: IAgentService) {}

  private skillsDir(projectId: string) {
    return path.join(getProjectPath(projectId), 'skills')
  }

  private skillDir(projectId: string, id: string) {
    validateId(id)
    return path.join(this.skillsDir(projectId), id)
  }

  private skillMdPath(projectId: string, id: string) {
    return path.join(this.skillDir(projectId, id), 'SKILL.md')
  }

  private metadataPath(projectId: string, id: string) {
    return path.join(this.skillDir(projectId, id), 'metadata.json')
  }

  private async readSkill(projectId: ProjectId, id: SkillId): Promise<Skill | null> {
    try {
      const [mdContent, metaRaw] = await Promise.all([
        fs.readFile(this.skillMdPath(projectId, id), 'utf-8'),
        fs.readFile(this.metadataPath(projectId, id), 'utf-8'),
      ])
      const { name, description, instructions } = parseSkillMd(mdContent)
      const meta: SkillMetadata = JSON.parse(metaRaw)
      return {
        id: meta.id,
        projectId: meta.projectId,
        name,
        description,
        instructions,
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt,
      }
    } catch (e) {
      if (isNodeError(e) && e.code === 'ENOENT') return null
      throw e
    }
  }

  async list(projectId: ProjectId): Promise<Skill[]> {
    const dir = this.skillsDir(projectId)
    let entries: string[]
    try {
      entries = await fs.readdir(dir)
    } catch (e) {
      if (isNodeError(e) && e.code === 'ENOENT') return []
      throw e
    }

    const skillEntries = entries.filter(e => e.startsWith('skill-'))
    const results = await Promise.all(
      skillEntries.map(entry => this.readSkill(projectId, entry as SkillId)),
    )
    const skills = results.filter((s): s is Skill => s !== null)
    log.debug({ projectId, count: skills.length }, 'listed skills')
    return skills
  }

  async getById(projectId: ProjectId, id: SkillId): Promise<Skill | null> {
    return this.readSkill(projectId, id)
  }

  async create(projectId: ProjectId, data: SkillCreateData): Promise<Skill> {
    const id = generateId('skill')
    log.debug({ projectId, skillId: id }, 'creating skill')
    const now = new Date().toISOString()

    const dir = this.skillDir(projectId, id)
    await fs.mkdir(dir, { recursive: true })

    const meta: SkillMetadata = { id, projectId, createdAt: now, updatedAt: now }
    const md = buildSkillMd(data.name, data.description, data.instructions)

    await Promise.all([
      fs.writeFile(this.skillMdPath(projectId, id), md, 'utf-8'),
      fs.writeFile(this.metadataPath(projectId, id), JSON.stringify(meta, null, 2), 'utf-8'),
    ])

    return { id, projectId, ...data, createdAt: now, updatedAt: now }
  }

  async update(projectId: ProjectId, id: SkillId, data: SkillUpdateData): Promise<Skill> {
    const existing = await this.readSkill(projectId, id)
    if (!existing) throw new Error(`Skill ${id} not found in project ${projectId}`)

    log.debug({ projectId, skillId: id }, 'updating skill')
    const now = new Date().toISOString()
    const updated: Skill = { ...existing, ...data, updatedAt: now }

    const meta: SkillMetadata = { id, projectId, createdAt: existing.createdAt, updatedAt: now }
    const md = buildSkillMd(updated.name, updated.description, updated.instructions)

    await Promise.all([
      fs.writeFile(this.skillMdPath(projectId, id), md, 'utf-8'),
      fs.writeFile(this.metadataPath(projectId, id), JSON.stringify(meta, null, 2), 'utf-8'),
    ])

    return updated
  }

  async delete(projectId: ProjectId, id: SkillId): Promise<void> {
    const agents = await this.agentStorage.list(projectId)
    if (agents.some(a => a.skillIds.includes(id))) {
      throw new Error(`Skill ${id} is assigned to agents`)
    }
    log.debug({ projectId, skillId: id }, 'deleting skill')
    await deleteDir(this.skillDir(projectId, id))
  }
}
