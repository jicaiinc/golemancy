import path from 'node:path'
import type { Agent, AgentId, ProjectId, IAgentService } from '@solocraft/shared'
import { readJson, writeJson, deleteFile, listJsonFiles } from './base'
import { getProjectPath } from '../utils/paths'
import { generateId } from '../utils/ids'

export class FileAgentStorage implements IAgentService {
  private agentsDir(projectId: string) {
    return path.join(getProjectPath(projectId), 'agents')
  }

  private agentPath(projectId: string, id: string) {
    return path.join(this.agentsDir(projectId), `${id}.json`)
  }

  async list(projectId: ProjectId): Promise<Agent[]> {
    return listJsonFiles<Agent>(this.agentsDir(projectId))
  }

  async getById(projectId: ProjectId, id: AgentId): Promise<Agent | null> {
    return readJson<Agent>(this.agentPath(projectId, id))
  }

  async create(
    projectId: ProjectId,
    data: Pick<Agent, 'name' | 'description' | 'systemPrompt' | 'modelConfig'>,
  ): Promise<Agent> {
    const id = generateId('agent')
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
    await deleteFile(this.agentPath(projectId, id))
  }
}
