import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { AgentId, MemoryEntry, MemoryId, ProjectId } from '@golemancy/shared'
import { useMemories, useCreateMemory, useUpdateMemory, useDeleteMemory } from './memories'
import { createTestQueryClient, TestQueryProvider } from '../test/query-wrapper'
import { configureServices } from '../services/container'
import type { ServiceContainer } from '../services/container'
import { useAppStore } from '../stores'

const PROJECT_ID = 'proj-1' as ProjectId
const AGENT_ID = 'agent-1' as AgentId
const MEMORY_ID = 'mem-1' as MemoryId
const now = new Date().toISOString()

const testMemory: MemoryEntry = {
  id: MEMORY_ID,
  agentId: AGENT_ID,
  content: 'Test memory',
  pinned: false,
  priority: 3,
  tags: ['test'],
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
    memories: {
      list: vi.fn().mockResolvedValue([testMemory]),
      create: vi.fn().mockImplementation((_pid, _aid, data) =>
        Promise.resolve({ id: 'mem-new' as MemoryId, agentId: AGENT_ID, ...data, createdAt: now, updatedAt: now }),
      ),
      update: vi.fn().mockImplementation((_pid, _aid, id, data) =>
        Promise.resolve({ ...testMemory, id, ...data }),
      ),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    teams: {} as any,
  }
}

describe('memories query hooks', () => {
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

  describe('useMemories', () => {
    it('returns memory list for agent', async () => {
      const { result } = renderHook(() => useMemories(PROJECT_ID, AGENT_ID), { wrapper })
      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual([testMemory])
      expect(mockServices.memories.list).toHaveBeenCalledWith(PROJECT_ID, AGENT_ID)
    })

    it('does not fetch when projectId is null', () => {
      const { result } = renderHook(() => useMemories(null, AGENT_ID), { wrapper })
      expect(result.current.fetchStatus).toBe('idle')
      expect(mockServices.memories.list).not.toHaveBeenCalled()
    })

    it('does not fetch when agentId is null', () => {
      const { result } = renderHook(() => useMemories(PROJECT_ID, null), { wrapper })
      expect(result.current.fetchStatus).toBe('idle')
      expect(mockServices.memories.list).not.toHaveBeenCalled()
    })
  })

  describe('useCreateMemory', () => {
    it('calls service.create with correct args', async () => {
      const { result } = renderHook(() => useCreateMemory(), { wrapper })
      await act(() => result.current.mutateAsync({ agentId: AGENT_ID, data: { content: 'new memory' } }))
      expect(mockServices.memories.create).toHaveBeenCalledWith(PROJECT_ID, AGENT_ID, { content: 'new memory' })
    })
  })

  describe('useUpdateMemory', () => {
    it('calls service.update with correct args', async () => {
      const { result } = renderHook(() => useUpdateMemory(), { wrapper })
      await act(() => result.current.mutateAsync({ agentId: AGENT_ID, id: MEMORY_ID, data: { pinned: true } }))
      expect(mockServices.memories.update).toHaveBeenCalledWith(PROJECT_ID, AGENT_ID, MEMORY_ID, { pinned: true })
    })
  })

  describe('useDeleteMemory', () => {
    it('calls service.delete with correct args', async () => {
      const { result } = renderHook(() => useDeleteMemory(), { wrapper })
      await act(() => result.current.mutateAsync({ agentId: AGENT_ID, id: MEMORY_ID }))
      expect(mockServices.memories.delete).toHaveBeenCalledWith(PROJECT_ID, AGENT_ID, MEMORY_ID)
    })
  })
})
