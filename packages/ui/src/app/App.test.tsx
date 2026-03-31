import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAppStore } from '../stores'
import type { GlobalSettings } from '@golemancy/shared'

// Mock HTTP layer so ServiceProvider.initServices() uses test doubles
vi.mock('../services/http', () => ({
  createHttpServices: vi.fn(() => ({
    projects: { list: vi.fn().mockResolvedValue([]), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), clone: vi.fn() },
    agents: { list: vi.fn().mockResolvedValue([]), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), clone: vi.fn() },
    conversations: { list: vi.fn().mockResolvedValue([]), getById: vi.fn(), create: vi.fn(), update: vi.fn(), sendMessage: vi.fn(), saveMessage: vi.fn(), getMessages: vi.fn(), searchMessages: vi.fn(), delete: vi.fn() },
    tasks: { list: vi.fn().mockResolvedValue([]), getById: vi.fn() },
    workspace: { listDir: vi.fn(), readFile: vi.fn(), deleteFile: vi.fn(), getFileUrl: vi.fn() },
    settings: { get: vi.fn().mockResolvedValue({ providers: {}, theme: 'dark', onboardingCompleted: true }), update: vi.fn(), testProvider: vi.fn() },
    cronJobs: { list: vi.fn().mockResolvedValue([]), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    skills: { list: vi.fn().mockResolvedValue([]), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), importZip: vi.fn() },
    mcp: { list: vi.fn().mockResolvedValue([]), getByName: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), resolveNames: vi.fn() },
    dashboard: { getSummary: vi.fn().mockResolvedValue({}), getAgentStats: vi.fn().mockResolvedValue([]), getRecentChats: vi.fn().mockResolvedValue([]), getTokenTrend: vi.fn().mockResolvedValue([]), getTokenByModel: vi.fn().mockResolvedValue([]), getTokenByAgent: vi.fn().mockResolvedValue([]), getRuntimeStatus: vi.fn().mockResolvedValue({ runningChats: [], runningCrons: [], upcoming: [], recentCompleted: [] }) },
    globalDashboard: { getSummary: vi.fn().mockResolvedValue({ todayTokens: { total: 0, input: 0, output: 0, callCount: 0 }, totalAgents: 0, activeChats: 0, totalChats: 0 }), getTokenByModel: vi.fn().mockResolvedValue([]), getTokenByAgent: vi.fn().mockResolvedValue([]), getTokenByProject: vi.fn().mockResolvedValue([]), getTokenTrend: vi.fn().mockResolvedValue([]), getRuntimeStatus: vi.fn().mockResolvedValue({ runningChats: [], runningCrons: [], upcoming: [], recentCompleted: [] }) },
    permissionsConfig: { list: vi.fn().mockResolvedValue([]), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), duplicate: vi.fn() },
    speech: {} as any,
    memories: {} as any,
    teams: {} as any,
  })),
}))

vi.mock('../services/http/base', () => ({
  setAuthToken: vi.fn(),
  setBaseUrl: vi.fn(),
}))

// Import App after mocks are set up (vi.mock is hoisted)
const { App } = await import('./App')

const emptySettings: GlobalSettings = {
  providers: {},
  theme: 'dark',
  onboardingCompleted: true,
}

describe('App', () => {
  beforeEach(() => {
    useAppStore.setState({
      settings: emptySettings,
      projects: [],
      projectsLoading: false,
    })
  })

  it('renders the project list page at root', async () => {
    render(<App />)
    expect(await screen.findByText('All Projects')).toBeInTheDocument()
  })
})
