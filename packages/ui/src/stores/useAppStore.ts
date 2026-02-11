import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  Project, Agent, Conversation, Task, Artifact, MemoryEntry, GlobalSettings, CronJob, Skill,
  DashboardSummary, DashboardAgentSummary, DashboardTaskSummary, ActivityEntry,
  ThemeMode,
  ProjectId, AgentId, ConversationId, TaskId, ArtifactId, MemoryId, SkillId, CronJobId,
  SkillCreateData, SkillUpdateData,
} from '@solocraft/shared'
import { DEFAULT_AGENT_SYSTEM_PROMPT } from '@solocraft/shared'
import { getServices } from '../services'
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

interface SkillSlice {
  skills: Skill[]
  skillsLoading: boolean
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
  themeMode: ThemeMode
}

interface DashboardSlice {
  dashboardSummary: DashboardSummary | null
  dashboardActiveAgents: DashboardAgentSummary[]
  dashboardRecentTasks: DashboardTaskSummary[]
  dashboardActivityFeed: ActivityEntry[]
  dashboardLoading: boolean
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

interface SkillActions {
  loadSkills(projectId: ProjectId): Promise<void>
  createSkill(data: SkillCreateData): Promise<Skill>
  updateSkill(id: SkillId, data: SkillUpdateData): Promise<void>
  deleteSkill(id: SkillId): Promise<void>
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
  setTheme(mode: ThemeMode): void
}

interface DashboardActions {
  loadDashboard(): Promise<void>
  loadDashboardActiveAgents(): Promise<void>
  loadDashboardRecentTasks(limit?: number): Promise<void>
  loadDashboardActivityFeed(limit?: number): Promise<void>
}

// --- Combined ---
export type AppState =
  & ProjectSlice & AgentSlice & ConversationSlice & TaskSlice & ArtifactSlice & MemorySlice & SkillSlice & CronJobSlice & SettingsSlice & UISlice & DashboardSlice
  & ProjectActions & AgentActions & ConversationActions & TaskActions & ArtifactActions & MemoryActions & SkillActions & CronJobActions & SettingsActions & UIActions & DashboardActions

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
          tasks: [],
          artifacts: [],
          memories: [],
          skills: [],
          cronJobs: [],
          agentsLoading: true,
          conversationsLoading: true,
          tasksLoading: true,
          artifactsLoading: true,
          memoriesLoading: true,
          skillsLoading: true,
          cronJobsLoading: true,
        })

        // Load project data in parallel (individual failures resolve to empty arrays)
        const svc = getServices()
        const safe = <T,>(p: Promise<T[]>): Promise<T[]> => p.catch(() => [] as T[])
        const [agents, conversations, tasks, artifacts, memories, skills, cronJobs] = await Promise.all([
          safe(svc.agents.list(id)),
          safe(svc.conversations.list(id)),
          safe(svc.tasks.list(id)),
          safe(svc.artifacts.list(id)),
          safe(svc.memory.list(id)),
          safe(svc.skills.list(id)),
          safe(svc.cronJobs.list(id)),
        ])

        // Guard: only apply if still the active project
        if (get().currentProjectId !== id) return

        set({
          agents,
          conversations,
          tasks,
          artifacts,
          memories,
          skills,
          cronJobs,
          agentsLoading: false,
          conversationsLoading: false,
          tasksLoading: false,
          artifactsLoading: false,
          memoriesLoading: false,
          skillsLoading: false,
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
          tasks: [],
          artifacts: [],
          memories: [],
          skills: [],
          cronJobs: [],
          skillsLoading: false,
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
          ...(s.currentProjectId === id ? { currentProjectId: null, agents: [], conversations: [], tasks: [], artifacts: [], memories: [], skills: [], cronJobs: [] } : {}),
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
      themeMode: 'dark' as ThemeMode,

      toggleSidebar() {
        set(s => ({ sidebarCollapsed: !s.sidebarCollapsed }))
      },

      setTheme(mode: ThemeMode) {
        set({ themeMode: mode })
        applyThemeToDOM(mode)
      },

      // --- Dashboard state ---
      dashboardSummary: null,
      dashboardActiveAgents: [],
      dashboardRecentTasks: [],
      dashboardActivityFeed: [],
      dashboardLoading: false,

      async loadDashboard() {
        set({ dashboardLoading: true })
        const svc = getServices().dashboard
        const [summary, activeAgents, recentTasks, activityFeed] = await Promise.all([
          svc.getSummary(),
          svc.getActiveAgents(),
          svc.getRecentTasks(),
          svc.getActivityFeed(),
        ])
        set({
          dashboardSummary: summary,
          dashboardActiveAgents: activeAgents,
          dashboardRecentTasks: recentTasks,
          dashboardActivityFeed: activityFeed,
          dashboardLoading: false,
        })
      },

      async loadDashboardActiveAgents() {
        const activeAgents = await getServices().dashboard.getActiveAgents()
        set({ dashboardActiveAgents: activeAgents })
      },

      async loadDashboardRecentTasks(limit?: number) {
        const recentTasks = await getServices().dashboard.getRecentTasks(limit)
        set({ dashboardRecentTasks: recentTasks })
      },

      async loadDashboardActivityFeed(limit?: number) {
        const activityFeed = await getServices().dashboard.getActivityFeed(limit)
        set({ dashboardActivityFeed: activityFeed })
      },
    }),
    {
      name: 'solocraft-prefs',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
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
  ;(window as any).__SOLOCRAFT_STORE__ = useAppStore
}
