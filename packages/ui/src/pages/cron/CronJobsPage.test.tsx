import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
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
    description: 'Generate daily project summary',
    cronExpression: '0 9 * * *',
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'cron-2' as CronJobId,
    projectId: 'proj-1' as ProjectId,
    agentId: 'agent-2' as AgentId,
    name: 'Weekly Scan',
    description: '',
    cronExpression: '0 8 * * 1',
    enabled: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
]

function createTestServices(): ServiceContainer {
  return {
    projects: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    agents: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    conversations: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), sendMessage: vi.fn(), saveMessage: vi.fn(), getMessages: vi.fn(), searchMessages: vi.fn(), delete: vi.fn() },
    tasks: { list: vi.fn(), getById: vi.fn() },
    workspace: { listDir: vi.fn(), readFile: vi.fn(), deleteFile: vi.fn(), getFileUrl: vi.fn() },
    memory: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    settings: { get: vi.fn(), update: vi.fn() },
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
    })
  })

  it('shows spinner when loading', () => {
    useAppStore.setState({ cronJobsLoading: true })
    const { container } = render(<CronJobsPage />)
    // PixelSpinner renders animated spans with pixel-pulse animation
    expect(container.querySelector('[class*="animate-"]')).toBeTruthy()
    // Should not show the header or empty state
    expect(screen.queryByText('Cron Jobs')).not.toBeInTheDocument()
  })

  it('shows empty state when no cron jobs', () => {
    render(<CronJobsPage />)
    expect(screen.getByText('No scheduled jobs')).toBeInTheDocument()
    expect(screen.getByText('Create First Job')).toBeInTheDocument()
  })

  it('renders header with count badge', () => {
    useAppStore.setState({ cronJobs: mockCronJobs as any })
    render(<CronJobsPage />)
    expect(screen.getByText('Cron Jobs')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('renders cron job list with names and expressions', () => {
    useAppStore.setState({ cronJobs: mockCronJobs as any })
    render(<CronJobsPage />)
    expect(screen.getByText('Daily Summary')).toBeInTheDocument()
    expect(screen.getByText('0 9 * * *')).toBeInTheDocument()
    expect(screen.getByText('Weekly Scan')).toBeInTheDocument()
    expect(screen.getByText('0 8 * * 1')).toBeInTheDocument()
  })

  it('shows description when available', () => {
    useAppStore.setState({ cronJobs: mockCronJobs as any })
    render(<CronJobsPage />)
    expect(screen.getByText('Generate daily project summary')).toBeInTheDocument()
  })

  it('shows agent name badge for each job', () => {
    useAppStore.setState({ cronJobs: mockCronJobs as any })
    render(<CronJobsPage />)
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
    render(<CronJobsPage />)
    expect(screen.getByText('Agent not found')).toBeInTheDocument()
  })

  it('shows "+ New Job" button', () => {
    render(<CronJobsPage />)
    expect(screen.getByText('+ New Job')).toBeInTheDocument()
  })

  it('opens form modal when clicking "+ New Job"', () => {
    render(<CronJobsPage />)
    fireEvent.click(screen.getByText('+ New Job'))
    expect(screen.getByText('New Cron Job')).toBeInTheDocument()
  })

  it('opens form modal when clicking "Create First Job" in empty state', () => {
    render(<CronJobsPage />)
    fireEvent.click(screen.getByText('Create First Job'))
    expect(screen.getByText('New Cron Job')).toBeInTheDocument()
  })

  it('opens edit form when clicking Edit', () => {
    useAppStore.setState({ cronJobs: mockCronJobs as any })
    render(<CronJobsPage />)
    const editButtons = screen.getAllByText('Edit')
    fireEvent.click(editButtons[0])
    expect(screen.getByText('Edit Cron Job')).toBeInTheDocument()
  })

  it('opens delete confirmation when clicking Delete', () => {
    useAppStore.setState({ cronJobs: mockCronJobs as any })
    render(<CronJobsPage />)
    const deleteButtons = screen.getAllByText('Delete')
    fireEvent.click(deleteButtons[0])
    expect(screen.getByText('Delete Cron Job')).toBeInTheDocument()
    expect(screen.getByText(/Are you sure you want to delete "Daily Summary"/)).toBeInTheDocument()
  })

  it('calls deleteCronJob when confirming delete', async () => {
    useAppStore.setState({ cronJobs: mockCronJobs as any })
    render(<CronJobsPage />)
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
    render(<CronJobsPage />)
    expect(screen.getAllByText('Edit')).toHaveLength(2)
    // Delete buttons: 2 from jobs list (modal not open yet)
    expect(screen.getAllByText('Delete')).toHaveLength(2)
  })
})
