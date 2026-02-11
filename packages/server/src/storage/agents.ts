import path from 'node:path'
import type { Agent, AgentId, ProjectId, IAgentService } from '@solocraft/shared'
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

  async list(projectId: ProjectId): Promise<Agent[]> {
    const agents = await listJsonFiles<Agent>(this.agentsDir(projectId))
    log.debug({ projectId, count: agents.length }, 'listed agents')
    return agents
  }

  async getById(projectId: ProjectId, id: AgentId): Promise<Agent | null> {
    return readJson<Agent>(this.agentPath(projectId, id))
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
      skills: [],
      tools: [],
      subAgents: [],
      createdAt: now,
      updatedAt: now,
    }

    await writeJson(this.agentPath(projectId, id), agent)
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
    await writeJson(this.agentPath(projectId, id), updated)
    return updated
  }

  async delete(projectId: ProjectId, id: AgentId): Promise<void> {
    log.debug({ projectId, agentId: id }, 'deleting agent')
    await deleteFile(this.agentPath(projectId, id))
  }
}
