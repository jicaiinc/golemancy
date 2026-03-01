import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { CronJob, CronJobId, CronJobRun, ProjectId, AgentId, ConversationId } from '@golemancy/shared'
import { CronJobExecutor, type ExecutorDeps } from './executor'

// Mock heavy dependencies that executor imports
vi.mock('../agent/model', () => ({
  resolveModel: vi.fn().mockResolvedValue({ id: 'mock-model' }),
}))

vi.mock('../agent/tools', () => ({
  loadAgentTools: vi.fn().mockResolvedValue({
    tools: {},
    instructions: '',
    cleanup: vi.fn(),
  }),
}))

vi.mock('ai', () => {
  const mockStream = {
    toUIMessageStream: vi.fn().mockImplementation(({ onFinish }) => {
      // Simulate onFinish callback with a response message
      onFinish?.({
        responseMessage: {
          id: 'msg-resp',
          parts: [{ type: 'text', text: 'Test response' }],
        },
      })
      return {
        getReader: () => ({
          read: vi.fn().mockResolvedValueOnce({ done: false, value: null }).mockResolvedValueOnce({ done: true }),
        }),
      }
    }),
    totalUsage: Promise.resolve({ inputTokens: 100, outputTokens: 50 }),
    usage: Promise.resolve({ totalTokens: 150 }),
    text: Promise.resolve('Test response'),
  }

  return {
    streamText: vi.fn().mockReturnValue(mockStream),
    stepCountIs: vi.fn().mockReturnValue(10),
    convertToModelMessages: vi.fn().mockResolvedValue([]),
  }
})

vi.mock('../utils/ids', () => ({
  generateId: vi.fn().mockImplementation((prefix: string) => `${prefix}-test-${Date.now()}`),
}))

const projId = 'proj-1' as ProjectId
const agentId = 'agent-1' as AgentId
const cronJobId = 'cron-1' as CronJobId

function makeCronJob(overrides: Partial<CronJob> = {}): CronJob {
  return {
    id: cronJobId,
    projectId: projId,
    agentId,
    name: 'Test Cron Job',
    cronExpression: '*/5 * * * *',
    enabled: true,
    scheduleType: 'cron',
    instruction: 'Do the work',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

function createMockDeps(overrides: Partial<ExecutorDeps> = {}): ExecutorDeps {
  return {
    agentStorage: {
      getById: vi.fn().mockResolvedValue({
        id: agentId,
        name: 'Test Agent',
        systemPrompt: 'You are a test agent',
        modelConfig: { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
        subAgents: [],
        status: 'idle',
      }),
      list: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue(undefined),
      create: vi.fn(),
      delete: vi.fn(),
    },
    conversationStorage: {
      create: vi.fn().mockResolvedValue({ id: 'conv-test' as ConversationId }),
      saveMessage: vi.fn().mockResolvedValue(undefined),
      list: vi.fn(),
      getById: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      listMessages: vi.fn(),
      deleteMessage: vi.fn(),
      search: vi.fn(),
    },
    settingsStorage: {
      get: vi.fn().mockResolvedValue({}),
      update: vi.fn(),
    },
    mcpStorage: {
      list: vi.fn().mockResolvedValue([]),
      getById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    permissionsConfigStorage: {
      list: vi.fn().mockResolvedValue([]),
      getById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    cronJobRunStorage: {
      create: vi.fn().mockResolvedValue({
        id: 'run-1',
        cronJobId,
        projectId: projId,
        agentId,
        status: 'running',
        triggeredBy: 'schedule',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } satisfies CronJobRun),
      updateStatus: vi.fn().mockResolvedValue(undefined),
    } as unknown as ExecutorDeps['cronJobRunStorage'],
    cronJobStorage: {
      updateRunMeta: vi.fn().mockResolvedValue(undefined),
    } as unknown as ExecutorDeps['cronJobStorage'],
    taskStorage: {} as unknown as ExecutorDeps['taskStorage'],
    projectStorage: {
      getById: vi.fn().mockResolvedValue({ id: projId, name: 'Test', config: {} }),
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    tokenRecordStorage: {
      save: vi.fn().mockReturnValue('tkr-1'),
    } as unknown as ExecutorDeps['tokenRecordStorage'],
    wsManager: {
      emit: vi.fn(),
    } as unknown as ExecutorDeps['wsManager'],
    activeChatRegistry: {
      countByAgent: vi.fn().mockReturnValue(0),
    } as unknown as ExecutorDeps['activeChatRegistry'],
    ...overrides,
  }
}

describe('CronJobExecutor', () => {
  let deps: ExecutorDeps
  let executor: CronJobExecutor

  beforeEach(() => {
    vi.clearAllMocks()
    deps = createMockDeps()
    executor = new CronJobExecutor(deps)
  })

  describe('execute — happy path', () => {
    it('creates a run record, executes, and returns success', async () => {
      const job = makeCronJob()
      const result = await executor.execute(job, 'schedule')

      expect(result.status).toBe('success')
      expect(result.durationMs).toBeGreaterThanOrEqual(0)
      expect(result.conversationId).toBe('conv-test')
    })

    it('creates a CronJobRun record first', async () => {
      const job = makeCronJob()
      await executor.execute(job, 'schedule')

      expect(deps.cronJobRunStorage.create).toHaveBeenCalledWith(projId, {
        cronJobId: job.id,
        projectId: projId,
        agentId,
        status: 'running',
        triggeredBy: 'schedule',
      })
    })

    it('marks cron job as running immediately', async () => {
      const job = makeCronJob()
      await executor.execute(job, 'schedule')

      expect(deps.cronJobStorage.updateRunMeta).toHaveBeenCalledWith(
        projId,
        job.id,
        expect.objectContaining({
          lastRunStatus: 'running',
          lastRunId: 'run-1',
        }),
      )
    })

    it('creates a conversation for the cron execution', async () => {
      const job = makeCronJob()
      await executor.execute(job, 'schedule')

      expect(deps.conversationStorage.create).toHaveBeenCalledWith(
        projId,
        agentId,
        expect.stringContaining('[Cron] Test Cron Job'),
      )
    })

    it('saves user message with instruction', async () => {
      const job = makeCronJob({ instruction: 'Build the report' })
      await executor.execute(job, 'schedule')

      expect(deps.conversationStorage.saveMessage).toHaveBeenCalledWith(
        projId,
        'conv-test',
        expect.objectContaining({
          role: 'user',
          content: 'Build the report',
        }),
      )
    })

    it('uses default instruction when none provided', async () => {
      const job = makeCronJob({ instruction: undefined })
      await executor.execute(job, 'schedule')

      expect(deps.conversationStorage.saveMessage).toHaveBeenCalledWith(
        projId,
        'conv-test',
        expect.objectContaining({
          role: 'user',
          content: expect.stringContaining('Scheduled'),
        }),
      )
    })

    it('saves assistant response after stream consumption', async () => {
      const job = makeCronJob()
      await executor.execute(job, 'schedule')

      // Second call to saveMessage should be assistant
      const calls = (deps.conversationStorage.saveMessage as ReturnType<typeof vi.fn>).mock.calls
      expect(calls.length).toBeGreaterThanOrEqual(2)
      const assistantCall = calls[1]
      expect(assistantCall[2].role).toBe('assistant')
    })

    it('updates run to success with duration', async () => {
      const job = makeCronJob()
      await executor.execute(job, 'schedule')

      expect(deps.cronJobRunStorage.updateStatus).toHaveBeenCalledWith(
        projId,
        'run-1',
        'success',
        expect.objectContaining({ durationMs: expect.any(Number) }),
      )
    })

    it('updates cronJob metadata on success', async () => {
      const job = makeCronJob()
      await executor.execute(job, 'schedule')

      // Last call to updateRunMeta should have success status
      const calls = (deps.cronJobStorage.updateRunMeta as ReturnType<typeof vi.fn>).mock.calls
      const lastCall = calls[calls.length - 1]
      expect(lastCall[2]).toEqual(expect.objectContaining({
        lastRunStatus: 'success',
        lastRunId: 'run-1',
      }))
    })
  })

  describe('agent not found', () => {
    it('returns error run when agent is not found', async () => {
      deps = createMockDeps({
        agentStorage: {
          getById: vi.fn().mockResolvedValue(null),
          list: vi.fn().mockResolvedValue([]),
          update: vi.fn().mockResolvedValue(undefined),
          create: vi.fn(),
          delete: vi.fn(),
        },
      })
      executor = new CronJobExecutor(deps)

      const job = makeCronJob()
      const result = await executor.execute(job, 'schedule')

      expect(result.status).toBe('error')
      expect(result.error).toContain('not found')
    })

    it('updates run record to error status', async () => {
      deps = createMockDeps({
        agentStorage: {
          getById: vi.fn().mockResolvedValue(null),
          list: vi.fn().mockResolvedValue([]),
          update: vi.fn().mockResolvedValue(undefined),
          create: vi.fn(),
          delete: vi.fn(),
        },
      })
      executor = new CronJobExecutor(deps)

      const job = makeCronJob()
      await executor.execute(job, 'schedule')

      expect(deps.cronJobRunStorage.updateStatus).toHaveBeenCalledWith(
        projId,
        'run-1',
        'error',
        expect.objectContaining({ error: expect.stringContaining('not found') }),
      )
    })
  })

  describe('token usage', () => {
    it('saves token record after successful execution', async () => {
      const job = makeCronJob()
      await executor.execute(job, 'schedule')

      expect(deps.tokenRecordStorage.save).toHaveBeenCalledWith(
        projId,
        expect.objectContaining({
          agentId,
          provider: 'anthropic',
          model: 'claude-sonnet-4-20250514',
          inputTokens: 100,
          outputTokens: 50,
          source: 'cron',
        }),
      )
    })

    it('emits token:recorded WebSocket event', async () => {
      const job = makeCronJob()
      await executor.execute(job, 'schedule')

      expect(deps.wsManager!.emit).toHaveBeenCalledWith(
        `project:${projId}`,
        expect.objectContaining({
          event: 'token:recorded',
          inputTokens: 100,
          outputTokens: 50,
        }),
      )
    })
  })

  describe('agent status transitions', () => {
    it('sets agent to running at start', async () => {
      const job = makeCronJob()
      await executor.execute(job, 'schedule')

      expect(deps.agentStorage.update).toHaveBeenCalledWith(
        projId,
        agentId,
        { status: 'running' },
      )
    })

    it('sets agent to idle after execution when no active chats', async () => {
      const job = makeCronJob()
      await executor.execute(job, 'schedule')

      // Should set idle since countByAgent returns 0
      expect(deps.agentStorage.update).toHaveBeenCalledWith(
        projId,
        agentId,
        { status: 'idle' },
      )
    })

    it('keeps agent running when active chats exist', async () => {
      deps = createMockDeps({
        activeChatRegistry: {
          countByAgent: vi.fn().mockReturnValue(2),
        } as unknown as ExecutorDeps['activeChatRegistry'],
      })
      executor = new CronJobExecutor(deps)

      const job = makeCronJob()
      await executor.execute(job, 'schedule')

      // agentStorage.update first call sets 'running', second should NOT set 'idle'
      const updateCalls = (deps.agentStorage.update as ReturnType<typeof vi.fn>).mock.calls
      // Only one update call (to running), idle is skipped because active chats > 0
      const idleCalls = updateCalls.filter(c => c[2]?.status === 'idle')
      expect(idleCalls).toHaveLength(0)
    })

    it('emits agent status WebSocket events', async () => {
      const job = makeCronJob()
      await executor.execute(job, 'schedule')

      expect(deps.wsManager!.emit).toHaveBeenCalledWith(
        `project:${projId}`,
        expect.objectContaining({ event: 'agent:status_changed', agentId, status: 'running' }),
      )
    })
  })

  describe('error cleanup', () => {
    it('marks agent idle on error', async () => {
      deps = createMockDeps({
        agentStorage: {
          getById: vi.fn().mockRejectedValue(new Error('DB error')),
          list: vi.fn().mockResolvedValue([]),
          update: vi.fn().mockResolvedValue(undefined),
          create: vi.fn(),
          delete: vi.fn(),
        },
      })
      executor = new CronJobExecutor(deps)

      const job = makeCronJob()
      const result = await executor.execute(job, 'schedule')

      expect(result.status).toBe('error')
      // Should still attempt to set agent idle
      expect(deps.agentStorage.update).toHaveBeenCalledWith(projId, agentId, { status: 'idle' })
    })

    it('updates cronJob metadata with error status', async () => {
      deps = createMockDeps({
        agentStorage: {
          getById: vi.fn().mockRejectedValue(new Error('fail')),
          list: vi.fn().mockResolvedValue([]),
          update: vi.fn().mockResolvedValue(undefined),
          create: vi.fn(),
          delete: vi.fn(),
        },
      })
      executor = new CronJobExecutor(deps)

      const job = makeCronJob()
      await executor.execute(job, 'schedule')

      const calls = (deps.cronJobStorage.updateRunMeta as ReturnType<typeof vi.fn>).mock.calls
      const lastCall = calls[calls.length - 1]
      expect(lastCall[2]).toEqual(expect.objectContaining({
        lastRunStatus: 'error',
      }))
    })

    it('emits runtime:cron_ended event on error', async () => {
      deps = createMockDeps({
        agentStorage: {
          getById: vi.fn().mockRejectedValue(new Error('fail')),
          list: vi.fn().mockResolvedValue([]),
          update: vi.fn().mockResolvedValue(undefined),
          create: vi.fn(),
          delete: vi.fn(),
        },
      })
      executor = new CronJobExecutor(deps)

      const job = makeCronJob()
      await executor.execute(job, 'schedule')

      expect(deps.wsManager!.emit).toHaveBeenCalledWith(
        `project:${projId}`,
        expect.objectContaining({ event: 'runtime:cron_ended' }),
      )
    })
  })

  describe('triggeredBy', () => {
    it('creates run with triggeredBy=schedule', async () => {
      const job = makeCronJob()
      await executor.execute(job, 'schedule')

      expect(deps.cronJobRunStorage.create).toHaveBeenCalledWith(
        projId,
        expect.objectContaining({ triggeredBy: 'schedule' }),
      )
    })

    it('creates run with triggeredBy=manual', async () => {
      const job = makeCronJob()
      await executor.execute(job, 'manual')

      expect(deps.cronJobRunStorage.create).toHaveBeenCalledWith(
        projId,
        expect.objectContaining({ triggeredBy: 'manual' }),
      )
    })
  })
})
