import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { ConversationTask, ProjectId, ConversationId, TaskId } from '@golemancy/shared'
import { useConversationTasks, useRefreshConversationTasks } from './conversation-tasks'
import { createTestQueryClient, TestQueryProvider } from '../test/query-wrapper'
import { configureServices } from '../services/container'
import type { ServiceContainer } from '../services/container'
import { useAppStore } from '../stores'

const PROJECT_ID = 'proj-1' as ProjectId
const now = new Date().toISOString()

const testTask: ConversationTask = {
  id: 'task-1' as TaskId,
  conversationId: 'conv-1' as ConversationId,
  subject: 'Test task',
  description: '',
  status: 'pending',
  blocks: [],
  blockedBy: [],
  createdAt: now,
  updatedAt: now,
}

function createMockServices(): ServiceContainer {
  return {
    projects: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), clone: vi.fn() },
    agents: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), clone: vi.fn() },
    conversations: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), sendMessage: vi.fn(), saveMessage: vi.fn(), getMessages: vi.fn(), searchMessages: vi.fn(), delete: vi.fn() },
    tasks: {
      list: vi.fn().mockResolvedValue([testTask]),
      getById: vi.fn(),
    },
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

describe('conversation-tasks query hooks', () => {
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

  describe('useConversationTasks', () => {
    it('returns task list for project', async () => {
      const { result } = renderHook(() => useConversationTasks(PROJECT_ID), { wrapper })
      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual([testTask])
      expect(mockServices.tasks.list).toHaveBeenCalledWith(PROJECT_ID)
    })

    it('does not fetch when projectId is null', () => {
      const { result } = renderHook(() => useConversationTasks(null), { wrapper })
      expect(result.current.fetchStatus).toBe('idle')
      expect(mockServices.tasks.list).not.toHaveBeenCalled()
    })
  })

  describe('useRefreshConversationTasks', () => {
    it('returns a function', () => {
      const { result } = renderHook(() => useRefreshConversationTasks(), { wrapper })
      expect(typeof result.current).toBe('function')
    })
  })
})
