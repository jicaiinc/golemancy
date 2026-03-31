import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { Team, TeamId, ProjectId, AgentId } from '@golemancy/shared'
import { useTeams, useCreateTeam, useUpdateTeam, useDeleteTeam, useCloneTeam } from './teams'
import { createTestQueryClient, TestQueryProvider } from '../test/query-wrapper'
import { configureServices } from '../services/container'
import type { ServiceContainer } from '../services/container'
import { useAppStore } from '../stores'

const PROJECT_ID = 'proj-1' as ProjectId
const TEAM_ID = 'team-1' as TeamId
const now = new Date().toISOString()

const testTeam: Team = {
  id: TEAM_ID,
  projectId: PROJECT_ID,
  name: 'Test Team',
  description: 'desc',
  members: [{ agentId: 'agent-1' as AgentId }],
  createdAt: now,
  updatedAt: now,
}

function createMockServices(): ServiceContainer {
  return {
    projects: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), clone: vi.fn() },
    agents: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), clone: vi.fn() },
    conversations: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), sendMessage: vi.fn(), saveMessage: vi.fn(), getMessages: vi.fn(), searchMessages: vi.fn(), delete: vi.fn() },
    tasks: { list: vi.fn(), getById: vi.fn() },
    workspace: { listDir: vi.fn(), readFile: vi.fn(), deleteFile: vi.fn(), getFileUrl: vi.fn() },
    settings: { get: vi.fn(), update: vi.fn(), testProvider: vi.fn() },
    cronJobs: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    skills: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), importZip: vi.fn() },
    mcp: { list: vi.fn(), getByName: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), resolveNames: vi.fn() },
    dashboard: { getSummary: vi.fn(), getAgentStats: vi.fn(), getRecentChats: vi.fn(), getTokenTrend: vi.fn(), getTokenByModel: vi.fn(), getTokenByAgent: vi.fn(), getRuntimeStatus: vi.fn() },
    globalDashboard: { getSummary: vi.fn(), getTokenByModel: vi.fn(), getTokenByAgent: vi.fn(), getTokenByProject: vi.fn(), getTokenTrend: vi.fn(), getRuntimeStatus: vi.fn() },
    permissionsConfig: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), duplicate: vi.fn() },
    speech: {} as any,
    memories: {} as any,
    teams: {
      list: vi.fn().mockResolvedValue([testTeam]),
      getById: vi.fn(),
      create: vi.fn().mockImplementation((_pid, data) =>
        Promise.resolve({ id: 'team-new' as TeamId, ...data, projectId: PROJECT_ID, createdAt: now, updatedAt: now }),
      ),
      update: vi.fn().mockImplementation((_pid, id, data) =>
        Promise.resolve({ ...testTeam, id, ...data }),
      ),
      delete: vi.fn().mockResolvedValue(undefined),
      clone: vi.fn().mockImplementation((_pid, _id, newName) =>
        Promise.resolve({ ...testTeam, id: 'team-cloned' as TeamId, name: newName }),
      ),
      getLayout: vi.fn().mockResolvedValue({}),
      saveLayout: vi.fn(),
    },
  }
}

describe('teams query hooks', () => {
  let mockServices: ServiceContainer
  let queryClient: ReturnType<typeof createTestQueryClient>

  beforeEach(() => {
    mockServices = createMockServices()
    configureServices(mockServices)
    queryClient = createTestQueryClient()
    useAppStore.setState({ currentProjectId: PROJECT_ID, projects: [] })
  })

  function wrapper({ children }: { children: ReactNode }) {
    return <TestQueryProvider client={queryClient}>{children}</TestQueryProvider>
  }

  describe('useTeams', () => {
    it('returns team list for a project', async () => {
      const { result } = renderHook(() => useTeams(PROJECT_ID), { wrapper })
      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual([testTeam])
      expect(mockServices.teams.list).toHaveBeenCalledWith(PROJECT_ID)
    })

    it('does not fetch when projectId is null', () => {
      const { result } = renderHook(() => useTeams(null), { wrapper })
      expect(result.current.fetchStatus).toBe('idle')
      expect(mockServices.teams.list).not.toHaveBeenCalled()
    })
  })

  describe('useCreateTeam', () => {
    it('calls service.create and invalidates cache', async () => {
      const { result } = renderHook(() => useCreateTeam(), { wrapper })
      await act(() => result.current.mutateAsync({ name: 'New', description: '', instruction: '', members: [] }))
      expect(mockServices.teams.create).toHaveBeenCalledWith(PROJECT_ID, { name: 'New', description: '', instruction: '', members: [] })
    })
  })

  describe('useDeleteTeam', () => {
    it('clears defaultTargetId when deleted team is project default', async () => {
      const mockUpdateProject = vi.fn()
      useAppStore.setState({
        currentProjectId: PROJECT_ID,
        projects: [{
          id: PROJECT_ID, name: 'P', description: '', icon: '', config: {},
          agentCount: 0, activeAgentCount: 0, lastActivityAt: now, createdAt: now, updatedAt: now,
          defaultTargetType: 'team', defaultTargetId: TEAM_ID,
        }],
        updateProject: mockUpdateProject,
      } as any)

      const { result } = renderHook(() => useDeleteTeam(), { wrapper })
      await act(() => result.current.mutateAsync(TEAM_ID))

      expect(mockUpdateProject).toHaveBeenCalledWith(PROJECT_ID, {
        defaultTargetType: undefined,
        defaultTargetId: undefined,
      })
    })
  })

  describe('useCloneTeam', () => {
    it('calls service.clone', async () => {
      const { result } = renderHook(() => useCloneTeam(), { wrapper })
      await act(() => result.current.mutateAsync({ id: TEAM_ID, newName: 'Cloned' }))
      expect(mockServices.teams.clone).toHaveBeenCalledWith(PROJECT_ID, TEAM_ID, 'Cloned')
    })
  })
})
