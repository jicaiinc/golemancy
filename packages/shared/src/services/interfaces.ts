import type {
  Project, Agent, Conversation, ConversationTask, CronJob, CronJobRun, Skill, Team,
  GlobalSettings, ProjectId, AgentId, ConversationId, MessageId, TaskId, SkillId, CronJobId, TeamId,
  PermissionsConfigId, TranscriptionId, MemoryId,
  DashboardSummary, DashboardAgentStats, DashboardRecentChat, DashboardTokenTrend,
  DashboardTokenByModel, DashboardTokenByAgent, RuntimeStatus, TimeRange,
  Message, PaginationParams, PaginatedResult,
  SkillCreateData, SkillUpdateData,
  MCPServerConfig, MCPServerCreateData, MCPServerUpdateData,
  PermissionsConfigFile,
  WorkspaceEntry, FilePreviewData,
  CompactRecord,
  TranscriptionRecord, SpeechToTextSettings, SpeechStorageUsage,
  MemoryEntry, MemoryCreateData, MemoryUpdateData,
} from '../types'

export interface IProjectService {
  list(): Promise<Project[]>
  getById(id: ProjectId): Promise<Project | null>
  create(data: Pick<Project, 'name' | 'description' | 'icon'>): Promise<Project>
  update(id: ProjectId, data: Partial<Pick<Project, 'name' | 'description' | 'icon' | 'config' | 'defaultAgentId' | 'defaultTeamId'>>): Promise<Project>
  delete(id: ProjectId): Promise<void>
  getTopologyLayout(projectId: ProjectId): Promise<Record<string, { x: number; y: number }>>
  saveTopologyLayout(projectId: ProjectId, layout: Record<string, { x: number; y: number }>): Promise<void>
}

export interface IAgentService {
  list(projectId: ProjectId): Promise<Agent[]>
  getById(projectId: ProjectId, id: AgentId): Promise<Agent | null>
  create(projectId: ProjectId, data: Pick<Agent, 'name' | 'description' | 'systemPrompt' | 'modelConfig'>): Promise<Agent>
  update(projectId: ProjectId, id: AgentId, data: Partial<Agent>): Promise<Agent>
  delete(projectId: ProjectId, id: AgentId): Promise<void>
}

export interface ConversationTokenUsageResult {
  total: { inputTokens: number; outputTokens: number }
  byAgent: Array<{ agentId: string; name: string; inputTokens: number; outputTokens: number }>
  byModel: Array<{ provider: string; model: string; inputTokens: number; outputTokens: number }>
}

export interface IConversationService {
  list(projectId: ProjectId, agentId?: AgentId): Promise<Conversation[]>
  getById(projectId: ProjectId, id: ConversationId): Promise<Conversation | null>
  create(projectId: ProjectId, agentId: AgentId, title: string, teamId?: TeamId): Promise<Conversation>
  sendMessage(projectId: ProjectId, conversationId: ConversationId, content: string): Promise<void>
  saveMessage(projectId: ProjectId, conversationId: ConversationId, data: { id: MessageId; role: string; parts: unknown[]; content: string; inputTokens?: number; outputTokens?: number; contextTokens?: number; provider?: string; model?: string; metadata?: Record<string, unknown> }): Promise<void>
  getMessages(projectId: ProjectId, conversationId: ConversationId, params: PaginationParams): Promise<PaginatedResult<Message>>
  searchMessages(projectId: ProjectId, query: string, params: PaginationParams): Promise<PaginatedResult<Message>>
  update(projectId: ProjectId, id: ConversationId, data: { title?: string }): Promise<Conversation>
  delete(projectId: ProjectId, id: ConversationId): Promise<void>
  getConversationTokenUsage?(projectId: ProjectId, conversationId: ConversationId): Promise<ConversationTokenUsageResult>
  compact?(projectId: ProjectId, conversationId: ConversationId, signal?: AbortSignal): Promise<CompactRecord>
}

export interface ITaskService {
  list(projectId: ProjectId, conversationId?: ConversationId): Promise<ConversationTask[]>
  getById(projectId: ProjectId, id: TaskId): Promise<ConversationTask | null>
}

export interface IWorkspaceService {
  /** List entries in a directory. `dirPath` is relative to workspace root. Empty string = root. */
  listDir(projectId: ProjectId, dirPath: string): Promise<WorkspaceEntry[]>

  /** Read a file for preview. Returns text content for tier-1, meta-only for tier-2. */
  readFile(projectId: ProjectId, filePath: string): Promise<FilePreviewData>

  /** Delete a file or empty directory. `filePath` is relative to workspace root. */
  deleteFile(projectId: ProjectId, filePath: string): Promise<void>

  /** Get the full URL to download/serve a workspace file (for images, downloads). */
  getFileUrl(projectId: ProjectId, filePath: string): string
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
  testProvider(slug: string): Promise<{ ok: boolean; error?: string; latencyMs?: number }>
}

export interface ICronJobService {
  list(projectId: ProjectId): Promise<CronJob[]>
  getById(projectId: ProjectId, id: CronJobId): Promise<CronJob | null>
  create(projectId: ProjectId, data: Pick<CronJob, 'agentId' | 'name' | 'cronExpression' | 'enabled' | 'instruction' | 'scheduleType' | 'scheduledAt'> & { teamId?: TeamId }): Promise<CronJob>
  update(projectId: ProjectId, id: CronJobId, data: Partial<Pick<CronJob, 'agentId' | 'name' | 'cronExpression' | 'enabled' | 'instruction' | 'scheduleType' | 'scheduledAt'> & { teamId?: TeamId }>): Promise<CronJob>
  delete(projectId: ProjectId, id: CronJobId): Promise<void>
  trigger?(projectId: ProjectId, id: CronJobId): Promise<void>
  listRuns?(projectId: ProjectId, cronJobId?: CronJobId, limit?: number): Promise<CronJobRun[]>
}

export interface IDashboardService {
  getSummary(projectId: ProjectId, timeRange?: TimeRange): Promise<DashboardSummary>
  getAgentStats(projectId: ProjectId, timeRange?: TimeRange): Promise<DashboardAgentStats[]>
  getRecentChats(projectId: ProjectId, limit?: number): Promise<DashboardRecentChat[]>
  getTokenTrend(projectId: ProjectId, days?: number, timeRange?: TimeRange): Promise<DashboardTokenTrend[]>
  getTokenByModel(projectId: ProjectId, timeRange?: TimeRange): Promise<DashboardTokenByModel[]>
  getTokenByAgent(projectId: ProjectId, timeRange?: TimeRange): Promise<DashboardTokenByAgent[]>
  getRuntimeStatus(projectId: ProjectId): Promise<RuntimeStatus>
}

export interface IGlobalDashboardService {
  getSummary(timeRange?: TimeRange): Promise<DashboardSummary>
  getTokenByModel(timeRange?: TimeRange): Promise<DashboardTokenByModel[]>
  getTokenByAgent(timeRange?: TimeRange): Promise<(DashboardTokenByAgent & { projectId: ProjectId; projectName: string })[]>
  getTokenByProject(timeRange?: TimeRange): Promise<{ projectId: ProjectId; projectName: string; inputTokens: number; outputTokens: number; callCount: number }[]>
  getTokenTrend(days?: number, timeRange?: TimeRange): Promise<DashboardTokenTrend[]>
  getRuntimeStatus(): Promise<RuntimeStatus>
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

export interface IMemoryService {
  list(projectId: ProjectId, agentId: AgentId): Promise<MemoryEntry[]>
  create(projectId: ProjectId, agentId: AgentId, data: MemoryCreateData): Promise<MemoryEntry>
  update(projectId: ProjectId, agentId: AgentId, id: MemoryId, data: MemoryUpdateData): Promise<MemoryEntry>
  delete(projectId: ProjectId, agentId: AgentId, id: MemoryId): Promise<void>
}

export interface ISpeechService {
  /** Upload audio + transcribe. Returns the created record. */
  transcribe(
    audio: File | Blob,
    metadata: {
      audioDurationMs: number
      projectId?: ProjectId
      conversationId?: ConversationId
    },
  ): Promise<TranscriptionRecord>

  /** List all transcription records, newest first. */
  listHistory(params?: { limit?: number; offset?: number }): Promise<TranscriptionRecord[]>

  /** Get the URL to stream/download an audio file. */
  getAudioUrl(audioFileId: string): string

  /** Delete a single transcription record + its audio file. */
  deleteRecord(id: TranscriptionId): Promise<void>

  /** Clear all history records + audio files. Returns stats. */
  clearHistory(): Promise<{ deletedCount: number; freedBytes: number }>

  /** Retry transcription for a failed record. */
  retry(id: TranscriptionId): Promise<TranscriptionRecord>

  /** Test the STT provider connection with a tiny audio snippet. */
  testProvider(config: SpeechToTextSettings): Promise<{ ok: boolean; error?: string; latencyMs?: number }>

  /** Get total storage used by audio files. */
  getStorageUsage(): Promise<SpeechStorageUsage>
}

export interface ITeamService {
  list(projectId: ProjectId): Promise<Team[]>
  getById(projectId: ProjectId, id: TeamId): Promise<Team | null>
  create(projectId: ProjectId, data: Pick<Team, 'name' | 'description' | 'instruction' | 'members'>): Promise<Team>
  update(projectId: ProjectId, id: TeamId, data: Partial<Pick<Team, 'name' | 'description' | 'instruction' | 'members'>>): Promise<Team>
  delete(projectId: ProjectId, id: TeamId): Promise<void>
}
