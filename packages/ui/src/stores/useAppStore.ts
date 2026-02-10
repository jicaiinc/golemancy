import { create } from 'zustand'
import type {
  Project, Agent, Conversation, Task, Artifact, MemoryEntry, GlobalSettings,
  ProjectId, AgentId, ConversationId, TaskId, ArtifactId, MemoryId,
} from '@solocraft/shared'
import { getServices } from '../services'

// --- State shape ---
interface ProjectSlice {
  projects: Project[]
  currentProjectId: ProjectId | null
  projectsLoading: boolean
}

interface AgentSlice {
  agents: Agent[]
  agentsLoading: boolean
}

interface ConversationSlice {
  conversations: Conversation[]
  currentConversationId: ConversationId | null
  conversationsLoading: boolean
}

interface TaskSlice {
  tasks: Task[]
  tasksLoading: boolean
}

interface ArtifactSlice {
  artifacts: Artifact[]
  artifactsLoading: boolean
}

interface MemorySlice {
  memories: MemoryEntry[]
  memoriesLoading: boolean
}

interface SettingsSlice {
  settings: GlobalSettings | null
}

interface UISlice {
  sidebarCollapsed: boolean
}

// --- Actions ---
interface ProjectActions {
  loadProjects(): Promise<void>
  selectProject(id: ProjectId): Promise<void>
  clearProject(): void
  createProject(data: Pick<Project, 'name' | 'description' | 'icon'>): Promise<Project>
  updateProject(id: ProjectId, data: Partial<Pick<Project, 'name' | 'description' | 'icon' | 'config'>>): Promise<void>
  deleteProject(id: ProjectId): Promise<void>
}

interface AgentActions {
  loadAgents(projectId: ProjectId): Promise<void>
  createAgent(data: Pick<Agent, 'name' | 'description' | 'systemPrompt' | 'modelConfig'>): Promise<Agent>
  updateAgent(id: AgentId, data: Partial<Agent>): Promise<void>
  deleteAgent(id: AgentId): Promise<void>
}

interface ConversationActions {
  loadConversations(projectId: ProjectId, agentId?: AgentId): Promise<void>
  selectConversation(id: ConversationId | null): void
  createConversation(agentId: AgentId, title: string): Promise<Conversation>
  sendMessage(conversationId: ConversationId, content: string): Promise<void>
  deleteConversation(id: ConversationId): Promise<void>
}

interface TaskActions {
  loadTasks(projectId: ProjectId): Promise<void>
  cancelTask(taskId: TaskId): Promise<void>
}

interface ArtifactActions {
  loadArtifacts(projectId: ProjectId): Promise<void>
  deleteArtifact(id: ArtifactId): Promise<void>
}

interface MemoryActions {
  loadMemories(projectId: ProjectId): Promise<void>
  createMemory(data: Pick<MemoryEntry, 'content' | 'source' | 'tags'>): Promise<MemoryEntry>
  updateMemory(id: MemoryId, data: Partial<Pick<MemoryEntry, 'content' | 'tags'>>): Promise<void>
  deleteMemory(id: MemoryId): Promise<void>
}

interface SettingsActions {
  loadSettings(): Promise<void>
  updateSettings(data: Partial<GlobalSettings>): Promise<void>
}

interface UIActions {
  toggleSidebar(): void
}

// --- Combined ---
export type AppState =
  & ProjectSlice & AgentSlice & ConversationSlice & TaskSlice & ArtifactSlice & MemorySlice & SettingsSlice & UISlice
  & ProjectActions & AgentActions & ConversationActions & TaskActions & ArtifactActions & MemoryActions & SettingsActions & UIActions

// AbortController for project switching
let projectAbort: AbortController | null = null

export const useAppStore = create<AppState>()((set, get) => ({
  // --- Project state ---
  projects: [],
  currentProjectId: null,
  projectsLoading: false,

  async loadProjects() {
    set({ projectsLoading: true })
    const projects = await getServices().projects.list()
    set({ projects, projectsLoading: false })
  },

  async selectProject(id: ProjectId) {
    // Cancel any in-flight requests for previous project
    projectAbort?.abort()
    projectAbort = new AbortController()

    const prevId = get().currentProjectId
    if (prevId === id) return

    // Clear → set new → populate
    set({
      currentProjectId: id,
      agents: [],
      conversations: [],
      tasks: [],
      artifacts: [],
      memories: [],
      agentsLoading: true,
      conversationsLoading: true,
      tasksLoading: true,
      artifactsLoading: true,
      memoriesLoading: true,
    })

    // Load project data in parallel
    const svc = getServices()
    const [agents, conversations, tasks, artifacts, memories] = await Promise.all([
      svc.agents.list(id),
      svc.conversations.list(id),
      svc.tasks.list(id),
      svc.artifacts.list(id),
      svc.memory.list(id),
    ])

    // Guard: only apply if still the active project
    if (get().currentProjectId !== id) return

    set({
      agents,
      conversations,
      tasks,
      artifacts,
      memories,
      agentsLoading: false,
      conversationsLoading: false,
      tasksLoading: false,
      artifactsLoading: false,
      memoriesLoading: false,
    })
  },

  clearProject() {
    projectAbort?.abort()
    set({
      currentProjectId: null,
      agents: [],
      conversations: [],
      tasks: [],
      artifacts: [],
      memories: [],
      currentConversationId: null,
    })
  },

  async createProject(data) {
    const project = await getServices().projects.create(data)
    set(s => ({ projects: [...s.projects, project] }))
    return project
  },

  async updateProject(id, data) {
    const updated = await getServices().projects.update(id, data)
    set(s => ({ projects: s.projects.map(p => p.id === id ? updated : p) }))
  },

  async deleteProject(id) {
    await getServices().projects.delete(id)
    set(s => ({
      projects: s.projects.filter(p => p.id !== id),
      ...(s.currentProjectId === id ? { currentProjectId: null, agents: [], conversations: [], tasks: [], artifacts: [], memories: [] } : {}),
    }))
  },

  // --- Agent state ---
  agents: [],
  agentsLoading: false,

  async loadAgents(projectId: ProjectId) {
    set({ agentsLoading: true })
    const agents = await getServices().agents.list(projectId)
    set({ agents, agentsLoading: false })
  },

  async createAgent(data) {
    const projectId = get().currentProjectId
    if (!projectId) throw new Error('No project selected')
    const agent = await getServices().agents.create(projectId, data)
    set(s => ({ agents: [...s.agents, agent] }))
    return agent
  },

  async updateAgent(id, data) {
    const projectId = get().currentProjectId
    if (!projectId) throw new Error('No project selected')
    const updated = await getServices().agents.update(projectId, id, data)
    set(s => ({ agents: s.agents.map(a => a.id === id ? updated : a) }))
  },

  async deleteAgent(id) {
    const projectId = get().currentProjectId
    if (!projectId) throw new Error('No project selected')
    await getServices().agents.delete(projectId, id)
    set(s => ({ agents: s.agents.filter(a => a.id !== id) }))
  },

  // --- Conversation state ---
  conversations: [],
  currentConversationId: null,
  conversationsLoading: false,

  async loadConversations(projectId: ProjectId, agentId?: AgentId) {
    set({ conversationsLoading: true })
    const conversations = await getServices().conversations.list(projectId, agentId)
    set({ conversations, conversationsLoading: false })
  },

  selectConversation(id: ConversationId | null) {
    set({ currentConversationId: id })
  },

  async createConversation(agentId: AgentId, title: string) {
    const projectId = get().currentProjectId
    if (!projectId) throw new Error('No project selected')
    const conv = await getServices().conversations.create(projectId, agentId, title)
    set(s => ({ conversations: [...s.conversations, conv], currentConversationId: conv.id }))
    return conv
  },

  async sendMessage(conversationId: ConversationId, content: string) {
    const projectId = get().currentProjectId
    if (!projectId) throw new Error('No project selected')
    await getServices().conversations.sendMessage(projectId, conversationId, content)
    // Reload the conversation to pick up new messages
    const updated = await getServices().conversations.getById(projectId, conversationId)
    if (updated) {
      set(s => ({ conversations: s.conversations.map(c => c.id === conversationId ? updated : c) }))
    }
  },

  async deleteConversation(id: ConversationId) {
    const projectId = get().currentProjectId
    if (!projectId) throw new Error('No project selected')
    await getServices().conversations.delete(projectId, id)
    set(s => ({
      conversations: s.conversations.filter(c => c.id !== id),
      ...(s.currentConversationId === id ? { currentConversationId: null } : {}),
    }))
  },

  // --- Task state ---
  tasks: [],
  tasksLoading: false,

  async loadTasks(projectId: ProjectId) {
    set({ tasksLoading: true })
    const tasks = await getServices().tasks.list(projectId)
    set({ tasks, tasksLoading: false })
  },

  async cancelTask(taskId: TaskId) {
    const projectId = get().currentProjectId
    if (!projectId) throw new Error('No project selected')
    await getServices().tasks.cancel(projectId, taskId)
    set(s => ({
      tasks: s.tasks.map(t => t.id === taskId ? { ...t, status: 'cancelled' as const, updatedAt: new Date().toISOString() } : t),
    }))
  },

  // --- Artifact state ---
  artifacts: [],
  artifactsLoading: false,

  async loadArtifacts(projectId: ProjectId) {
    set({ artifactsLoading: true })
    const artifacts = await getServices().artifacts.list(projectId)
    set({ artifacts, artifactsLoading: false })
  },

  async deleteArtifact(id: ArtifactId) {
    const projectId = get().currentProjectId
    if (!projectId) throw new Error('No project selected')
    await getServices().artifacts.delete(projectId, id)
    set(s => ({ artifacts: s.artifacts.filter(a => a.id !== id) }))
  },

  // --- Memory state ---
  memories: [],
  memoriesLoading: false,

  async loadMemories(projectId: ProjectId) {
    set({ memoriesLoading: true })
    const memories = await getServices().memory.list(projectId)
    set({ memories, memoriesLoading: false })
  },

  async createMemory(data) {
    const projectId = get().currentProjectId
    if (!projectId) throw new Error('No project selected')
    const entry = await getServices().memory.create(projectId, data)
    set(s => ({ memories: [...s.memories, entry] }))
    return entry
  },

  async updateMemory(id, data) {
    const projectId = get().currentProjectId
    if (!projectId) throw new Error('No project selected')
    const updated = await getServices().memory.update(projectId, id, data)
    set(s => ({ memories: s.memories.map(m => m.id === id ? updated : m) }))
  },

  async deleteMemory(id) {
    const projectId = get().currentProjectId
    if (!projectId) throw new Error('No project selected')
    await getServices().memory.delete(projectId, id)
    set(s => ({ memories: s.memories.filter(m => m.id !== id) }))
  },

  // --- Settings state ---
  settings: null,

  async loadSettings() {
    const settings = await getServices().settings.get()
    set({ settings })
  },

  async updateSettings(data) {
    const settings = await getServices().settings.update(data)
    set({ settings })
  },

  // --- UI state ---
  sidebarCollapsed: false,

  toggleSidebar() {
    set(s => ({ sidebarCollapsed: !s.sidebarCollapsed }))
  },
}))
