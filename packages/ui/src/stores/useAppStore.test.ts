import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAppStore } from './useAppStore'
import { configureServices } from '../services/container'
import type { ServiceContainer } from '../services/container'
import type { ProjectId, AgentId, ConversationId } from '@solocraft/shared'

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
      sendMessage: vi.fn(),
      delete: vi.fn(),
    },
    tasks: {
      list: vi.fn().mockResolvedValue([
        { id: 'task-1', title: 'Task 1' },
      ]),
      getById: vi.fn(),
      cancel: vi.fn(),
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
      }),
      update: vi.fn().mockImplementation((data) =>
        Promise.resolve({ ...data }),
      ),
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
      tasks: [],
      tasksLoading: false,
      settings: null,
      sidebarCollapsed: false,
    })
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
      expect(state.tasks).toHaveLength(1)
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
      expect(state.tasks).toEqual([])
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
    it('sets current conversation id', () => {
      useAppStore.getState().selectConversation('conv-1' as ConversationId)
      expect(useAppStore.getState().currentConversationId).toBe('conv-1')
    })

    it('clears conversation when null', () => {
      useAppStore.getState().selectConversation('conv-1' as ConversationId)
      useAppStore.getState().selectConversation(null)
      expect(useAppStore.getState().currentConversationId).toBeNull()
    })
  })

  describe('createProject', () => {
    it('creates a project and adds it to the list', async () => {
      const data = { name: 'New', description: 'Desc', icon: 'star' }
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
})
