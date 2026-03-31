import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  Project, Conversation, ConversationSummary, GlobalSettings,
  DashboardSummary, DashboardAgentStats, DashboardRecentChat, DashboardTokenTrend,
  DashboardTokenByModel, DashboardTokenByAgent, RuntimeStatus, TimeRange,
  ThemeMode, StyleTheme, WorkspaceEntry, FilePreviewData,
  TranscriptionRecord, SpeechStorageUsage,
  ProjectId, AgentId, ConversationId, TranscriptionId, TeamId,
  TargetType,
} from '@golemancy/shared'
import { DEFAULT_AGENT_SYSTEM_PROMPT } from '@golemancy/shared'
import i18next from 'i18next'
import { getServices } from '../services'
import { destroyChat, destroyAllChats, releaseIdleChats } from '../lib/chat-instances'
import { captureError } from '../lib/error-reporting'
import { queryClient } from '../queries/query-client'
import { queryKeys } from '../queries/keys'
import { agentListOptions } from '../queries/agents'
import { skillListOptions } from '../queries/skills'
import { mcpServerListOptions } from '../queries/mcp-servers'
import { teamListOptions } from '../queries/teams'
import { cronJobListOptions } from '../queries/cron-jobs'
import { conversationTaskListOptions } from '../queries/conversation-tasks'

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

// --- Style theme helper ---
function applyStyleThemeToDOM(theme: StyleTheme): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.classList.remove('theme-modern')
  if (theme === 'modern') root.classList.add('theme-modern')
}

// --- State shape ---
interface ProjectSlice {
  projects: Project[]
  currentProjectId: ProjectId | null
  projectsLoading: boolean
}


interface ConversationSlice {
  conversationList: ConversationSummary[]
  currentConversation: Conversation | null
  conversationsLoading: boolean
}

/** Strip messages/compactRecords from a full Conversation to get a ConversationSummary. */
function toSummary(conv: Conversation): ConversationSummary {
  const { messages, compactRecords, ...summary } = conv
  return summary
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


interface SettingsSlice {
  settings: GlobalSettings | null
}

interface UISlice {
  sidebarCollapsed: boolean
  chatHistoryExpanded: boolean
  themeMode: ThemeMode
  styleTheme: StyleTheme
  updateState: UpdateState | null
  updateNotificationsEnabled: boolean
  chatFilterShowCron: boolean
  chatFilterShowSubAgent: boolean
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
  updateProject(id: ProjectId, data: Partial<Pick<Project, 'name' | 'description' | 'icon' | 'config' | 'defaultTargetType' | 'defaultTargetId'>>): Promise<void>
  deleteProject(id: ProjectId): Promise<void>
  cloneProject(id: ProjectId, newName: string): Promise<Project>
  createProjectFromTemplate(templateId: string, name: string): Promise<Project>
}


interface ConversationActions {
  loadConversations(projectId: ProjectId, agentId?: AgentId): Promise<void>
  selectConversation(id: ConversationId | null): Promise<void>
  /** Ensure a conversation exists in the store list (fetch + append if missing, no navigation) */
  ensureConversation(id: ConversationId): Promise<void>
  createConversation(targetType: TargetType, targetId: AgentId | TeamId, title: string): Promise<Conversation>
  updateConversation(id: ConversationId, data: { title?: string; targetType?: TargetType; targetId?: AgentId | TeamId }): Promise<Conversation>
  updateConversationTitle(id: ConversationId, title: string): Promise<void>
  deleteConversation(id: ConversationId): Promise<void>
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


interface SettingsActions {
  loadSettings(): Promise<void>
  updateSettings(data: Partial<GlobalSettings>): Promise<void>
}

interface UIActions {
  toggleSidebar(): void
  toggleChatHistory(): void
  setTheme(mode: ThemeMode): void
  setStyleTheme(theme: StyleTheme): void
  setUpdateState(state: UpdateState | null): void
  setUpdateNotifications(enabled: boolean): void
  setChatFilter(key: 'chatFilterShowCron' | 'chatFilterShowSubAgent', value: boolean): void
}

interface DashboardActions {
  loadDashboard(projectId: ProjectId, timeRange?: TimeRange): Promise<void>
  setDashboardTimeRange(range: TimeRange): void
  loadRuntimeStatus(projectId: ProjectId): Promise<void>
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
  & ProjectSlice & ConversationSlice & WorkspaceSlice & SettingsSlice & UISlice & DashboardSlice & SpeechSlice
  & ProjectActions & ConversationActions & WorkspaceActions & SettingsActions & UIActions & DashboardActions & SpeechActions

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // --- Project state ---
      projects: [],
      currentProjectId: null,
      projectsLoading: true,

      async loadProjects() {
        set({ projectsLoading: true })
        try {
          const projects = await getServices().projects.list()
          set({ projects, projectsLoading: false })
        } catch (err) {
          set({ projectsLoading: false })
          captureError(err, { component: 'loadProjects' })
        }
      },

      async selectProject(id: ProjectId) {
        const prevId = get().currentProjectId
        if (prevId === id) return

        // Release idle Chat instances; keep streaming ones alive so
        // server-side execution completes and saves messages to DB.
        releaseIdleChats()

        // Clear old project's TQ cache
        if (prevId) {
          queryClient.removeQueries({
            predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[1] === prevId,
          })
        }

        // Clear → set new → populate
        set({
          currentProjectId: id,
          conversationList: [],
          currentConversation: null,
          workspaceEntries: [],
          conversationsLoading: true,
          workspaceLoading: false,
        })

        // Load project data in parallel (individual failures resolve to empty arrays)
        // Workspace is lazy-loaded on page visit, not on project select
        const svc = getServices()
        const safe = <T,>(p: Promise<T[]>): Promise<T[]> => p.catch(() => [] as T[])
        const [conversationList] = await Promise.all([
          safe(svc.conversations.list(id)),
          // TQ prefetch (runs in parallel, maintains zero-flicker UX)
          queryClient.prefetchQuery(agentListOptions(id)),
          queryClient.prefetchQuery(skillListOptions(id)),
          queryClient.prefetchQuery(mcpServerListOptions(id)),
          queryClient.prefetchQuery(teamListOptions(id)),
          queryClient.prefetchQuery(cronJobListOptions(id)),
          queryClient.prefetchQuery(conversationTaskListOptions(id)),
        ])

        // Guard: only apply if still the active project
        if (get().currentProjectId !== id) return

        set({
          conversationList,
          conversationsLoading: false,
        })
      },

      clearProject() {
        const prevId = get().currentProjectId
        destroyAllChats()
        if (prevId) {
          queryClient.removeQueries({
            predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[1] === prevId,
          })
        }
        set({
          currentProjectId: null,
          conversationList: [],
          currentConversation: null,
          workspaceEntries: [],
          workspaceCurrentPath: '',
          workspacePreview: null,
          workspaceLoading: false,
          workspacePreviewLoading: false,
        })
      },

      async createProject(data) {
        const svc = getServices()
        const project = await svc.projects.create(data)

        const settings = get().settings
        const modelConfig = settings?.defaultModel

        // Auto-create default Main Agent
        const agent = await svc.agents.create(project.id, {
          name: 'Main Agent',
          description: 'Default AI assistant for this project',
          systemPrompt: DEFAULT_AGENT_SYSTEM_PROMPT,
          modelConfig: modelConfig ?? { provider: '', model: '' },
        })

        // Set as Main Agent
        const updated = await svc.projects.update(project.id, { defaultTargetType: 'agent', defaultTargetId: agent.id })

        set(s => ({ projects: [...s.projects, updated] }))
        return updated
      },

      async updateProject(id, data) {
        const updated = await getServices().projects.update(id, data)
        set(s => ({ projects: s.projects.map(p => p.id === id ? updated : p) }))
      },

      async deleteProject(id) {
        // Optimistic: remove from store immediately, then fire backend delete.
        // Backend returns 200 instantly (deletion runs in background).
        const isCurrent = get().currentProjectId === id
        set(s => ({
          projects: s.projects.filter(p => p.id !== id),
          ...(isCurrent ? { currentProjectId: null, conversationList: [], currentConversation: null, workspaceEntries: [] } : {}),
        }))
        if (isCurrent) {
          queryClient.removeQueries({
            predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[1] === id,
          })
        }
        await getServices().projects.delete(id)
      },

      async cloneProject(id, newName) {
        const project = await getServices().projects.clone(id, newName)
        set(s => ({ projects: [...s.projects, project] }))
        return project
      },

      async createProjectFromTemplate(templateId, name) {
        const service = getServices().projects
        if (!service.createFromTemplate) throw new Error('createFromTemplate not supported')
        const project = await service.createFromTemplate(templateId, name)
        set(s => ({ projects: [...s.projects, project] }))
        return project
      },

      // --- Agent state: migrated to TanStack Query (see queries/agents.ts) ---

      // --- Conversation state ---
      conversationList: [],
      currentConversation: null,
      conversationsLoading: false,

      async loadConversations(projectId: ProjectId, agentId?: AgentId) {
        set({ conversationsLoading: true })
        const conversationList = await getServices().conversations.list(projectId, agentId)
        set({ conversationList, conversationsLoading: false })
      },

      async selectConversation(id: ConversationId | null) {
        if (!id) {
          set({ currentConversation: null })
          return
        }

        const projectId = get().currentProjectId
        if (!projectId) {
          set({ currentConversation: null })
          return
        }

        // Load full conversation (with messages) BEFORE setting currentConversation.
        // This ensures ChatWindow mounts with messages already available,
        // since useChat only reads `messages` on initialization.
        const full = await getServices().conversations.getById(projectId, id)
        if (full) {
          set(s => ({
            currentConversation: full,
            // Update list entry metadata (e.g. title/lastMessageAt) if it exists
            conversationList: s.conversationList.some(c => c.id === id)
              ? s.conversationList.map(c => c.id === id ? toSummary(full) : c)
              : [...s.conversationList, toSummary(full)],
          }))
          console.debug('[store] selectConversation loaded', id, 'messages:', full.messages.length)
        } else {
          set({ currentConversation: null })
        }
      },

      async ensureConversation(id: ConversationId) {
        const projectId = get().currentProjectId
        if (!projectId) return
        const exists = get().conversationList.some(c => c.id === id)
        if (exists) return
        const conv = await getServices().conversations.getById(projectId, id)
        if (conv) {
          set(s => s.conversationList.some(c => c.id === id)
            ? s
            : { conversationList: [...s.conversationList, toSummary(conv)] },
          )
        }
      },

      async createConversation(targetType: TargetType, targetId: AgentId | TeamId, title: string) {
        const projectId = get().currentProjectId
        if (!projectId) throw new Error('No project selected')
        const conv = await getServices().conversations.create(projectId, targetType, targetId, title)
        set(s => ({
          conversationList: [...s.conversationList, toSummary(conv)],
          currentConversation: conv,
        }))
        return conv
      },

      async updateConversation(id: ConversationId, data: { title?: string; targetType?: TargetType; targetId?: AgentId | TeamId }) {
        const projectId = get().currentProjectId
        if (!projectId) throw new Error('No project selected')
        const updated = await getServices().conversations.update(projectId, id, data)
        const changesTarget = Object.prototype.hasOwnProperty.call(data, 'targetType')
          || Object.prototype.hasOwnProperty.call(data, 'targetId')
        if (changesTarget) {
          destroyChat(id)
        }
        set(s => ({
          conversationList: s.conversationList.map(c => c.id === id ? toSummary(updated) : c),
          // Update currentConversation metadata if it's the active one (preserve messages)
          ...(s.currentConversation && s.currentConversation.id === id
            ? { currentConversation: { ...s.currentConversation, ...toSummary(updated) } }
            : {}),
        }))
        return updated
      },

      async updateConversationTitle(id: ConversationId, title: string) {
        const projectId = get().currentProjectId
        if (!projectId) throw new Error('No project selected')
        const updated = await getServices().conversations.update(projectId, id, { title })
        if (!updated) return
        set(s => ({
          conversationList: s.conversationList.map(c => c.id === id ? { ...c, title: updated.title, updatedAt: updated.updatedAt } : c),
          ...(s.currentConversation && s.currentConversation.id === id
            ? { currentConversation: { ...s.currentConversation, title: updated.title, updatedAt: updated.updatedAt } }
            : {}),
        }))
      },

      async deleteConversation(id: ConversationId) {
        const projectId = get().currentProjectId
        if (!projectId) throw new Error('No project selected')
        await getServices().conversations.delete(projectId, id)
        destroyChat(id)
        set(s => ({
          conversationList: s.conversationList.filter(c => c.id !== id),
          ...(s.currentConversation?.id === id ? { currentConversation: null } : {}),
        }))
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

      // --- Skill + MCP state: migrated to TanStack Query (see queries/skills.ts, queries/mcp-servers.ts) ---

      // --- Settings state ---
      settings: null,

      async loadSettings() {
        try {
          const settings = await getServices().settings.get()
          set({ settings })
          // Sync persisted theme with loaded settings (if not already overridden)
          applyThemeToDOM(get().themeMode)
          applyStyleThemeToDOM(get().styleTheme ?? 'pixel')
          // Sync language from server-side settings (fallback if localStorage was cleared)
          if (settings.language) {
            i18next.changeLanguage(settings.language)
          }
        } catch (err) {
          captureError(err, { component: 'loadSettings' })
        }
      },

      async updateSettings(data) {
        const settings = await getServices().settings.update(data)
        set({ settings })
        if (data.theme) {
          set({ themeMode: data.theme })
          applyThemeToDOM(data.theme)
        }
        if (data.styleTheme) {
          set({ styleTheme: data.styleTheme })
          applyStyleThemeToDOM(data.styleTheme)
        }
        if (data.language) {
          i18next.changeLanguage(data.language)
        }
        if (data.telemetryEnabled !== undefined) {
          window.electronAPI?.setTelemetryEnabled(data.telemetryEnabled)
        }
      },

      // --- UI state ---
      sidebarCollapsed: false,
      chatHistoryExpanded: false,
      themeMode: 'system' as ThemeMode,
      styleTheme: 'pixel' as StyleTheme,
      updateState: null,
      updateNotificationsEnabled: true,
      chatFilterShowCron: true,
      chatFilterShowSubAgent: false,

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

      setStyleTheme(theme: StyleTheme) {
        set({ styleTheme: theme })
        applyStyleThemeToDOM(theme)
      },

      setUpdateState(state) {
        set({ updateState: state })
      },

      setUpdateNotifications(enabled: boolean) {
        set({ updateNotificationsEnabled: enabled })
      },

      setChatFilter(key: 'chatFilterShowCron' | 'chatFilterShowSubAgent', value: boolean) {
        set({ [key]: value })
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
          captureError(err, { component: 'dashboard' })
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

      // Memory + Team state migrated to TanStack Query (queries/memories.ts, queries/teams.ts)
    }),
    {
      name: 'golemancy-prefs',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        chatHistoryExpanded: state.chatHistoryExpanded,
        themeMode: state.themeMode,
        styleTheme: state.styleTheme,
        updateNotificationsEnabled: state.updateNotificationsEnabled,
        chatFilterShowCron: state.chatFilterShowCron,
        chatFilterShowSubAgent: state.chatFilterShowSubAgent,
      }),
      onRehydrateStorage: () => {
        return (state?: AppState) => {
          if (state) {
            applyThemeToDOM(state.themeMode)
            applyStyleThemeToDOM(state.styleTheme ?? 'pixel')
          }
        }
      },
    },
  ),
)

// Expose store for E2E testing via bridge proxy.
// Merges Zustand state with TanStack Query cache so E2E tests
// can read migrated fields (e.g. agents) without code changes.
if (typeof window !== 'undefined') {
  const bridge = (() => {}) as any
  bridge.getState = () => {
    const state = useAppStore.getState()
    const pid = state.currentProjectId
    return {
      ...state,
      // Inject TQ-migrated fields back into the state shape for E2E compat
      agents: pid ? queryClient.getQueryData(queryKeys.agents.all(pid)) ?? [] : [],
      agentsLoading: pid
        ? queryClient.getQueryState(queryKeys.agents.all(pid))?.status === 'pending'
        : false,
      skills: pid ? queryClient.getQueryData(queryKeys.skills.all(pid)) ?? [] : [],
      skillsLoading: pid
        ? queryClient.getQueryState(queryKeys.skills.all(pid))?.status === 'pending'
        : false,
      mcpServers: pid ? queryClient.getQueryData(queryKeys.mcpServers.all(pid)) ?? [] : [],
      mcpServersLoading: pid
        ? queryClient.getQueryState(queryKeys.mcpServers.all(pid))?.status === 'pending'
        : false,
      teams: pid ? queryClient.getQueryData(queryKeys.teams.all(pid)) ?? [] : [],
      teamsLoading: pid
        ? queryClient.getQueryState(queryKeys.teams.all(pid))?.status === 'pending'
        : false,
      cronJobs: pid ? queryClient.getQueryData(queryKeys.cronJobs.all(pid)) ?? [] : [],
      cronJobsLoading: pid
        ? queryClient.getQueryState(queryKeys.cronJobs.all(pid))?.status === 'pending'
        : false,
      cronJobRuns: [] as unknown[],
      cronJobRunsLoading: false,
      conversationTasks: pid ? queryClient.getQueryData(queryKeys.tasks.all(pid)) ?? [] : [],
      tasksLoading: pid
        ? queryClient.getQueryState(queryKeys.tasks.all(pid))?.status === 'pending'
        : false,
      memories: [] as unknown[],
      memoriesLoading: false,
      // TQ-migrated action stubs for E2E compat
      loadAgents: async (pid: ProjectId) => {
        await queryClient.invalidateQueries({ queryKey: queryKeys.agents.all(pid) })
      },
      loadCronJobs: async (pid: ProjectId) => {
        await queryClient.invalidateQueries({ queryKey: queryKeys.cronJobs.all(pid) })
      },
      loadConversationTasks: async (pid: ProjectId) => {
        await queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all(pid) })
      },
      refreshConversationTasks: async () => {
        if (pid) await queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all(pid) })
      },
    }
  }
  bridge.subscribe = useAppStore.subscribe
  ;(window as any).__GOLEMANCY_STORE__ = bridge
}
