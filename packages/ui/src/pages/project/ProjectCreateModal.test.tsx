import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router'
import { ProjectCreateModal } from './ProjectCreateModal'
import { useAppStore } from '../../stores'
import { configureServices } from '../../services/container'
import type { ServiceContainer } from '../../services/container'
import type { ProjectId, GlobalSettings } from '@solocraft/shared'

// Mock motion/react to avoid animation issues in tests
vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => {
      const { initial, animate, exit, transition, ...rest } = props
      return <div {...rest}>{children}</div>
    },
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

const mockSettings: GlobalSettings = {
  providers: [{ provider: 'openai', apiKey: 'sk-test', defaultModel: 'gpt-4o' }],
  defaultProvider: 'openai',
  theme: 'dark',
  userProfile: { name: 'Test', email: 'test@test.com' },
  defaultWorkingDirectoryBase: '~/projects',
}

function createTestServices(): ServiceContainer {
  return {
    projects: {
      list: vi.fn(),
      getById: vi.fn(),
      create: vi.fn().mockImplementation((data) =>
        Promise.resolve({ id: 'proj-new' as ProjectId, ...data }),
      ),
      update: vi.fn(),
      delete: vi.fn(),
    },
    agents: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    conversations: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), sendMessage: vi.fn(), saveMessage: vi.fn(), getMessages: vi.fn(), searchMessages: vi.fn(), delete: vi.fn() },
    tasks: { list: vi.fn(), getById: vi.fn(), cancel: vi.fn(), getLogs: vi.fn() },
    artifacts: { list: vi.fn(), getById: vi.fn(), delete: vi.fn() },
    memory: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    settings: { get: vi.fn(), update: vi.fn() },
    cronJobs: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    dashboard: {
      getSummary: vi.fn().mockResolvedValue({}),
      getActiveAgents: vi.fn().mockResolvedValue([]),
      getRecentTasks: vi.fn().mockResolvedValue([]),
      getActivityFeed: vi.fn().mockResolvedValue([]),
    },
  }
}

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe('ProjectCreateModal', () => {
  let services: ServiceContainer

  beforeEach(() => {
    services = createTestServices()
    configureServices(services)
    useAppStore.setState({
      settings: mockSettings,
      projects: [],
    })
  })

  it('renders when open', () => {
    renderWithRouter(<ProjectCreateModal open={true} onClose={() => {}} />)
    expect(screen.getByText('Create New Project')).toBeInTheDocument()
  })

  it('does not render when closed', () => {
    renderWithRouter(<ProjectCreateModal open={false} onClose={() => {}} />)
    expect(screen.queryByText('Create New Project')).not.toBeInTheDocument()
  })

  it('renders project name input', () => {
    renderWithRouter(<ProjectCreateModal open={true} onClose={() => {}} />)
    expect(screen.getByText('PROJECT NAME')).toBeInTheDocument()
  })

  it('renders description textarea', () => {
    renderWithRouter(<ProjectCreateModal open={true} onClose={() => {}} />)
    expect(screen.getByText('DESCRIPTION')).toBeInTheDocument()
  })

  it('renders working directory field', () => {
    renderWithRouter(<ProjectCreateModal open={true} onClose={() => {}} />)
    expect(screen.getByText('WORKING DIRECTORY')).toBeInTheDocument()
  })

  it('renders icon picker', () => {
    renderWithRouter(<ProjectCreateModal open={true} onClose={() => {}} />)
    expect(screen.getByText('ICON')).toBeInTheDocument()
  })

  it('auto-generates working directory from project name', async () => {
    renderWithRouter(<ProjectCreateModal open={true} onClose={() => {}} />)

    const nameInput = screen.getByPlaceholderText('My Awesome Project')
    fireEvent.change(nameInput, { target: { value: 'My Test Project' } })

    await waitFor(() => {
      const workDirInput = screen.getByPlaceholderText('~/projects/my-project')
      expect((workDirInput as HTMLInputElement).value).toBe('~/projects/my-test-project')
    })
  })

  it('shows auto-generated hint when name is set', async () => {
    renderWithRouter(<ProjectCreateModal open={true} onClose={() => {}} />)

    const nameInput = screen.getByPlaceholderText('My Awesome Project')
    fireEvent.change(nameInput, { target: { value: 'Test' } })

    await waitFor(() => {
      expect(screen.getByText('Auto-generated from project name')).toBeInTheDocument()
    })
  })

  it('Create Project button is disabled when name is empty', () => {
    renderWithRouter(<ProjectCreateModal open={true} onClose={() => {}} />)
    const createBtn = screen.getByText('Create Project')
    expect(createBtn).toBeDisabled()
  })

  it('Create Project button is enabled when name is provided', () => {
    renderWithRouter(<ProjectCreateModal open={true} onClose={() => {}} />)
    const nameInput = screen.getByPlaceholderText('My Awesome Project')
    fireEvent.change(nameInput, { target: { value: 'New Project' } })
    const createBtn = screen.getByText('Create Project')
    expect(createBtn).not.toBeDisabled()
  })

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn()
    renderWithRouter(<ProjectCreateModal open={true} onClose={onClose} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
