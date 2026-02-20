import type {
  Project, Agent, Conversation, ConversationTask, MemoryEntry, GlobalSettings, CronJob,CronJobRun, Skill,
  MCPServerConfig, MCPServerCreateData, MCPServerUpdateData, PermissionsConfigFile,
  ProjectId, AgentId, ConversationId, TaskId, MemoryId, MessageId, SkillId, CronJobId, PermissionsConfigId,
  DashboardSummary, DashboardAgentStats, DashboardRecentChat, DashboardTokenTrend,
  DashboardTokenByModel, DashboardTokenByAgent, RuntimeStatus, TimeRange,
  Message, PaginationParams, PaginatedResult,
  SkillCreateData, SkillUpdateData,
  WorkspaceEntry, FilePreviewData,
  CompactRecord,
} from '@golemancy/shared'
import { DEFAULT_PERMISSIONS_CONFIG, getFileCategory, getMimeType } from '@golemancy/shared'
import type {
  IProjectService, IAgentService, IConversationService,
  ITaskService, IMemoryService, ISkillService, IMCPService, ISettingsService, ICronJobService, IDashboardService,
  IGlobalDashboardService, IPermissionsConfigService, IWorkspaceService,
} from '../interfaces'
import type { ConversationTokenUsageResult } from '@golemancy/shared'
import {
  SEED_PROJECTS, SEED_AGENTS, SEED_CONVERSATIONS,
  SEED_CONVERSATION_TASKS, SEED_MEMORIES, SEED_SETTINGS,
  SEED_CRON_JOBS, SEED_SKILLS, SEED_MCP_SERVERS,
  SEED_PERMISSIONS_CONFIGS,
  SEED_DASHBOARD_SUMMARY, SEED_DASHBOARD_AGENT_STATS, SEED_DASHBOARD_RECENT_CHATS, SEED_DASHBOARD_TOKEN_TREND,
  SEED_DASHBOARD_TOKEN_BY_MODEL, SEED_DASHBOARD_TOKEN_BY_AGENT, SEED_DASHBOARD_RUNTIME_STATUS,
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

  async update(id: ProjectId, data: Partial<Pick<Project, 'name' | 'description' | 'icon' | 'config' | 'mainAgentId'>>): Promise<Project> {
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

  private topologyLayouts = new Map<ProjectId, Record<string, { x: number; y: number }>>()

  async getTopologyLayout(projectId: ProjectId): Promise<Record<string, { x: number; y: number }>> {
    await delay()
    return this.topologyLayouts.get(projectId) ?? {}
  }

  async saveTopologyLayout(projectId: ProjectId, layout: Record<string, { x: number; y: number }>): Promise<void> {
    await delay()
    this.topologyLayouts.set(projectId, layout)
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
      inputTokens: 0,
      outputTokens: 0,
      provider: '',
      model: '',
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
      inputTokens: 0,
      outputTokens: 0,
      provider: '',
      model: '',
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
      inputTokens: 0,
      outputTokens: 0,
      provider: '',
      model: '',
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

  async getConversationTokenUsage(_projectId: ProjectId, _conversationId: ConversationId): Promise<ConversationTokenUsageResult> {
    await delay()
    return { total: { inputTokens: 0, outputTokens: 0 }, byAgent: [], byModel: [] }
  }

  async compact(_projectId: ProjectId, _conversationId: ConversationId): Promise<CompactRecord> {
    await delay()
    return {
      id: genId('compact'),
      conversationId: _conversationId,
      summary: 'Mock compact summary',
      boundaryMessageId: '' as MessageId,
      inputTokens: 0,
      outputTokens: 0,
      trigger: 'manual',
      createdAt: new Date().toISOString(),
    }
  }
}

// --- TaskService ---
export class MockTaskService implements ITaskService {
  private data = new Map<TaskId, ConversationTask>(SEED_CONVERSATION_TASKS.map(t => [t.id, { ...t }]))

  async list(_projectId: ProjectId, conversationId?: ConversationId): Promise<ConversationTask[]> {
    await delay()
    const all = [...this.data.values()]
    if (conversationId) return all.filter(t => t.conversationId === conversationId)
    return all
  }

  async getById(_projectId: ProjectId, id: TaskId): Promise<ConversationTask | null> {
    await delay()
    return this.data.get(id) ?? null
  }
}

// --- WorkspaceService ---
export class MockWorkspaceService implements IWorkspaceService {
  // In-memory fake filesystem for dev
  private files: Array<{ path: string; content: string; size: number; modifiedAt: string }> = [
    { path: 'report.md', content: '# Analysis Report\n\nSample content...', size: 2048, modifiedAt: new Date().toISOString() },
    { path: 'data/results.csv', content: 'name,value,score\nAlpha,100,0.95\nBeta,85,0.87\nGamma,72,0.81', size: 512, modifiedAt: new Date().toISOString() },
    { path: 'scripts/analyze.py', content: 'import pandas as pd\n\ndef analyze(data):\n    return data.describe()', size: 1024, modifiedAt: new Date().toISOString() },
    { path: 'output/chart.png', content: '', size: 45000, modifiedAt: new Date().toISOString() },
  ]

  async listDir(_projectId: ProjectId, dirPath: string): Promise<WorkspaceEntry[]> {
    await delay()
    const prefix = dirPath ? dirPath + '/' : ''
    const entries = new Map<string, WorkspaceEntry>()

    for (const file of this.files) {
      if (!file.path.startsWith(prefix)) continue
      const rest = file.path.slice(prefix.length)
      const parts = rest.split('/')

      if (parts.length === 1) {
        // Direct file
        entries.set(parts[0], {
          name: file.path,
          type: 'file',
          size: file.size,
          modifiedAt: file.modifiedAt,
          category: getFileCategory(parts[0]),
        })
      } else {
        // Directory entry
        const dirName = prefix + parts[0]
        if (!entries.has(parts[0])) {
          entries.set(parts[0], {
            name: dirName,
            type: 'directory',
            size: 0,
            modifiedAt: file.modifiedAt,
          })
        }
      }
    }

    const result = [...entries.values()]
    result.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    return result
  }

  async readFile(_projectId: ProjectId, filePath: string): Promise<FilePreviewData> {
    await delay()
    const file = this.files.find(f => f.path === filePath)
    if (!file) throw new Error('File not found')
    const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
    const category = getFileCategory(filePath)
    return {
      path: filePath,
      category,
      size: file.size,
      modifiedAt: file.modifiedAt,
      content: category === 'code' || category === 'text' ? file.content : null,
      mimeType: getMimeType(filePath),
      extension: ext,
    }
  }

  async deleteFile(_projectId: ProjectId, filePath: string): Promise<void> {
    await delay()
    this.files = this.files.filter(f => f.path !== filePath)
  }

  getFileUrl(_projectId: ProjectId, filePath: string): string {
    return `/mock/workspace/${encodeURIComponent(filePath)}`
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

  async test(_projectId: ProjectId, name: string): Promise<{ ok: boolean; toolCount: number; error?: string }> {
    await delay()
    const server = this.data.get(name)
    if (!server) return { ok: false, toolCount: 0, error: 'MCP server not found' }
    // Mock: return success with random tool count
    return { ok: true, toolCount: Math.floor(Math.random() * 8) + 1 }
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

  async create(projectId: ProjectId, input: Pick<CronJob, 'agentId' | 'name' | 'cronExpression' | 'enabled' | 'instruction' | 'scheduleType' | 'scheduledAt'>): Promise<CronJob> {
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

  async update(projectId: ProjectId, id: CronJobId, data: Partial<Pick<CronJob, 'agentId' | 'name' | 'cronExpression' | 'enabled' | 'instruction' | 'scheduleType' | 'scheduledAt'>>): Promise<CronJob> {
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

  async trigger(_projectId: ProjectId, _id: CronJobId): Promise<void> {
    await delay()
  }

  async listRuns(_projectId: ProjectId, _cronJobId?: CronJobId, _limit?: number): Promise<CronJobRun[]> {
    await delay()
    return []
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

  async testProvider(slug: string): Promise<{ ok: boolean; error?: string; latencyMs?: number }> {
    await delay(200)
    const entry = this.settings.providers[slug]
    if (!entry) return { ok: false, error: `Provider "${slug}" not found` }
    if (!entry.apiKey && !entry.baseUrl?.includes('localhost')) return { ok: false, error: 'No API key configured' }
    return { ok: true, latencyMs: 120 + Math.floor(Math.random() * 200) }
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
  async getSummary(_projectId: ProjectId, _timeRange?: TimeRange): Promise<DashboardSummary> {
    await delay()
    return { ...SEED_DASHBOARD_SUMMARY }
  }

  async getAgentStats(_projectId: ProjectId, _timeRange?: TimeRange): Promise<DashboardAgentStats[]> {
    await delay()
    return [...SEED_DASHBOARD_AGENT_STATS]
  }

  async getRecentChats(_projectId: ProjectId, limit = 20): Promise<DashboardRecentChat[]> {
    await delay()
    return SEED_DASHBOARD_RECENT_CHATS.slice(0, limit)
  }

  async getTokenTrend(_projectId: ProjectId, days = 14, _timeRange?: TimeRange): Promise<DashboardTokenTrend[]> {
    await delay()
    return SEED_DASHBOARD_TOKEN_TREND.slice(-days)
  }

  async getTokenByModel(_projectId: ProjectId, _timeRange?: TimeRange): Promise<DashboardTokenByModel[]> {
    await delay()
    return [...SEED_DASHBOARD_TOKEN_BY_MODEL]
  }

  async getTokenByAgent(_projectId: ProjectId, _timeRange?: TimeRange): Promise<DashboardTokenByAgent[]> {
    await delay()
    return [...SEED_DASHBOARD_TOKEN_BY_AGENT]
  }

  async getRuntimeStatus(_projectId: ProjectId): Promise<RuntimeStatus> {
    await delay()
    return { ...SEED_DASHBOARD_RUNTIME_STATUS }
  }
}

// --- GlobalDashboardService ---
export class MockGlobalDashboardService implements IGlobalDashboardService {
  async getSummary(_timeRange?: TimeRange): Promise<DashboardSummary> {
    await delay()
    return { ...SEED_DASHBOARD_SUMMARY }
  }

  async getTokenByModel(_timeRange?: TimeRange) {
    await delay()
    return [...SEED_DASHBOARD_TOKEN_BY_MODEL]
  }

  async getTokenByAgent(_timeRange?: TimeRange) {
    await delay()
    return SEED_DASHBOARD_TOKEN_BY_AGENT.map(a => ({
      ...a,
      projectId: 'proj-1' as ProjectId,
      projectName: 'Content Biz',
    }))
  }

  async getTokenByProject(_timeRange?: TimeRange) {
    await delay()
    return [
      { projectId: 'proj-1' as ProjectId, projectName: 'Content Biz', inputTokens: 137_600, outputTokens: 68_700, callCount: 42 },
      { projectId: 'proj-2' as ProjectId, projectName: 'E-Commerce Ops', inputTokens: 50_850, outputTokens: 25_400, callCount: 15 },
    ]
  }

  async getTokenTrend(_days?: number, _timeRange?: TimeRange): Promise<DashboardTokenTrend[]> {
    await delay()
    return [...SEED_DASHBOARD_TOKEN_TREND].slice(-(_days ?? 14))
  }

  async getRuntimeStatus(): Promise<RuntimeStatus> {
    await delay()
    return { ...SEED_DASHBOARD_RUNTIME_STATUS }
  }
}
