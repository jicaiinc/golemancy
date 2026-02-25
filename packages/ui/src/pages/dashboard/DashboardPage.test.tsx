import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Routes, Route } from 'react-router'
import { DashboardPage } from './DashboardPage'
import { useAppStore } from '../../stores'
import { configureServices } from '../../services/container'
import type { ServiceContainer } from '../../services/container'
import type {
  ProjectId, AgentId, ConversationId,
  DashboardSummary, DashboardAgentStats, DashboardRecentChat, DashboardTokenTrend,
  DashboardTokenByModel, DashboardTokenByAgent, RuntimeStatus,
  Project,
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

const PID = 'proj-1' as ProjectId

const mockProject: Project = {
  id: PID,
  name: 'Content Biz',
  description: 'A content business project',
  icon: '📄',
  config: { maxConcurrentAgents: 3 },
  agentCount: 5,
  activeAgentCount: 1,
  lastActivityAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

const mockSummary: DashboardSummary = {
  todayTokens: { total: 48_520, input: 32_180, output: 16_340, callCount: 42 },
  totalAgents: 5,
  activeChats: 2,
  totalChats: 8,
}

const mockAgentStats: DashboardAgentStats[] = [
  {
    agentId: 'agent-1' as AgentId,
    projectId: PID,
    projectName: 'Content Biz',
    agentName: 'Writer',
    model: 'gpt-4o',
    status: 'running',
    totalTokens: 125_430,
    conversationCount: 4,
    taskCount: 6,
    completedTasks: 4,
    failedTasks: 0,
    lastActiveAt: new Date().toISOString(),
  },
]

const mockRecentChats: DashboardRecentChat[] = [
  {
    conversationId: 'conv-1' as ConversationId,
    projectId: PID,
    projectName: 'Content Biz',
    agentId: 'agent-1' as AgentId,
    agentName: 'Writer',
    title: 'Blog Draft: AI Trends',
    messageCount: 12,
    totalTokens: 24_500,
    lastMessageAt: new Date().toISOString(),
  },
]

const mockTokenTrend: DashboardTokenTrend[] = [
  { date: '2026-02-18', inputTokens: 15_000, outputTokens: 8_000 },
  { date: '2026-02-19', inputTokens: 17_000, outputTokens: 9_000 },
]

const mockTokenByModel: DashboardTokenByModel[] = [
  { provider: 'openai', model: 'gpt-4o', inputTokens: 85_200, outputTokens: 42_600, callCount: 28 },
]

const mockTokenByAgent: DashboardTokenByAgent[] = [
  { agentId: 'agent-1' as AgentId, agentName: 'Writer', inputTokens: 62_300, outputTokens: 31_150, callCount: 18 },
]

const mockRuntimeStatus: RuntimeStatus = {
  runningChats: [],
  runningCrons: [],
  upcoming: [],
  recentCompleted: [],
}

function createTestServices(): ServiceContainer {
  return {
    projects: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), getTopologyLayout: vi.fn().mockResolvedValue({}), saveTopologyLayout: vi.fn() },
    agents: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    conversations: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), sendMessage: vi.fn(), saveMessage: vi.fn(), getMessages: vi.fn(), searchMessages: vi.fn(), delete: vi.fn() },
    tasks: { list: vi.fn(), getById: vi.fn() },
    workspace: { listDir: vi.fn(), readFile: vi.fn(), deleteFile: vi.fn(), getFileUrl: vi.fn() },
    memory: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    settings: { get: vi.fn(), update: vi.fn(), testProvider: vi.fn(), testClaudeCode: vi.fn() },
    cronJobs: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    skills: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), importZip: vi.fn() },
    mcp: { list: vi.fn(), getByName: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), resolveNames: vi.fn() },
    dashboard: {
      getSummary: vi.fn().mockResolvedValue(mockSummary),
      getAgentStats: vi.fn().mockResolvedValue(mockAgentStats),
      getRecentChats: vi.fn().mockResolvedValue(mockRecentChats),
      getTokenTrend: vi.fn().mockResolvedValue(mockTokenTrend),
      getTokenByModel: vi.fn().mockResolvedValue(mockTokenByModel),
      getTokenByAgent: vi.fn().mockResolvedValue(mockTokenByAgent),
      getRuntimeStatus: vi.fn().mockResolvedValue(mockRuntimeStatus),
    },
    globalDashboard: {
      getSummary: vi.fn().mockResolvedValue(mockSummary),
      getTokenByModel: vi.fn().mockResolvedValue([]),
      getTokenByAgent: vi.fn().mockResolvedValue([]),
      getTokenByProject: vi.fn().mockResolvedValue([]),
      getTokenTrend: vi.fn().mockResolvedValue([]),
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
    speech: {} as any,
  }
}

/** Render DashboardPage within a route that provides projectId via useParams */
function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={[`/projects/${PID}`]}>
      <Routes>
        <Route path="/projects/:projectId" element={<DashboardPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('DashboardPage', () => {
  beforeEach(() => {
    const services = createTestServices()
    configureServices(services)
    useAppStore.setState({
      dashboardSummary: null,
      dashboardAgentStats: [],
      dashboardRecentChats: [],
      dashboardTokenTrend: [],
      dashboardTokenByModel: [],
      dashboardTokenByAgent: [],
      dashboardRuntimeStatus: null,
      dashboardTimeRange: 'today',
      dashboardStale: false,
      dashboardLoading: false,
      projects: [mockProject],
      currentProjectId: PID,
    })
  })

  it('shows loading spinner initially', () => {
    useAppStore.setState({ dashboardLoading: true })
    renderDashboard()
    expect(screen.getByText('Loading dashboard...')).toBeInTheDocument()
  })

  it('renders project name as header', async () => {
    useAppStore.setState({
      dashboardSummary: mockSummary,
      dashboardLoading: false,
    })
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('Content Biz')).toBeInTheDocument()
    })
  })

  it('renders summary cards with 4 token cards', async () => {
    useAppStore.setState({
      dashboardSummary: mockSummary,
      dashboardLoading: false,
    })
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('Total Tokens')).toBeInTheDocument()
      expect(screen.getByText('Input Tokens')).toBeInTheDocument()
      expect(screen.getByText('Output Tokens')).toBeInTheDocument()
      expect(screen.getByText('API Calls')).toBeInTheDocument()
    })
  })

  it('renders time range selector with Today active by default', async () => {
    useAppStore.setState({
      dashboardSummary: mockSummary,
      dashboardLoading: false,
    })
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('Today')).toBeInTheDocument()
      expect(screen.getByText('7 Days')).toBeInTheDocument()
      expect(screen.getByText('30 Days')).toBeInTheDocument()
      expect(screen.getByText('All Time')).toBeInTheDocument()
    })
  })

  it('renders token detail tabs (Trend / By Agent / By Model)', async () => {
    useAppStore.setState({
      dashboardSummary: mockSummary,
      dashboardTokenByAgent: mockTokenByAgent,
      dashboardTokenByModel: mockTokenByModel,
      dashboardLoading: false,
    })
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('Trend')).toBeInTheDocument()
      expect(screen.getByText('By Agent')).toBeInTheDocument()
      expect(screen.getByText('By Model')).toBeInTheDocument()
    })
  })

  it('renders token trend chart in Trend tab by default', async () => {
    useAppStore.setState({
      dashboardSummary: mockSummary,
      dashboardTokenTrend: mockTokenTrend,
      dashboardLoading: false,
    })
    renderDashboard()
    await waitFor(() => {
      // Trend tab should be present and active by default
      expect(screen.getByText('Trend')).toBeInTheDocument()
      // Chart legend should be visible (trend is default tab)
      expect(screen.getByText('Input')).toBeInTheDocument()
      expect(screen.getByText('Output')).toBeInTheDocument()
    })
  })

  it('renders activity panel', async () => {
    useAppStore.setState({
      dashboardSummary: mockSummary,
      dashboardRuntimeStatus: mockRuntimeStatus,
      dashboardLoading: false,
    })
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('ACTIVITY')).toBeInTheDocument()
      expect(screen.getByText('Active (0)')).toBeInTheDocument()
    })
  })

  it('renders overview panel with agents and recent chats sections', async () => {
    useAppStore.setState({
      dashboardSummary: mockSummary,
      dashboardAgentStats: mockAgentStats,
      dashboardRecentChats: mockRecentChats,
      dashboardLoading: false,
    })
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('AGENTS')).toBeInTheDocument()
      expect(screen.getByText('RECENT CHATS')).toBeInTheDocument()
      // "Writer" may appear in both overview and breakdown table
      expect(screen.getAllByText('Writer').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('Blog Draft: AI Trends')).toBeInTheDocument()
    })
  })

  it('shows empty state messages when no data', async () => {
    // Override services to return empty data so loadDashboard doesn't populate
    const services = createTestServices()
    services.dashboard.getAgentStats = vi.fn().mockResolvedValue([])
    services.dashboard.getRecentChats = vi.fn().mockResolvedValue([])
    services.dashboard.getTokenTrend = vi.fn().mockResolvedValue([])
    configureServices(services)

    useAppStore.setState({
      dashboardSummary: mockSummary,
      dashboardAgentStats: [],
      dashboardRecentChats: [],
      dashboardTokenTrend: [],
      dashboardRuntimeStatus: mockRuntimeStatus,
      dashboardLoading: false,
    })
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('No agents')).toBeInTheDocument()
      expect(screen.getByText('No recent chats')).toBeInTheDocument()
    })
  })

  // --- Intent tests: Dashboard is project-level ---

  describe('project-level intent', () => {
    it('calls loadDashboard with projectId from route params', async () => {
      const services = createTestServices()
      configureServices(services)

      renderDashboard()

      await waitFor(() => {
        expect(services.dashboard.getSummary).toHaveBeenCalledWith(PID, 'today')
        expect(services.dashboard.getAgentStats).toHaveBeenCalledWith(PID, 'today')
        expect(services.dashboard.getRecentChats).toHaveBeenCalledWith(PID)
        expect(services.dashboard.getTokenTrend).toHaveBeenCalledWith(PID, undefined, 'today')
        expect(services.dashboard.getTokenByModel).toHaveBeenCalledWith(PID, 'today')
        expect(services.dashboard.getTokenByAgent).toHaveBeenCalledWith(PID, 'today')
        expect(services.dashboard.getRuntimeStatus).toHaveBeenCalledWith(PID)
      })
    })

    it('displays project name and description in header', async () => {
      useAppStore.setState({
        dashboardSummary: mockSummary,
        dashboardLoading: false,
      })
      renderDashboard()
      await waitFor(() => {
        expect(screen.getByText('Content Biz')).toBeInTheDocument()
        expect(screen.getByText('A content business project')).toBeInTheDocument()
      })
    })

    it('agent in overview uses relative navigation', async () => {
      useAppStore.setState({
        dashboardSummary: mockSummary,
        dashboardAgentStats: mockAgentStats,
        dashboardLoading: false,
      })
      renderDashboard()
      await waitFor(() => {
        // "Writer" may appear in both overview and breakdown; find the one in overview panel
        const writerElements = screen.getAllByText('Writer')
        const agentRow = writerElements
          .map(el => el.closest('[class*="cursor-pointer"]'))
          .find(Boolean)
        expect(agentRow).toBeTruthy()
      })
    })

    it('recent chats in overview uses relative navigation', async () => {
      useAppStore.setState({
        dashboardSummary: mockSummary,
        dashboardRecentChats: mockRecentChats,
        dashboardLoading: false,
      })
      renderDashboard()
      await waitFor(() => {
        const chatRow = screen.getByText('Blog Draft: AI Trends').closest('[class*="cursor-pointer"]')
        expect(chatRow).toBeTruthy()
      })
    })

    it('does not render cross-project elements', async () => {
      useAppStore.setState({
        dashboardSummary: mockSummary,
        dashboardLoading: false,
      })
      renderDashboard()
      await waitFor(() => {
        expect(screen.queryByText(/Projects/)).toBeNull()
        expect(screen.queryByText('Settings')).toBeNull()
      })
    })
  })
})
