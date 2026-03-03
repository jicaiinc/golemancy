import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router'
import { CronJobsPage } from './CronJobsPage'
import { useAppStore } from '../../stores'
import { configureServices } from '../../services/container'
import type { ServiceContainer } from '../../services/container'
import type { AgentId, CronJobId, ProjectId } from '@golemancy/shared'

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

const mockAgents = [
  { id: 'agent-1' as AgentId, projectId: 'proj-1' as ProjectId, name: 'Writer' },
  { id: 'agent-2' as AgentId, projectId: 'proj-1' as ProjectId, name: 'Researcher' },
]

const mockCronJobs = [
  {
    id: 'cron-1' as CronJobId,
    projectId: 'proj-1' as ProjectId,
    agentId: 'agent-1' as AgentId,
    name: 'Daily Summary',
    cronExpression: '0 9 * * *',
    enabled: true,
    scheduleType: 'cron' as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'cron-2' as CronJobId,
    projectId: 'proj-1' as ProjectId,
    agentId: 'agent-2' as AgentId,
    name: 'Weekly Scan',
    cronExpression: '0 8 * * 1',
    enabled: false,
    scheduleType: 'cron' as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
]

function renderWithRouter(ui: React.ReactElement) {
  return render(
    <MemoryRouter initialEntries={['/projects/proj-1/cron']}>
      {ui}
    </MemoryRouter>
  )
}

function createTestServices(): ServiceContainer {
  return {
    projects: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), getTopologyLayout: vi.fn().mockResolvedValue({}), saveTopologyLayout: vi.fn() },
    agents: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    conversations: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), sendMessage: vi.fn(), saveMessage: vi.fn(), getMessages: vi.fn(), searchMessages: vi.fn(), delete: vi.fn() },
    tasks: { list: vi.fn(), getById: vi.fn() },
    workspace: { listDir: vi.fn(), readFile: vi.fn(), deleteFile: vi.fn(), getFileUrl: vi.fn() },
    knowledgeBase: { listCollections: vi.fn(), createCollection: vi.fn(), updateCollection: vi.fn(), deleteCollection: vi.fn(), listDocuments: vi.fn(), ingestDocument: vi.fn(), uploadDocument: vi.fn(), getDocument: vi.fn(), deleteDocument: vi.fn(), search: vi.fn(), hasVectorData: vi.fn() },
    settings: { get: vi.fn(), update: vi.fn(), testProvider: vi.fn(), testEmbedding: vi.fn() },
    cronJobs: {
      list: vi.fn(),
      getById: vi.fn(),
      create: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    },
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
  }
}

describe('CronJobsPage', () => {
  let services: ServiceContainer

  beforeEach(() => {
    services = createTestServices()
    configureServices(services)
    useAppStore.setState({
      currentProjectId: 'proj-1' as ProjectId,
      agents: mockAgents as any,
      cronJobs: [],
      cronJobsLoading: false,
      cronJobRuns: [],
      cronJobRunsLoading: false,
    })
  })

  it('shows spinner when loading', () => {
    useAppStore.setState({ cronJobsLoading: true })
    const { container } = renderWithRouter(<CronJobsPage />)
    // PixelSpinner renders animated spans with pixel-pulse animation
    expect(container.querySelector('[class*="animate-"]')).toBeTruthy()
    // Should not show the header or empty state
    expect(screen.queryByText('Automations')).not.toBeInTheDocument()
  })

  it('shows empty state when no cron jobs', () => {
    renderWithRouter(<CronJobsPage />)
    expect(screen.getByText('No automations yet')).toBeInTheDocument()
    expect(screen.getByText('Create First Automation')).toBeInTheDocument()
  })

  it('renders header with count badge', () => {
    useAppStore.setState({ cronJobs: mockCronJobs as any })
    renderWithRouter(<CronJobsPage />)
    expect(screen.getByText('Automations')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('renders cron job list with names and expressions', () => {
    useAppStore.setState({ cronJobs: mockCronJobs as any })
    renderWithRouter(<CronJobsPage />)
    expect(screen.getByText('Daily Summary')).toBeInTheDocument()
    expect(screen.getByText('0 9 * * *')).toBeInTheDocument()
    expect(screen.getByText('Weekly Scan')).toBeInTheDocument()
    expect(screen.getByText('0 8 * * 1')).toBeInTheDocument()
  })

  it('shows agent name badge for each job', () => {
    useAppStore.setState({ cronJobs: mockCronJobs as any })
    renderWithRouter(<CronJobsPage />)
    expect(screen.getByText('Writer')).toBeInTheDocument()
    expect(screen.getByText('Researcher')).toBeInTheDocument()
  })

  it('shows "Agent not found" when agent is missing', () => {
    useAppStore.setState({
      cronJobs: [{
        ...mockCronJobs[0],
        agentId: 'agent-missing' as AgentId,
      }] as any,
    })
    renderWithRouter(<CronJobsPage />)
    expect(screen.getByText('Agent not found')).toBeInTheDocument()
  })

  it('shows "+ New" button', () => {
    renderWithRouter(<CronJobsPage />)
    expect(screen.getByText('+ New')).toBeInTheDocument()
  })

  it('opens form modal when clicking "+ New"', () => {
    renderWithRouter(<CronJobsPage />)
    fireEvent.click(screen.getByText('+ New'))
    expect(screen.getByText('New Automation')).toBeInTheDocument()
  })

  it('opens form modal when clicking "Create First Automation" in empty state', () => {
    renderWithRouter(<CronJobsPage />)
    fireEvent.click(screen.getByText('Create First Automation'))
    expect(screen.getByText('New Automation')).toBeInTheDocument()
  })

  it('opens edit form when clicking Edit', () => {
    useAppStore.setState({ cronJobs: mockCronJobs as any })
    renderWithRouter(<CronJobsPage />)
    const editButtons = screen.getAllByText('Edit')
    fireEvent.click(editButtons[0])
    expect(screen.getByText('Edit Automation')).toBeInTheDocument()
  })

  it('opens delete confirmation when clicking Delete', () => {
    useAppStore.setState({ cronJobs: mockCronJobs as any })
    renderWithRouter(<CronJobsPage />)
    const deleteButtons = screen.getAllByText('Delete')
    fireEvent.click(deleteButtons[0])
    expect(screen.getByText('Delete Automation')).toBeInTheDocument()
    expect(screen.getByText(/Are you sure you want to delete "Daily Summary"/)).toBeInTheDocument()
  })

  it('calls deleteCronJob when confirming delete', async () => {
    useAppStore.setState({ cronJobs: mockCronJobs as any })
    renderWithRouter(<CronJobsPage />)
    // Click first delete button to open modal
    const deleteButtons = screen.getAllByText('Delete')
    fireEvent.click(deleteButtons[0])
    // Now there are more "Delete" buttons — the last one is in the modal footer
    const allDeleteBtns = screen.getAllByText('Delete')
    fireEvent.click(allDeleteBtns[allDeleteBtns.length - 1])
    await waitFor(() => {
      expect(services.cronJobs.delete).toHaveBeenCalled()
    })
  })

  it('has Edit and Delete buttons for each job', () => {
    useAppStore.setState({ cronJobs: mockCronJobs as any })
    renderWithRouter(<CronJobsPage />)
    expect(screen.getAllByText('Edit')).toHaveLength(2)
    // Delete buttons: 2 from jobs list (modal not open yet)
    expect(screen.getAllByText('Delete')).toHaveLength(2)
  })

  it('shows running status bar when job is running', () => {
    useAppStore.setState({
      cronJobs: [{
        ...mockCronJobs[0],
        lastRunStatus: 'running',
        lastRunId: 'run-1',
      }] as any,
    })
    renderWithRouter(<CronJobsPage />)
    expect(screen.getByText('Running...')).toBeInTheDocument()
    expect(screen.getByText('View Chat →')).toBeInTheDocument()
  })

  it('shows "once" badge for one-time schedules', () => {
    useAppStore.setState({
      cronJobs: [{
        ...mockCronJobs[0],
        scheduleType: 'once',
        scheduledAt: '2026-03-01T09:00:00.000Z',
      }] as any,
    })
    renderWithRouter(<CronJobsPage />)
    expect(screen.getByText('once')).toBeInTheDocument()
  })
})
