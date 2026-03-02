import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  Project, Agent, Conversation, ConversationTask, GlobalSettings, CronJob,CronJobRun, Skill,
  MCPServerConfig, MCPServerCreateData, MCPServerUpdateData,
  KBCollection, KBDocument, KBSearchResult, KBCollectionTier, KBSourceType,
  DashboardSummary, DashboardAgentStats, DashboardRecentChat, DashboardTokenTrend,
  DashboardTokenByModel, DashboardTokenByAgent, RuntimeStatus, TimeRange,
  ThemeMode, WorkspaceEntry, FilePreviewData,
  TranscriptionRecord, SpeechStorageUsage,
  ProjectId, AgentId, ConversationId, KBCollectionId, KBDocumentId, SkillId, CronJobId, TranscriptionId,
  SkillCreateData, SkillUpdateData,
  AgentStatus,
} from '@golemancy/shared'
import { DEFAULT_AGENT_SYSTEM_PROMPT } from '@golemancy/shared'
import i18next from 'i18next'
import { getServices } from '../services'
import { destroyChat, destroyAllChats, releaseIdleChats } from '../lib/chat-instances'

// --- Theme helper ---
function applyThemeToDOM(mode: ThemeMode): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.classList.remove('light', 'dark')
  if (mode === 'light' || mode === 'dark') {
    root.classList.add(mode)
  }
  // 'system' → no class, CSS @media handles it
}

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
  conversationTasks: ConversationTask[]
  tasksLoading: boolean
}

interface WorkspaceSlice {
  /** Current directory listing (flat — one level at a time) */
  workspaceEntries: WorkspaceEntry[]
  /** Current directory path (relative to workspace root) */
  workspaceCurrentPath: string
  /** Currently previewed file data */
  workspacePreview: FilePreviewData | null
  workspaceLoading: boolean
  workspacePreviewLoading: boolean
}

interface KnowledgeBaseSlice {
  kbCollections: KBCollection[]
  kbDocuments: KBDocument[]
  kbCollectionsLoading: boolean
  kbDocumentsLoading: boolean
}

interface SkillSlice {
  skills: Skill[]
  skillsLoading: boolean
}

interface MCPSlice {
  mcpServers: MCPServerConfig[]
  mcpServersLoading: boolean
}

interface CronJobSlice {
  cronJobs: CronJob[]
  cronJobsLoading: boolean
  cronJobRuns: CronJobRun[]
  cronJobRunsLoading: boolean
}

interface SettingsSlice {
  settings: GlobalSettings | null
}

interface UISlice {
  sidebarCollapsed: boolean
  chatHistoryExpanded: boolean
  themeMode: ThemeMode
  updateInfo: { version: string; downloadUrl: string } | null
  skippedVersion: string | null
  updateNotificationsEnabled: boolean
}

interface DashboardSlice {
  dashboardSummary: DashboardSummary | null
  dashboardAgentStats: DashboardAgentStats[]
  dashboardRecentChats: DashboardRecentChat[]
  dashboardTokenTrend: DashboardTokenTrend[]
  dashboardTokenByModel: DashboardTokenByModel[]
  dashboardTokenByAgent: DashboardTokenByAgent[]
  dashboardRuntimeStatus: RuntimeStatus | null
  dashboardTimeRange: TimeRange
  dashboardStale: boolean
  dashboardLoading: boolean
}

interface TopologySlice {
  topologyLayout: Record<string, { x: number; y: number }>
  topologyLayoutLoading: boolean
}

interface SpeechSlice {
  speechHistory: TranscriptionRecord[]
  speechHistoryLoading: boolean
  speechStorageUsage: SpeechStorageUsage | null
}

// --- Actions ---
interface ProjectActions {
  loadProjects(): Promise<void>
  selectProject(id: ProjectId): Promise<void>
  clearProject(): void
  createProject(data: Pick<Project, 'name' | 'description' | 'icon'>): Promise<Project>
  updateProject(id: ProjectId, data: Partial<Pick<Project, 'name' | 'description' | 'icon' | 'config' | 'mainAgentId'>>): Promise<void>
  deleteProject(id: ProjectId): Promise<void>
}

interface AgentActions {
  loadAgents(projectId: ProjectId): Promise<void>
  createAgent(data: Pick<Agent, 'name' | 'description' | 'systemPrompt' | 'modelConfig'>): Promise<Agent>
  updateAgent(id: AgentId, data: Partial<Agent>): Promise<void>
  deleteAgent(id: AgentId): Promise<void>
  /** Update agent status from WebSocket event (no server call) */
  updateAgentStatus(agentId: AgentId, status: AgentStatus): void
}

interface ConversationActions {
  loadConversations(projectId: ProjectId, agentId?: AgentId): Promise<void>
  selectConversation(id: ConversationId | null): Promise<void>
  createConversation(agentId: AgentId, title: string): Promise<Conversation>
  updateConversationTitle(id: ConversationId, title: string): Promise<void>
  deleteConversation(id: ConversationId): Promise<void>
}

interface TaskActions {
  loadConversationTasks(projectId: ProjectId): Promise<void>
  refreshConversationTasks(): Promise<void>
}

interface WorkspaceActions {
  /** Load entries for a directory path */
  loadWorkspaceDir(projectId: ProjectId, dirPath?: string): Promise<void>
  /** Navigate into a directory (updates currentPath and loads) */
  navigateWorkspace(dirPath: string): Promise<void>
  /** Load file preview */
  loadWorkspaceFile(filePath: string): Promise<void>
  /** Delete a file, then refresh the current directory */
  deleteWorkspaceFile(filePath: string): Promise<void>
}

interface KnowledgeBaseActions {
  loadKBCollections(projectId: ProjectId): Promise<void>
  createKBCollection(data: { name: string; description?: string; tier: KBCollectionTier }): Promise<KBCollection>
  updateKBCollection(id: KBCollectionId, data: Partial<{ name: string; description: string; tier: KBCollectionTier }>): Promise<void>
  deleteKBCollection(id: KBCollectionId): Promise<void>
  loadKBDocuments(collectionId: KBCollectionId): Promise<void>
  ingestKBDocument(collectionId: KBCollectionId, data: { title?: string; content: string; sourceType: KBSourceType; sourceName?: string }): Promise<KBDocument>
  uploadKBDocument(collectionId: KBCollectionId, file: File, metadata?: { title?: string }): Promise<KBDocument>
  deleteKBDocument(documentId: KBDocumentId): Promise<void>
  searchKB(query: string, options?: { collectionId?: KBCollectionId; limit?: number }): Promise<KBSearchResult[]>
  hasKBVectorData(): Promise<boolean>
}

interface SkillActions {
  loadSkills(projectId: ProjectId): Promise<void>
  createSkill(data: SkillCreateData): Promise<Skill>
  updateSkill(id: SkillId, data: SkillUpdateData): Promise<void>
  deleteSkill(id: SkillId): Promise<void>
  importSkillsFromZip(file: File): Promise<{ imported: Array<{ name: string; id: SkillId }>; count: number }>
}

interface MCPActions {
  loadMCPServers(projectId: ProjectId): Promise<void>
  createMCPServer(data: MCPServerCreateData): Promise<MCPServerConfig>
  updateMCPServer(name: string, data: MCPServerUpdateData): Promise<void>
  deleteMCPServer(name: string): Promise<void>
  testMCPServer(name: string): Promise<{ ok: boolean; toolCount: number; error?: string }>
}

interface CronJobActions {
  loadCronJobs(projectId: ProjectId): Promise<void>
  createCronJob(data: Pick<CronJob, 'agentId' | 'name' | 'cronExpression' | 'enabled' | 'instruction' | 'scheduleType' | 'scheduledAt'>): Promise<CronJob>
  updateCronJob(id: CronJobId, data: Partial<Pick<CronJob, 'agentId' | 'name' | 'cronExpression' | 'enabled' | 'instruction' | 'scheduleType' | 'scheduledAt'>>): Promise<void>
  deleteCronJob(id: CronJobId): Promise<void>
  triggerCronJob(id: CronJobId): Promise<void>
  loadCronJobRuns(cronJobId: CronJobId): Promise<void>
}

interface SettingsActions {
  loadSettings(): Promise<void>
  updateSettings(data: Partial<GlobalSettings>): Promise<void>
}

interface UIActions {
  toggleSidebar(): void
  toggleChatHistory(): void
  setTheme(mode: ThemeMode): void
  setUpdateInfo(info: { version: string; downloadUrl: string } | null): void
  skipVersion(version: string): void
  setUpdateNotifications(enabled: boolean): void
}

interface DashboardActions {
  loadDashboard(projectId: ProjectId, timeRange?: TimeRange): Promise<void>
  setDashboardTimeRange(range: TimeRange): void
  loadRuntimeStatus(projectId: ProjectId): Promise<void>
}

interface TopologyActions {
  loadTopologyLayout(projectId: ProjectId): Promise<void>
  saveTopologyLayout(projectId: ProjectId, layout: Record<string, { x: number; y: number }>): Promise<void>
}

interface SpeechActions {
  transcribeAudio(
    audio: Blob,
    metadata: { audioDurationMs: number; projectId?: ProjectId; conversationId?: ConversationId },
  ): Promise<TranscriptionRecord>
  loadSpeechHistory(params?: { limit?: number; offset?: number }): Promise<void>
  retrySpeechRecord(id: TranscriptionId): Promise<TranscriptionRecord>
  deleteSpeechRecord(id: TranscriptionId): Promise<void>
  clearSpeechHistory(): Promise<{ deletedCount: number; freedBytes: number }>
  loadSpeechStorageUsage(): Promise<void>
}

// --- Combined ---
export type AppState =
  & ProjectSlice & AgentSlice & ConversationSlice & TaskSlice & WorkspaceSlice & KnowledgeBaseSlice & SkillSlice & MCPSlice & CronJobSlice & SettingsSlice & UISlice & DashboardSlice & TopologySlice & SpeechSlice
  & ProjectActions & AgentActions & ConversationActions & TaskActions & WorkspaceActions & KnowledgeBaseActions & SkillActions & MCPActions & CronJobActions & SettingsActions & UIActions & DashboardActions & TopologyActions & SpeechActions

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // --- Project state ---
      projects: [],
      currentProjectId: null,
      projectsLoading: true,

      async loadProjects() {
        set({ projectsLoading: true })
        const projects = await getServices().projects.list()
        set({ projects, projectsLoading: false })
      },

      async selectProject(id: ProjectId) {
        const prevId = get().currentProjectId
        if (prevId === id) return

        // Release idle Chat instances; keep streaming ones alive so
        // server-side execution completes and saves messages to DB.
        releaseIdleChats()

        // Clear → set new → populate
        set({
          currentProjectId: id,
          agents: [],
          conversations: [],
          conversationTasks: [],
          workspaceEntries: [],
          kbCollections: [],
          kbDocuments: [],
          skills: [],
          mcpServers: [],
          cronJobs: [],
          cronJobRuns: [],
          topologyLayout: {},
          topologyLayoutLoading: false,
          agentsLoading: true,
          conversationsLoading: true,
          tasksLoading: true,
          workspaceLoading: false,
          kbCollectionsLoading: true,
          kbDocumentsLoading: false,
          skillsLoading: true,
          mcpServersLoading: true,
          cronJobsLoading: true,
          cronJobRunsLoading: false,
        })

        // Load project data in parallel (individual failures resolve to empty arrays)
        // Workspace is lazy-loaded on page visit, not on project select
        const svc = getServices()
        const safe = <T,>(p: Promise<T[]>): Promise<T[]> => p.catch(() => [] as T[])
        const [agents, conversations, conversationTasks, kbCollections, skills, mcpServers, cronJobs] = await Promise.all([
          safe(svc.agents.list(id)),
          safe(svc.conversations.list(id)),
          safe(svc.tasks.list(id)),
          safe(svc.knowledgeBase.listCollections(id)),
          safe(svc.skills.list(id)),
          safe(svc.mcp.list(id)),
          safe(svc.cronJobs.list(id)),
        ])

        // Guard: only apply if still the active project
        if (get().currentProjectId !== id) return

        set({
          agents,
          conversations,
          conversationTasks,
          kbCollections,
          skills,
          mcpServers,
          cronJobs,
          agentsLoading: false,
          conversationsLoading: false,
          tasksLoading: false,
          kbCollectionsLoading: false,
          skillsLoading: false,
          mcpServersLoading: false,
          cronJobsLoading: false,
        })
      },

      clearProject() {
        destroyAllChats()
        set({
          currentProjectId: null,
          agents: [],
          conversations: [],
          conversationTasks: [],
          workspaceEntries: [],
          workspaceCurrentPath: '',
          workspacePreview: null,
          workspaceLoading: false,
          workspacePreviewLoading: false,
          kbCollections: [],
          kbDocuments: [],
          skills: [],
          mcpServers: [],
          cronJobs: [],
          cronJobRuns: [],
          topologyLayout: {},
          skillsLoading: false,
          mcpServersLoading: false,
          cronJobsLoading: false,
          cronJobRunsLoading: false,
          currentConversationId: null,
        })
      },

      async createProject(data) {
        const svc = getServices()
        const project = await svc.projects.create(data)

        // Resolve default model: settings.defaultModel → first test-verified provider → empty
        const settings = get().settings
        let modelConfig = settings?.defaultModel
        if (!modelConfig) {
          const entry = Object.entries(settings?.providers ?? {}).find(
            ([, e]) => e.testStatus === 'ok',
          )
          if (entry) {
            modelConfig = { provider: entry[0], model: entry[1].models[0] ?? '' }
          }
        }

        // Auto-create default Main Agent
        const agent = await svc.agents.create(project.id, {
          name: 'Main Agent',
          description: 'Default AI assistant for this project',
          systemPrompt: DEFAULT_AGENT_SYSTEM_PROMPT,
          modelConfig: modelConfig ?? { provider: '', model: '' },
        })

        // Set as Main Agent
        const updated = await svc.projects.update(project.id, { mainAgentId: agent.id })

        set(s => ({ projects: [...s.projects, updated] }))
        return updated
      },

      async updateProject(id, data) {
        const updated = await getServices().projects.update(id, data)
        set(s => ({ projects: s.projects.map(p => p.id === id ? updated : p) }))
      },

      async deleteProject(id) {
        await getServices().projects.delete(id)
        set(s => ({
          projects: s.projects.filter(p => p.id !== id),
          ...(s.currentProjectId === id ? { currentProjectId: null, agents: [], conversations: [], conversationTasks: [], workspaceEntries: [], kbCollections: [], kbDocuments: [], skills: [], mcpServers: [], cronJobs: [], cronJobRuns: [] } : {}),
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
        // If the deleted agent was the project's mainAgentId, clear it
        const project = get().projects.find(p => p.id === projectId)
        if (project?.mainAgentId === id) {
          await get().updateProject(projectId, { mainAgentId: undefined })
        }
      },

      updateAgentStatus(agentId: AgentId, status: AgentStatus) {
        set(s => ({
          agents: s.agents.map(a =>
            a.id === agentId ? { ...a, status } : a,
          ),
        }))
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

      async selectConversation(id: ConversationId | null) {
        if (!id) {
          set({ currentConversationId: null })
          return
        }

        const projectId = get().currentProjectId
        if (!projectId) {
          set({ currentConversationId: id })
          return
        }

        // Load full conversation (with messages) BEFORE setting currentConversationId.
        // This ensures ChatWindow mounts with messages already available,
        // since useChat only reads `messages` on initialization.
        const full = await getServices().conversations.getById(projectId, id)
        if (full) {
          set(s => {
            const exists = s.conversations.some(c => c.id === id)
            return {
              conversations: exists
                ? s.conversations.map(c => c.id === id ? full : c)
                : [...s.conversations, full],
              currentConversationId: id,
            }
          })
          console.debug('[store] selectConversation loaded', id, 'messages:', full.messages.length)
        } else {
          set({ currentConversationId: id })
        }
      },

      async createConversation(agentId: AgentId, title: string) {
        const projectId = get().currentProjectId
        if (!projectId) throw new Error('No project selected')
        const conv = await getServices().conversations.create(projectId, agentId, title)
        set(s => ({ conversations: [...s.conversations, conv], currentConversationId: conv.id }))
        return conv
      },

      async updateConversationTitle(id: ConversationId, title: string) {
        const projectId = get().currentProjectId
        if (!projectId) throw new Error('No project selected')
        const updated = await getServices().conversations.update(projectId, id, { title })
        set(s => ({ conversations: s.conversations.map(c => c.id === id ? { ...c, title: updated.title, updatedAt: updated.updatedAt } : c) }))
      },

      async deleteConversation(id: ConversationId) {
        const projectId = get().currentProjectId
        if (!projectId) throw new Error('No project selected')
        await getServices().conversations.delete(projectId, id)
        destroyChat(id)
        set(s => ({
          conversations: s.conversations.filter(c => c.id !== id),
          ...(s.currentConversationId === id ? { currentConversationId: null } : {}),
        }))
      },

      // --- Task state ---
      conversationTasks: [],
      tasksLoading: false,

      async loadConversationTasks(projectId: ProjectId) {
        set({ tasksLoading: true })
        const tasks = await getServices().tasks.list(projectId)
        set({ conversationTasks: tasks, tasksLoading: false })
      },

      async refreshConversationTasks() {
        const projectId = get().currentProjectId
        if (!projectId) return
        const tasks = await getServices().tasks.list(projectId)
        set({ conversationTasks: tasks })
      },

      // --- Workspace state ---
      workspaceEntries: [],
      workspaceCurrentPath: '',
      workspacePreview: null,
      workspaceLoading: false,
      workspacePreviewLoading: false,

      async loadWorkspaceDir(projectId: ProjectId, dirPath = '') {
        set({ workspaceLoading: true, workspaceCurrentPath: dirPath })
        const entries = await getServices().workspace.listDir(projectId, dirPath)
        set({ workspaceEntries: entries, workspaceLoading: false })
      },

      async navigateWorkspace(dirPath: string) {
        const projectId = get().currentProjectId
        if (!projectId) return
        set({ workspacePreview: null })
        await get().loadWorkspaceDir(projectId, dirPath)
      },

      async loadWorkspaceFile(filePath: string) {
        const projectId = get().currentProjectId
        if (!projectId) return
        set({ workspacePreviewLoading: true })
        const preview = await getServices().workspace.readFile(projectId, filePath)
        set({ workspacePreview: preview, workspacePreviewLoading: false })
      },

      async deleteWorkspaceFile(filePath: string) {
        const projectId = get().currentProjectId
        if (!projectId) throw new Error('No project selected')
        await getServices().workspace.deleteFile(projectId, filePath)
        // Refresh current directory
        await get().loadWorkspaceDir(projectId, get().workspaceCurrentPath)
        // Clear preview if deleted file was being previewed
        if (get().workspacePreview?.path === filePath) {
          set({ workspacePreview: null })
        }
      },

      // --- Knowledge Base state ---
      kbCollections: [],
      kbDocuments: [],
      kbCollectionsLoading: false,
      kbDocumentsLoading: false,

      async loadKBCollections(projectId: ProjectId) {
        set({ kbCollectionsLoading: true })
        const kbCollections = await getServices().knowledgeBase.listCollections(projectId)
        set({ kbCollections, kbCollectionsLoading: false })
      },

      async createKBCollection(data) {
        const projectId = get().currentProjectId
        if (!projectId) throw new Error('No project selected')
        const collection = await getServices().knowledgeBase.createCollection(projectId, data)
        set(s => ({ kbCollections: [...s.kbCollections, collection] }))
        return collection
      },

      async updateKBCollection(id, data) {
        const projectId = get().currentProjectId
        if (!projectId) throw new Error('No project selected')
        const updated = await getServices().knowledgeBase.updateCollection(projectId, id, data)
        set(s => ({ kbCollections: s.kbCollections.map(c => c.id === id ? updated : c) }))
      },

      async deleteKBCollection(id) {
        const projectId = get().currentProjectId
        if (!projectId) throw new Error('No project selected')
        await getServices().knowledgeBase.deleteCollection(projectId, id)
        set(s => ({
          kbCollections: s.kbCollections.filter(c => c.id !== id),
          kbDocuments: s.kbDocuments.filter(d => d.collectionId !== id),
        }))
      },

      async loadKBDocuments(collectionId) {
        const projectId = get().currentProjectId
        if (!projectId) throw new Error('No project selected')
        set({ kbDocumentsLoading: true })
        const docs = await getServices().knowledgeBase.listDocuments(projectId, collectionId)
        set(s => ({
          kbDocuments: [...s.kbDocuments.filter(d => d.collectionId !== collectionId), ...docs],
          kbDocumentsLoading: false,
        }))
      },

      async ingestKBDocument(collectionId, data) {
        const projectId = get().currentProjectId
        if (!projectId) throw new Error('No project selected')
        const doc = await getServices().knowledgeBase.ingestDocument(projectId, collectionId, data)
        set(s => ({
          kbDocuments: [...s.kbDocuments, doc],
          kbCollections: s.kbCollections.map(c => c.id === collectionId ? { ...c, documentCount: c.documentCount + 1, totalChars: c.totalChars + doc.charCount } : c),
        }))
        return doc
      },

      async uploadKBDocument(collectionId, file, metadata) {
        const projectId = get().currentProjectId
        if (!projectId) throw new Error('No project selected')
        const doc = await getServices().knowledgeBase.uploadDocument(projectId, collectionId, file, metadata)
        set(s => ({
          kbDocuments: [...s.kbDocuments, doc],
          kbCollections: s.kbCollections.map(c => c.id === collectionId ? { ...c, documentCount: c.documentCount + 1, totalChars: c.totalChars + doc.charCount } : c),
        }))
        return doc
      },

      async deleteKBDocument(documentId) {
        const projectId = get().currentProjectId
        if (!projectId) throw new Error('No project selected')
        const doc = get().kbDocuments.find(d => d.id === documentId)
        await getServices().knowledgeBase.deleteDocument(projectId, documentId)
        set(s => ({
          kbDocuments: s.kbDocuments.filter(d => d.id !== documentId),
          kbCollections: doc ? s.kbCollections.map(c => c.id === doc.collectionId ? { ...c, documentCount: c.documentCount - 1, totalChars: c.totalChars - doc.charCount } : c) : s.kbCollections,
        }))
      },

      async searchKB(query, options) {
        const projectId = get().currentProjectId
        if (!projectId) throw new Error('No project selected')
        return getServices().knowledgeBase.search(projectId, query, options)
      },

      async hasKBVectorData() {
        const projectId = get().currentProjectId
        if (!projectId) throw new Error('No project selected')
        return getServices().knowledgeBase.hasVectorData(projectId)
      },

      // --- Skill state ---
      skills: [],
      skillsLoading: false,

      async loadSkills(projectId: ProjectId) {
        set({ skillsLoading: true })
        const skills = await getServices().skills.list(projectId)
        set({ skills, skillsLoading: false })
      },

      async createSkill(data) {
        const projectId = get().currentProjectId
        if (!projectId) throw new Error('No project selected')
        const skill = await getServices().skills.create(projectId, data)
        set(s => ({ skills: [...s.skills, skill] }))
        return skill
      },

      async updateSkill(id, data) {
        const projectId = get().currentProjectId
        if (!projectId) throw new Error('No project selected')
        const updated = await getServices().skills.update(projectId, id, data)
        set(s => ({ skills: s.skills.map(sk => sk.id === id ? updated : sk) }))
      },

      async deleteSkill(id) {
        const projectId = get().currentProjectId
        if (!projectId) throw new Error('No project selected')
        await getServices().skills.delete(projectId, id)
        set(s => ({ skills: s.skills.filter(sk => sk.id !== id) }))
      },

      async importSkillsFromZip(file) {
        const projectId = get().currentProjectId
        if (!projectId) throw new Error('No project selected')
        const result = await getServices().skills.importZip(projectId, file)
        // Reload skills to get the newly imported ones
        await get().loadSkills(projectId)
        return result
      },

      // --- MCP state ---
      mcpServers: [],
      mcpServersLoading: false,

      async loadMCPServers(projectId: ProjectId) {
        set({ mcpServersLoading: true })
        const mcpServers = await getServices().mcp.list(projectId)
        set({ mcpServers, mcpServersLoading: false })
      },

      async createMCPServer(data) {
        const projectId = get().currentProjectId
        if (!projectId) throw new Error('No project selected')
        const server = await getServices().mcp.create(projectId, data)
        set(s => ({ mcpServers: [...s.mcpServers, server] }))
        return server
      },

      async updateMCPServer(name, data) {
        const projectId = get().currentProjectId
        if (!projectId) throw new Error('No project selected')
        const updated = await getServices().mcp.update(projectId, name, data)
        set(s => ({ mcpServers: s.mcpServers.map(m => m.name === name ? updated : m) }))
      },

      async deleteMCPServer(name) {
        const projectId = get().currentProjectId
        if (!projectId) throw new Error('No project selected')
        await getServices().mcp.delete(projectId, name)
        set(s => ({ mcpServers: s.mcpServers.filter(m => m.name !== name) }))
      },

      async testMCPServer(name) {
        const projectId = get().currentProjectId
        if (!projectId) throw new Error('No project selected')
        const svc = getServices().mcp
        if (!svc.test) throw new Error('MCP test not available')
        return svc.test(projectId, name)
      },

      // --- CronJob state ---
      cronJobs: [],
      cronJobsLoading: false,
      cronJobRuns: [],
      cronJobRunsLoading: false,

      async loadCronJobs(projectId: ProjectId) {
        set({ cronJobsLoading: true })
        const cronJobs = await getServices().cronJobs.list(projectId)
        set({ cronJobs, cronJobsLoading: false })
      },

      async createCronJob(data) {
        const projectId = get().currentProjectId
        if (!projectId) throw new Error('No project selected')
        const job = await getServices().cronJobs.create(projectId, data)
        set(s => ({ cronJobs: [...s.cronJobs, job] }))
        return job
      },

      async updateCronJob(id, data) {
        const projectId = get().currentProjectId
        if (!projectId) throw new Error('No project selected')
        const updated = await getServices().cronJobs.update(projectId, id, data)
        set(s => ({ cronJobs: s.cronJobs.map(c => c.id === id ? updated : c) }))
      },

      async deleteCronJob(id) {
        const projectId = get().currentProjectId
        if (!projectId) throw new Error('No project selected')
        await getServices().cronJobs.delete(projectId, id)
        set(s => ({ cronJobs: s.cronJobs.filter(c => c.id !== id) }))
      },

      async triggerCronJob(id) {
        const projectId = get().currentProjectId
        if (!projectId) throw new Error('No project selected')
        const svc = getServices().cronJobs
        if (!svc.trigger) return
        // Optimistically set status to 'running' immediately
        set(s => ({
          cronJobs: s.cronJobs.map(c => c.id === id ? { ...c, lastRunStatus: 'running' as const } : c),
        }))
        try {
          await svc.trigger(projectId, id)
          // Silent reload — don't set cronJobsLoading to avoid page flash
          const cronJobs = await getServices().cronJobs.list(projectId)
          set({ cronJobs })
        } catch (err) {
          // Silent reload on error too
          const cronJobs = await getServices().cronJobs.list(projectId)
          set({ cronJobs })
          throw err
        }
      },

      async loadCronJobRuns(cronJobId) {
        const projectId = get().currentProjectId
        if (!projectId) return
        set({ cronJobRunsLoading: true })
        const svc = getServices().cronJobs
        const runs = svc.listRuns ? await svc.listRuns(projectId, cronJobId) : []
        set({ cronJobRuns: runs, cronJobRunsLoading: false })
      },

      // --- Settings state ---
      settings: null,

      async loadSettings() {
        const settings = await getServices().settings.get()
        set({ settings })
        // Sync persisted theme with loaded settings (if not already overridden)
        applyThemeToDOM(get().themeMode)
        // Sync language from server-side settings (fallback if localStorage was cleared)
        if (settings.language) {
          i18next.changeLanguage(settings.language)
        }
      },

      async updateSettings(data) {
        const settings = await getServices().settings.update(data)
        set({ settings })
        if (data.theme) {
          set({ themeMode: data.theme })
          applyThemeToDOM(data.theme)
        }
        if (data.language) {
          i18next.changeLanguage(data.language)
        }
      },

      // --- UI state ---
      sidebarCollapsed: false,
      chatHistoryExpanded: false,
      themeMode: 'dark' as ThemeMode,
      updateInfo: null,
      skippedVersion: null,
      updateNotificationsEnabled: true,

      toggleSidebar() {
        set(s => ({ sidebarCollapsed: !s.sidebarCollapsed }))
      },

      toggleChatHistory() {
        set(s => ({ chatHistoryExpanded: !s.chatHistoryExpanded }))
      },

      setTheme(mode: ThemeMode) {
        set({ themeMode: mode })
        applyThemeToDOM(mode)
      },

      setUpdateInfo(info) {
        set({ updateInfo: info })
      },

      skipVersion(version: string) {
        set({ skippedVersion: version })
      },

      setUpdateNotifications(enabled: boolean) {
        set({ updateNotificationsEnabled: enabled })
      },

      // --- Dashboard state ---
      dashboardSummary: null,
      dashboardAgentStats: [],
      dashboardRecentChats: [],
      dashboardTokenTrend: [],
      dashboardTokenByModel: [],
      dashboardTokenByAgent: [],
      dashboardRuntimeStatus: null,
      dashboardTimeRange: 'today' as TimeRange,
      dashboardStale: false,
      dashboardLoading: false,

      async loadDashboard(projectId: ProjectId, timeRange?: TimeRange) {
        set({ dashboardLoading: true, dashboardStale: false })
        const range = timeRange ?? get().dashboardTimeRange
        const svc = getServices().dashboard
        try {
          const [summary, agentStats, recentChats, tokenTrend, tokenByModel, tokenByAgent, runtimeStatus] = await Promise.all([
            svc.getSummary(projectId, range),
            svc.getAgentStats(projectId, range),
            svc.getRecentChats(projectId),
            svc.getTokenTrend(projectId, undefined, range),
            svc.getTokenByModel(projectId, range),
            svc.getTokenByAgent(projectId, range),
            svc.getRuntimeStatus(projectId),
          ])
          if (get().currentProjectId !== projectId) return
          set({
            dashboardSummary: summary,
            dashboardAgentStats: agentStats,
            dashboardRecentChats: recentChats,
            dashboardTokenTrend: tokenTrend,
            dashboardTokenByModel: tokenByModel,
            dashboardTokenByAgent: tokenByAgent,
            dashboardRuntimeStatus: runtimeStatus,
          })
        } catch (err) {
          console.error('Failed to load dashboard:', err)
        } finally {
          set({ dashboardLoading: false })
        }
      },

      setDashboardTimeRange(range: TimeRange) {
        set({ dashboardTimeRange: range })
        const projectId = get().currentProjectId
        if (projectId) {
          get().loadDashboard(projectId, range)
        }
      },

      async loadRuntimeStatus(projectId: ProjectId) {
        const runtimeStatus = await getServices().dashboard.getRuntimeStatus(projectId)
        if (get().currentProjectId !== projectId) return
        set({ dashboardRuntimeStatus: runtimeStatus })
      },

      // --- Topology state ---
      topologyLayout: {},
      topologyLayoutLoading: false,

      async loadTopologyLayout(projectId: ProjectId) {
        set({ topologyLayoutLoading: true })
        try {
          const layout = await getServices().projects.getTopologyLayout(projectId)
          set({ topologyLayout: layout, topologyLayoutLoading: false })
        } catch {
          set({ topologyLayout: {}, topologyLayoutLoading: false })
        }
      },

      async saveTopologyLayout(projectId: ProjectId, layout: Record<string, { x: number; y: number }>) {
        set({ topologyLayout: layout })
        await getServices().projects.saveTopologyLayout(projectId, layout)
      },

      // --- Speech state ---
      speechHistory: [],
      speechHistoryLoading: false,
      speechStorageUsage: null,

      async transcribeAudio(audio, metadata) {
        return getServices().speech.transcribe(audio, metadata)
      },

      async loadSpeechHistory(params) {
        set({ speechHistoryLoading: true })
        try {
          const records = await getServices().speech.listHistory(params)
          set({ speechHistory: records, speechHistoryLoading: false })
        } catch {
          set({ speechHistoryLoading: false })
        }
      },

      async retrySpeechRecord(id) {
        const updated = await getServices().speech.retry(id)
        set(s => ({
          speechHistory: s.speechHistory.map(r => r.id === id ? updated : r),
        }))
        return updated
      },

      async deleteSpeechRecord(id) {
        await getServices().speech.deleteRecord(id)
        set(s => ({
          speechHistory: s.speechHistory.filter(r => r.id !== id),
        }))
      },

      async clearSpeechHistory() {
        const result = await getServices().speech.clearHistory()
        set({ speechHistory: [], speechStorageUsage: { totalBytes: 0, recordCount: 0 } })
        return result
      },

      async loadSpeechStorageUsage() {
        const usage = await getServices().speech.getStorageUsage()
        set({ speechStorageUsage: usage })
      },
    }),
    {
      name: 'golemancy-prefs',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        chatHistoryExpanded: state.chatHistoryExpanded,
        themeMode: state.themeMode,
        skippedVersion: state.skippedVersion,
        updateNotificationsEnabled: state.updateNotificationsEnabled,
      }),
      onRehydrateStorage: () => {
        return (state?: AppState) => {
          if (state) {
            applyThemeToDOM(state.themeMode)
          }
        }
      },
    },
  ),
)

// Expose store for E2E testing.
// Always exposed — this is an Electron desktop app, not a public web app.
if (typeof window !== 'undefined') {
  ;(window as any).__GOLEMANCY_STORE__ = useAppStore
}
