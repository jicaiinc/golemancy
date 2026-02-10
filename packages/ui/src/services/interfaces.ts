import type {
  Project, Agent, Conversation, Task, Artifact, MemoryEntry,
  GlobalSettings, ProjectId, AgentId, ConversationId, TaskId, ArtifactId, MemoryId,
  DashboardSummary, DashboardAgentSummary, DashboardTaskSummary, ActivityEntry,
} from '@solocraft/shared'

export interface IProjectService {
  list(): Promise<Project[]>
  getById(id: ProjectId): Promise<Project | null>
  create(data: Pick<Project, 'name' | 'description' | 'icon' | 'workingDirectory'>): Promise<Project>
  update(id: ProjectId, data: Partial<Pick<Project, 'name' | 'description' | 'icon' | 'workingDirectory' | 'config'>>): Promise<Project>
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
  delete(projectId: ProjectId, id: ConversationId): Promise<void>
}

export interface ITaskService {
  list(projectId: ProjectId, agentId?: AgentId): Promise<Task[]>
  getById(projectId: ProjectId, id: TaskId): Promise<Task | null>
  cancel(projectId: ProjectId, id: TaskId): Promise<void>
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

export interface ISettingsService {
  get(): Promise<GlobalSettings>
  update(data: Partial<GlobalSettings>): Promise<GlobalSettings>
}

export interface IDashboardService {
  getSummary(): Promise<DashboardSummary>
  getActiveAgents(): Promise<DashboardAgentSummary[]>
  getRecentTasks(limit?: number): Promise<DashboardTaskSummary[]>
  getActivityFeed(limit?: number): Promise<ActivityEntry[]>
}
