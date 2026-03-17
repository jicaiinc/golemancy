import fs from 'node:fs/promises'
import path from 'node:path'
import type {
  Project, ProjectId, AgentId, SkillId, TeamId, CronJobId,
  AgentModelConfig, TargetType,
} from '@golemancy/shared'
import type { ProjectTemplate } from '@golemancy/shared'
import { getProjectTemplate } from '@golemancy/shared'
import { writeJson } from './base'
import { getDataDir } from '../utils/paths'
import { generateId } from '../utils/ids'
import { logger } from '../logger'

const log = logger.child({ component: 'storage:template-instantiate' })

interface RefIdMap {
  skills: Map<string, SkillId>
  agents: Map<string, AgentId>
  teams: Map<string, TeamId>
  cronJobs: Map<string, CronJobId>
  mcpServers: Map<string, string>
}

export async function instantiateProjectTemplate(
  templateId: string,
  projectName: string,
  defaultModel: AgentModelConfig,
): Promise<Project> {
  const template = getProjectTemplate(templateId)
  if (!template) throw new Error(`Template "${templateId}" not found`)

  const projectId = generateId('proj')
  const projectDir = path.join(getDataDir(), 'projects', projectId)
  log.debug({ templateId, projectId }, 'instantiating project from template')

  try {
    // Create directory structure
    await fs.mkdir(path.join(projectDir, 'agents'), { recursive: true })
    await fs.mkdir(path.join(projectDir, 'data'), { recursive: true })
    await fs.mkdir(path.join(projectDir, 'skills'), { recursive: true })
    await fs.mkdir(path.join(projectDir, 'teams'), { recursive: true })
    await fs.mkdir(path.join(projectDir, 'cronjobs'), { recursive: true })
    await fs.mkdir(path.join(projectDir, 'permissions-config'), { recursive: true })
    await fs.mkdir(path.join(projectDir, 'workspace'), { recursive: true })
    await fs.mkdir(path.join(projectDir, 'tasks'), { recursive: true })

    // Pre-generate all IDs for the refId→realId mapping
    const remap: RefIdMap = {
      skills: new Map(),
      agents: new Map(),
      teams: new Map(),
      cronJobs: new Map(),
      mcpServers: new Map(),
    }

    for (const s of template.skills) remap.skills.set(s.refId, generateId('skill'))
    for (const a of template.agents) remap.agents.set(a.refId, generateId('agent'))
    for (const t of template.teams) remap.teams.set(t.refId, generateId('team'))
    for (const c of template.cronJobs) remap.cronJobs.set(c.refId, generateId('cron'))
    for (const m of template.mcpServers) remap.mcpServers.set(m.refId, m.name)

    const now = new Date().toISOString()

    // 1. Create Skills (no dependencies)
    for (const tplSkill of template.skills) {
      const skillId = remap.skills.get(tplSkill.refId)!
      const skillDir = path.join(projectDir, 'skills', skillId)
      await fs.mkdir(skillDir, { recursive: true })

      // Write SKILL.md with frontmatter
      const skillMd = `---\nname: ${JSON.stringify(tplSkill.name)}\ndescription: ${JSON.stringify(tplSkill.description)}\n---\n${tplSkill.instructions}`
      await fs.writeFile(path.join(skillDir, 'SKILL.md'), skillMd, 'utf-8')

      // Write metadata.json
      const meta = { id: skillId, createdAt: now, updatedAt: now }
      await fs.writeFile(path.join(skillDir, 'metadata.json'), JSON.stringify(meta, null, 2), 'utf-8')
    }

    // 2. Create MCP servers (mcp.json)
    if (template.mcpServers.length > 0) {
      const mcpServers: Record<string, Record<string, unknown>> = {}
      for (const tplMcp of template.mcpServers) {
        const entry: Record<string, unknown> = {
          transportType: tplMcp.transportType,
          enabled: true,
        }
        if (tplMcp.description) entry.description = tplMcp.description
        if (tplMcp.command) entry.command = tplMcp.command
        if (tplMcp.args) entry.args = tplMcp.args
        if (tplMcp.env) entry.env = tplMcp.env
        mcpServers[tplMcp.name] = entry
      }
      await writeJson(path.join(projectDir, 'mcp.json'), { mcpServers })
    }

    // 3. Create Agents (depends on skills + mcp mapping)
    for (const tplAgent of template.agents) {
      const agentId = remap.agents.get(tplAgent.refId)!
      const skillIds = (tplAgent.skillRefs ?? [])
        .map(ref => remap.skills.get(ref))
        .filter((id): id is SkillId => id != null)
      const mcpServerNames = (tplAgent.mcpRefs ?? [])
        .map(ref => remap.mcpServers.get(ref))
        .filter((name): name is string => name != null)

      const agent = {
        id: agentId,
        name: tplAgent.name,
        description: tplAgent.description,
        status: 'idle' as const,
        systemPrompt: tplAgent.systemPrompt,
        modelConfig: { ...defaultModel },
        skillIds,
        tools: [],
        mcpServers: mcpServerNames,
        builtinTools: tplAgent.builtinTools ?? { bash: true },
        createdAt: now,
        updatedAt: now,
      }
      await writeJson(path.join(projectDir, 'agents', `${agentId}.json`), agent)
    }

    // 4. Create Teams (depends on agents mapping)
    for (const tplTeam of template.teams) {
      const teamId = remap.teams.get(tplTeam.refId)!
      const members = tplTeam.members.map(m => {
        const member: { agentId: AgentId; parentAgentId?: AgentId } = {
          agentId: remap.agents.get(m.agentRef)! as AgentId,
        }
        if (m.parentAgentRef) {
          member.parentAgentId = remap.agents.get(m.parentAgentRef)! as AgentId
        }
        return member
      })

      const team = {
        id: teamId,
        name: tplTeam.name,
        description: tplTeam.description,
        instruction: tplTeam.instruction,
        members,
        createdAt: now,
        updatedAt: now,
      }
      await writeJson(path.join(projectDir, 'teams', `${teamId}.json`), team)
    }

    // 5. Create CronJobs (depends on agents + teams mapping)
    for (const tplCron of template.cronJobs) {
      const cronId = remap.cronJobs.get(tplCron.refId)!
      let targetId: AgentId | TeamId
      if (tplCron.targetType === 'agent') {
        targetId = remap.agents.get(tplCron.targetRef)! as AgentId
      } else {
        targetId = remap.teams.get(tplCron.targetRef)! as TeamId
      }

      const job = {
        id: cronId,
        targetType: tplCron.targetType,
        targetId,
        name: tplCron.name,
        cronExpression: tplCron.schedule,
        enabled: tplCron.enabled,
        instruction: tplCron.prompt,
        scheduleType: 'cron' as const,
        createdAt: now,
        updatedAt: now,
      }
      await writeJson(path.join(projectDir, 'cronjobs', `${cronId}.json`), job)
    }

    // 6. Resolve defaultTarget
    let defaultTargetType: TargetType | undefined
    let defaultTargetId: AgentId | TeamId | undefined
    if (template.defaultTarget) {
      defaultTargetType = template.defaultTarget.type
      if (template.defaultTarget.type === 'agent') {
        defaultTargetId = remap.agents.get(template.defaultTarget.ref) as AgentId
      } else {
        defaultTargetId = remap.teams.get(template.defaultTarget.ref) as TeamId
      }
    }

    // 7. Write project.json
    const project: Project = {
      id: projectId,
      name: projectName,
      description: template.description,
      icon: template.icon,
      config: {},
      defaultTargetType,
      defaultTargetId,
      agentCount: template.agents.length,
      activeAgentCount: 0,
      lastActivityAt: now,
      createdAt: now,
      updatedAt: now,
    }

    await writeJson(path.join(projectDir, 'project.json'), project)
    log.debug({
      templateId,
      projectId,
      skills: remap.skills.size,
      agents: remap.agents.size,
      teams: remap.teams.size,
      cronJobs: remap.cronJobs.size,
      mcpServers: remap.mcpServers.size,
    }, 'instantiated project from template')

    return project
  } catch (e) {
    // Cleanup on failure
    await fs.rm(projectDir, { recursive: true, force: true }).catch(() => {})
    throw e
  }
}
