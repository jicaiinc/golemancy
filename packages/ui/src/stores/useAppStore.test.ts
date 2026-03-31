import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAppStore } from './useAppStore'
import { configureServices } from '../services/container'
import type { ServiceContainer } from '../services/container'
import type { ProjectId, AgentId, ConversationId, TeamId } from '@golemancy/shared'

// Mock chat-instances to verify store calls destroyChat/destroyAllChats/releaseIdleChats
vi.mock('../lib/chat-instances', () => ({
  destroyChat: vi.fn(),
  destroyAllChats: vi.fn(),
  releaseIdleChats: vi.fn(),
}))

// Create mock services
function createTestServices(): ServiceContainer {
  return {
    projects: {
      list: vi.fn().mockResolvedValue([
        { id: 'proj-1' as ProjectId, name: 'Test Project' },
        { id: 'proj-2' as ProjectId, name: 'Another Project' },
      ]),
      getById: vi.fn(),
      create: vi.fn().mockImplementation((data) =>
        Promise.resolve({ id: 'proj-new' as ProjectId, ...data }),
      ),
      update: vi.fn().mockImplementation((id, data) =>
        Promise.resolve({ id, ...data }),
      ),
      delete: vi.fn().mockResolvedValue(undefined),
      clone: vi.fn().mockImplementation((id, newName) =>
        Promise.resolve({ id: 'proj-cloned' as ProjectId, name: newName }),
      ),
    },
    agents: {
      list: vi.fn().mockResolvedValue([
        { id: 'agent-1' as AgentId, name: 'Agent A' },
      ]),
      getById: vi.fn(),
      create: vi.fn().mockImplementation((_pid, data) =>
        Promise.resolve({ id: 'agent-new' as AgentId, ...data }),
      ),
      update: vi.fn().mockImplementation((_pid, id, data) =>
        Promise.resolve({ id, ...data }),
      ),
      delete: vi.fn().mockResolvedValue(undefined),
      clone: vi.fn().mockImplementation((_pid, _id, newName) =>
        Promise.resolve({ id: 'agent-cloned' as AgentId, name: newName }),
      ),
    },
    conversations: {
      list: vi.fn().mockResolvedValue([
        { id: 'conv-1' as ConversationId, title: 'Chat 1' },
      ]),
      getById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      sendMessage: vi.fn(),
      saveMessage: vi.fn(),
      getMessages: vi.fn(),
      searchMessages: vi.fn(),
      delete: vi.fn(),
    },
    tasks: {
      list: vi.fn().mockResolvedValue([
        { id: 'task-1', subject: 'Task 1', conversationId: 'conv-1', status: 'pending', blocks: [], blockedBy: [] },
      ]),
      getById: vi.fn(),
    },
    workspace: {
      listDir: vi.fn().mockResolvedValue([]),
      readFile: vi.fn().mockResolvedValue(null),
      deleteFile: vi.fn().mockResolvedValue(undefined),
      getFileUrl: vi.fn().mockReturnValue(''),
    },
    settings: {
      get: vi.fn().mockResolvedValue({
        providers: {
          openai: { name: 'OpenAI', sdkType: 'openai', apiKey: 'test', models: ['gpt-4o'], testStatus: 'ok' },
        },
        theme: 'dark',
      }),
      update: vi.fn().mockImplementation((data) =>
        Promise.resolve({ ...data }),
      ),
      testProvider: vi.fn().mockResolvedValue({ ok: true, latencyMs: 150 }),
    },
    cronJobs: {
      list: vi.fn().mockResolvedValue([]),
      getById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    skills: {
      list: vi.fn().mockResolvedValue([]),
      getById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      importZip: vi.fn(),
    },
    mcp: {
      list: vi.fn().mockResolvedValue([]),
      getByName: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      resolveNames: vi.fn().mockResolvedValue([]),
    },
    dashboard: {
      getSummary: vi.fn().mockResolvedValue({
        todayTokens: { total: 0, input: 0, output: 0, callCount: 0 }, totalAgents: 0, activeChats: 0, totalChats: 0,
      }),
      getAgentStats: vi.fn().mockResolvedValue([]),
      getRecentChats: vi.fn().mockResolvedValue([]),
      getTokenTrend: vi.fn().mockResolvedValue([]),
      getTokenByModel: vi.fn().mockResolvedValue([]),
      getTokenByAgent: vi.fn().mockResolvedValue([]),
      getRuntimeStatus: vi.fn().mockResolvedValue({ runningChats: [], runningCrons: [], upcoming: [], recentCompleted: [] }),
    },
    globalDashboard: {
      getSummary: vi.fn().mockResolvedValue({ todayTokens: { total: 0, input: 0, output: 0, callCount: 0 }, totalAgents: 0, activeChats: 0, totalChats: 0 }),
      getTokenByModel: vi.fn().mockResolvedValue([]),
      getTokenByAgent: vi.fn().mockResolvedValue([]),
      getTokenByProject: vi.fn().mockResolvedValue([]),
      getTokenTrend: vi.fn().mockResolvedValue([]),
      getRuntimeStatus: vi.fn().mockResolvedValue({ runningChats: [], runningCrons: [], upcoming: [], recentCompleted: [] }),
    },
    permissionsConfig: {
      list: vi.fn().mockResolvedValue([]),
      getById: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      duplicate: vi.fn(),
    },
    speech: {} as any,
    memories: {} as any,
    teams: {
      list: vi.fn().mockResolvedValue([]),
      getById: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      clone: vi.fn().mockImplementation((_pid, _id, newName) =>
        Promise.resolve({ id: 'team-cloned' as TeamId, name: newName }),
      ),
      getLayout: vi.fn().mockResolvedValue({}),
      saveLayout: vi.fn(),
    },
  }
}

describe('useAppStore', () => {
  let mockServices: ServiceContainer

  beforeEach(() => {
    mockServices = createTestServices()
    configureServices(mockServices)
    // Reset store state
    useAppStore.setState({
      projects: [],
      currentProjectId: null,
      projectsLoading: false,
      conversationList: [],
      currentConversation: null,
      conversationsLoading: false,
      settings: null,
      sidebarCollapsed: false,
      themeMode: 'dark',
      dashboardSummary: null,
      dashboardAgentStats: [],
      dashboardRecentChats: [],
      dashboardTokenTrend: [],
      dashboardLoading: false,
    })
    // Clean DOM classes for theme tests
    document.documentElement.classList.remove('light', 'dark')
  })

  describe('initial state', () => {
    it('has empty projects', () => {
      expect(useAppStore.getState().projects).toEqual([])
    })

    it('has no current project', () => {
      expect(useAppStore.getState().currentProjectId).toBeNull()
    })

    it('has sidebar expanded by default', () => {
      expect(useAppStore.getState().sidebarCollapsed).toBe(false)
    })

    it('has no settings', () => {
      expect(useAppStore.getState().settings).toBeNull()
    })
  })

  describe('loadProjects', () => {
    it('loads projects from service', async () => {
      await useAppStore.getState().loadProjects()
      const state = useAppStore.getState()
      expect(state.projects).toHaveLength(2)
      expect(state.projectsLoading).toBe(false)
      expect(mockServices.projects.list).toHaveBeenCalledOnce()
    })

    it('sets loading state during fetch', async () => {
      const promise = useAppStore.getState().loadProjects()
      expect(useAppStore.getState().projectsLoading).toBe(true)
      await promise
      expect(useAppStore.getState().projectsLoading).toBe(false)
    })
  })

  describe('selectProject', () => {
    it('loads conversations and tasks for the project', async () => {
      await useAppStore.getState().selectProject('proj-1' as ProjectId)
      const state = useAppStore.getState()
      expect(state.currentProjectId).toBe('proj-1')
      expect(state.conversationList).toHaveLength(1)
      expect(mockServices.conversations.list).toHaveBeenCalledWith('proj-1')
    })

    it('does not reload if same project is selected', async () => {
      await useAppStore.getState().selectProject('proj-1' as ProjectId)
      await useAppStore.getState().selectProject('proj-1' as ProjectId)
      // Second call should be a no-op since project is already selected
      expect(mockServices.conversations.list).toHaveBeenCalledTimes(1)
    })

    it('clears previous project data when switching', async () => {
      await useAppStore.getState().selectProject('proj-1' as ProjectId)

      // Mock new data for project 2
      ;(mockServices.conversations.list as any).mockResolvedValue([])
      ;(mockServices.tasks.list as any).mockResolvedValue([])

      await useAppStore.getState().selectProject('proj-2' as ProjectId)
      const state = useAppStore.getState()
      expect(state.currentProjectId).toBe('proj-2')
      expect(state.conversationList).toHaveLength(0)
    })

    it('guards against race condition when switching projects rapidly', async () => {
      // Make conversations.list slow for proj-1
      ;(mockServices.conversations.list as any).mockImplementation((pid: string) => {
        if (pid === 'proj-1') {
          return new Promise(() => {}) // never resolves
        }
        return Promise.resolve([])
      })
      ;(mockServices.tasks.list as any).mockImplementation((pid: string) => {
        if (pid === 'proj-1') {
          return new Promise(() => {}) // never resolves
        }
        return Promise.resolve([])
      })

      // Start selecting proj-1 (slow)
      const p1 = useAppStore.getState().selectProject('proj-1' as ProjectId)

      // Immediately switch to proj-2 (fast)
      await useAppStore.getState().selectProject('proj-2' as ProjectId)

      // proj-2 should be active
      expect(useAppStore.getState().currentProjectId).toBe('proj-2')
      expect(useAppStore.getState().conversationList).toEqual([])
    })
  })

  describe('clearProject', () => {
    it('clears all project-related state', async () => {
      await useAppStore.getState().selectProject('proj-1' as ProjectId)
      useAppStore.getState().clearProject()
      const state = useAppStore.getState()
      expect(state.currentProjectId).toBeNull()
      expect(state.conversationList).toEqual([])
      expect(state.currentConversation).toBeNull()
    })
  })

  describe('toggleSidebar', () => {
    it('toggles sidebar collapsed state', () => {
      expect(useAppStore.getState().sidebarCollapsed).toBe(false)
      useAppStore.getState().toggleSidebar()
      expect(useAppStore.getState().sidebarCollapsed).toBe(true)
      useAppStore.getState().toggleSidebar()
      expect(useAppStore.getState().sidebarCollapsed).toBe(false)
    })
  })

  describe('selectConversation', () => {
    it('sets current conversation', async () => {
      // selectConversation requires a project to call getById
      useAppStore.setState({ currentProjectId: 'proj-1' as ProjectId })
      ;(mockServices.conversations.getById as any).mockResolvedValue({
        id: 'conv-1', projectId: 'proj-1', title: 'Chat 1', targetType: 'agent', targetId: 'agent-1',
        messages: [{ id: 'msg-1', role: 'user', parts: [], content: 'hi' }],
        lastMessageAt: '2026-01-01T00:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      })
      await useAppStore.getState().selectConversation('conv-1' as ConversationId)
      expect(useAppStore.getState().currentConversation?.id).toBe('conv-1')
    })

    it('clears conversation when null', async () => {
      useAppStore.setState({ currentConversation: { id: 'conv-1' } as any })
      await useAppStore.getState().selectConversation(null)
      expect(useAppStore.getState().currentConversation).toBeNull()
    })
  })

  describe('deleteConversation', () => {
    it('calls destroyChat and removes conversation', async () => {
      const { destroyChat } = await import('../lib/chat-instances')
      useAppStore.setState({
        currentProjectId: 'proj-1' as ProjectId,
        conversationList: [{ id: 'conv-1' as ConversationId, title: 'Chat 1' } as any],
        currentConversation: { id: 'conv-1' as ConversationId, title: 'Chat 1', messages: [] } as any,
      })
      ;(mockServices.conversations.delete as any).mockResolvedValue(undefined)

      await useAppStore.getState().deleteConversation('conv-1' as ConversationId)

      expect(destroyChat).toHaveBeenCalledWith('conv-1')
      expect(useAppStore.getState().conversationList).toHaveLength(0)
      expect(useAppStore.getState().currentConversation).toBeNull()
    })
  })

  describe('updateConversation', () => {
    beforeEach(async () => {
      const { destroyChat } = await import('../lib/chat-instances')
      vi.mocked(destroyChat).mockClear()
    })

    it('destroys cached chat when target changes', async () => {
      const { destroyChat } = await import('../lib/chat-instances')
      useAppStore.setState({
        currentProjectId: 'proj-1' as ProjectId,
        conversationList: [{ id: 'conv-1' as ConversationId, title: 'Chat 1', targetType: 'agent', targetId: 'agent-1' as AgentId } as any],
      })
      ;(mockServices.conversations.update as any).mockResolvedValue({
        id: 'conv-1',
        title: 'Chat 1',
        targetType: 'team',
        targetId: 'team-1',
      })

      await useAppStore.getState().updateConversation('conv-1' as ConversationId, {
        targetType: 'team',
        targetId: 'team-1' as TeamId,
      })

      expect(destroyChat).toHaveBeenCalledWith('conv-1')
    })

    it('does not destroy cached chat when only the title changes', async () => {
      const { destroyChat } = await import('../lib/chat-instances')
      useAppStore.setState({
        currentProjectId: 'proj-1' as ProjectId,
        conversationList: [{ id: 'conv-1' as ConversationId, title: 'Chat 1', targetType: 'agent', targetId: 'agent-1' as AgentId } as any],
      })
      ;(mockServices.conversations.update as any).mockResolvedValue({
        id: 'conv-1',
        title: 'Renamed',
        targetType: 'agent',
        targetId: 'agent-1',
      })

      await useAppStore.getState().updateConversation('conv-1' as ConversationId, {
        title: 'Renamed',
      })

      expect(destroyChat).not.toHaveBeenCalled()
    })
  })

  describe('chat cleanup on project switch', () => {
    it('selectProject calls releaseIdleChats (keeps streaming chats alive)', async () => {
      const { releaseIdleChats } = await import('../lib/chat-instances')
      await useAppStore.getState().selectProject('proj-1' as ProjectId)
      expect(releaseIdleChats).toHaveBeenCalled()
    })

    it('clearProject calls destroyAllChats', async () => {
      const { destroyAllChats } = await import('../lib/chat-instances')
      useAppStore.getState().clearProject()
      expect(destroyAllChats).toHaveBeenCalled()
    })
  })

  describe('createProject', () => {
    it('creates a project and adds it to the list', async () => {
      const data = { name: 'New', description: 'Desc', icon: 'star' }
      const result = await useAppStore.getState().createProject(data)
      expect(result.id).toBe('proj-new')
      expect(useAppStore.getState().projects).toHaveLength(1)
    })

    it('uses settings.defaultModel directly without fallback', async () => {
      const services = createTestServices()
      const defaultModel = { provider: 'anthropic', model: 'claude-sonnet-4-6' }
      services.settings.get = vi.fn().mockResolvedValue({
        providers: {
          openai: { name: 'OpenAI', sdkType: 'openai', apiKey: 'sk-test', models: ['gpt-4o'], testStatus: 'ok' },
          anthropic: { name: 'Anthropic', sdkType: 'anthropic', apiKey: 'sk-ant', models: ['claude-sonnet-4-6'], testStatus: 'ok' },
        },
        theme: 'dark',
        defaultModel,
      })
      configureServices(services)
      await useAppStore.getState().loadSettings()

      await useAppStore.getState().createProject({ name: 'Test', description: '', icon: '' })
      expect(services.agents.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ modelConfig: defaultModel }),
      )
    })

    it('does not silently fallback to first provider when defaultModel is missing', async () => {
      const services = createTestServices()
      services.settings.get = vi.fn().mockResolvedValue({
        providers: {
          openai: { name: 'OpenAI', sdkType: 'openai', apiKey: 'sk-test', models: ['gpt-4o'], testStatus: 'ok' },
        },
        theme: 'dark',
        // No defaultModel set
      })
      configureServices(services)
      await useAppStore.getState().loadSettings()

      await useAppStore.getState().createProject({ name: 'Test', description: '', icon: '' })
      // Should use empty modelConfig, not silently pick openai
      expect(services.agents.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ modelConfig: { provider: '', model: '' } }),
      )
    })
  })

  describe('deleteProject', () => {
    it('removes the project from the list', async () => {
      await useAppStore.getState().loadProjects()
      expect(useAppStore.getState().projects).toHaveLength(2)
      await useAppStore.getState().deleteProject('proj-1' as ProjectId)
      expect(useAppStore.getState().projects).toHaveLength(1)
    })

    it('clears related state if deleting the current project', async () => {
      await useAppStore.getState().loadProjects()
      await useAppStore.getState().selectProject('proj-1' as ProjectId)
      await useAppStore.getState().deleteProject('proj-1' as ProjectId)
      expect(useAppStore.getState().currentProjectId).toBeNull()
    })
  })

  describe('loadSettings', () => {
    it('loads settings from service', async () => {
      await useAppStore.getState().loadSettings()
      expect(useAppStore.getState().settings).not.toBeNull()
      expect(useAppStore.getState().settings!.theme).toBe('dark')
    })
  })

  describe('theme state', () => {
    it('has dark as default theme mode', () => {
      expect(useAppStore.getState().themeMode).toBe('dark')
    })

    it('setTheme("light") updates themeMode and adds light class to document', () => {
      useAppStore.getState().setTheme('light')
      expect(useAppStore.getState().themeMode).toBe('light')
      expect(document.documentElement.classList.contains('light')).toBe(true)
      expect(document.documentElement.classList.contains('dark')).toBe(false)
    })

    it('setTheme("dark") updates themeMode and adds dark class to document', () => {
      useAppStore.getState().setTheme('dark')
      expect(useAppStore.getState().themeMode).toBe('dark')
      expect(document.documentElement.classList.contains('dark')).toBe(true)
      expect(document.documentElement.classList.contains('light')).toBe(false)
    })

    it('setTheme("system") removes both light and dark classes', () => {
      // First set to light so a class is present
      useAppStore.getState().setTheme('light')
      expect(document.documentElement.classList.contains('light')).toBe(true)

      // Switch to system
      useAppStore.getState().setTheme('system')
      expect(useAppStore.getState().themeMode).toBe('system')
      expect(document.documentElement.classList.contains('light')).toBe(false)
      expect(document.documentElement.classList.contains('dark')).toBe(false)
    })

    it('switching themes replaces the previous class', () => {
      useAppStore.getState().setTheme('light')
      expect(document.documentElement.classList.contains('light')).toBe(true)
      useAppStore.getState().setTheme('dark')
      expect(document.documentElement.classList.contains('dark')).toBe(true)
      expect(document.documentElement.classList.contains('light')).toBe(false)
    })
  })

  describe('dashboard state', () => {
    it('has empty dashboard state initially', () => {
      const state = useAppStore.getState()
      expect(state.dashboardSummary).toBeNull()
      expect(state.dashboardAgentStats).toEqual([])
      expect(state.dashboardRecentChats).toEqual([])
      expect(state.dashboardTokenTrend).toEqual([])
      expect(state.dashboardLoading).toBe(false)
    })

    it('loadDashboard populates all dashboard state', async () => {
      useAppStore.setState({ currentProjectId: 'proj-1' as ProjectId })
      await useAppStore.getState().loadDashboard('proj-1' as ProjectId)
      const state = useAppStore.getState()
      expect(state.dashboardSummary).not.toBeNull()
      expect(state.dashboardLoading).toBe(false)
      expect(mockServices.dashboard.getSummary).toHaveBeenCalledOnce()
      expect(mockServices.dashboard.getAgentStats).toHaveBeenCalledOnce()
      expect(mockServices.dashboard.getRecentChats).toHaveBeenCalledOnce()
      expect(mockServices.dashboard.getTokenTrend).toHaveBeenCalledOnce()
      expect(mockServices.dashboard.getTokenByModel).toHaveBeenCalledOnce()
      expect(mockServices.dashboard.getTokenByAgent).toHaveBeenCalledOnce()
      expect(mockServices.dashboard.getRuntimeStatus).toHaveBeenCalledOnce()
    })

    it('loadDashboard sets loading true then false', async () => {
      useAppStore.setState({ currentProjectId: 'proj-1' as ProjectId })
      const promise = useAppStore.getState().loadDashboard('proj-1' as ProjectId)
      expect(useAppStore.getState().dashboardLoading).toBe(true)
      await promise
      expect(useAppStore.getState().dashboardLoading).toBe(false)
    })
  })

  // cronJob slice tests moved to queries/cron-jobs.test.tsx (TanStack Query migration)
  // deleteAgent cascade tests moved to queries/agents.test.ts (TanStack Query migration)
})
