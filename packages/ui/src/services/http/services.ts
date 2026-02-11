import type {
  Project, Agent, Conversation, Task, Artifact, MemoryEntry, GlobalSettings, CronJob,
  ProjectId, AgentId, ConversationId, TaskId, ArtifactId, MemoryId, MessageId, CronJobId,
  DashboardSummary, DashboardAgentSummary, DashboardTaskSummary, ActivityEntry,
  Message, PaginationParams, PaginatedResult, TaskLogEntry,
  IProjectService, IAgentService, IConversationService,
  ITaskService, IArtifactService, IMemoryService, ISettingsService, ICronJobService, IDashboardService,
} from '@solocraft/shared'
import { fetchJson } from './base'

export class HttpProjectService implements IProjectService {
  constructor(private baseUrl: string) {}

  list() {
    return fetchJson<Project[]>(`${this.baseUrl}/api/projects`)
  }
  getById(id: ProjectId) {
    return fetchJson<Project | null>(`${this.baseUrl}/api/projects/${id}`)
  }
  create(data: Pick<Project, 'name' | 'description' | 'icon' | 'workingDirectory'>) {
    return fetchJson<Project>(`${this.baseUrl}/api/projects`, {
      method: 'POST', body: JSON.stringify(data),
    })
  }
  update(id: ProjectId, data: Partial<Pick<Project, 'name' | 'description' | 'icon' | 'workingDirectory' | 'config' | 'mainAgentId'>>) {
    return fetchJson<Project>(`${this.baseUrl}/api/projects/${id}`, {
      method: 'PATCH', body: JSON.stringify(data),
    })
  }
  async delete(id: ProjectId) {
    await fetchJson(`${this.baseUrl}/api/projects/${id}`, { method: 'DELETE' })
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
  async sendMessage(_projectId: ProjectId, _conversationId: ConversationId, _content: string) {
    // Chat streaming uses useChat() + /api/chat, not this method
    throw new Error('Use useChat() for real-time chat')
  }
  async saveMessage(projectId: ProjectId, conversationId: ConversationId, data: { id: MessageId; role: string; content: string }) {
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
      `${this.baseUrl}/api/projects/${projectId}/conversations/search?q=${encodeURIComponent(query)}&page=${params.page}&pageSize=${params.pageSize}`,
    )
  }
  async delete(projectId: ProjectId, id: ConversationId) {
    await fetchJson(`${this.baseUrl}/api/projects/${projectId}/conversations/${id}`, { method: 'DELETE' })
  }
}

export class HttpTaskService implements ITaskService {
  constructor(private baseUrl: string) {}

  list(projectId: ProjectId, agentId?: AgentId) {
    const params = agentId ? `?agentId=${agentId}` : ''
    return fetchJson<Task[]>(`${this.baseUrl}/api/projects/${projectId}/tasks${params}`)
  }
  getById(projectId: ProjectId, id: TaskId) {
    return fetchJson<Task | null>(`${this.baseUrl}/api/projects/${projectId}/tasks/${id}`)
  }
  async cancel(projectId: ProjectId, id: TaskId) {
    await fetchJson(`${this.baseUrl}/api/projects/${projectId}/tasks/${id}/cancel`, { method: 'POST' })
  }
  getLogs(taskId: TaskId, cursor?: number, limit?: number) {
    const params = new URLSearchParams()
    if (cursor !== undefined) params.set('cursor', String(cursor))
    if (limit !== undefined) params.set('limit', String(limit))
    const qs = params.toString()
    return fetchJson<TaskLogEntry[]>(`${this.baseUrl}/api/tasks/${taskId}/logs${qs ? `?${qs}` : ''}`)
  }
}

export class HttpArtifactService implements IArtifactService {
  constructor(private baseUrl: string) {}

  list(projectId: ProjectId, agentId?: AgentId) {
    const params = agentId ? `?agentId=${agentId}` : ''
    return fetchJson<Artifact[]>(`${this.baseUrl}/api/projects/${projectId}/artifacts${params}`)
  }
  getById(projectId: ProjectId, id: ArtifactId) {
    return fetchJson<Artifact | null>(`${this.baseUrl}/api/projects/${projectId}/artifacts/${id}`)
  }
  async delete(projectId: ProjectId, id: ArtifactId) {
    await fetchJson(`${this.baseUrl}/api/projects/${projectId}/artifacts/${id}`, { method: 'DELETE' })
  }
}

export class HttpMemoryService implements IMemoryService {
  constructor(private baseUrl: string) {}

  list(projectId: ProjectId) {
    return fetchJson<MemoryEntry[]>(`${this.baseUrl}/api/projects/${projectId}/memories`)
  }
  create(projectId: ProjectId, data: Pick<MemoryEntry, 'content' | 'source' | 'tags'>) {
    return fetchJson<MemoryEntry>(`${this.baseUrl}/api/projects/${projectId}/memories`, {
      method: 'POST', body: JSON.stringify(data),
    })
  }
  update(projectId: ProjectId, id: MemoryId, data: Partial<Pick<MemoryEntry, 'content' | 'tags'>>) {
    return fetchJson<MemoryEntry>(`${this.baseUrl}/api/projects/${projectId}/memories/${id}`, {
      method: 'PATCH', body: JSON.stringify(data),
    })
  }
  async delete(projectId: ProjectId, id: MemoryId) {
    await fetchJson(`${this.baseUrl}/api/projects/${projectId}/memories/${id}`, { method: 'DELETE' })
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
  create(projectId: ProjectId, data: Pick<CronJob, 'agentId' | 'name' | 'description' | 'cronExpression' | 'enabled'>) {
    return fetchJson<CronJob>(`${this.baseUrl}/api/projects/${projectId}/cron-jobs`, {
      method: 'POST', body: JSON.stringify(data),
    })
  }
  update(projectId: ProjectId, id: CronJobId, data: Partial<Pick<CronJob, 'agentId' | 'name' | 'description' | 'cronExpression' | 'enabled'>>) {
    return fetchJson<CronJob>(`${this.baseUrl}/api/projects/${projectId}/cron-jobs/${id}`, {
      method: 'PATCH', body: JSON.stringify(data),
    })
  }
  async delete(projectId: ProjectId, id: CronJobId) {
    await fetchJson(`${this.baseUrl}/api/projects/${projectId}/cron-jobs/${id}`, { method: 'DELETE' })
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
}

export class HttpDashboardService implements IDashboardService {
  constructor(private baseUrl: string) {}

  getSummary() {
    return fetchJson<DashboardSummary>(`${this.baseUrl}/api/dashboard/summary`)
  }
  getActiveAgents() {
    return fetchJson<DashboardAgentSummary[]>(`${this.baseUrl}/api/dashboard/active-agents`)
  }
  getRecentTasks(limit = 10) {
    return fetchJson<DashboardTaskSummary[]>(`${this.baseUrl}/api/dashboard/recent-tasks?limit=${limit}`)
  }
  getActivityFeed(limit = 20) {
    return fetchJson<ActivityEntry[]>(`${this.baseUrl}/api/dashboard/activity?limit=${limit}`)
  }
}
