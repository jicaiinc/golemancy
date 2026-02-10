import type {
  Project, Agent, Conversation, Task, Artifact, MemoryEntry, GlobalSettings,
  ProjectId, AgentId, ConversationId, TaskId, ArtifactId, MemoryId, MessageId,
} from '@solocraft/shared'
import type {
  IProjectService, IAgentService, IConversationService,
  ITaskService, IArtifactService, IMemoryService, ISettingsService,
} from '../interfaces'
import {
  SEED_PROJECTS, SEED_AGENTS, SEED_CONVERSATIONS,
  SEED_TASKS, SEED_ARTIFACTS, SEED_MEMORIES, SEED_SETTINGS,
} from './data'

// Small delay to simulate async I/O
const delay = (ms = 50) => new Promise(r => setTimeout(r, ms))
let nextId = 100

function genId(prefix: string): string {
  return `${prefix}-${++nextId}`
}

// --- ProjectService ---
export class MockProjectService implements IProjectService {
  private data = new Map<ProjectId, Project>(SEED_PROJECTS.map(p => [p.id, { ...p }]))

  async list(): Promise<Project[]> {
    await delay()
    return [...this.data.values()]
  }

  async getById(id: ProjectId): Promise<Project | null> {
    await delay()
    return this.data.get(id) ?? null
  }

  async create(input: Pick<Project, 'name' | 'description' | 'icon'>): Promise<Project> {
    await delay()
    const now = new Date().toISOString()
    const project: Project = {
      id: genId('proj') as ProjectId,
      ...input,
      config: { maxConcurrentAgents: 3 },
      agentCount: 0,
      activeAgentCount: 0,
      lastActivityAt: now,
      createdAt: now,
      updatedAt: now,
    }
    this.data.set(project.id, project)
    return project
  }

  async update(id: ProjectId, data: Partial<Pick<Project, 'name' | 'description' | 'icon' | 'config'>>): Promise<Project> {
    await delay()
    const existing = this.data.get(id)
    if (!existing) throw new Error(`Project ${id} not found`)
    const updated = { ...existing, ...data, updatedAt: new Date().toISOString() }
    this.data.set(id, updated)
    return updated
  }

  async delete(id: ProjectId): Promise<void> {
    await delay()
    this.data.delete(id)
  }
}

// --- AgentService ---
export class MockAgentService implements IAgentService {
  private data = new Map<AgentId, Agent>(SEED_AGENTS.map(a => [a.id, { ...a }]))

  async list(projectId: ProjectId): Promise<Agent[]> {
    await delay()
    return [...this.data.values()].filter(a => a.projectId === projectId)
  }

  async getById(projectId: ProjectId, id: AgentId): Promise<Agent | null> {
    await delay()
    const agent = this.data.get(id)
    return agent && agent.projectId === projectId ? agent : null
  }

  async create(projectId: ProjectId, input: Pick<Agent, 'name' | 'description' | 'systemPrompt' | 'modelConfig'>): Promise<Agent> {
    await delay()
    const now = new Date().toISOString()
    const agent: Agent = {
      id: genId('agent') as AgentId,
      projectId,
      ...input,
      status: 'idle',
      skills: [],
      tools: [],
      subAgents: [],
      createdAt: now,
      updatedAt: now,
    }
    this.data.set(agent.id, agent)
    return agent
  }

  async update(projectId: ProjectId, id: AgentId, data: Partial<Agent>): Promise<Agent> {
    await delay()
    const existing = this.data.get(id)
    if (!existing || existing.projectId !== projectId) throw new Error(`Agent ${id} not found`)
    const updated = { ...existing, ...data, updatedAt: new Date().toISOString() }
    this.data.set(id, updated)
    return updated
  }

  async delete(projectId: ProjectId, id: AgentId): Promise<void> {
    await delay()
    const agent = this.data.get(id)
    if (agent && agent.projectId === projectId) this.data.delete(id)
  }
}

// --- ConversationService ---
export class MockConversationService implements IConversationService {
  private data = new Map<ConversationId, Conversation>(SEED_CONVERSATIONS.map(c => [c.id, { ...c }]))

  async list(projectId: ProjectId, agentId?: AgentId): Promise<Conversation[]> {
    await delay()
    return [...this.data.values()].filter(c =>
      c.projectId === projectId && (!agentId || c.agentId === agentId)
    )
  }

  async getById(projectId: ProjectId, id: ConversationId): Promise<Conversation | null> {
    await delay()
    const conv = this.data.get(id)
    return conv && conv.projectId === projectId ? conv : null
  }

  async create(projectId: ProjectId, agentId: AgentId, title: string): Promise<Conversation> {
    await delay()
    const now = new Date().toISOString()
    const conv: Conversation = {
      id: genId('conv') as ConversationId,
      projectId,
      agentId,
      title,
      messages: [],
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
    }
    this.data.set(conv.id, conv)
    return conv
  }

  async sendMessage(projectId: ProjectId, conversationId: ConversationId, content: string): Promise<void> {
    await delay()
    const conv = this.data.get(conversationId)
    if (!conv || conv.projectId !== projectId) throw new Error('Conversation not found')
    const now = new Date().toISOString()
    conv.messages.push({
      id: genId('msg') as MessageId,
      conversationId,
      role: 'user',
      content,
      createdAt: now,
      updatedAt: now,
    })
    // Simulate assistant response
    conv.messages.push({
      id: genId('msg') as MessageId,
      conversationId,
      role: 'assistant',
      content: `Mock response to: "${content}"`,
      createdAt: now,
      updatedAt: now,
    })
    conv.lastMessageAt = now
    conv.updatedAt = now
  }

  async delete(projectId: ProjectId, id: ConversationId): Promise<void> {
    await delay()
    const conv = this.data.get(id)
    if (conv && conv.projectId === projectId) this.data.delete(id)
  }
}

// --- TaskService ---
export class MockTaskService implements ITaskService {
  private data = new Map<TaskId, Task>(SEED_TASKS.map(t => [t.id, { ...t }]))

  async list(projectId: ProjectId, agentId?: AgentId): Promise<Task[]> {
    await delay()
    return [...this.data.values()].filter(t =>
      t.projectId === projectId && (!agentId || t.agentId === agentId)
    )
  }

  async getById(projectId: ProjectId, id: TaskId): Promise<Task | null> {
    await delay()
    const task = this.data.get(id)
    return task && task.projectId === projectId ? task : null
  }

  async cancel(projectId: ProjectId, id: TaskId): Promise<void> {
    await delay()
    const task = this.data.get(id)
    if (task && task.projectId === projectId) {
      task.status = 'cancelled'
      task.updatedAt = new Date().toISOString()
    }
  }
}

// --- ArtifactService ---
export class MockArtifactService implements IArtifactService {
  private data = new Map<ArtifactId, Artifact>(SEED_ARTIFACTS.map(a => [a.id, { ...a }]))

  async list(projectId: ProjectId, agentId?: AgentId): Promise<Artifact[]> {
    await delay()
    return [...this.data.values()].filter(a =>
      a.projectId === projectId && (!agentId || a.agentId === agentId)
    )
  }

  async getById(projectId: ProjectId, id: ArtifactId): Promise<Artifact | null> {
    await delay()
    const artifact = this.data.get(id)
    return artifact && artifact.projectId === projectId ? artifact : null
  }

  async delete(projectId: ProjectId, id: ArtifactId): Promise<void> {
    await delay()
    const artifact = this.data.get(id)
    if (artifact && artifact.projectId === projectId) this.data.delete(id)
  }
}

// --- MemoryService ---
export class MockMemoryService implements IMemoryService {
  private data = new Map<MemoryId, MemoryEntry>(SEED_MEMORIES.map(m => [m.id, { ...m }]))

  async list(projectId: ProjectId): Promise<MemoryEntry[]> {
    await delay()
    return [...this.data.values()].filter(m => m.projectId === projectId)
  }

  async create(projectId: ProjectId, input: Pick<MemoryEntry, 'content' | 'source' | 'tags'>): Promise<MemoryEntry> {
    await delay()
    const now = new Date().toISOString()
    const entry: MemoryEntry = {
      id: genId('mem') as MemoryId,
      projectId,
      ...input,
      createdAt: now,
      updatedAt: now,
    }
    this.data.set(entry.id, entry)
    return entry
  }

  async update(projectId: ProjectId, id: MemoryId, data: Partial<Pick<MemoryEntry, 'content' | 'tags'>>): Promise<MemoryEntry> {
    await delay()
    const existing = this.data.get(id)
    if (!existing || existing.projectId !== projectId) throw new Error('Memory not found')
    const updated = { ...existing, ...data, updatedAt: new Date().toISOString() }
    this.data.set(id, updated)
    return updated
  }

  async delete(projectId: ProjectId, id: MemoryId): Promise<void> {
    await delay()
    const entry = this.data.get(id)
    if (entry && entry.projectId === projectId) this.data.delete(id)
  }
}

// --- SettingsService ---
export class MockSettingsService implements ISettingsService {
  private settings: GlobalSettings = { ...SEED_SETTINGS }

  async get(): Promise<GlobalSettings> {
    await delay()
    return { ...this.settings }
  }

  async update(data: Partial<GlobalSettings>): Promise<GlobalSettings> {
    await delay()
    this.settings = { ...this.settings, ...data }
    return { ...this.settings }
  }
}
