import type {
  Project, Agent, Conversation, ConversationTask, GlobalSettings, CronJob,CronJobRun, Skill,
  MCPServerConfig, MCPServerCreateData, MCPServerUpdateData, PermissionsConfigFile,
  ProjectId, AgentId, ConversationId, TaskId, MessageId, SkillId, CronJobId, PermissionsConfigId,
  KBCollectionId, KBDocumentId, KBCollection, KBDocument, KBSearchResult, KBCollectionTier, KBSourceType,
  DashboardSummary, DashboardAgentStats, DashboardRecentChat, DashboardTokenTrend,
  DashboardTokenByModel, DashboardTokenByAgent, RuntimeStatus, TimeRange,
  Message, PaginationParams, PaginatedResult,
  SkillCreateData, SkillUpdateData,
  WorkspaceEntry, FilePreviewData,
  ConversationTokenUsageResult, CompactRecord,
  IProjectService, IAgentService, IConversationService,
  ITaskService, IKnowledgeBaseService, ISkillService, IMCPService, ISettingsService, ICronJobService, IDashboardService,
  IPermissionsConfigService, IGlobalDashboardService, IWorkspaceService,
} from '@golemancy/shared'
import { fetchJson, getAuthToken } from './base'

export class HttpProjectService implements IProjectService {
  constructor(private baseUrl: string) {}

  list() {
    return fetchJson<Project[]>(`${this.baseUrl}/api/projects`)
  }
  getById(id: ProjectId) {
    return fetchJson<Project | null>(`${this.baseUrl}/api/projects/${id}`)
  }
  create(data: Pick<Project, 'name' | 'description' | 'icon'>) {
    return fetchJson<Project>(`${this.baseUrl}/api/projects`, {
      method: 'POST', body: JSON.stringify(data),
    })
  }
  update(id: ProjectId, data: Partial<Pick<Project, 'name' | 'description' | 'icon' | 'config' | 'mainAgentId'>>) {
    return fetchJson<Project>(`${this.baseUrl}/api/projects/${id}`, {
      method: 'PATCH', body: JSON.stringify(data),
    })
  }
  async delete(id: ProjectId) {
    await fetchJson(`${this.baseUrl}/api/projects/${id}`, { method: 'DELETE' })
  }
  async getTopologyLayout(projectId: ProjectId) {
    const layout = await fetchJson<Record<string, { x: number; y: number }>>(
      `${this.baseUrl}/api/projects/${projectId}/topology-layout`
    )
    return layout ?? {}
  }
  async saveTopologyLayout(projectId: ProjectId, layout: Record<string, { x: number; y: number }>) {
    await fetchJson(`${this.baseUrl}/api/projects/${projectId}/topology-layout`, {
      method: 'PUT',
      body: JSON.stringify(layout),
    })
  }
}

export class HttpAgentService implements IAgentService {
  constructor(private baseUrl: string) {}

  list(projectId: ProjectId) {
    return fetchJson<Agent[]>(`${this.baseUrl}/api/projects/${projectId}/agents`)
  }
  getById(projectId: ProjectId, id: AgentId) {
    return fetchJson<Agent | null>(`${this.baseUrl}/api/projects/${projectId}/agents/${id}`)
  }
  create(projectId: ProjectId, data: Pick<Agent, 'name' | 'description' | 'systemPrompt' | 'modelConfig'>) {
    return fetchJson<Agent>(`${this.baseUrl}/api/projects/${projectId}/agents`, {
      method: 'POST', body: JSON.stringify(data),
    })
  }
  update(projectId: ProjectId, id: AgentId, data: Partial<Agent>) {
    return fetchJson<Agent>(`${this.baseUrl}/api/projects/${projectId}/agents/${id}`, {
      method: 'PATCH', body: JSON.stringify(data),
    })
  }
  async delete(projectId: ProjectId, id: AgentId) {
    await fetchJson(`${this.baseUrl}/api/projects/${projectId}/agents/${id}`, { method: 'DELETE' })
  }
}

export class HttpConversationService implements IConversationService {
  constructor(private baseUrl: string) {}

  list(projectId: ProjectId, agentId?: AgentId) {
    const params = agentId ? `?agentId=${agentId}` : ''
    return fetchJson<Conversation[]>(`${this.baseUrl}/api/projects/${projectId}/conversations${params}`)
  }
  getById(projectId: ProjectId, id: ConversationId) {
    return fetchJson<Conversation | null>(`${this.baseUrl}/api/projects/${projectId}/conversations/${id}`)
  }
  create(projectId: ProjectId, agentId: AgentId, title: string) {
    return fetchJson<Conversation>(`${this.baseUrl}/api/projects/${projectId}/conversations`, {
      method: 'POST', body: JSON.stringify({ agentId, title }),
    })
  }
  update(projectId: ProjectId, id: ConversationId, data: { title?: string }) {
    return fetchJson<Conversation>(`${this.baseUrl}/api/projects/${projectId}/conversations/${id}`, {
      method: 'PATCH', body: JSON.stringify(data),
    })
  }
  async sendMessage(_projectId: ProjectId, _conversationId: ConversationId, _content: string) {
    // Chat streaming uses useChat() + /api/chat, not this method
    throw new Error('Use useChat() for real-time chat')
  }
  async saveMessage(projectId: ProjectId, conversationId: ConversationId, data: { id: MessageId; role: string; parts: unknown[]; content: string }) {
    await fetchJson(`${this.baseUrl}/api/projects/${projectId}/conversations/${conversationId}/messages`, {
      method: 'POST', body: JSON.stringify(data),
    })
  }
  getMessages(projectId: ProjectId, conversationId: ConversationId, params: PaginationParams) {
    return fetchJson<PaginatedResult<Message>>(
      `${this.baseUrl}/api/projects/${projectId}/conversations/${conversationId}/messages?page=${params.page}&pageSize=${params.pageSize}`,
    )
  }
  searchMessages(projectId: ProjectId, query: string, params: PaginationParams) {
    return fetchJson<PaginatedResult<Message>>(
      `${this.baseUrl}/api/projects/${projectId}/conversations/messages/search?q=${encodeURIComponent(query)}&page=${params.page}&pageSize=${params.pageSize}`,
    )
  }
  async delete(projectId: ProjectId, id: ConversationId) {
    await fetchJson(`${this.baseUrl}/api/projects/${projectId}/conversations/${id}`, { method: 'DELETE' })
  }
  getConversationTokenUsage(projectId: ProjectId, conversationId: ConversationId) {
    return fetchJson<ConversationTokenUsageResult>(
      `${this.baseUrl}/api/projects/${projectId}/conversations/${conversationId}/token-usage`,
    )
  }
  compact(projectId: ProjectId, conversationId: ConversationId, signal?: AbortSignal) {
    return fetchJson<CompactRecord>(
      `${this.baseUrl}/api/projects/${projectId}/conversations/${conversationId}/compact`,
      { method: 'POST', signal },
    )
  }
}

export class HttpTaskService implements ITaskService {
  constructor(private baseUrl: string) {}

  list(projectId: ProjectId, conversationId?: ConversationId) {
    const params = conversationId ? `?conversationId=${conversationId}` : ''
    return fetchJson<ConversationTask[]>(`${this.baseUrl}/api/projects/${projectId}/tasks${params}`)
  }
  getById(projectId: ProjectId, id: TaskId) {
    return fetchJson<ConversationTask | null>(`${this.baseUrl}/api/projects/${projectId}/tasks/${id}`)
  }
}

export class HttpWorkspaceService implements IWorkspaceService {
  constructor(private baseUrl: string) {}

  listDir(projectId: ProjectId, dirPath: string) {
    const params = dirPath ? `?path=${encodeURIComponent(dirPath)}` : ''
    return fetchJson<WorkspaceEntry[]>(
      `${this.baseUrl}/api/projects/${projectId}/workspace${params}`
    )
  }

  readFile(projectId: ProjectId, filePath: string) {
    return fetchJson<FilePreviewData>(
      `${this.baseUrl}/api/projects/${projectId}/workspace/file?path=${encodeURIComponent(filePath)}`
    )
  }

  async deleteFile(projectId: ProjectId, filePath: string) {
    await fetchJson(
      `${this.baseUrl}/api/projects/${projectId}/workspace/file?path=${encodeURIComponent(filePath)}`,
      { method: 'DELETE' }
    )
  }

  getFileUrl(projectId: ProjectId, filePath: string): string {
    return `${this.baseUrl}/api/projects/${projectId}/workspace/raw?path=${encodeURIComponent(filePath)}`
  }
}

export class HttpKnowledgeBaseService implements IKnowledgeBaseService {
  constructor(private baseUrl: string) {}

  private kbUrl(projectId: ProjectId, ...segments: string[]) {
    return `${this.baseUrl}/api/projects/${projectId}/knowledge-base${segments.length ? '/' + segments.join('/') : ''}`
  }

  listCollections(projectId: ProjectId) {
    return fetchJson<KBCollection[]>(this.kbUrl(projectId))
  }
  createCollection(projectId: ProjectId, data: { name: string; description?: string; tier: KBCollectionTier }) {
    return fetchJson<KBCollection>(this.kbUrl(projectId), {
      method: 'POST', body: JSON.stringify(data),
    })
  }
  updateCollection(projectId: ProjectId, id: KBCollectionId, data: Partial<{ name: string; description: string; tier: KBCollectionTier }>) {
    return fetchJson<KBCollection>(this.kbUrl(projectId, id), {
      method: 'PATCH', body: JSON.stringify(data),
    })
  }
  async deleteCollection(projectId: ProjectId, id: KBCollectionId) {
    await fetchJson(this.kbUrl(projectId, id), { method: 'DELETE' })
  }

  listDocuments(projectId: ProjectId, collectionId: KBCollectionId) {
    return fetchJson<KBDocument[]>(this.kbUrl(projectId, collectionId, 'documents'))
  }
  ingestDocument(projectId: ProjectId, collectionId: KBCollectionId, data: { title?: string; content: string; sourceType: KBSourceType; sourceName?: string }) {
    return fetchJson<KBDocument>(this.kbUrl(projectId, collectionId, 'documents'), {
      method: 'POST', body: JSON.stringify(data),
    })
  }
  async uploadDocument(projectId: ProjectId, collectionId: KBCollectionId, file: File, metadata?: { title?: string }): Promise<KBDocument> {
    const formData = new FormData()
    formData.append('file', file)
    if (metadata?.title) formData.append('title', metadata.title)

    const headers: Record<string, string> = {}
    const token = getAuthToken()
    if (token) headers['Authorization'] = `Bearer ${token}`

    const res = await fetch(this.kbUrl(projectId, collectionId, 'documents', 'upload'), {
      method: 'POST',
      body: formData,
      headers,
    })
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
    return await res.json()
  }
  getDocument(projectId: ProjectId, documentId: KBDocumentId) {
    return fetchJson<KBDocument>(`${this.baseUrl}/api/projects/${projectId}/knowledge-base/documents/${documentId}`)
  }
  async deleteDocument(projectId: ProjectId, documentId: KBDocumentId) {
    await fetchJson(`${this.baseUrl}/api/projects/${projectId}/knowledge-base/documents/${documentId}`, { method: 'DELETE' })
  }

  search(projectId: ProjectId, query: string, options?: { collectionId?: KBCollectionId; limit?: number }) {
    return fetchJson<KBSearchResult[]>(this.kbUrl(projectId, 'search'), {
      method: 'POST', body: JSON.stringify({ query, ...options }),
    })
  }
  async hasVectorData(projectId: ProjectId): Promise<boolean> {
    const res = await fetchJson<{ hasVectorData: boolean }>(this.kbUrl(projectId, 'has-vector-data'))
    return res.hasVectorData
  }
}

export class HttpSkillService implements ISkillService {
  constructor(private baseUrl: string) {}

  list(projectId: ProjectId) {
    return fetchJson<Skill[]>(`${this.baseUrl}/api/projects/${projectId}/skills`)
  }
  getById(projectId: ProjectId, id: SkillId) {
    return fetchJson<Skill | null>(`${this.baseUrl}/api/projects/${projectId}/skills/${id}`)
  }
  create(projectId: ProjectId, data: SkillCreateData) {
    return fetchJson<Skill>(`${this.baseUrl}/api/projects/${projectId}/skills`, {
      method: 'POST', body: JSON.stringify(data),
    })
  }
  update(projectId: ProjectId, id: SkillId, data: SkillUpdateData) {
    return fetchJson<Skill>(`${this.baseUrl}/api/projects/${projectId}/skills/${id}`, {
      method: 'PATCH', body: JSON.stringify(data),
    })
  }
  async delete(projectId: ProjectId, id: SkillId) {
    await fetchJson(`${this.baseUrl}/api/projects/${projectId}/skills/${id}`, { method: 'DELETE' })
  }
  async importZip(projectId: ProjectId, file: File) {
    const formData = new FormData()
    formData.append('file', file)
    const response = await fetch(`${this.baseUrl}/api/projects/${projectId}/skills/import-zip`, {
      method: 'POST',
      body: formData,
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to import zip' }))
      throw new Error(error.error || 'Failed to import zip')
    }
    return response.json() as Promise<{ imported: Array<{ name: string; id: SkillId }>; count: number }>
  }
}

export class HttpMCPService implements IMCPService {
  constructor(private baseUrl: string) {}

  list(projectId: ProjectId) {
    return fetchJson<MCPServerConfig[]>(`${this.baseUrl}/api/projects/${projectId}/mcp-servers`)
  }
  getByName(projectId: ProjectId, name: string) {
    return fetchJson<MCPServerConfig | null>(`${this.baseUrl}/api/projects/${projectId}/mcp-servers/${encodeURIComponent(name)}`)
  }
  create(projectId: ProjectId, data: MCPServerCreateData) {
    return fetchJson<MCPServerConfig>(`${this.baseUrl}/api/projects/${projectId}/mcp-servers`, {
      method: 'POST', body: JSON.stringify(data),
    })
  }
  update(projectId: ProjectId, name: string, data: MCPServerUpdateData) {
    return fetchJson<MCPServerConfig>(`${this.baseUrl}/api/projects/${projectId}/mcp-servers/${encodeURIComponent(name)}`, {
      method: 'PATCH', body: JSON.stringify(data),
    })
  }
  async delete(projectId: ProjectId, name: string) {
    await fetchJson(`${this.baseUrl}/api/projects/${projectId}/mcp-servers/${encodeURIComponent(name)}`, { method: 'DELETE' })
  }
  async resolveNames(projectId: ProjectId, names: string[]) {
    const all = await this.list(projectId)
    return all.filter(s => names.includes(s.name))
  }
  test(projectId: ProjectId, name: string) {
    return fetchJson<{ ok: boolean; toolCount: number; error?: string }>(
      `${this.baseUrl}/api/projects/${projectId}/mcp-servers/${encodeURIComponent(name)}/test`,
      { method: 'POST' },
    )
  }
}

export class HttpCronJobService implements ICronJobService {
  constructor(private baseUrl: string) {}

  list(projectId: ProjectId) {
    return fetchJson<CronJob[]>(`${this.baseUrl}/api/projects/${projectId}/cron-jobs`)
  }
  getById(projectId: ProjectId, id: CronJobId) {
    return fetchJson<CronJob | null>(`${this.baseUrl}/api/projects/${projectId}/cron-jobs/${id}`)
  }
  create(projectId: ProjectId, data: Pick<CronJob, 'agentId' | 'name' | 'cronExpression' | 'enabled' | 'instruction' | 'scheduleType' | 'scheduledAt'>) {
    return fetchJson<CronJob>(`${this.baseUrl}/api/projects/${projectId}/cron-jobs`, {
      method: 'POST', body: JSON.stringify(data),
    })
  }
  update(projectId: ProjectId, id: CronJobId, data: Partial<Pick<CronJob, 'agentId' | 'name' | 'cronExpression' | 'enabled' | 'instruction' | 'scheduleType' | 'scheduledAt'>>) {
    return fetchJson<CronJob>(`${this.baseUrl}/api/projects/${projectId}/cron-jobs/${id}`, {
      method: 'PATCH', body: JSON.stringify(data),
    })
  }
  async delete(projectId: ProjectId, id: CronJobId) {
    await fetchJson(`${this.baseUrl}/api/projects/${projectId}/cron-jobs/${id}`, { method: 'DELETE' })
  }
  async trigger(projectId: ProjectId, id: CronJobId): Promise<void> {
    await fetchJson(`${this.baseUrl}/api/projects/${projectId}/cron-jobs/${id}/trigger`, {
      method: 'POST',
    })
  }
  listRuns(projectId: ProjectId, cronJobId?: CronJobId, limit?: number) {
    const params = new URLSearchParams()
    if (limit) params.set('limit', String(limit))
    const suffix = cronJobId ? `/${cronJobId}/runs` : '/runs'
    const qs = params.toString() ? `?${params}` : ''
    return fetchJson<CronJobRun[]>(`${this.baseUrl}/api/projects/${projectId}/cron-jobs${suffix}${qs}`)
  }
}

export class HttpSettingsService implements ISettingsService {
  constructor(private baseUrl: string) {}

  get() {
    return fetchJson<GlobalSettings>(`${this.baseUrl}/api/settings`)
  }
  update(data: Partial<GlobalSettings>) {
    return fetchJson<GlobalSettings>(`${this.baseUrl}/api/settings`, {
      method: 'PATCH', body: JSON.stringify(data),
    })
  }
  testProvider(slug: string) {
    return fetchJson<{ ok: boolean; error?: string; latencyMs?: number }>(
      `${this.baseUrl}/api/settings/providers/${encodeURIComponent(slug)}/test`,
      { method: 'POST' },
    )
  }
  testEmbedding(apiKey: string, model: string) {
    return fetchJson<{ ok: boolean; error?: string; latencyMs?: number }>(
      `${this.baseUrl}/api/settings/embedding/test`,
      { method: 'POST', body: JSON.stringify({ apiKey, model }) },
    )
  }
}

export class HttpDashboardService implements IDashboardService {
  constructor(private baseUrl: string) {}

  private dashUrl(projectId: ProjectId, path: string, params?: Record<string, string | number | undefined>): string {
    const url = `${this.baseUrl}/api/projects/${projectId}/dashboard/${path}`
    const qs = Object.entries(params ?? {}).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}=${v}`).join('&')
    return qs ? `${url}?${qs}` : url
  }

  getSummary(projectId: ProjectId, timeRange?: TimeRange) {
    return fetchJson<DashboardSummary>(this.dashUrl(projectId, 'summary', { timeRange }))
  }
  getAgentStats(projectId: ProjectId, timeRange?: TimeRange) {
    return fetchJson<DashboardAgentStats[]>(this.dashUrl(projectId, 'agent-stats', { timeRange }))
  }
  getRecentChats(projectId: ProjectId, limit = 20) {
    return fetchJson<DashboardRecentChat[]>(this.dashUrl(projectId, 'recent-chats', { limit }))
  }
  getTokenTrend(projectId: ProjectId, days = 14, timeRange?: TimeRange) {
    return fetchJson<DashboardTokenTrend[]>(this.dashUrl(projectId, 'token-trend', { days, timeRange }))
  }
  getTokenByModel(projectId: ProjectId, timeRange?: TimeRange) {
    return fetchJson<DashboardTokenByModel[]>(this.dashUrl(projectId, 'token-by-model', { timeRange }))
  }
  getTokenByAgent(projectId: ProjectId, timeRange?: TimeRange) {
    return fetchJson<DashboardTokenByAgent[]>(this.dashUrl(projectId, 'token-by-agent', { timeRange }))
  }
  getRuntimeStatus(projectId: ProjectId) {
    return fetchJson<RuntimeStatus>(this.dashUrl(projectId, 'runtime-status'))
  }
}

export class HttpGlobalDashboardService implements IGlobalDashboardService {
  constructor(private baseUrl: string) {}

  private url(path: string, params?: Record<string, string | number | undefined>): string {
    const base = `${this.baseUrl}/api/dashboard/${path}`
    const qs = Object.entries(params ?? {}).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}=${v}`).join('&')
    return qs ? `${base}?${qs}` : base
  }

  getSummary(timeRange?: TimeRange) {
    return fetchJson<DashboardSummary>(this.url('summary', { timeRange }))
  }
  getTokenByModel(timeRange?: TimeRange) {
    return fetchJson<DashboardTokenByModel[]>(this.url('token-by-model', { timeRange }))
  }
  getTokenByAgent(timeRange?: TimeRange) {
    return fetchJson<(DashboardTokenByAgent & { projectId: ProjectId; projectName: string })[]>(this.url('token-by-agent', { timeRange }))
  }
  getTokenByProject(timeRange?: TimeRange) {
    return fetchJson<{ projectId: ProjectId; projectName: string; inputTokens: number; outputTokens: number; callCount: number }[]>(this.url('token-by-project', { timeRange }))
  }
  getTokenTrend(days = 14, timeRange?: TimeRange) {
    return fetchJson<DashboardTokenTrend[]>(this.url('token-trend', { days, timeRange }))
  }
  getRuntimeStatus() {
    return fetchJson<RuntimeStatus>(this.url('runtime-status'))
  }
}

export class HttpPermissionsConfigService implements IPermissionsConfigService {
  constructor(private baseUrl: string) {}

  list(projectId: ProjectId) {
    return fetchJson<PermissionsConfigFile[]>(`${this.baseUrl}/api/projects/${projectId}/permissions-config`)
  }
  getById(projectId: ProjectId, id: PermissionsConfigId) {
    return fetchJson<PermissionsConfigFile | null>(`${this.baseUrl}/api/projects/${projectId}/permissions-config/${id}`)
  }
  create(projectId: ProjectId, data: Pick<PermissionsConfigFile, 'title' | 'mode' | 'config'>) {
    return fetchJson<PermissionsConfigFile>(`${this.baseUrl}/api/projects/${projectId}/permissions-config`, {
      method: 'POST', body: JSON.stringify(data),
    })
  }
  update(projectId: ProjectId, id: PermissionsConfigId, data: Partial<Pick<PermissionsConfigFile, 'title' | 'mode' | 'config'>>) {
    return fetchJson<PermissionsConfigFile>(`${this.baseUrl}/api/projects/${projectId}/permissions-config/${id}`, {
      method: 'PATCH', body: JSON.stringify(data),
    })
  }
  async delete(projectId: ProjectId, id: PermissionsConfigId) {
    await fetchJson(`${this.baseUrl}/api/projects/${projectId}/permissions-config/${id}`, { method: 'DELETE' })
  }
  duplicate(projectId: ProjectId, sourceId: PermissionsConfigId, newTitle: string) {
    return fetchJson<PermissionsConfigFile>(`${this.baseUrl}/api/projects/${projectId}/permissions-config/${sourceId}/duplicate`, {
      method: 'POST', body: JSON.stringify({ title: newTitle }),
    })
  }
}
