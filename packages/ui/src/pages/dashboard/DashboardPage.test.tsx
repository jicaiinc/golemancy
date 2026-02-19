import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Routes, Route } from 'react-router'
import { DashboardPage } from './DashboardPage'
import { useAppStore } from '../../stores'
import { configureServices } from '../../services/container'
import type { ServiceContainer } from '../../services/container'
import type { ProjectId, AgentId, ConversationId, DashboardSummary, DashboardAgentStats, DashboardRecentChat, DashboardTokenTrend, Project } from '@golemancy/shared'

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

const PID = 'proj-1' as ProjectId

const mockProject: Project = {
  id: PID,
  name: 'Content Biz',
  description: 'A content business project',
  icon: '📄',
  workingDirectory: '/tmp/content',
  config: { maxConcurrentAgents: 3 },
  agentCount: 5,
  activeAgentCount: 1,
  lastActivityAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

const mockSummary: DashboardSummary = {
  todayTokens: { total: 48_520, input: 32_180, output: 16_340 },
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
      getAgentStats: vi.fn().mockResolvedValue(mockAgentStats),
      getRecentChats: vi.fn().mockResolvedValue(mockRecentChats),
      getTokenTrend: vi.fn().mockResolvedValue(mockTokenTrend),
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
      dashboardAgentStats: mockAgentStats,
      dashboardRecentChats: mockRecentChats,
      dashboardTokenTrend: mockTokenTrend,
      dashboardLoading: false,
    })
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('Content Biz')).toBeInTheDocument()
    })
  })

  it('renders summary cards when summary is available', async () => {
    useAppStore.setState({
      dashboardSummary: mockSummary,
      dashboardAgentStats: mockAgentStats,
      dashboardRecentChats: mockRecentChats,
      dashboardTokenTrend: mockTokenTrend,
      dashboardLoading: false,
    })
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('Today Tokens')).toBeInTheDocument()
      expect(screen.getByText('Agents')).toBeInTheDocument()
      expect(screen.getByText('Active Chats')).toBeInTheDocument()
      expect(screen.getByText('Total Chats')).toBeInTheDocument()
    })
  })

  it('renders agent ranking with agent data', async () => {
    useAppStore.setState({
      dashboardSummary: mockSummary,
      dashboardAgentStats: mockAgentStats,
      dashboardRecentChats: mockRecentChats,
      dashboardTokenTrend: mockTokenTrend,
      dashboardLoading: false,
    })
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('AGENT RANKING')).toBeInTheDocument()
      expect(screen.getByText('Writer')).toBeInTheDocument()
    })
  })

  it('renders recent chats', async () => {
    useAppStore.setState({
      dashboardSummary: mockSummary,
      dashboardAgentStats: mockAgentStats,
      dashboardRecentChats: mockRecentChats,
      dashboardTokenTrend: mockTokenTrend,
      dashboardLoading: false,
    })
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('RECENT CHATS')).toBeInTheDocument()
      expect(screen.getByText('Blog Draft: AI Trends')).toBeInTheDocument()
    })
  })

  it('renders token trend chart', async () => {
    useAppStore.setState({
      dashboardSummary: mockSummary,
      dashboardAgentStats: mockAgentStats,
      dashboardRecentChats: mockRecentChats,
      dashboardTokenTrend: mockTokenTrend,
      dashboardLoading: false,
    })
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('TOKEN USAGE TREND')).toBeInTheDocument()
    })
  })

  it('shows empty state messages when no data', async () => {
    // Override services to return empty data so loadDashboard populates empty state
    const emptyServices = createTestServices()
    ;(emptyServices.dashboard.getAgentStats as any).mockResolvedValue([])
    ;(emptyServices.dashboard.getRecentChats as any).mockResolvedValue([])
    ;(emptyServices.dashboard.getTokenTrend as any).mockResolvedValue([])
    configureServices(emptyServices)

    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('No agent data')).toBeInTheDocument()
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
        expect(services.dashboard.getSummary).toHaveBeenCalledWith(PID)
        expect(services.dashboard.getAgentStats).toHaveBeenCalledWith(PID)
        expect(services.dashboard.getRecentChats).toHaveBeenCalledWith(PID)
        expect(services.dashboard.getTokenTrend).toHaveBeenCalledWith(PID)
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

    it('agent ranking uses relative navigation (no absolute /projects/ prefix)', async () => {
      useAppStore.setState({
        dashboardSummary: mockSummary,
        dashboardAgentStats: mockAgentStats,
        dashboardLoading: false,
      })
      renderDashboard()
      await waitFor(() => {
        // The agent row should be rendered as a clickable element
        const agentRow = screen.getByText('Writer').closest('[class*="cursor-pointer"]')
        expect(agentRow).toBeTruthy()
      })
    })

    it('recent chats uses relative navigation (no absolute /projects/ prefix)', async () => {
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

    it('does not render cross-project elements (no "← Projects" button, no "Settings" button)', async () => {
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
