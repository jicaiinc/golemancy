import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  Project, Agent, Conversation, ConversationTask, MemoryEntry, GlobalSettings, CronJob, Skill,
  MCPServerConfig, MCPServerCreateData, MCPServerUpdateData,
  DashboardSummary, DashboardAgentStats, DashboardRecentChat, DashboardTokenTrend,
  ThemeMode, WorkspaceEntry, FilePreviewData,
  ProjectId, AgentId, ConversationId, MemoryId, SkillId, CronJobId,
  SkillCreateData, SkillUpdateData,
} from '@golemancy/shared'
import { DEFAULT_AGENT_SYSTEM_PROMPT } from '@golemancy/shared'
import { getServices } from '../services'
import { fetchJson, getBaseUrl } from '../services/http/base'
import { destroyChat, destroyAllChats } from '../lib/chat-instances'

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

interface MemorySlice {
  memories: MemoryEntry[]
  memoriesLoading: boolean
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
}

interface SettingsSlice {
  settings: GlobalSettings | null
}

interface UISlice {
  sidebarCollapsed: boolean
  chatHistoryExpanded: boolean
  themeMode: ThemeMode
}

interface DashboardSlice {
  dashboardSummary: DashboardSummary | null
  dashboardAgentStats: DashboardAgentStats[]
  dashboardRecentChats: DashboardRecentChat[]
  dashboardTokenTrend: DashboardTokenTrend[]
  dashboardLoading: boolean
}

interface TopologySlice {
  topologyLayout: Record<string, { x: number; y: number }>
  topologyLayoutLoading: boolean
}

// --- Actions ---
interface ProjectActions {
  loadProjects(): Promise<void>
  selectProject(id: ProjectId): Promise<void>
  clearProject(): void
  createProject(data: Pick<Project, 'name' | 'description' | 'icon' | 'workingDirectory'>): Promise<Project>
  updateProject(id: ProjectId, data: Partial<Pick<Project, 'name' | 'description' | 'icon' | 'config' | 'mainAgentId'>>): Promise<void>
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
  /** Clear workspace state (on project switch) */
  clearWorkspace(): void
}

interface MemoryActions {
  loadMemories(projectId: ProjectId): Promise<void>
  createMemory(data: Pick<MemoryEntry, 'content' | 'source' | 'tags'>): Promise<MemoryEntry>
  updateMemory(id: MemoryId, data: Partial<Pick<MemoryEntry, 'content' | 'tags'>>): Promise<void>
  deleteMemory(id: MemoryId): Promise<void>
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
  createCronJob(data: Pick<CronJob, 'agentId' | 'name' | 'description' | 'cronExpression' | 'enabled'>): Promise<CronJob>
  updateCronJob(id: CronJobId, data: Partial<Pick<CronJob, 'agentId' | 'name' | 'description' | 'cronExpression' | 'enabled'>>): Promise<void>
  deleteCronJob(id: CronJobId): Promise<void>
}

interface SettingsActions {
  loadSettings(): Promise<void>
  updateSettings(data: Partial<GlobalSettings>): Promise<void>
}

interface UIActions {
  toggleSidebar(): void
  toggleChatHistory(): void
  setTheme(mode: ThemeMode): void
}

interface DashboardActions {
  loadDashboard(projectId: ProjectId): Promise<void>
}

interface TopologyActions {
  loadTopologyLayout(projectId: ProjectId): Promise<void>
  saveTopologyLayout(projectId: ProjectId, layout: Record<string, { x: number; y: number }>): Promise<void>
}

// --- Combined ---
export type AppState =
  & ProjectSlice & AgentSlice & ConversationSlice & TaskSlice & WorkspaceSlice & MemorySlice & SkillSlice & MCPSlice & CronJobSlice & SettingsSlice & UISlice & DashboardSlice & TopologySlice
  & ProjectActions & AgentActions & ConversationActions & TaskActions & WorkspaceActions & MemoryActions & SkillActions & MCPActions & CronJobActions & SettingsActions & UIActions & DashboardActions & TopologyActions

// AbortController for project switching
let projectAbort: AbortController | null = null

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
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

        // Destroy all Chat instances from previous project
        destroyAllChats()

        // Clear → set new → populate
        set({
          currentProjectId: id,
          agents: [],
          conversations: [],
          conversationTasks: [],
          workspaceEntries: [],
          memories: [],
          skills: [],
          mcpServers: [],
          cronJobs: [],
          topologyLayout: {},
          topologyLayoutLoading: false,
          agentsLoading: true,
          conversationsLoading: true,
          tasksLoading: true,
          workspaceLoading: false,
          memoriesLoading: true,
          skillsLoading: true,
          mcpServersLoading: true,
          cronJobsLoading: true,
        })

        // Load project data in parallel (individual failures resolve to empty arrays)
        // Workspace is lazy-loaded on page visit, not on project select
        const svc = getServices()
        const safe = <T,>(p: Promise<T[]>): Promise<T[]> => p.catch(() => [] as T[])
        const [agents, conversations, conversationTasks, memories, skills, mcpServers, cronJobs] = await Promise.all([
          safe(svc.agents.list(id)),
          safe(svc.conversations.list(id)),
          safe(svc.tasks.list(id)),
          safe(svc.memory.list(id)),
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
          memories,
          skills,
          mcpServers,
          cronJobs,
          agentsLoading: false,
          conversationsLoading: false,
          tasksLoading: false,
          memoriesLoading: false,
          skillsLoading: false,
          mcpServersLoading: false,
          cronJobsLoading: false,
        })
      },

      clearProject() {
        projectAbort?.abort()
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
          memories: [],
          skills: [],
          mcpServers: [],
          cronJobs: [],
          topologyLayout: {},
          skillsLoading: false,
          mcpServersLoading: false,
          cronJobsLoading: false,
          currentConversationId: null,
        })
      },

      async createProject(data) {
        const svc = getServices()
        const project = await svc.projects.create(data)

        // Auto-create default Main Agent
        const agent = await svc.agents.create(project.id, {
          name: 'Main Agent',
          description: 'Default AI assistant for this project',
          systemPrompt: DEFAULT_AGENT_SYSTEM_PROMPT,
          modelConfig: { temperature: 0.7, maxTokens: 4096 },
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
          ...(s.currentProjectId === id ? { currentProjectId: null, agents: [], conversations: [], conversationTasks: [], workspaceEntries: [], memories: [], skills: [], mcpServers: [], cronJobs: [] } : {}),
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
          set(s => ({
            conversations: s.conversations.map(c => c.id === id ? full : c),
            currentConversationId: id,
          }))
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

      clearWorkspace() {
        set({
          workspaceEntries: [],
          workspaceCurrentPath: '',
          workspacePreview: null,
          workspaceLoading: false,
          workspacePreviewLoading: false,
        })
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

      // --- Settings state ---
      settings: null,

      async loadSettings() {
        const settings = await getServices().settings.get()
        set({ settings })
        // Sync persisted theme with loaded settings (if not already overridden)
        applyThemeToDOM(get().themeMode)
      },

      async updateSettings(data) {
        const settings = await getServices().settings.update(data)
        set({ settings })
        if (data.theme) {
          set({ themeMode: data.theme })
          applyThemeToDOM(data.theme)
        }
      },

      // --- UI state ---
      sidebarCollapsed: false,
      chatHistoryExpanded: false,
      themeMode: 'dark' as ThemeMode,

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

      // --- Dashboard state ---
      dashboardSummary: null,
      dashboardAgentStats: [],
      dashboardRecentChats: [],
      dashboardTokenTrend: [],
      dashboardLoading: false,

      async loadDashboard(projectId: ProjectId) {
        set({ dashboardLoading: true })
        const svc = getServices().dashboard
        const [summary, agentStats, recentChats, tokenTrend] = await Promise.all([
          svc.getSummary(projectId),
          svc.getAgentStats(projectId),
          svc.getRecentChats(projectId),
          svc.getTokenTrend(projectId),
        ])
        set({
          dashboardSummary: summary,
          dashboardAgentStats: agentStats,
          dashboardRecentChats: recentChats,
          dashboardTokenTrend: tokenTrend,
          dashboardLoading: false,
        })
      },

      // --- Topology state ---
      topologyLayout: {},
      topologyLayoutLoading: false,

      async loadTopologyLayout(projectId: ProjectId) {
        set({ topologyLayoutLoading: true })
        try {
          const layout = await fetchJson<Record<string, { x: number; y: number }>>(
            `${getBaseUrl()}/api/projects/${projectId}/topology-layout`
          )
          set({ topologyLayout: layout ?? {}, topologyLayoutLoading: false })
        } catch {
          set({ topologyLayout: {}, topologyLayoutLoading: false })
        }
      },

      async saveTopologyLayout(projectId: ProjectId, layout: Record<string, { x: number; y: number }>) {
        set({ topologyLayout: layout })
        await fetchJson(`${getBaseUrl()}/api/projects/${projectId}/topology-layout`, {
          method: 'PUT',
          body: JSON.stringify(layout),
        })
      },
    }),
    {
      name: 'golemancy-prefs',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        chatHistoryExpanded: state.chatHistoryExpanded,
        themeMode: state.themeMode,
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
