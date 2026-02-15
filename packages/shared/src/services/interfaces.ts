import type {
  Project, Agent, Conversation, Task, Artifact, MemoryEntry, CronJob, Skill,
  GlobalSettings, ProjectId, AgentId, ConversationId, MessageId, TaskId, ArtifactId, MemoryId, SkillId, CronJobId,
  PermissionsConfigId,
  DashboardSummary, DashboardAgentSummary, DashboardTaskSummary, ActivityEntry,
  Message, PaginationParams, PaginatedResult, TaskLogEntry,
  SkillCreateData, SkillUpdateData,
  MCPServerConfig, MCPServerCreateData, MCPServerUpdateData,
  PermissionsConfigFile,
} from '../types'

export interface IProjectService {
  list(): Promise<Project[]>
  getById(id: ProjectId): Promise<Project | null>
  create(data: Pick<Project, 'name' | 'description' | 'icon' | 'workingDirectory'>): Promise<Project>
  update(id: ProjectId, data: Partial<Pick<Project, 'name' | 'description' | 'icon' | 'workingDirectory' | 'config' | 'mainAgentId'>>): Promise<Project>
  delete(id: ProjectId): Promise<void>
}

export interface IAgentService {
  list(projectId: ProjectId): Promise<Agent[]>
  getById(projectId: ProjectId, id: AgentId): Promise<Agent | null>
  create(projectId: ProjectId, data: Pick<Agent, 'name' | 'description' | 'systemPrompt' | 'modelConfig'>): Promise<Agent>
  update(projectId: ProjectId, id: AgentId, data: Partial<Agent>): Promise<Agent>
  delete(projectId: ProjectId, id: AgentId): Promise<void>
}

export interface IConversationService {
  list(projectId: ProjectId, agentId?: AgentId): Promise<Conversation[]>
  getById(projectId: ProjectId, id: ConversationId): Promise<Conversation | null>
  create(projectId: ProjectId, agentId: AgentId, title: string): Promise<Conversation>
  sendMessage(projectId: ProjectId, conversationId: ConversationId, content: string): Promise<void>
  saveMessage(projectId: ProjectId, conversationId: ConversationId, data: { id: MessageId; role: string; parts: unknown[]; content: string }): Promise<void>
  getMessages(projectId: ProjectId, conversationId: ConversationId, params: PaginationParams): Promise<PaginatedResult<Message>>
  searchMessages(projectId: ProjectId, query: string, params: PaginationParams): Promise<PaginatedResult<Message>>
  update(projectId: ProjectId, id: ConversationId, data: { title?: string }): Promise<Conversation>
  delete(projectId: ProjectId, id: ConversationId): Promise<void>
}

export interface ITaskService {
  list(projectId: ProjectId, agentId?: AgentId): Promise<Task[]>
  getById(projectId: ProjectId, id: TaskId): Promise<Task | null>
  cancel(projectId: ProjectId, id: TaskId): Promise<void>
  getLogs(taskId: TaskId, cursor?: number, limit?: number): Promise<TaskLogEntry[]>
}

export interface IArtifactService {
  list(projectId: ProjectId, agentId?: AgentId): Promise<Artifact[]>
  getById(projectId: ProjectId, id: ArtifactId): Promise<Artifact | null>
  delete(projectId: ProjectId, id: ArtifactId): Promise<void>
}

export interface IMemoryService {
  list(projectId: ProjectId): Promise<MemoryEntry[]>
  create(projectId: ProjectId, data: Pick<MemoryEntry, 'content' | 'source' | 'tags'>): Promise<MemoryEntry>
  update(projectId: ProjectId, id: MemoryId, data: Partial<Pick<MemoryEntry, 'content' | 'tags'>>): Promise<MemoryEntry>
  delete(projectId: ProjectId, id: MemoryId): Promise<void>
}

export interface ISkillService {
  list(projectId: ProjectId): Promise<Skill[]>
  getById(projectId: ProjectId, id: SkillId): Promise<Skill | null>
  create(projectId: ProjectId, data: SkillCreateData): Promise<Skill>
  update(projectId: ProjectId, id: SkillId, data: SkillUpdateData): Promise<Skill>
  delete(projectId: ProjectId, id: SkillId): Promise<void>
  importZip(projectId: ProjectId, file: File): Promise<{ imported: Array<{ name: string; id: SkillId }>; count: number }>
}

export interface IMCPService {
  list(projectId: ProjectId): Promise<MCPServerConfig[]>
  getByName(projectId: ProjectId, name: string): Promise<MCPServerConfig | null>
  create(projectId: ProjectId, data: MCPServerCreateData): Promise<MCPServerConfig>
  update(projectId: ProjectId, name: string, data: MCPServerUpdateData): Promise<MCPServerConfig>
  delete(projectId: ProjectId, name: string): Promise<void>
  /** Resolve an array of names to full configs (skips missing) */
  resolveNames(projectId: ProjectId, names: string[]): Promise<MCPServerConfig[]>
  /** Test connectivity to an MCP server. Returns ok/toolCount/error. Optional — only implemented by HTTP/mock services, not storage. */
  test?(projectId: ProjectId, name: string): Promise<{ ok: boolean; toolCount: number; error?: string }>
}

export interface ISettingsService {
  get(): Promise<GlobalSettings>
  update(data: Partial<GlobalSettings>): Promise<GlobalSettings>
}

export interface ICronJobService {
  list(projectId: ProjectId): Promise<CronJob[]>
  getById(projectId: ProjectId, id: CronJobId): Promise<CronJob | null>
  create(projectId: ProjectId, data: Pick<CronJob, 'agentId' | 'name' | 'description' | 'cronExpression' | 'enabled'>): Promise<CronJob>
  update(projectId: ProjectId, id: CronJobId, data: Partial<Pick<CronJob, 'agentId' | 'name' | 'description' | 'cronExpression' | 'enabled'>>): Promise<CronJob>
  delete(projectId: ProjectId, id: CronJobId): Promise<void>
}

export interface IDashboardService {
  getSummary(): Promise<DashboardSummary>
  getActiveAgents(): Promise<DashboardAgentSummary[]>
  getRecentTasks(limit?: number): Promise<DashboardTaskSummary[]>
  getActivityFeed(limit?: number): Promise<ActivityEntry[]>
}

export interface IPermissionsConfigService {
  /** List all permissions configs for a project. Always includes the system default. */
  list(projectId: ProjectId): Promise<PermissionsConfigFile[]>

  /** Get a permissions config by ID. System default (id='default') is always available. */
  getById(projectId: ProjectId, id: PermissionsConfigId): Promise<PermissionsConfigFile | null>

  /** Create a new permissions config with a generated UUID. */
  create(
    projectId: ProjectId,
    data: Pick<PermissionsConfigFile, 'title' | 'mode' | 'config'>
  ): Promise<PermissionsConfigFile>

  /** Update an existing permissions config. Cannot update system default (id='default'). */
  update(
    projectId: ProjectId,
    id: PermissionsConfigId,
    data: Partial<Pick<PermissionsConfigFile, 'title' | 'mode' | 'config'>>
  ): Promise<PermissionsConfigFile>

  /** Delete a permissions config. Cannot delete system default (id='default'). */
  delete(projectId: ProjectId, id: PermissionsConfigId): Promise<void>

  /** Duplicate a permissions config with a new ID and title. */
  duplicate(
    projectId: ProjectId,
    sourceId: PermissionsConfigId,
    newTitle: string
  ): Promise<PermissionsConfigFile>
}
