import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router'
import { GlobalSettingsPage } from './GlobalSettingsPage'
import { useAppStore } from '../../stores'
import { configureServices } from '../../services/container'
import { ServiceProvider } from '../../services/ServiceProvider'
import type { ServiceContainer } from '../../services/container'
import type { GlobalSettings } from '@golemancy/shared'

const mockSettings: GlobalSettings = {
  providers: {
    openai: { name: 'OpenAI', sdkType: 'openai', apiKey: 'sk-test-key', models: ['gpt-4o'], testStatus: 'ok' },
  },
  theme: 'dark',
}

function createTestServices(): ServiceContainer {
  return {
    projects: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    agents: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    conversations: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), sendMessage: vi.fn(), saveMessage: vi.fn(), getMessages: vi.fn(), searchMessages: vi.fn(), delete: vi.fn() },
    tasks: { list: vi.fn(), getById: vi.fn() },
    workspace: { listDir: vi.fn(), readFile: vi.fn(), deleteFile: vi.fn(), getFileUrl: vi.fn() },
    memory: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    settings: {
      get: vi.fn().mockResolvedValue(mockSettings),
      update: vi.fn().mockImplementation((data) => Promise.resolve({ ...mockSettings, ...data })),
      testProvider: vi.fn().mockResolvedValue({ ok: true, latencyMs: 150 }),
    },
    cronJobs: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
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
  }
}

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter><ServiceProvider>{ui}</ServiceProvider></MemoryRouter>)
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

  it('renders all tabs', () => {
    renderWithRouter(<GlobalSettingsPage />)
    expect(screen.getByText('General')).toBeInTheDocument()
    expect(screen.getByText('Providers')).toBeInTheDocument()
  })

  it('shows General tab by default with Appearance section', () => {
    renderWithRouter(<GlobalSettingsPage />)
    expect(screen.getByText('APPEARANCE')).toBeInTheDocument()
    expect(screen.getByText('Light')).toBeInTheDocument()
    expect(screen.getByText('Dark')).toBeInTheDocument()
    expect(screen.getByText('System')).toBeInTheDocument()
  })

  it('switches to Providers tab and shows provider list', () => {
    renderWithRouter(<GlobalSettingsPage />)
    fireEvent.click(screen.getByText('Providers'))
    expect(screen.getByText('PROVIDERS')).toBeInTheDocument()
    expect(screen.getAllByText('OpenAI').length).toBeGreaterThanOrEqual(1)
  })

  it('renders about footer with version', () => {
    renderWithRouter(<GlobalSettingsPage />)
    expect(screen.getByText(/Golemancy v0\.1\.0/)).toBeInTheDocument()
    expect(screen.getByText(/AI Agent Orchestrator for Super Individuals/)).toBeInTheDocument()
  })

  it('renders Golemancy branding in header', () => {
    renderWithRouter(<GlobalSettingsPage />)
    expect(screen.getByText('Golemancy')).toBeInTheDocument()
  })
})
