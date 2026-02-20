import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Routes, Route } from 'react-router'
import { GlobalDashboardPage } from './GlobalDashboardPage'
import { configureServices } from '../../services/container'
import type { ServiceContainer } from '../../services/container'
import type {
  ProjectId, AgentId,
  DashboardSummary, DashboardTokenTrend,
  DashboardTokenByModel, DashboardTokenByAgent, RuntimeStatus,
} from '@golemancy/shared'

// Mock motion/react to avoid animation issues in tests
vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => {
      const { initial, animate, exit, transition, variants, ...rest } = props
      return <div {...rest}>{children}</div>
    },
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

// Mock WebSocketProvider
vi.mock('../../providers/WebSocketProvider', () => ({
  useWs: () => ({
    status: 'disconnected',
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    addListener: vi.fn(() => vi.fn()),
  }),
}))

const PID1 = 'proj-1' as ProjectId
const PID2 = 'proj-2' as ProjectId

const mockSummary: DashboardSummary = {
  todayTokens: { total: 120_000, input: 80_000, output: 40_000, callCount: 85 },
  totalAgents: 12,
  activeChats: 5,
  totalChats: 30,
}

const mockTokenByModel: (DashboardTokenByModel & { projectId: ProjectId; projectName: string })[] = [
  { provider: 'openai', model: 'gpt-4o', inputTokens: 85_200, outputTokens: 42_600, callCount: 28, projectId: PID1, projectName: 'Content Biz' },
]

const mockTokenByAgent: (DashboardTokenByAgent & { projectId: ProjectId; projectName: string })[] = [
  { agentId: 'agent-1' as AgentId, agentName: 'Writer', inputTokens: 62_300, outputTokens: 31_150, callCount: 18, projectId: PID1, projectName: 'Content Biz' },
]

const mockTokenByProject = [
  { projectId: PID1, projectName: 'Content Biz', inputTokens: 137_600, outputTokens: 68_700, callCount: 42 },
  { projectId: PID2, projectName: 'E-Commerce Ops', inputTokens: 50_850, outputTokens: 25_400, callCount: 15 },
]

const mockTokenTrend: DashboardTokenTrend[] = [
  { date: '2026-02-18', inputTokens: 15_000, outputTokens: 8_000 },
  { date: '2026-02-19', inputTokens: 17_000, outputTokens: 9_000 },
]

const mockRuntimeStatus: RuntimeStatus = {
  runningChats: [],
  runningCrons: [],
  upcoming: [],
  recentCompleted: [],
}

function createTestServices(): ServiceContainer {
  return {
    projects: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    agents: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    conversations: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), sendMessage: vi.fn(), saveMessage: vi.fn(), getMessages: vi.fn(), searchMessages: vi.fn(), delete: vi.fn() },
    tasks: { list: vi.fn(), getById: vi.fn() },
    workspace: { listDir: vi.fn(), readFile: vi.fn(), deleteFile: vi.fn(), getFileUrl: vi.fn() },
    memory: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    settings: { get: vi.fn(), update: vi.fn(), testProvider: vi.fn() },
    cronJobs: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    skills: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), importZip: vi.fn() },
    mcp: { list: vi.fn(), getByName: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), resolveNames: vi.fn() },
    dashboard: {
      getSummary: vi.fn().mockResolvedValue(mockSummary),
      getAgentStats: vi.fn().mockResolvedValue([]),
      getRecentChats: vi.fn().mockResolvedValue([]),
      getTokenTrend: vi.fn().mockResolvedValue([]),
      getTokenByModel: vi.fn().mockResolvedValue([]),
      getTokenByAgent: vi.fn().mockResolvedValue([]),
      getRuntimeStatus: vi.fn().mockResolvedValue(mockRuntimeStatus),
    },
    globalDashboard: {
      getSummary: vi.fn().mockResolvedValue(mockSummary),
      getTokenByModel: vi.fn().mockResolvedValue(mockTokenByModel),
      getTokenByAgent: vi.fn().mockResolvedValue(mockTokenByAgent),
      getTokenByProject: vi.fn().mockResolvedValue(mockTokenByProject),
      getTokenTrend: vi.fn().mockResolvedValue(mockTokenTrend),
      getRuntimeStatus: vi.fn().mockResolvedValue(mockRuntimeStatus),
    },
    permissionsConfig: {
      list: vi.fn().mockResolvedValue([]),
      getById: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      duplicate: vi.fn(),
    },
  }
}

function renderGlobalDashboard() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="/dashboard" element={<GlobalDashboardPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('GlobalDashboardPage', () => {
  let services: ServiceContainer

  beforeEach(() => {
    services = createTestServices()
    configureServices(services)
  })

  it('shows loading spinner initially', () => {
    renderGlobalDashboard()
    expect(screen.getByText('Loading dashboard...')).toBeInTheDocument()
  })

  it('renders header with title and description', async () => {
    renderGlobalDashboard()
    await waitFor(() => {
      expect(screen.getByText('Global Dashboard')).toBeInTheDocument()
      expect(screen.getByText('Cross-project overview')).toBeInTheDocument()
    })
  })

  it('renders summary cards after loading', async () => {
    renderGlobalDashboard()
    await waitFor(() => {
      expect(screen.getByText('Total Tokens')).toBeInTheDocument()
      expect(screen.getByText('Input Tokens')).toBeInTheDocument()
      expect(screen.getByText('Output Tokens')).toBeInTheDocument()
      expect(screen.getByText('API Calls')).toBeInTheDocument()
    })
  })

  it('renders time range selector', async () => {
    renderGlobalDashboard()
    await waitFor(() => {
      expect(screen.getByText('Today')).toBeInTheDocument()
      expect(screen.getByText('7 Days')).toBeInTheDocument()
      expect(screen.getByText('30 Days')).toBeInTheDocument()
      expect(screen.getByText('All Time')).toBeInTheDocument()
    })
  })

  it('renders 3 breakdown tabs (By Project / By Model / By Agent)', async () => {
    renderGlobalDashboard()
    await waitFor(() => {
      expect(screen.getByText('By Project')).toBeInTheDocument()
      expect(screen.getByText('By Model')).toBeInTheDocument()
      expect(screen.getByText('By Agent')).toBeInTheDocument()
    })
  })

  it('renders token trend chart', async () => {
    renderGlobalDashboard()
    await waitFor(() => {
      expect(screen.getByText('TOKEN USAGE TREND')).toBeInTheDocument()
    })
  })

  it('renders runtime status panel', async () => {
    renderGlobalDashboard()
    await waitFor(() => {
      expect(screen.getByText('RUNTIME STATUS')).toBeInTheDocument()
      expect(screen.getByText('Running (0)')).toBeInTheDocument()
    })
  })

  it('renders top projects overview', async () => {
    renderGlobalDashboard()
    await waitFor(() => {
      expect(screen.getByText('TOP PROJECTS')).toBeInTheDocument()
      // Project names appear in both breakdown table (By Project) and top projects section
      expect(screen.getAllByText('Content Biz').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('E-Commerce Ops').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('shows empty state when no project data', async () => {
    services.globalDashboard.getTokenByProject = vi.fn().mockResolvedValue([])
    configureServices(services)

    renderGlobalDashboard()
    await waitFor(() => {
      expect(screen.getByText('No project data')).toBeInTheDocument()
    })
  })

  it('calls globalDashboard service methods on mount', async () => {
    renderGlobalDashboard()
    await waitFor(() => {
      expect(services.globalDashboard.getSummary).toHaveBeenCalledWith('today')
      expect(services.globalDashboard.getTokenByModel).toHaveBeenCalledWith('today')
      expect(services.globalDashboard.getTokenByAgent).toHaveBeenCalledWith('today')
      expect(services.globalDashboard.getTokenByProject).toHaveBeenCalledWith('today')
      expect(services.globalDashboard.getTokenTrend).toHaveBeenCalledWith(undefined, 'today')
      expect(services.globalDashboard.getRuntimeStatus).toHaveBeenCalled()
    })
  })

  it('does not use project-scoped dashboard service', async () => {
    renderGlobalDashboard()
    await waitFor(() => {
      expect(screen.getByText('Global Dashboard')).toBeInTheDocument()
    })
    expect(services.dashboard.getSummary).not.toHaveBeenCalled()
  })
})
