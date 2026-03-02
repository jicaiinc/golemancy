import path from 'node:path'
import type { Agent, AgentId, ProjectId, IAgentService } from '@golemancy/shared'
import { readJson, writeJson, deleteFile, listJsonFiles } from './base'
import { getProjectPath, validateId } from '../utils/paths'
import { generateId } from '../utils/ids'
import { logger } from '../logger'

const log = logger.child({ component: 'storage:agents' })

export class FileAgentStorage implements IAgentService {
  private agentsDir(projectId: string) {
    return path.join(getProjectPath(projectId), 'agents')
  }

  private agentPath(projectId: string, id: string) {
    validateId(id)
    return path.join(this.agentsDir(projectId), `${id}.json`)
  }

  /** Normalize agent data from disk — backfill fields added after initial release */
  private normalize(agent: Agent): Agent {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = agent as any

    // Migration: old mcpServers was MCPServerConfig[], new is string[]
    let mcpServers: string[] = []
    if (Array.isArray(raw.mcpServers)) {
      if (raw.mcpServers.length > 0 && typeof raw.mcpServers[0] === 'object') {
        // Old format: extract names from MCPServerConfig objects
        mcpServers = (raw.mcpServers as Array<{ name: string }>).map(s => s.name)
      } else {
        // New format: already string[]
        mcpServers = raw.mcpServers as string[]
      }
    }

    return {
      ...agent,
      skillIds: agent.skillIds ?? raw.skills?.map((s: { id: string }) => s.id) ?? [],
      mcpServers,
      builtinTools: agent.builtinTools ?? { bash: true, knowledge_base: true },
    }
  }

  async list(projectId: ProjectId): Promise<Agent[]> {
    const agents = await listJsonFiles<Agent>(this.agentsDir(projectId))
    log.debug({ projectId, count: agents.length }, 'listed agents')
    return agents.map(a => this.normalize({ ...a, projectId }))
  }

  async getById(projectId: ProjectId, id: AgentId): Promise<Agent | null> {
    const agent = await readJson<Agent>(this.agentPath(projectId, id))
    return agent ? this.normalize({ ...agent, projectId }) : null
  }

  async create(
    projectId: ProjectId,
    data: Pick<Agent, 'name' | 'description' | 'systemPrompt' | 'modelConfig'>,
  ): Promise<Agent> {
    const id = generateId('agent')
    log.debug({ projectId, agentId: id }, 'creating agent')
    const now = new Date().toISOString()

    const agent: Agent = {
      id,
      projectId,
      ...data,
      status: 'idle',
      skillIds: [],
      tools: [],
      subAgents: [],
      mcpServers: [],
      builtinTools: { bash: true, knowledge_base: true },
      createdAt: now,
      updatedAt: now,
    }

    // Write without projectId — ownership is determined by directory
    const { projectId: _, ...toWrite } = agent
    await writeJson(this.agentPath(projectId, id), toWrite)
    return agent
  }

  async update(projectId: ProjectId, id: AgentId, data: Partial<Agent>): Promise<Agent> {
    const existing = await this.getById(projectId, id)
    if (!existing) throw new Error(`Agent ${id} not found in project ${projectId}`)

    log.debug({ projectId, agentId: id }, 'updating agent')
    const updated: Agent = {
      ...existing,
      ...data,
      id,
      projectId,
      updatedAt: new Date().toISOString(),
    }
    // Write without projectId — ownership is determined by directory
    const { projectId: _, ...toWrite } = updated
    await writeJson(this.agentPath(projectId, id), toWrite)
    return updated
  }

  async delete(projectId: ProjectId, id: AgentId): Promise<void> {
    log.debug({ projectId, agentId: id }, 'deleting agent')
    await deleteFile(this.agentPath(projectId, id))
  }
}
