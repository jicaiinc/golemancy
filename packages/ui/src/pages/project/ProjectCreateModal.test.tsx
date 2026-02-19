import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router'
import { ProjectCreateModal } from './ProjectCreateModal'
import { useAppStore } from '../../stores'
import { configureServices } from '../../services/container'
import type { ServiceContainer } from '../../services/container'
import type { ProjectId, GlobalSettings } from '@golemancy/shared'

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
  providers: {
    openai: { name: 'OpenAI', sdkType: 'openai', apiKey: 'sk-test', models: ['gpt-4o'], testStatus: 'ok' },
  },
  theme: 'dark',
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
    conversations: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), sendMessage: vi.fn(), saveMessage: vi.fn(), getMessages: vi.fn(), searchMessages: vi.fn(), delete: vi.fn() },
    tasks: { list: vi.fn(), getById: vi.fn() },
    workspace: { listDir: vi.fn(), readFile: vi.fn(), deleteFile: vi.fn(), getFileUrl: vi.fn() },
    memory: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    settings: { get: vi.fn(), update: vi.fn(), testProvider: vi.fn() },
    cronJobs: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
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

  it('renders icon picker', () => {
    renderWithRouter(<ProjectCreateModal open={true} onClose={() => {}} />)
    expect(screen.getByText('ICON')).toBeInTheDocument()
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
