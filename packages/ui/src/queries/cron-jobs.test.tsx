import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { AgentId, CronJob, CronJobId, ProjectId } from '@golemancy/shared'
import { useCronJobs, useCreateCronJob, useUpdateCronJob, useDeleteCronJob, useTriggerCronJob } from './cron-jobs'
import { createTestQueryClient, TestQueryProvider } from '../test/query-wrapper'
import { configureServices } from '../services/container'
import type { ServiceContainer } from '../services/container'
import { useAppStore } from '../stores'

const PROJECT_ID = 'proj-1' as ProjectId
const CRON_ID = 'cron-1' as CronJobId
const now = new Date().toISOString()

const testCronJob: CronJob = {
  id: CRON_ID,
  projectId: PROJECT_ID,
  targetType: 'agent',
  targetId: 'agent-1' as AgentId,
  name: 'Daily Job',
  cronExpression: '0 9 * * *',
  enabled: true,
  scheduleType: 'cron',
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
    cronJobs: {
      list: vi.fn().mockResolvedValue([testCronJob]),
      getById: vi.fn(),
      create: vi.fn().mockImplementation((_pid, data) =>
        Promise.resolve({ id: 'cron-new' as CronJobId, projectId: PROJECT_ID, ...data, createdAt: now, updatedAt: now }),
      ),
      update: vi.fn().mockImplementation((_pid, id, data) =>
        Promise.resolve({ ...testCronJob, id, ...data }),
      ),
      delete: vi.fn().mockResolvedValue(undefined),
      trigger: vi.fn().mockResolvedValue(undefined),
    },
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

describe('cron-jobs query hooks', () => {
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

  describe('useCronJobs', () => {
    it('returns cron job list for project', async () => {
      const { result } = renderHook(() => useCronJobs(PROJECT_ID), { wrapper })
      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual([testCronJob])
      expect(mockServices.cronJobs.list).toHaveBeenCalledWith(PROJECT_ID)
    })

    it('does not fetch when projectId is null', () => {
      const { result } = renderHook(() => useCronJobs(null), { wrapper })
      expect(result.current.fetchStatus).toBe('idle')
      expect(mockServices.cronJobs.list).not.toHaveBeenCalled()
    })
  })

  describe('useCreateCronJob', () => {
    it('calls service.create with correct args', async () => {
      const { result } = renderHook(() => useCreateCronJob(), { wrapper })
      await act(() => result.current.mutateAsync({
        targetType: 'agent',
        targetId: 'agent-1' as AgentId,
        name: 'New Job',
        cronExpression: '0 * * * *',
        enabled: true,
        scheduleType: 'cron',
      }))
      expect(mockServices.cronJobs.create).toHaveBeenCalledWith(PROJECT_ID, expect.objectContaining({ name: 'New Job' }))
    })
  })

  describe('useUpdateCronJob', () => {
    it('calls service.update with correct args', async () => {
      const { result } = renderHook(() => useUpdateCronJob(), { wrapper })
      await act(() => result.current.mutateAsync({ id: CRON_ID, data: { enabled: false } }))
      expect(mockServices.cronJobs.update).toHaveBeenCalledWith(PROJECT_ID, CRON_ID, { enabled: false })
    })
  })

  describe('useDeleteCronJob', () => {
    it('calls service.delete with correct args', async () => {
      const { result } = renderHook(() => useDeleteCronJob(), { wrapper })
      await act(() => result.current.mutateAsync(CRON_ID))
      expect(mockServices.cronJobs.delete).toHaveBeenCalledWith(PROJECT_ID, CRON_ID)
    })
  })

  describe('useTriggerCronJob', () => {
    it('calls service.trigger with correct args', async () => {
      const { result } = renderHook(() => useTriggerCronJob(), { wrapper })
      await act(() => result.current.mutateAsync(CRON_ID))
      expect(mockServices.cronJobs.trigger).toHaveBeenCalledWith(PROJECT_ID, CRON_ID)
    })
  })
})
