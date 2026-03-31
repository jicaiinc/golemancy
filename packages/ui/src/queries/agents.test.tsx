import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { Agent, AgentId, ProjectId } from '@golemancy/shared'
import { useAgents, useCreateAgent, useUpdateAgent, useDeleteAgent, useCloneAgent } from './agents'
import { createTestQueryClient, TestQueryProvider } from '../test/query-wrapper'
import { configureServices } from '../services/container'
import type { ServiceContainer } from '../services/container'
import { useAppStore } from '../stores'

const PROJECT_ID = 'proj-1' as ProjectId
const AGENT_ID = 'agent-1' as AgentId
const now = new Date().toISOString()

const testAgent: Agent = {
  id: AGENT_ID,
  projectId: PROJECT_ID,
  name: 'Test Agent',
  description: 'desc',
  status: 'idle',
  systemPrompt: '',
  modelConfig: { provider: 'openai', model: 'gpt-4o' },
  skillIds: [],
  tools: [],
  mcpServers: [],
  builtinTools: {},
  createdAt: now,
  updatedAt: now,
}

function createMockServices(): ServiceContainer {
  return {
    projects: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), clone: vi.fn() },
    agents: {
      list: vi.fn().mockResolvedValue([testAgent]),
      getById: vi.fn(),
      create: vi.fn().mockImplementation((_pid, data) =>
        Promise.resolve({ id: 'agent-new' as AgentId, ...data, projectId: PROJECT_ID, status: 'idle', skillIds: [], tools: [], mcpServers: [], builtinTools: {}, createdAt: now, updatedAt: now }),
      ),
      update: vi.fn().mockImplementation((_pid, id, data) =>
        Promise.resolve({ ...testAgent, id, ...data }),
      ),
      delete: vi.fn().mockResolvedValue(undefined),
      clone: vi.fn().mockImplementation((_pid, _id, newName) =>
        Promise.resolve({ ...testAgent, id: 'agent-cloned' as AgentId, name: newName }),
      ),
    },
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
    teams: {} as any,
  }
}

describe('agents query hooks', () => {
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

  describe('useAgents', () => {
    it('returns agent list for a project', async () => {
      const { result } = renderHook(() => useAgents(PROJECT_ID), { wrapper })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(result.current.data).toEqual([testAgent])
      expect(mockServices.agents.list).toHaveBeenCalledWith(PROJECT_ID)
    })

    it('does not fetch when projectId is null', async () => {
      const { result } = renderHook(() => useAgents(null), { wrapper })

      // Should stay in pending state since query is disabled
      expect(result.current.fetchStatus).toBe('idle')
      expect(result.current.data).toBeUndefined()
      expect(mockServices.agents.list).not.toHaveBeenCalled()
    })
  })

  describe('useCreateAgent', () => {
    it('calls service.create and invalidates cache', async () => {
      const { result } = renderHook(() => useCreateAgent(), { wrapper })
      const newAgentData = { name: 'New', description: 'new desc', systemPrompt: '', modelConfig: { provider: 'openai', model: 'gpt-4o' } }

      await act(() => result.current.mutateAsync(newAgentData))

      expect(mockServices.agents.create).toHaveBeenCalledWith(PROJECT_ID, newAgentData)
    })
  })

  describe('useUpdateAgent', () => {
    it('calls service.update and invalidates cache', async () => {
      const { result } = renderHook(() => useUpdateAgent(), { wrapper })

      await act(() => result.current.mutateAsync({ id: AGENT_ID, data: { name: 'Updated' } }))

      expect(mockServices.agents.update).toHaveBeenCalledWith(PROJECT_ID, AGENT_ID, { name: 'Updated' })
    })
  })

  describe('useDeleteAgent', () => {
    it('calls service.delete and invalidates cache', async () => {
      const { result } = renderHook(() => useDeleteAgent(), { wrapper })

      await act(() => result.current.mutateAsync(AGENT_ID))

      expect(mockServices.agents.delete).toHaveBeenCalledWith(PROJECT_ID, AGENT_ID)
    })

    it('clears defaultTargetId when deleted agent is project default', async () => {
      const mockUpdateProject = vi.fn()
      useAppStore.setState({
        currentProjectId: PROJECT_ID,
        projects: [{
          id: PROJECT_ID,
          name: 'P',
          description: '',
          icon: '',
          config: {},
          agentCount: 1,
          activeAgentCount: 0,
          lastActivityAt: now,
          createdAt: now,
          updatedAt: now,
          defaultTargetType: 'agent',
          defaultTargetId: AGENT_ID,
        }],
        updateProject: mockUpdateProject,
      } as any)

      const { result } = renderHook(() => useDeleteAgent(), { wrapper })

      await act(() => result.current.mutateAsync(AGENT_ID))

      expect(mockUpdateProject).toHaveBeenCalledWith(PROJECT_ID, {
        defaultTargetType: undefined,
        defaultTargetId: undefined,
      })
    })

    it('does not clear defaultTargetId when deleted agent is not project default', async () => {
      const mockUpdateProject = vi.fn()
      useAppStore.setState({
        currentProjectId: PROJECT_ID,
        projects: [{
          id: PROJECT_ID,
          name: 'P',
          description: '',
          icon: '',
          config: {},
          agentCount: 1,
          activeAgentCount: 0,
          lastActivityAt: now,
          createdAt: now,
          updatedAt: now,
          defaultTargetType: 'agent',
          defaultTargetId: 'agent-other' as AgentId,
        }],
        updateProject: mockUpdateProject,
      } as any)

      const { result } = renderHook(() => useDeleteAgent(), { wrapper })

      await act(() => result.current.mutateAsync(AGENT_ID))

      expect(mockUpdateProject).not.toHaveBeenCalled()
    })
  })

  describe('useCloneAgent', () => {
    it('calls service.clone and invalidates cache', async () => {
      const { result } = renderHook(() => useCloneAgent(), { wrapper })

      await act(() => result.current.mutateAsync({ id: AGENT_ID, newName: 'Cloned' }))

      expect(mockServices.agents.clone).toHaveBeenCalledWith(PROJECT_ID, AGENT_ID, 'Cloned')
    })
  })
})
