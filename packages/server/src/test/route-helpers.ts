import { vi } from 'vitest'
import { Hono } from 'hono'
import type {
  IProjectService, IAgentService, IConversationService, ITaskService,
  ISkillService, ISettingsService,
  IDashboardService, ICronJobService, IMCPService, IPermissionsConfigService,
  ITeamService,
} from '@golemancy/shared'
import { createApp, type ServerDependencies } from '../app'

/** All mock storage services, each method a `vi.fn()` stub. */
export interface MockStorage extends ServerDependencies {
  projectStorage: MockedService<IProjectService>
  agentStorage: MockedService<IAgentService>
  conversationStorage: MockedService<IConversationService>
  taskStorage: MockedService<ITaskService>
  skillStorage: MockedService<ISkillService>
  settingsStorage: MockedService<ISettingsService>
  dashboardService: MockedService<IDashboardService>
  cronJobStorage: MockedService<ICronJobService>
  mcpStorage: MockedService<IMCPService>
  permissionsConfigStorage: MockedService<IPermissionsConfigService>
  teamStorage: MockedService<ITeamService>
}

/** Turn every method of T into a vi.fn() mock */
type MockedService<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? ReturnType<typeof vi.fn<(...args: A) => R>>
    : T[K]
}

/** Create stub implementations for all server dependencies. */
export function createMockStorage(): MockStorage {
  return {
    projectStorage: {
      list: vi.fn().mockResolvedValue([]),
      getById: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    agentStorage: {
      list: vi.fn().mockResolvedValue([]),
      getById: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    conversationStorage: {
      list: vi.fn().mockResolvedValue([]),
      getById: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      sendMessage: vi.fn().mockResolvedValue(undefined),
      saveMessage: vi.fn().mockResolvedValue(undefined),
      getMessages: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      searchMessages: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      update: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    taskStorage: {
      list: vi.fn().mockResolvedValue([]),
      getById: vi.fn().mockResolvedValue(null),
    },
    skillStorage: {
      list: vi.fn().mockResolvedValue([]),
      getById: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
      importZip: vi.fn(),
    },
    settingsStorage: {
      get: vi.fn().mockResolvedValue({
        providers: {},
        theme: 'dark',
      }),
      update: vi.fn(),
      testProvider: vi.fn(),
    },
    dashboardService: {
      getSummary: vi.fn().mockResolvedValue({ todayTokens: { total: 0, input: 0, output: 0, callCount: 0 }, totalAgents: 0, activeChats: 0, totalChats: 0 }),
      getAgentStats: vi.fn().mockResolvedValue([]),
      getRecentChats: vi.fn().mockResolvedValue([]),
      getTokenTrend: vi.fn().mockResolvedValue([]),
      getTokenByModel: vi.fn().mockResolvedValue([]),
      getTokenByAgent: vi.fn().mockResolvedValue([]),
      getRuntimeStatus: vi.fn().mockResolvedValue({ runningChats: [], runningCrons: [], upcoming: [], recentCompleted: [] }),
    },
    cronJobStorage: {
      list: vi.fn().mockResolvedValue([]),
      getById: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    cronJobRunStorage: {
      create: vi.fn().mockResolvedValue({ id: 'cronrun-1', status: 'running' }),
      updateStatus: vi.fn().mockResolvedValue(undefined),
      listByJob: vi.fn().mockResolvedValue([]),
      listByProject: vi.fn().mockResolvedValue([]),
    } as any,
    mcpStorage: {
      list: vi.fn().mockResolvedValue([]),
      getByName: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
      resolveNames: vi.fn().mockResolvedValue([]),
    },
    permissionsConfigStorage: {
      list: vi.fn().mockResolvedValue([]),
      getById: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
      duplicate: vi.fn(),
    },
    tokenRecordStorage: {
      save: vi.fn().mockReturnValue('tkr-mock'),
    } as any,
    compactRecordStorage: {
      getLatest: vi.fn().mockResolvedValue(null),
      list: vi.fn().mockResolvedValue([]),
      save: vi.fn(),
    } as any,
    memoryStorage: {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
      loadForContext: vi.fn().mockResolvedValue({ pinned: [], autoLoaded: [], totalCount: 0 }),
      search: vi.fn().mockResolvedValue([]),
    } as any,
    teamStorage: {
      list: vi.fn().mockResolvedValue([]),
      getById: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
      getLayout: vi.fn().mockResolvedValue({}),
      saveLayout: vi.fn().mockResolvedValue(undefined),
    },
  }
}

/**
 * Create a full Hono app with all routes mounted and mock storage injected.
 * Optionally pass an authToken to enable Bearer auth (same as production).
 */
export function createTestApp(
  mocks?: MockStorage,
  authToken?: string,
): { app: Hono; mocks: MockStorage } {
  const storage = mocks ?? createMockStorage()
  const app = createApp(storage, authToken)
  return { app, mocks: storage }
}

/**
 * Convenience helper to make requests against a Hono app.
 * Returns the Response directly for assertion.
 */
export async function makeRequest(
  app: Hono,
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<Response> {
  const headers: Record<string, string> = {}
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  return app.request(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}
