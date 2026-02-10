import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router'
import { DashboardPage } from './DashboardPage'
import { useAppStore } from '../../stores'
import { configureServices } from '../../services/container'
import type { ServiceContainer } from '../../services/container'
import type { ProjectId, AgentId, DashboardSummary, DashboardAgentSummary, DashboardTaskSummary, ActivityEntry } from '@solocraft/shared'

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

const mockSummary: DashboardSummary = {
  totalProjects: 2,
  totalAgents: 5,
  activeAgents: 1,
  runningTasks: 1,
  completedTasksToday: 3,
  totalTokenUsageToday: 2134,
}

const mockActiveAgents: DashboardAgentSummary[] = [
  {
    agentId: 'agent-1' as AgentId,
    projectId: 'proj-1' as ProjectId,
    projectName: 'Content Biz',
    agentName: 'Writer',
    status: 'running',
    currentTaskTitle: 'Draft blog post',
  },
]

const mockRecentTasks: DashboardTaskSummary[] = [
  {
    taskId: 'task-1' as any,
    projectId: 'proj-1' as ProjectId,
    projectName: 'Content Biz',
    agentId: 'agent-1' as AgentId,
    agentName: 'Writer',
    title: 'Draft blog post',
    status: 'running',
    progress: 60,
    updatedAt: new Date().toISOString(),
  },
]

const mockActivityFeed: ActivityEntry[] = [
  {
    id: 'activity-1',
    type: 'agent_started',
    projectId: 'proj-1' as ProjectId,
    projectName: 'Content Biz',
    agentId: 'agent-1' as AgentId,
    agentName: 'Writer',
    description: 'Writer agent started working',
    timestamp: new Date().toISOString(),
  },
]

function createTestServices(): ServiceContainer {
  return {
    projects: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    agents: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    conversations: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), sendMessage: vi.fn(), delete: vi.fn() },
    tasks: { list: vi.fn(), getById: vi.fn(), cancel: vi.fn() },
    artifacts: { list: vi.fn(), getById: vi.fn(), delete: vi.fn() },
    memory: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    settings: { get: vi.fn(), update: vi.fn() },
    dashboard: {
      getSummary: vi.fn().mockResolvedValue(mockSummary),
      getActiveAgents: vi.fn().mockResolvedValue(mockActiveAgents),
      getRecentTasks: vi.fn().mockResolvedValue(mockRecentTasks),
      getActivityFeed: vi.fn().mockResolvedValue(mockActivityFeed),
    },
  }
}

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

function createEmptyDashboardServices(): ServiceContainer {
  return {
    ...createTestServices(),
    dashboard: {
      getSummary: vi.fn().mockResolvedValue(mockSummary),
      getActiveAgents: vi.fn().mockResolvedValue([]),
      getRecentTasks: vi.fn().mockResolvedValue([]),
      getActivityFeed: vi.fn().mockResolvedValue([]),
    },
  }
}

describe('DashboardPage', () => {
  beforeEach(() => {
    const services = createTestServices()
    configureServices(services)
    useAppStore.setState({
      dashboardSummary: null,
      dashboardActiveAgents: [],
      dashboardRecentTasks: [],
      dashboardActivityFeed: [],
      dashboardLoading: false,
      projects: [],
    })
  })

  it('shows loading spinner initially', () => {
    useAppStore.setState({ dashboardLoading: true })
    renderWithRouter(<DashboardPage />)
    expect(screen.getByText('Loading dashboard...')).toBeInTheDocument()
  })

  it('renders header text', async () => {
    // Pre-populate dashboard state to skip loading
    useAppStore.setState({
      dashboardSummary: mockSummary,
      dashboardActiveAgents: mockActiveAgents,
      dashboardRecentTasks: mockRecentTasks,
      dashboardActivityFeed: mockActivityFeed,
      dashboardLoading: false,
    })
    renderWithRouter(<DashboardPage />)
    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument()
    })
  })

  it('renders quick stats when summary is available', async () => {
    useAppStore.setState({
      dashboardSummary: mockSummary,
      dashboardActiveAgents: mockActiveAgents,
      dashboardRecentTasks: mockRecentTasks,
      dashboardActivityFeed: mockActivityFeed,
      dashboardLoading: false,
    })
    renderWithRouter(<DashboardPage />)
    await waitFor(() => {
      expect(screen.getByText('Projects')).toBeInTheDocument()
      expect(screen.getByText('Agents')).toBeInTheDocument()
      expect(screen.getByText('Active')).toBeInTheDocument()
      expect(screen.getByText('Running Tasks')).toBeInTheDocument()
      expect(screen.getByText('Done Today')).toBeInTheDocument()
      expect(screen.getByText('Tokens Today')).toBeInTheDocument()
    })
  })

  it('renders active agents panel', async () => {
    useAppStore.setState({
      dashboardSummary: mockSummary,
      dashboardActiveAgents: mockActiveAgents,
      dashboardRecentTasks: mockRecentTasks,
      dashboardActivityFeed: mockActivityFeed,
      dashboardLoading: false,
    })
    renderWithRouter(<DashboardPage />)
    await waitFor(() => {
      expect(screen.getByText('Active Agents')).toBeInTheDocument()
      expect(screen.getByText('Writer')).toBeInTheDocument()
      // "Draft blog post" appears in both agents panel and tasks panel
      expect(screen.getAllByText('Draft blog post').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('renders recent tasks panel', async () => {
    useAppStore.setState({
      dashboardSummary: mockSummary,
      dashboardActiveAgents: mockActiveAgents,
      dashboardRecentTasks: mockRecentTasks,
      dashboardActivityFeed: mockActivityFeed,
      dashboardLoading: false,
    })
    renderWithRouter(<DashboardPage />)
    await waitFor(() => {
      expect(screen.getByText('Recent Tasks')).toBeInTheDocument()
    })
  })

  it('renders activity feed', async () => {
    useAppStore.setState({
      dashboardSummary: mockSummary,
      dashboardActiveAgents: mockActiveAgents,
      dashboardRecentTasks: mockRecentTasks,
      dashboardActivityFeed: mockActivityFeed,
      dashboardLoading: false,
    })
    renderWithRouter(<DashboardPage />)
    await waitFor(() => {
      expect(screen.getByText('Recent Activity')).toBeInTheDocument()
      expect(screen.getByText('Writer agent started working')).toBeInTheDocument()
    })
  })

  it('renders tabs for Overview and All Agents', async () => {
    useAppStore.setState({
      dashboardSummary: mockSummary,
      dashboardActiveAgents: [],
      dashboardRecentTasks: [],
      dashboardActivityFeed: [],
      dashboardLoading: false,
    })
    renderWithRouter(<DashboardPage />)
    await waitFor(() => {
      expect(screen.getByText('Overview')).toBeInTheDocument()
      expect(screen.getByText('All Agents')).toBeInTheDocument()
    })
  })

  it('shows empty state messages when no data', async () => {
    // Use services that return empty data so useEffect doesn't repopulate
    const emptyServices = createEmptyDashboardServices()
    configureServices(emptyServices)
    useAppStore.setState({
      dashboardSummary: mockSummary,
      dashboardActiveAgents: [],
      dashboardRecentTasks: [],
      dashboardActivityFeed: [],
      dashboardLoading: false,
    })
    renderWithRouter(<DashboardPage />)
    await waitFor(() => {
      expect(screen.getByText('No active agents')).toBeInTheDocument()
      expect(screen.getByText('No recent tasks')).toBeInTheDocument()
      expect(screen.getByText('No recent activity')).toBeInTheDocument()
    })
  })
})
