import type {
  Project, Agent, Conversation, Task, Artifact, MemoryEntry, GlobalSettings, CronJob, Skill,
  MCPServerConfig, MCPServerCreateData, MCPServerUpdateData, PermissionsConfigFile,
  ProjectId, AgentId, ConversationId, TaskId, ArtifactId, MemoryId, MessageId, SkillId, CronJobId, PermissionsConfigId,
  DashboardSummary, DashboardAgentSummary, DashboardTaskSummary, ActivityEntry,
  Message, PaginationParams, PaginatedResult, TaskLogEntry,
  SkillCreateData, SkillUpdateData,
} from '@golemancy/shared'
import { DEFAULT_PERMISSIONS_CONFIG } from '@golemancy/shared'
import type {
  IProjectService, IAgentService, IConversationService,
  ITaskService, IArtifactService, IMemoryService, ISkillService, IMCPService, ISettingsService, ICronJobService, IDashboardService,
  IPermissionsConfigService,
} from '../interfaces'
import {
  SEED_PROJECTS, SEED_AGENTS, SEED_CONVERSATIONS,
  SEED_TASKS, SEED_ARTIFACTS, SEED_MEMORIES, SEED_SETTINGS,
  SEED_ACTIVITIES, SEED_CRON_JOBS, SEED_SKILLS, SEED_MCP_SERVERS,
  SEED_PERMISSIONS_CONFIGS,
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

  async create(input: Pick<Project, 'name' | 'description' | 'icon' | 'workingDirectory'>): Promise<Project> {
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

  async update(id: ProjectId, data: Partial<Pick<Project, 'name' | 'description' | 'icon' | 'workingDirectory' | 'config' | 'mainAgentId'>>): Promise<Project> {
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
      skillIds: [],
      tools: [],
      subAgents: [],
      mcpServers: [],
      builtinTools: { bash: true },
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

  async update(projectId: ProjectId, id: ConversationId, data: { title?: string }): Promise<Conversation> {
    await delay()
    const conv = this.data.get(id)
    if (!conv || conv.projectId !== projectId) throw new Error('Conversation not found')
    if (data.title !== undefined) conv.title = data.title
    conv.updatedAt = new Date().toISOString()
    return { ...conv }
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
      parts: [{ type: 'text', text: content }],
      content,
      createdAt: now,
      updatedAt: now,
    })
    const responseText = `Mock response to: "${content}"`
    // Simulate assistant response
    conv.messages.push({
      id: genId('msg') as MessageId,
      conversationId,
      role: 'assistant',
      parts: [{ type: 'text', text: responseText }],
      content: responseText,
      createdAt: now,
      updatedAt: now,
    })
    conv.lastMessageAt = now
    conv.updatedAt = now
  }

  async saveMessage(projectId: ProjectId, conversationId: ConversationId, data: { id: MessageId; role: string; parts: unknown[]; content: string }): Promise<void> {
    await delay()
    const conv = this.data.get(conversationId)
    if (!conv || conv.projectId !== projectId) throw new Error('Conversation not found')
    const now = new Date().toISOString()
    conv.messages.push({
      id: data.id,
      conversationId,
      role: data.role as Message['role'],
      parts: data.parts,
      content: data.content,
      createdAt: now,
      updatedAt: now,
    })
    conv.lastMessageAt = now
    conv.updatedAt = now
  }

  async getMessages(projectId: ProjectId, conversationId: ConversationId, params: PaginationParams): Promise<PaginatedResult<Message>> {
    await delay()
    const conv = this.data.get(conversationId)
    if (!conv || conv.projectId !== projectId) return { items: [], total: 0, page: params.page, pageSize: params.pageSize }
    const start = (params.page - 1) * params.pageSize
    const items = conv.messages.slice(start, start + params.pageSize)
    return { items, total: conv.messages.length, page: params.page, pageSize: params.pageSize }
  }

  async searchMessages(projectId: ProjectId, query: string, params: PaginationParams): Promise<PaginatedResult<Message>> {
    await delay()
    const allMessages: Message[] = []
    for (const conv of this.data.values()) {
      if (conv.projectId === projectId) {
        allMessages.push(...conv.messages.filter(m => m.content.includes(query)))
      }
    }
    const start = (params.page - 1) * params.pageSize
    const items = allMessages.slice(start, start + params.pageSize)
    return { items, total: allMessages.length, page: params.page, pageSize: params.pageSize }
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

  async getLogs(taskId: TaskId, _cursor?: number, _limit?: number): Promise<TaskLogEntry[]> {
    await delay()
    const task = this.data.get(taskId)
    return task?.log ?? []
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

// --- SkillService ---
export class MockSkillService implements ISkillService {
  private data = new Map<SkillId, Skill>(SEED_SKILLS.map(s => [s.id, { ...s }]))
  private agents: MockAgentService

  constructor(agents: MockAgentService) {
    this.agents = agents
  }

  async list(projectId: ProjectId): Promise<Skill[]> {
    await delay()
    return [...this.data.values()].filter(s => s.projectId === projectId)
  }

  async getById(projectId: ProjectId, id: SkillId): Promise<Skill | null> {
    await delay()
    const skill = this.data.get(id)
    return skill && skill.projectId === projectId ? skill : null
  }

  async create(projectId: ProjectId, input: SkillCreateData): Promise<Skill> {
    await delay()
    const now = new Date().toISOString()
    const skill: Skill = {
      id: genId('skill') as SkillId,
      projectId,
      ...input,
      createdAt: now,
      updatedAt: now,
    }
    this.data.set(skill.id, skill)
    return skill
  }

  async update(projectId: ProjectId, id: SkillId, data: SkillUpdateData): Promise<Skill> {
    await delay()
    const existing = this.data.get(id)
    if (!existing || existing.projectId !== projectId) throw new Error('Skill not found')
    const updated = { ...existing, ...data, updatedAt: new Date().toISOString() }
    this.data.set(id, updated)
    return updated
  }

  async delete(projectId: ProjectId, id: SkillId): Promise<void> {
    await delay()
    const skill = this.data.get(id)
    if (!skill || skill.projectId !== projectId) throw new Error('Skill not found')
    const agents = await this.agents.list(projectId)
    const referencingAgents = agents.filter(a => a.skillIds.includes(id))
    if (referencingAgents.length > 0) {
      throw new Error(`Skill is assigned to ${referencingAgents.length} agent(s). Unassign first.`)
    }
    this.data.delete(id)
  }

  async importZip(_projectId: ProjectId, _file: File): Promise<{ imported: Array<{ name: string; id: SkillId }>; count: number }> {
    await delay()
    // Mock: just return empty result
    return { imported: [], count: 0 }
  }
}

// --- MCPService ---
export class MockMCPService implements IMCPService {
  private data = new Map<string, MCPServerConfig>(SEED_MCP_SERVERS.map(s => [s.name, { ...s }]))
  private agents: MockAgentService

  constructor(agents: MockAgentService) {
    this.agents = agents
  }

  async list(_projectId: ProjectId): Promise<MCPServerConfig[]> {
    await delay()
    return [...this.data.values()]
  }

  async getByName(_projectId: ProjectId, name: string): Promise<MCPServerConfig | null> {
    await delay()
    return this.data.get(name) ?? null
  }

  async create(_projectId: ProjectId, input: MCPServerCreateData): Promise<MCPServerConfig> {
    await delay()
    if (this.data.has(input.name)) throw new Error(`MCP server "${input.name}" already exists`)
    const server: MCPServerConfig = { ...input, enabled: input.enabled ?? true }
    this.data.set(server.name, server)
    return server
  }

  async update(_projectId: ProjectId, name: string, data: MCPServerUpdateData): Promise<MCPServerConfig> {
    await delay()
    const existing = this.data.get(name)
    if (!existing) throw new Error(`MCP server "${name}" not found`)
    const updated = { ...existing, ...data }
    this.data.set(name, updated)
    return updated
  }

  async delete(projectId: ProjectId, name: string): Promise<void> {
    await delay()
    if (!this.data.has(name)) throw new Error(`MCP server "${name}" not found`)
    const agents = await this.agents.list(projectId)
    const referencingAgents = agents.filter(a => a.mcpServers.includes(name))
    if (referencingAgents.length > 0) {
      throw new Error(`MCP server is used by ${referencingAgents.length} agent(s). Remove references first.`)
    }
    this.data.delete(name)
  }

  async resolveNames(_projectId: ProjectId, names: string[]): Promise<MCPServerConfig[]> {
    await delay()
    return names.map(n => this.data.get(n)).filter((s): s is MCPServerConfig => s != null)
  }
}

// --- CronJobService ---
export class MockCronJobService implements ICronJobService {
  private data = new Map<CronJobId, CronJob>(SEED_CRON_JOBS.map(c => [c.id, { ...c }]))

  async list(projectId: ProjectId): Promise<CronJob[]> {
    await delay()
    return [...this.data.values()].filter(c => c.projectId === projectId)
  }

  async getById(projectId: ProjectId, id: CronJobId): Promise<CronJob | null> {
    await delay()
    const job = this.data.get(id)
    return job && job.projectId === projectId ? job : null
  }

  async create(projectId: ProjectId, input: Pick<CronJob, 'agentId' | 'name' | 'description' | 'cronExpression' | 'enabled'>): Promise<CronJob> {
    await delay()
    const now = new Date().toISOString()
    const job: CronJob = {
      id: genId('cron') as CronJobId,
      projectId,
      ...input,
      createdAt: now,
      updatedAt: now,
    }
    this.data.set(job.id, job)
    return job
  }

  async update(projectId: ProjectId, id: CronJobId, data: Partial<Pick<CronJob, 'agentId' | 'name' | 'description' | 'cronExpression' | 'enabled'>>): Promise<CronJob> {
    await delay()
    const existing = this.data.get(id)
    if (!existing || existing.projectId !== projectId) throw new Error(`CronJob ${id} not found`)
    const updated = { ...existing, ...data, updatedAt: new Date().toISOString() }
    this.data.set(id, updated)
    return updated
  }

  async delete(projectId: ProjectId, id: CronJobId): Promise<void> {
    await delay()
    const job = this.data.get(id)
    if (job && job.projectId === projectId) this.data.delete(id)
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

// --- PermissionsConfigService ---
export class MockPermissionsConfigService implements IPermissionsConfigService {
  private data = new Map<string, PermissionsConfigFile>(
    SEED_PERMISSIONS_CONFIGS.map(c => [`${c.id}`, { ...c }])
  )

  async list(_projectId: ProjectId): Promise<PermissionsConfigFile[]> {
    await delay()
    const userConfigs = [...this.data.values()].filter(c => c.id !== ('default' as PermissionsConfigId))
    return [DEFAULT_PERMISSIONS_CONFIG, ...userConfigs]
  }

  async getById(_projectId: ProjectId, id: PermissionsConfigId): Promise<PermissionsConfigFile | null> {
    await delay()
    if (id === ('default' as PermissionsConfigId)) return { ...DEFAULT_PERMISSIONS_CONFIG }
    return this.data.get(id) ?? null
  }

  async create(_projectId: ProjectId, input: Pick<PermissionsConfigFile, 'title' | 'mode' | 'config'>): Promise<PermissionsConfigFile> {
    await delay()
    const now = new Date().toISOString()
    const config: PermissionsConfigFile = {
      id: genId('perm') as PermissionsConfigId,
      ...input,
      createdAt: now,
      updatedAt: now,
    }
    this.data.set(config.id, config)
    return config
  }

  async update(_projectId: ProjectId, id: PermissionsConfigId, data: Partial<Pick<PermissionsConfigFile, 'title' | 'mode' | 'config'>>): Promise<PermissionsConfigFile> {
    await delay()
    if (id === ('default' as PermissionsConfigId)) throw new Error('Cannot modify system default config')
    const existing = this.data.get(id)
    if (!existing) throw new Error(`Permissions config ${id} not found`)
    const updated = { ...existing, ...data, updatedAt: new Date().toISOString() }
    this.data.set(id, updated)
    return updated
  }

  async delete(_projectId: ProjectId, id: PermissionsConfigId): Promise<void> {
    await delay()
    if (id === ('default' as PermissionsConfigId)) throw new Error('Cannot delete system default config')
    this.data.delete(id)
  }

  async duplicate(_projectId: ProjectId, sourceId: PermissionsConfigId, newTitle: string): Promise<PermissionsConfigFile> {
    await delay()
    const source = sourceId === ('default' as PermissionsConfigId)
      ? DEFAULT_PERMISSIONS_CONFIG
      : this.data.get(sourceId)
    if (!source) throw new Error(`Source config ${sourceId} not found`)
    const now = new Date().toISOString()
    const config: PermissionsConfigFile = {
      id: genId('perm') as PermissionsConfigId,
      title: newTitle,
      mode: source.mode,
      config: { ...source.config },
      createdAt: now,
      updatedAt: now,
    }
    this.data.set(config.id, config)
    return config
  }
}

// --- DashboardService ---
export class MockDashboardService implements IDashboardService {
  private projects: Project[]
  private agents: Agent[]
  private tasks: Task[]
  private activities: ActivityEntry[]

  constructor(projects: Project[], agents: Agent[], tasks: Task[], activities: ActivityEntry[]) {
    this.projects = projects
    this.agents = agents
    this.tasks = tasks
    this.activities = activities
  }

  async getSummary(): Promise<DashboardSummary> {
    await delay()
    const today = new Date().toDateString()
    return {
      totalProjects: this.projects.length,
      totalAgents: this.agents.length,
      activeAgents: this.agents.filter(a => a.status === 'running').length,
      runningTasks: this.tasks.filter(t => t.status === 'running').length,
      completedTasksToday: this.tasks.filter(
        t => t.status === 'completed' && t.completedAt && new Date(t.completedAt).toDateString() === today
      ).length,
      totalTokenUsageToday: this.tasks
        .filter(t => new Date(t.updatedAt).toDateString() === today)
        .reduce((sum, t) => sum + t.tokenUsage, 0),
    }
  }

  async getActiveAgents(): Promise<DashboardAgentSummary[]> {
    await delay()
    return this.agents
      .filter(a => a.status === 'running')
      .map(a => {
        const project = this.projects.find(p => p.id === a.projectId)
        const task = a.currentTaskId ? this.tasks.find(t => t.id === a.currentTaskId) : undefined
        return {
          agentId: a.id,
          projectId: a.projectId,
          projectName: project?.name ?? 'Unknown',
          agentName: a.name,
          status: a.status,
          currentTaskTitle: task?.title,
        }
      })
  }

  async getRecentTasks(limit = 10): Promise<DashboardTaskSummary[]> {
    await delay()
    return [...this.tasks]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, limit)
      .map(t => {
        const project = this.projects.find(p => p.id === t.projectId)
        const agent = this.agents.find(a => a.id === t.agentId)
        return {
          taskId: t.id,
          projectId: t.projectId,
          projectName: project?.name ?? 'Unknown',
          agentId: t.agentId,
          agentName: agent?.name ?? 'Unknown',
          title: t.title,
          status: t.status,
          progress: t.progress,
          updatedAt: t.updatedAt,
        }
      })
  }

  async getActivityFeed(limit = 20): Promise<ActivityEntry[]> {
    await delay()
    return [...this.activities]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit)
  }
}
