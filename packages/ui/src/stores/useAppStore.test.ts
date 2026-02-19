import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAppStore } from './useAppStore'
import { configureServices } from '../services/container'
import type { ServiceContainer } from '../services/container'
import type { ProjectId, AgentId, ConversationId, CronJobId } from '@golemancy/shared'

// Mock chat-instances to verify store calls destroyChat/destroyAllChats
vi.mock('../lib/chat-instances', () => ({
  destroyChat: vi.fn(),
  destroyAllChats: vi.fn(),
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
    artifacts: {
      list: vi.fn().mockResolvedValue([]),
      getById: vi.fn(),
      delete: vi.fn(),
    },
    memory: {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    settings: {
      get: vi.fn().mockResolvedValue({
        providers: [{ provider: 'openai', apiKey: 'test', defaultModel: 'gpt-4o' }],
        defaultProvider: 'openai',
        theme: 'dark',
        userProfile: { name: 'Test', email: 'test@test.com' },
        defaultWorkingDirectoryBase: '~/projects',
      }),
      update: vi.fn().mockImplementation((data) =>
        Promise.resolve({ ...data }),
      ),
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
        todayTokens: { total: 0, input: 0, output: 0 }, totalAgents: 0, activeChats: 0, totalChats: 0,
      }),
      getAgentStats: vi.fn().mockResolvedValue([]),
      getRecentChats: vi.fn().mockResolvedValue([]),
      getTokenTrend: vi.fn().mockResolvedValue([]),
    },
    permissionsConfig: {
      list: vi.fn().mockResolvedValue([]),
      getById: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      duplicate: vi.fn(),
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
      agents: [],
      agentsLoading: false,
      conversations: [],
      currentConversationId: null,
      conversationsLoading: false,
      conversationTasks: [],
      tasksLoading: false,
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
    it('loads agents, conversations, and tasks for the project', async () => {
      await useAppStore.getState().selectProject('proj-1' as ProjectId)
      const state = useAppStore.getState()
      expect(state.currentProjectId).toBe('proj-1')
      expect(state.agents).toHaveLength(1)
      expect(state.conversations).toHaveLength(1)
      expect(state.conversationTasks).toHaveLength(1)
      expect(mockServices.agents.list).toHaveBeenCalledWith('proj-1')
      expect(mockServices.conversations.list).toHaveBeenCalledWith('proj-1')
      expect(mockServices.tasks.list).toHaveBeenCalledWith('proj-1')
    })

    it('does not reload if same project is selected', async () => {
      await useAppStore.getState().selectProject('proj-1' as ProjectId)
      await useAppStore.getState().selectProject('proj-1' as ProjectId)
      // Second call should be a no-op since project is already selected
      expect(mockServices.agents.list).toHaveBeenCalledTimes(1)
    })

    it('clears previous project data when switching', async () => {
      await useAppStore.getState().selectProject('proj-1' as ProjectId)
      expect(useAppStore.getState().agents).toHaveLength(1)

      // Mock new data for project 2
      ;(mockServices.agents.list as any).mockResolvedValue([])
      ;(mockServices.conversations.list as any).mockResolvedValue([])
      ;(mockServices.tasks.list as any).mockResolvedValue([])

      await useAppStore.getState().selectProject('proj-2' as ProjectId)
      const state = useAppStore.getState()
      expect(state.currentProjectId).toBe('proj-2')
      expect(state.agents).toHaveLength(0)
    })

    it('guards against race condition when switching projects rapidly', async () => {
      // Make agents.list slow for proj-1
      let resolveProj1: any
      ;(mockServices.agents.list as any).mockImplementation((pid: string) => {
        if (pid === 'proj-1') {
          return new Promise(resolve => { resolveProj1 = resolve })
        }
        return Promise.resolve([{ id: 'agent-99', name: 'Fast Agent' }])
      })
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
      expect(useAppStore.getState().agents).toEqual([{ id: 'agent-99', name: 'Fast Agent' }])
    })
  })

  describe('clearProject', () => {
    it('clears all project-related state', async () => {
      await useAppStore.getState().selectProject('proj-1' as ProjectId)
      useAppStore.getState().clearProject()
      const state = useAppStore.getState()
      expect(state.currentProjectId).toBeNull()
      expect(state.agents).toEqual([])
      expect(state.conversations).toEqual([])
      expect(state.conversationTasks).toEqual([])
      expect(state.currentConversationId).toBeNull()
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
    it('sets current conversation id', async () => {
      await useAppStore.getState().selectConversation('conv-1' as ConversationId)
      expect(useAppStore.getState().currentConversationId).toBe('conv-1')
    })

    it('clears conversation when null', async () => {
      await useAppStore.getState().selectConversation('conv-1' as ConversationId)
      await useAppStore.getState().selectConversation(null)
      expect(useAppStore.getState().currentConversationId).toBeNull()
    })
  })

  describe('deleteConversation', () => {
    it('calls destroyChat and removes conversation', async () => {
      const { destroyChat } = await import('../lib/chat-instances')
      useAppStore.setState({
        currentProjectId: 'proj-1' as ProjectId,
        conversations: [{ id: 'conv-1' as ConversationId, title: 'Chat 1' } as any],
        currentConversationId: 'conv-1' as ConversationId,
      })
      ;(mockServices.conversations.delete as any).mockResolvedValue(undefined)

      await useAppStore.getState().deleteConversation('conv-1' as ConversationId)

      expect(destroyChat).toHaveBeenCalledWith('conv-1')
      expect(useAppStore.getState().conversations).toHaveLength(0)
      expect(useAppStore.getState().currentConversationId).toBeNull()
    })
  })

  describe('chat cleanup on project switch', () => {
    it('selectProject calls destroyAllChats', async () => {
      const { destroyAllChats } = await import('../lib/chat-instances')
      await useAppStore.getState().selectProject('proj-1' as ProjectId)
      expect(destroyAllChats).toHaveBeenCalled()
    })

    it('clearProject calls destroyAllChats', async () => {
      const { destroyAllChats } = await import('../lib/chat-instances')
      useAppStore.getState().clearProject()
      expect(destroyAllChats).toHaveBeenCalled()
    })
  })

  describe('createProject', () => {
    it('creates a project and adds it to the list', async () => {
      const data = { name: 'New', description: 'Desc', icon: 'star', workingDirectory: '~/projects/new' }
      const result = await useAppStore.getState().createProject(data)
      expect(result.id).toBe('proj-new')
      expect(useAppStore.getState().projects).toHaveLength(1)
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
      expect(useAppStore.getState().settings!.defaultProvider).toBe('openai')
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
      await useAppStore.getState().loadDashboard('proj-1' as ProjectId)
      const state = useAppStore.getState()
      expect(state.dashboardSummary).not.toBeNull()
      expect(state.dashboardLoading).toBe(false)
      expect(mockServices.dashboard.getSummary).toHaveBeenCalledOnce()
      expect(mockServices.dashboard.getAgentStats).toHaveBeenCalledOnce()
      expect(mockServices.dashboard.getRecentChats).toHaveBeenCalledOnce()
      expect(mockServices.dashboard.getTokenTrend).toHaveBeenCalledOnce()
    })

    it('loadDashboard sets loading true then false', async () => {
      const promise = useAppStore.getState().loadDashboard('proj-1' as ProjectId)
      expect(useAppStore.getState().dashboardLoading).toBe(true)
      await promise
      expect(useAppStore.getState().dashboardLoading).toBe(false)
    })
  })

  describe('createProject with workingDirectory', () => {
    it('passes workingDirectory through to the service', async () => {
      const data = {
        name: 'Test Project',
        description: 'Testing workDir',
        icon: 'star',
        workingDirectory: '~/custom/path',
      }
      await useAppStore.getState().createProject(data)
      expect(mockServices.projects.create).toHaveBeenCalledWith(data)
    })
  })

  describe('cronJob slice', () => {
    beforeEach(() => {
      useAppStore.setState({
        currentProjectId: 'proj-1' as ProjectId,
        cronJobs: [],
        cronJobsLoading: false,
      })
    })

    it('has empty cronJobs initially', () => {
      expect(useAppStore.getState().cronJobs).toEqual([])
      expect(useAppStore.getState().cronJobsLoading).toBe(false)
    })

    it('loadCronJobs fetches from service', async () => {
      const mockJobs = [
        { id: 'cron-1' as CronJobId, name: 'Daily Job' },
        { id: 'cron-2' as CronJobId, name: 'Weekly Job' },
      ]
      ;(mockServices.cronJobs.list as any).mockResolvedValue(mockJobs)
      await useAppStore.getState().loadCronJobs('proj-1' as ProjectId)
      expect(useAppStore.getState().cronJobs).toEqual(mockJobs)
      expect(useAppStore.getState().cronJobsLoading).toBe(false)
      expect(mockServices.cronJobs.list).toHaveBeenCalledWith('proj-1')
    })

    it('loadCronJobs sets loading state', async () => {
      ;(mockServices.cronJobs.list as any).mockResolvedValue([])
      const promise = useAppStore.getState().loadCronJobs('proj-1' as ProjectId)
      expect(useAppStore.getState().cronJobsLoading).toBe(true)
      await promise
      expect(useAppStore.getState().cronJobsLoading).toBe(false)
    })

    it('createCronJob adds to list', async () => {
      const newJob = { id: 'cron-new' as CronJobId, name: 'New Job', agentId: 'agent-1' as AgentId }
      ;(mockServices.cronJobs.create as any).mockResolvedValue(newJob)
      const result = await useAppStore.getState().createCronJob({
        agentId: 'agent-1' as AgentId,
        name: 'New Job',
        description: 'Test',
        cronExpression: '0 * * * *',
        enabled: true,
      })
      expect(result).toEqual(newJob)
      expect(useAppStore.getState().cronJobs).toHaveLength(1)
      expect(useAppStore.getState().cronJobs[0].id).toBe('cron-new')
    })

    it('createCronJob throws if no project selected', async () => {
      useAppStore.setState({ currentProjectId: null })
      await expect(
        useAppStore.getState().createCronJob({
          agentId: 'agent-1' as AgentId,
          name: 'Job',
          description: '',
          cronExpression: '0 * * * *',
          enabled: true,
        }),
      ).rejects.toThrow('No project selected')
    })

    it('updateCronJob updates in list', async () => {
      useAppStore.setState({
        cronJobs: [
          { id: 'cron-1' as CronJobId, name: 'Old Name', enabled: true } as any,
        ],
      })
      const updated = { id: 'cron-1' as CronJobId, name: 'New Name', enabled: false }
      ;(mockServices.cronJobs.update as any).mockResolvedValue(updated)
      await useAppStore.getState().updateCronJob('cron-1' as CronJobId, { name: 'New Name', enabled: false })
      expect(useAppStore.getState().cronJobs[0].name).toBe('New Name')
    })

    it('deleteCronJob removes from list', async () => {
      useAppStore.setState({
        cronJobs: [
          { id: 'cron-1' as CronJobId, name: 'Job 1' } as any,
          { id: 'cron-2' as CronJobId, name: 'Job 2' } as any,
        ],
      })
      ;(mockServices.cronJobs.delete as any).mockResolvedValue(undefined)
      await useAppStore.getState().deleteCronJob('cron-1' as CronJobId)
      expect(useAppStore.getState().cronJobs).toHaveLength(1)
      expect(useAppStore.getState().cronJobs[0].id).toBe('cron-2')
    })

    it('selectProject loads cronJobs along with other data', async () => {
      useAppStore.setState({ currentProjectId: null })
      const mockJobs = [{ id: 'cron-x' as CronJobId, name: 'X' }]
      ;(mockServices.cronJobs.list as any).mockResolvedValue(mockJobs)
      await useAppStore.getState().selectProject('proj-1' as ProjectId)
      expect(useAppStore.getState().cronJobs).toEqual(mockJobs)
      expect(mockServices.cronJobs.list).toHaveBeenCalledWith('proj-1')
    })

    it('clearProject clears cronJobs', async () => {
      useAppStore.setState({ cronJobs: [{ id: 'cron-1' } as any] })
      useAppStore.getState().clearProject()
      expect(useAppStore.getState().cronJobs).toEqual([])
    })

    it('deleteProject clears cronJobs when deleting current project', async () => {
      await useAppStore.getState().loadProjects()
      await useAppStore.getState().selectProject('proj-1' as ProjectId)
      useAppStore.setState({ cronJobs: [{ id: 'cron-1' } as any] })
      await useAppStore.getState().deleteProject('proj-1' as ProjectId)
      expect(useAppStore.getState().cronJobs).toEqual([])
    })
  })

  describe('deleteAgent cascades mainAgentId', () => {
    it('clears mainAgentId when deleting the main agent', async () => {
      // Set up: project with mainAgentId = agent-1
      useAppStore.setState({
        currentProjectId: 'proj-1' as ProjectId,
        projects: [
          { id: 'proj-1' as ProjectId, name: 'Test', mainAgentId: 'agent-1' as AgentId } as any,
        ],
        agents: [
          { id: 'agent-1' as AgentId, name: 'Agent A' } as any,
        ],
      })
      ;(mockServices.agents.delete as any).mockResolvedValue(undefined)
      ;(mockServices.projects.update as any).mockImplementation((id: string, data: any) =>
        Promise.resolve({ id, ...data, mainAgentId: undefined }),
      )

      await useAppStore.getState().deleteAgent('agent-1' as AgentId)

      // Agent should be removed
      expect(useAppStore.getState().agents).toHaveLength(0)
      // updateProject should have been called to clear mainAgentId
      expect(mockServices.projects.update).toHaveBeenCalledWith('proj-1', { mainAgentId: undefined })
    })

    it('does not clear mainAgentId when deleting a non-main agent', async () => {
      useAppStore.setState({
        currentProjectId: 'proj-1' as ProjectId,
        projects: [
          { id: 'proj-1' as ProjectId, name: 'Test', mainAgentId: 'agent-1' as AgentId } as any,
        ],
        agents: [
          { id: 'agent-1' as AgentId, name: 'Agent A' } as any,
          { id: 'agent-2' as AgentId, name: 'Agent B' } as any,
        ],
      })
      ;(mockServices.agents.delete as any).mockResolvedValue(undefined)

      await useAppStore.getState().deleteAgent('agent-2' as AgentId)

      expect(useAppStore.getState().agents).toHaveLength(1)
      // updateProject should NOT have been called
      expect(mockServices.projects.update).not.toHaveBeenCalled()
    })
  })
})
