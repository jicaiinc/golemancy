import path from 'node:path'
import type { Team, TeamId, ProjectId, ITeamService } from '@golemancy/shared'
import { readJson, writeJson, deleteFile, listJsonFiles } from './base'
import { getProjectPath, validateId } from '../utils/paths'
import { generateId } from '../utils/ids'
import { logger } from '../logger'

const log = logger.child({ component: 'storage:teams' })

export class FileTeamStorage implements ITeamService {
  private teamsDir(projectId: string) {
    return path.join(getProjectPath(projectId), 'teams')
  }

  private teamPath(projectId: string, id: string) {
    validateId(id)
    return path.join(this.teamsDir(projectId), `${id}.json`)
  }

  private normalize(team: Team): Team {
    return {
      ...team,
      instruction: team.instruction ?? undefined,
      members: team.members ?? [],
      layout: team.layout ?? undefined,
    }
  }

  async list(projectId: ProjectId): Promise<Team[]> {
    const all = await listJsonFiles<Team>(this.teamsDir(projectId))
    // Filter to valid team objects only (ignore stale layout files from old format)
    const teams = all.filter(t => t.id && typeof t.id === 'string' && t.id.startsWith('team-'))
    log.debug({ projectId, count: teams.length }, 'listed teams')
    return teams.map(t => this.normalize({ ...t, projectId }))
  }

  async getById(projectId: ProjectId, id: TeamId): Promise<Team | null> {
    const team = await readJson<Team>(this.teamPath(projectId, id))
    return team ? this.normalize({ ...team, projectId }) : null
  }

  async create(
    projectId: ProjectId,
    data: Pick<Team, 'name' | 'description' | 'instruction' | 'members'>,
  ): Promise<Team> {
    const id = generateId('team')
    log.debug({ projectId, teamId: id }, 'creating team')
    const now = new Date().toISOString()

    const team: Team = {
      id,
      projectId,
      ...data,
      createdAt: now,
      updatedAt: now,
    }

    const { projectId: _, ...toWrite } = team
    await writeJson(this.teamPath(projectId, id), toWrite)
    return team
  }

  async update(
    projectId: ProjectId,
    id: TeamId,
    data: Partial<Pick<Team, 'name' | 'description' | 'instruction' | 'members'>>,
  ): Promise<Team> {
    const existing = await this.getById(projectId, id)
    if (!existing) throw new Error(`Team ${id} not found in project ${projectId}`)

    log.debug({ projectId, teamId: id }, 'updating team')
    const updated: Team = {
      ...existing,
      ...data,
      id,
      projectId,
      updatedAt: new Date().toISOString(),
    }
    const { projectId: _, ...toWrite } = updated
    await writeJson(this.teamPath(projectId, id), toWrite)
    return updated
  }

  async delete(projectId: ProjectId, id: TeamId): Promise<void> {
    log.debug({ projectId, teamId: id }, 'deleting team')
    await deleteFile(this.teamPath(projectId, id))
    // Clean up stale layout file from old format
    const legacyLayoutPath = path.join(this.teamsDir(projectId), `${id}-layout.json`)
    await deleteFile(legacyLayoutPath).catch(() => {})
  }

  async getLayout(projectId: ProjectId, teamId: TeamId): Promise<Record<string, { x: number; y: number }>> {
    const team = await this.getById(projectId, teamId)
    return team?.layout ?? {}
  }

  async saveLayout(projectId: ProjectId, teamId: TeamId, layout: Record<string, { x: number; y: number }>): Promise<void> {
    const team = await this.getById(projectId, teamId)
    if (!team) throw new Error(`Team ${teamId} not found in project ${projectId}`)
    const { projectId: _, ...toWrite } = { ...team, layout, updatedAt: new Date().toISOString() }
    await writeJson(this.teamPath(projectId, teamId), toWrite)
  }
}
