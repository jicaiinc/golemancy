import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AppRoutes } from './routes'
import { useAppStore } from '../stores'
import { configureServices } from '../services/container'
import type { ServiceContainer } from '../services/container'
import type { GlobalSettings, ProjectId } from '@golemancy/shared'

// Mock motion/react to avoid animation issues in tests
vi.mock('motion/react', () => {
  const el = (Tag: string) => {
    const Comp = ({ children, ...props }: any) => {
      const { initial, animate, exit, transition, custom, variants, style, ...rest } = props
      return <Tag {...rest} style={style}>{children}</Tag>
    }
    Comp.displayName = `motion.${Tag}`
    return Comp
  }
  return {
    motion: { div: el('div'), h1: el('h1'), p: el('p'), span: el('span') },
    AnimatePresence: ({ children }: any) => <>{children}</>,
  }
})

const emptySettings: GlobalSettings = {
  providers: {},
  theme: 'dark',
}

const settingsWithProvider: GlobalSettings = {
  providers: {
    openai: { name: 'OpenAI', sdkType: 'openai', apiKey: 'sk-test', models: ['gpt-4o'], testStatus: 'ok' },
  },
  theme: 'dark',
}

function createTestServices(): ServiceContainer {
  return {
    projects: { list: vi.fn().mockResolvedValue([]), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), clone: vi.fn() },
    agents: { list: vi.fn().mockResolvedValue([]), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), clone: vi.fn() },
    conversations: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), sendMessage: vi.fn(), saveMessage: vi.fn(), getMessages: vi.fn(), searchMessages: vi.fn(), delete: vi.fn() },
    tasks: { list: vi.fn(), getById: vi.fn() },
    workspace: { listDir: vi.fn(), readFile: vi.fn(), deleteFile: vi.fn(), getFileUrl: vi.fn() },
    settings: { get: vi.fn().mockResolvedValue(emptySettings), update: vi.fn(), testProvider: vi.fn() },
    cronJobs: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    skills: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), importZip: vi.fn() },
    mcp: { list: vi.fn(), getByName: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), resolveNames: vi.fn() },
    dashboard: {
      getSummary: vi.fn().mockResolvedValue({}),
      getAgentStats: vi.fn().mockResolvedValue([]),
      getRecentChats: vi.fn().mockResolvedValue([]),
      getTokenTrend: vi.fn().mockResolvedValue([]),
      getTokenByModel: vi.fn().mockResolvedValue([]),
      getTokenByAgent: vi.fn().mockResolvedValue([]),
      getRuntimeStatus: vi.fn().mockResolvedValue({ runningChats: [], runningCrons: [], upcoming: [], recentCompleted: [] }),
    },
    globalDashboard: {
      getSummary: vi.fn().mockResolvedValue({ todayTokens: { total: 0, input: 0, output: 0, callCount: 0 }, totalAgents: 0, activeChats: 0, totalChats: 0 }),
      getTokenByModel: vi.fn().mockResolvedValue([]),
      getTokenByAgent: vi.fn().mockResolvedValue([]),
      getTokenByProject: vi.fn().mockResolvedValue([]),
      getTokenTrend: vi.fn().mockResolvedValue([]),
      getRuntimeStatus: vi.fn().mockResolvedValue({ runningChats: [], runningCrons: [], upcoming: [], recentCompleted: [] }),
    },
    permissionsConfig: {
      list: vi.fn().mockResolvedValue([]),
      getById: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      duplicate: vi.fn(),
    },
    speech: {} as any,
    memories: {} as any,
    teams: {} as any,
  }
}

describe('RootRedirect — Onboarding Detection', () => {
  beforeEach(() => {
    configureServices(createTestServices())
    // Ensure electronAPI is not available
    delete (window as any).electronAPI
  })

  it('shows onboarding when all three conditions are met (fresh install)', () => {
    useAppStore.setState({
      settings: emptySettings, // no providers, no onboardingCompleted
      projects: [],
      projectsLoading: false,
    })
    render(<AppRoutes />)
    expect(screen.getByTestId('onboarding-page')).toBeInTheDocument()
  })

  it('shows nothing while settings are loading', () => {
    useAppStore.setState({
      settings: null,
      projects: [],
      projectsLoading: false,
    })
    const { container } = render(<AppRoutes />)
    // Should render nothing (null return)
    expect(screen.queryByTestId('onboarding-page')).not.toBeInTheDocument()
    expect(screen.queryByTestId('project-list-page')).not.toBeInTheDocument()
  })

  it('shows nothing while projects are loading', () => {
    useAppStore.setState({
      settings: emptySettings,
      projects: [],
      projectsLoading: true,
    })
    render(<AppRoutes />)
    expect(screen.queryByTestId('onboarding-page')).not.toBeInTheDocument()
  })

  it('skips onboarding when onboardingCompleted is true', () => {
    useAppStore.setState({
      settings: { ...emptySettings, onboardingCompleted: true },
      projects: [],
      projectsLoading: false,
    })
    render(<AppRoutes />)
    expect(screen.queryByTestId('onboarding-page')).not.toBeInTheDocument()
  })

  it('skips onboarding when providers exist', () => {
    useAppStore.setState({
      settings: settingsWithProvider,
      projects: [],
      projectsLoading: false,
    })
    render(<AppRoutes />)
    expect(screen.queryByTestId('onboarding-page')).not.toBeInTheDocument()
  })

  it('skips onboarding when projects exist', () => {
    useAppStore.setState({
      settings: emptySettings,
      projects: [
        {
          id: 'proj-1' as ProjectId,
          name: 'Test',
          description: '',
          icon: 'pickaxe',
          config: { maxConcurrentAgents: 3 },
          agentCount: 0,
          activeAgentCount: 0,
          lastActivityAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      projectsLoading: false,
    })
    render(<AppRoutes />)
    expect(screen.queryByTestId('onboarding-page')).not.toBeInTheDocument()
  })

  it('skips onboarding for old users upgrading (has providers, no onboardingCompleted)', () => {
    useAppStore.setState({
      settings: settingsWithProvider, // has providers but no onboardingCompleted
      projects: [
        {
          id: 'proj-1' as ProjectId,
          name: 'Existing',
          description: '',
          icon: 'sword',
          config: { maxConcurrentAgents: 3 },
          agentCount: 1,
          activeAgentCount: 0,
          lastActivityAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      projectsLoading: false,
    })
    render(<AppRoutes />)
    expect(screen.queryByTestId('onboarding-page')).not.toBeInTheDocument()
  })
})
