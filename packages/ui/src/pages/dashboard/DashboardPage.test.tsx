import { render, screen, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router'
import { DashboardPage } from './DashboardPage'
import { useAppStore } from '../../stores'
import { configureServices } from '../../services/container'
import type { ServiceContainer } from '../../services/container'
import type { ProjectId, AgentId, DashboardSummary, DashboardAgentSummary, ActivityEntry } from '@golemancy/shared'

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
  totalTokenUsageToday: 2134,
}

const mockActiveAgents: DashboardAgentSummary[] = [
  {
    agentId: 'agent-1' as AgentId,
    projectId: 'proj-1' as ProjectId,
    projectName: 'Content Biz',
    agentName: 'Writer',
    status: 'running',
  },
]

const mockActivityFeed: ActivityEntry[] = [
  {
    id: 'activity-1',
    type: 'agent_started',
    projectId: 'proj-1' as ProjectId,
    agentId: 'agent-1' as AgentId,
    agentName: 'Writer',
    projectName: 'Content Biz',
    description: 'Writer agent started working',
    timestamp: new Date().toISOString(),
  },
]

function createTestServices(): ServiceContainer {
  return {
    projects: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    agents: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    conversations: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), sendMessage: vi.fn(), saveMessage: vi.fn(), getMessages: vi.fn(), searchMessages: vi.fn(), delete: vi.fn() },
    tasks: { list: vi.fn(), getById: vi.fn() },
    artifacts: { list: vi.fn(), getById: vi.fn(), delete: vi.fn() },
    memory: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    settings: { get: vi.fn(), update: vi.fn() },
    cronJobs: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    skills: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), importZip: vi.fn() },
    mcp: { list: vi.fn(), getByName: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), resolveNames: vi.fn() },
    dashboard: {
      getSummary: vi.fn().mockResolvedValue(mockSummary),
      getActiveAgents: vi.fn().mockResolvedValue(mockActiveAgents),
      getActivityFeed: vi.fn().mockResolvedValue(mockActivityFeed),
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

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

function createEmptyDashboardServices(): ServiceContainer {
  return {
    ...createTestServices(),
    dashboard: {
      getSummary: vi.fn().mockResolvedValue(mockSummary),
      getActiveAgents: vi.fn().mockResolvedValue([]),
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
    useAppStore.setState({
      dashboardSummary: mockSummary,
      dashboardActiveAgents: mockActiveAgents,
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
      dashboardActivityFeed: mockActivityFeed,
      dashboardLoading: false,
    })
    renderWithRouter(<DashboardPage />)
    await waitFor(() => {
      expect(screen.getByText('Projects')).toBeInTheDocument()
      expect(screen.getByText('Agents')).toBeInTheDocument()
      expect(screen.getByText('Active')).toBeInTheDocument()
      expect(screen.getByText('Tokens Today')).toBeInTheDocument()
    })
  })

  it('renders active agents panel', async () => {
    useAppStore.setState({
      dashboardSummary: mockSummary,
      dashboardActiveAgents: mockActiveAgents,
      dashboardActivityFeed: mockActivityFeed,
      dashboardLoading: false,
    })
    renderWithRouter(<DashboardPage />)
    await waitFor(() => {
      expect(screen.getByText('Active Agents')).toBeInTheDocument()
      expect(screen.getByText('Writer')).toBeInTheDocument()
    })
  })

  it('renders activity feed', async () => {
    useAppStore.setState({
      dashboardSummary: mockSummary,
      dashboardActiveAgents: mockActiveAgents,
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
    const emptyServices = createEmptyDashboardServices()
    configureServices(emptyServices)
    useAppStore.setState({
      dashboardSummary: mockSummary,
      dashboardActiveAgents: [],
      dashboardActivityFeed: [],
      dashboardLoading: false,
    })
    renderWithRouter(<DashboardPage />)
    await waitFor(() => {
      expect(screen.getByText('No active agents')).toBeInTheDocument()
      expect(screen.getByText('No recent activity')).toBeInTheDocument()
    })
  })
})
