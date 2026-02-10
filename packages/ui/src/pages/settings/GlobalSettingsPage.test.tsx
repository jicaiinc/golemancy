import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router'
import { GlobalSettingsPage } from './GlobalSettingsPage'
import { useAppStore } from '../../stores'
import { configureServices } from '../../services/container'
import type { ServiceContainer } from '../../services/container'
import type { GlobalSettings } from '@solocraft/shared'

const mockSettings: GlobalSettings = {
  providers: [
    { provider: 'openai', apiKey: 'sk-test-key', defaultModel: 'gpt-4o' },
  ],
  defaultProvider: 'openai',
  theme: 'dark',
  userProfile: { name: 'Test User', email: 'test@example.com' },
  defaultWorkingDirectoryBase: '~/projects',
}

function createTestServices(): ServiceContainer {
  return {
    projects: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    agents: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    conversations: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), sendMessage: vi.fn(), getMessages: vi.fn(), searchMessages: vi.fn(), delete: vi.fn() },
    tasks: { list: vi.fn(), getById: vi.fn(), cancel: vi.fn(), getLogs: vi.fn() },
    artifacts: { list: vi.fn(), getById: vi.fn(), delete: vi.fn() },
    memory: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    settings: {
      get: vi.fn().mockResolvedValue(mockSettings),
      update: vi.fn().mockImplementation((data) => Promise.resolve({ ...mockSettings, ...data })),
    },
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

describe('GlobalSettingsPage', () => {
  beforeEach(() => {
    const services = createTestServices()
    configureServices(services)
    useAppStore.setState({
      settings: mockSettings,
      themeMode: 'dark',
    })
  })

  it('renders nothing when settings is null', () => {
    useAppStore.setState({ settings: null })
    const { container } = renderWithRouter(<GlobalSettingsPage />)
    expect(container.innerHTML).toBe('')
  })

  it('renders the page title', () => {
    renderWithRouter(<GlobalSettingsPage />)
    expect(screen.getByText('Global Settings')).toBeInTheDocument()
  })

  it('renders all 5 tabs', () => {
    renderWithRouter(<GlobalSettingsPage />)
    expect(screen.getByText('Providers')).toBeInTheDocument()
    expect(screen.getByText('Appearance')).toBeInTheDocument()
    expect(screen.getByText('Profile')).toBeInTheDocument()
    expect(screen.getByText('Paths')).toBeInTheDocument()
    expect(screen.getByText('General')).toBeInTheDocument()
  })

  it('shows Providers tab by default', () => {
    renderWithRouter(<GlobalSettingsPage />)
    expect(screen.getByText('DEFAULT PROVIDER')).toBeInTheDocument()
    // OpenAI appears in both the provider selector and the configured provider card
    expect(screen.getAllByText('OpenAI').length).toBeGreaterThanOrEqual(1)
  })

  it('switches to Appearance tab and shows theme options', () => {
    renderWithRouter(<GlobalSettingsPage />)
    fireEvent.click(screen.getByText('Appearance'))
    expect(screen.getByText('THEME')).toBeInTheDocument()
    expect(screen.getByText('Light')).toBeInTheDocument()
    expect(screen.getByText('Dark')).toBeInTheDocument()
    expect(screen.getByText('System')).toBeInTheDocument()
  })

  it('switches to Profile tab and shows form fields', () => {
    renderWithRouter(<GlobalSettingsPage />)
    fireEvent.click(screen.getByText('Profile'))
    expect(screen.getByText('USER PROFILE')).toBeInTheDocument()
  })

  it('switches to Paths tab and shows working directory', () => {
    renderWithRouter(<GlobalSettingsPage />)
    fireEvent.click(screen.getByText('Paths'))
    expect(screen.getByText('DEFAULT WORKING DIRECTORY')).toBeInTheDocument()
  })

  it('switches to General tab and shows about info', () => {
    renderWithRouter(<GlobalSettingsPage />)
    fireEvent.click(screen.getByText('General'))
    expect(screen.getByText('ABOUT')).toBeInTheDocument()
    expect(screen.getByText('SoloCraft')).toBeInTheDocument()
    expect(screen.getByText('v0.1.0')).toBeInTheDocument()
  })

  it('renders back button', () => {
    renderWithRouter(<GlobalSettingsPage />)
    // The back button has "← Back" text (HTML entity)
    const backBtn = screen.getByText(/Back/)
    expect(backBtn).toBeInTheDocument()
  })
})
