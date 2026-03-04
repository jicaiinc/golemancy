import fs from 'node:fs/promises'
import path from 'node:path'
import type {
  Project, ProjectId, AgentId, SkillId, TeamId, CronJobId, PermissionsConfigId,
} from '@golemancy/shared'
import { readJson, writeJson, isNodeError } from './base'
import { getDataDir, validateId } from '../utils/paths'
import { generateId } from '../utils/ids'
import { logger } from '../logger'

const log = logger.child({ component: 'storage:clone-project' })

interface IdRemapTable {
  agents: Map<AgentId, AgentId>
  skills: Map<SkillId, SkillId>
  teams: Map<TeamId, TeamId>
  cronJobs: Map<CronJobId, CronJobId>
  permissions: Map<PermissionsConfigId, PermissionsConfigId>
}

function projectDir(id: string): string {
  return path.join(getDataDir(), 'projects', id)
}

export async function cloneProject(sourceId: ProjectId, newName: string): Promise<Project> {
  validateId(sourceId)

  const sourceDir = projectDir(sourceId)
  const sourceProjectRaw = await readJson<Project & { mainAgentId?: AgentId }>(path.join(sourceDir, 'project.json'))
  if (!sourceProjectRaw) throw new Error(`Project ${sourceId} not found`)

  // Normalize: migrate legacy mainAgentId → defaultAgentId
  const sourceProject: Project = {
    ...sourceProjectRaw,
    defaultAgentId: sourceProjectRaw.defaultAgentId ?? sourceProjectRaw.mainAgentId,
  }

  const newId = generateId('proj')
  const targetDir = projectDir(newId)
  log.debug({ sourceId, newId }, 'cloning project')

  try {
    // Create directory structure
    await fs.mkdir(path.join(targetDir, 'agents'), { recursive: true })
    await fs.mkdir(path.join(targetDir, 'skills'), { recursive: true })
    await fs.mkdir(path.join(targetDir, 'teams'), { recursive: true })
    await fs.mkdir(path.join(targetDir, 'cronjobs'), { recursive: true })
    await fs.mkdir(path.join(targetDir, 'permissions-config'), { recursive: true })
    await fs.mkdir(path.join(targetDir, 'workspace'), { recursive: true })
    await fs.mkdir(path.join(targetDir, 'tasks'), { recursive: true })

    // Build ID remap table by scanning source directories
    const remap: IdRemapTable = {
      agents: new Map(),
      skills: new Map(),
      teams: new Map(),
      cronJobs: new Map(),
      permissions: new Map(),
    }

    // Scan and map IDs
    const agentFiles = await safeListDir(path.join(sourceDir, 'agents'), '.json')
    for (const f of agentFiles) {
      const oldId = f.replace('.json', '') as AgentId
      remap.agents.set(oldId, generateId('agent'))
    }

    const skillDirs = await safeListDirs(path.join(sourceDir, 'skills'))
    for (const d of skillDirs) {
      remap.skills.set(d as SkillId, generateId('skill'))
    }

    const permFiles = await safeListDir(path.join(sourceDir, 'permissions-config'), '.json')
    for (const f of permFiles) {
      const oldId = f.replace('.json', '') as PermissionsConfigId
      remap.permissions.set(oldId, generateId('perm'))
    }

    const teamFiles = await safeListDir(path.join(sourceDir, 'teams'), '.json')
    for (const f of teamFiles) {
      const oldId = f.replace('.json', '') as TeamId
      remap.teams.set(oldId, generateId('team'))
    }

    const cronFiles = await safeListDir(path.join(sourceDir, 'cronjobs'), '.json')
    for (const f of cronFiles) {
      const oldId = f.replace('.json', '') as CronJobId
      remap.cronJobs.set(oldId, generateId('cron'))
    }

    // 1. Clone skills (no dependencies — copy entire directory + update metadata.id)
    for (const [oldId, newSkillId] of remap.skills) {
      const srcSkillDir = path.join(sourceDir, 'skills', oldId)
      const dstSkillDir = path.join(targetDir, 'skills', newSkillId)
      await fs.cp(srcSkillDir, dstSkillDir, { recursive: true })
      // Update metadata.json id
      const metaPath = path.join(dstSkillDir, 'metadata.json')
      const meta = await readJson<{ id: string }>(metaPath)
      if (meta) {
        meta.id = newSkillId
        await writeJson(metaPath, meta)
      }
    }

    // 2. Clone permissions configs (no dependencies)
    for (const [oldId, newPermId] of remap.permissions) {
      const data = await readJson<Record<string, unknown>>(
        path.join(sourceDir, 'permissions-config', `${oldId}.json`),
      )
      if (data) {
        data.id = newPermId
        const now = new Date().toISOString()
        data.createdAt = now
        data.updatedAt = now
        await writeJson(path.join(targetDir, 'permissions-config', `${newPermId}.json`), data)
      }
    }

    // 3. Clone mcp.json (no dependencies, whole-file copy)
    try {
      await fs.copyFile(
        path.join(sourceDir, 'mcp.json'),
        path.join(targetDir, 'mcp.json'),
      )
    } catch (e) {
      if (!isNodeError(e) || e.code !== 'ENOENT') throw e
      // Source has no mcp.json — skip
    }

    // 4. Clone agents (depends on skills mapping)
    for (const [oldId, newAgentId] of remap.agents) {
      const data = await readJson<Record<string, unknown>>(
        path.join(sourceDir, 'agents', `${oldId}.json`),
      )
      if (data) {
        data.id = newAgentId
        data.status = 'idle'
        const now = new Date().toISOString()
        data.createdAt = now
        data.updatedAt = now

        // Normalize: migrate legacy skills (object array) → skillIds (string array)
        if (!Array.isArray(data.skillIds) && Array.isArray(data.skills)) {
          data.skillIds = (data.skills as Array<{ id: string }>).map(s => s.id)
          delete data.skills
        }

        // Normalize: migrate legacy mcpServers (object array) → string array
        if (Array.isArray(data.mcpServers) && data.mcpServers.length > 0 && typeof data.mcpServers[0] === 'object') {
          data.mcpServers = (data.mcpServers as Array<{ name: string }>).map(s => s.name)
        }

        // Remap skillIds
        if (Array.isArray(data.skillIds)) {
          data.skillIds = (data.skillIds as SkillId[]).map(
            sid => remap.skills.get(sid) ?? sid,
          )
        }
        await writeJson(path.join(targetDir, 'agents', `${newAgentId}.json`), data)
      }
    }

    // 5. Clone teams (depends on agents mapping)
    for (const [oldId, newTeamId] of remap.teams) {
      const data = await readJson<Record<string, unknown>>(
        path.join(sourceDir, 'teams', `${oldId}.json`),
      )
      if (data) {
        data.id = newTeamId
        const now = new Date().toISOString()
        data.createdAt = now
        data.updatedAt = now
        // Remap members
        if (Array.isArray(data.members)) {
          data.members = (data.members as Array<{ agentId: AgentId; parentAgentId?: AgentId }>).map(m => ({
            agentId: remap.agents.get(m.agentId) ?? m.agentId,
            ...(m.parentAgentId ? { parentAgentId: remap.agents.get(m.parentAgentId) ?? m.parentAgentId } : {}),
          }))
        }
        // Remap layout keys
        if (data.layout && typeof data.layout === 'object') {
          const oldLayout = data.layout as Record<string, { x: number; y: number }>
          const newLayout: Record<string, { x: number; y: number }> = {}
          for (const [key, val] of Object.entries(oldLayout)) {
            const newKey = remap.agents.get(key as AgentId) ?? key
            newLayout[newKey] = { ...val }
          }
          data.layout = newLayout
        }
        await writeJson(path.join(targetDir, 'teams', `${newTeamId}.json`), data)
      }
    }

    // 6. Clone cronjobs (depends on agents + teams mapping)
    for (const [oldId, newCronId] of remap.cronJobs) {
      const data = await readJson<Record<string, unknown>>(
        path.join(sourceDir, 'cronjobs', `${oldId}.json`),
      )
      if (data) {
        data.id = newCronId
        data.enabled = false
        const now = new Date().toISOString()
        data.createdAt = now
        data.updatedAt = now
        // Clear runtime state
        delete data.lastRunAt
        delete data.lastRunStatus
        delete data.nextRunAt
        delete data.lastRunId
        // Remap agentId and teamId
        if (data.agentId) {
          data.agentId = remap.agents.get(data.agentId as AgentId) ?? data.agentId
        }
        if (data.teamId) {
          data.teamId = remap.teams.get(data.teamId as TeamId) ?? data.teamId
        }
        await writeJson(path.join(targetDir, 'cronjobs', `${newCronId}.json`), data)
      }
    }

    // 7. Write project.json
    const now = new Date().toISOString()
    const newProject: Project = {
      id: newId,
      name: newName,
      description: sourceProject.description,
      icon: sourceProject.icon,
      config: {
        ...sourceProject.config,
        permissionsConfigId: sourceProject.config.permissionsConfigId
          ? remap.permissions.get(sourceProject.config.permissionsConfigId) ?? sourceProject.config.permissionsConfigId
          : undefined,
      },
      defaultAgentId: sourceProject.defaultAgentId
        ? remap.agents.get(sourceProject.defaultAgentId) ?? sourceProject.defaultAgentId
        : undefined,
      defaultTeamId: sourceProject.defaultTeamId
        ? remap.teams.get(sourceProject.defaultTeamId) ?? sourceProject.defaultTeamId
        : undefined,
      agentCount: remap.agents.size,
      activeAgentCount: 0,
      lastActivityAt: now,
      createdAt: now,
      updatedAt: now,
    }

    await writeJson(path.join(targetDir, 'project.json'), newProject)
    log.debug({ sourceId, newId, agents: remap.agents.size, skills: remap.skills.size, teams: remap.teams.size, cronJobs: remap.cronJobs.size }, 'cloned project')
    return newProject
  } catch (e) {
    // Cleanup on failure
    await fs.rm(targetDir, { recursive: true, force: true }).catch(() => {})
    throw e
  }
}

/** List files in a directory with a given extension, returns [] on ENOENT */
async function safeListDir(dirPath: string, ext: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath)
    return entries.filter(e => e.endsWith(ext))
  } catch (e) {
    if (isNodeError(e) && e.code === 'ENOENT') return []
    throw e
  }
}

/** List subdirectories, returns [] on ENOENT */
async function safeListDirs(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    return entries.filter(e => e.isDirectory()).map(e => e.name)
  } catch (e) {
    if (isNodeError(e) && e.code === 'ENOENT') return []
    throw e
  }
}
