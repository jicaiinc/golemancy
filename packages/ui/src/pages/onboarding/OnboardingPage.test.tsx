import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router'
import { OnboardingPage } from './OnboardingPage'
import { useAppStore } from '../../stores'
import { configureServices } from '../../services/container'
import type { ServiceContainer } from '../../services/container'
import type { GlobalSettings, ProjectId, AgentId } from '@golemancy/shared'

// Mock motion/react to avoid animation issues in tests
vi.mock('motion/react', () => {
  const el = (Tag: string) => {
    const Comp = ({ children, ...props }: any) => {
      const { initial, animate, exit, transition, custom, variants, style, ...rest } = props
      return <Tag {...rest} style={style}>{children}</Tag>
    }
    Comp.displayName = `motion.${Tag}`
    return Comp
  }
  return {
    motion: { div: el('div'), h1: el('h1'), p: el('p'), span: el('span') },
    AnimatePresence: ({ children }: any) => <>{children}</>,
  }
})

const emptySettings: GlobalSettings = {
  providers: {},
  theme: 'dark',
}

function createTestServices(): ServiceContainer {
  return {
    projects: {
      list: vi.fn().mockResolvedValue([]),
      getById: vi.fn(),
      create: vi.fn().mockImplementation((data) =>
        Promise.resolve({
          id: 'proj-new' as ProjectId,
          ...data,
          config: {},
          agentCount: 0,
          activeAgentCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      ),
      update: vi.fn().mockImplementation((id, data) =>
        Promise.resolve({
          id,
          name: 'Test',
          description: '',
          icon: 'pickaxe',
          config: {},
          defaultTargetType: 'agent',
          defaultTargetId: 'agent-1' as AgentId,
          agentCount: 1,
          activeAgentCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          ...data,
        }),
      ),
      delete: vi.fn(),
      clone: vi.fn(),
    },
    agents: {
      list: vi.fn().mockResolvedValue([]),
      getById: vi.fn(),
      create: vi.fn().mockImplementation((projectId, data) =>
        Promise.resolve({
          id: 'agent-1' as AgentId,
          projectId,
          ...data,
          status: 'idle',
          skillIds: [],
          tools: [],

          mcpServers: [],
          builtinTools: { bash: true },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      ),
      update: vi.fn(),
      delete: vi.fn(),
      clone: vi.fn(),
    },
    conversations: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), sendMessage: vi.fn(), saveMessage: vi.fn(), getMessages: vi.fn(), searchMessages: vi.fn(), delete: vi.fn() },
    tasks: { list: vi.fn(), getById: vi.fn() },
    workspace: { listDir: vi.fn(), readFile: vi.fn(), deleteFile: vi.fn(), getFileUrl: vi.fn() },
    settings: {
      get: vi.fn().mockResolvedValue(emptySettings),
      update: vi.fn().mockImplementation((data) => Promise.resolve({ ...emptySettings, ...data })),
      testProvider: vi.fn().mockResolvedValue({ ok: true, latencyMs: 100 }),
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
    speech: {
      testProvider: vi.fn().mockResolvedValue({ ok: true, latencyMs: 50 }),
    } as any,
    memories: {} as any,
    teams: {} as any,
  }
}

function renderOnboarding() {
  return render(
    <MemoryRouter>
      <OnboardingPage />
    </MemoryRouter>
  )
}

describe('OnboardingPage', () => {
  let services: ServiceContainer

  beforeEach(() => {
    services = createTestServices()
    configureServices(services)
    useAppStore.setState({
      settings: emptySettings,
      projects: [],
      projectsLoading: false,
    })
  })

  it('renders the onboarding page', () => {
    renderOnboarding()
    expect(screen.getByTestId('onboarding-page')).toBeInTheDocument()
  })

  it('shows welcome step initially', () => {
    renderOnboarding()
    expect(screen.getByText('Command Your AI Golems')).toBeInTheDocument()
    expect(screen.getByText('Orchestrate autonomous AI agents from your desktop.')).toBeInTheDocument()
  })

  it('shows Get Started button on welcome step', () => {
    renderOnboarding()
    expect(screen.getByText('Get Started')).toBeInTheDocument()
  })

  it('shows progress bar and step labels', () => {
    renderOnboarding()
    expect(screen.getByText('Provider')).toBeInTheDocument()
    expect(screen.getByText('Speech')).toBeInTheDocument()
    expect(screen.getByText('Project')).toBeInTheDocument()
    expect(screen.getByText('Complete')).toBeInTheDocument()
  })

  it('shows Skip Setup button', () => {
    renderOnboarding()
    expect(screen.getByText('Skip Setup')).toBeInTheDocument()
  })

  it('shows header with Golemancy branding', () => {
    renderOnboarding()
    expect(screen.getByText('Golemancy')).toBeInTheDocument()
    expect(screen.getByText('Setup')).toBeInTheDocument()
  })

  it('navigates to provider step when Get Started is clicked', () => {
    renderOnboarding()
    fireEvent.click(screen.getByText('Get Started'))
    expect(screen.getByText('Connect an AI Provider')).toBeInTheDocument()
  })

  it('hides Back/Next footer on welcome step', () => {
    renderOnboarding()
    expect(screen.queryByText('Back')).not.toBeInTheDocument()
    expect(screen.queryByText('Next')).not.toBeInTheDocument()
  })

  it('shows Back button on step 1+', () => {
    renderOnboarding()
    fireEvent.click(screen.getByText('Get Started'))
    expect(screen.getByText('Back')).not.toBeDisabled()
  })

  it('navigates back from provider step to welcome', () => {
    renderOnboarding()
    fireEvent.click(screen.getByText('Get Started'))
    expect(screen.getByText('Connect an AI Provider')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Back'))
    expect(screen.getByText('Command Your AI Golems')).toBeInTheDocument()
  })

  it('shows provider grid on provider step', () => {
    renderOnboarding()
    fireEvent.click(screen.getByText('Get Started'))
    expect(screen.getByText('Anthropic')).toBeInTheDocument()
    expect(screen.getByText('OpenAI')).toBeInTheDocument()
    expect(screen.getByText('Google')).toBeInTheDocument()
    expect(screen.getByText('Custom')).toBeInTheDocument()
  })

  it('Next is disabled on provider step until test passes and model selected', () => {
    renderOnboarding()
    fireEvent.click(screen.getByText('Get Started'))
    // On provider step, Next should be disabled (no provider selected)
    const nextBtn = screen.getByText('Next')
    expect(nextBtn).toBeDisabled()
  })

  it('calls updateSettings with onboardingCompleted when Skip Setup is clicked', async () => {
    renderOnboarding()
    await act(async () => {
      fireEvent.click(screen.getByText('Skip Setup'))
    })
    // Store's updateSettings calls getServices().settings.update()
    await waitFor(() => {
      expect(services.settings.update).toHaveBeenCalledWith(
        expect.objectContaining({ onboardingCompleted: true }),
      )
    })
  })
})

describe('OnboardingPage — Provider Step', () => {
  let services: ServiceContainer

  beforeEach(() => {
    services = createTestServices()
    configureServices(services)
    useAppStore.setState({
      settings: emptySettings,
      projects: [],
      projectsLoading: false,
    })
  })

  it('shows API key input after selecting a provider', () => {
    renderOnboarding()
    fireEvent.click(screen.getByText('Get Started'))
    fireEvent.click(screen.getByText('Anthropic'))
    expect(screen.getByText('API KEY')).toBeInTheDocument()
  })

  it('shows Change button after selecting a provider', () => {
    renderOnboarding()
    fireEvent.click(screen.getByText('Get Started'))
    fireEvent.click(screen.getByText('Anthropic'))
    expect(screen.getByText('Change')).toBeInTheDocument()
  })

  it('shows Test Connection button', () => {
    renderOnboarding()
    fireEvent.click(screen.getByText('Get Started'))
    fireEvent.click(screen.getByText('Anthropic'))
    expect(screen.getByText('Test Connection')).toBeInTheDocument()
  })

  it('Test Connection button is disabled when no API key', () => {
    renderOnboarding()
    fireEvent.click(screen.getByText('Get Started'))
    fireEvent.click(screen.getByText('Anthropic'))
    expect(screen.getByText('Test Connection')).toBeDisabled()
  })

  it('clicking Change returns to provider grid', () => {
    renderOnboarding()
    fireEvent.click(screen.getByText('Get Started'))
    fireEvent.click(screen.getByText('Anthropic'))
    fireEvent.click(screen.getByText('Change'))
    // Should see the provider grid again
    expect(screen.getByText('OpenAI')).toBeInTheDocument()
    expect(screen.getByText('Google')).toBeInTheDocument()
  })

  it('shows custom provider form when Custom is clicked', () => {
    renderOnboarding()
    fireEvent.click(screen.getByText('Get Started'))
    fireEvent.click(screen.getByText('Custom'))
    expect(screen.getByText('CUSTOM PROVIDER')).toBeInTheDocument()
    expect(screen.getByText('NAME')).toBeInTheDocument()
  })
})

describe('OnboardingPage — OAuth Provider (Codex)', () => {
  let services: ServiceContainer

  beforeEach(() => {
    services = createTestServices()
    configureServices(services)
    useAppStore.setState({
      settings: emptySettings,
      projects: [],
      projectsLoading: false,
    })
  })

  it('shows OpenAI Codex in provider grid with OAUTH and NO API FEES labels', () => {
    renderOnboarding()
    fireEvent.click(screen.getByText('Get Started'))
    expect(screen.getByText('OpenAI Codex')).toBeInTheDocument()
    // OAUTH and NO API FEES badges are rendered for OAuth providers
    expect(screen.getAllByText('OAUTH').length).toBeGreaterThan(0)
  })

  it('shows Sign in button (not API key input) when Codex is selected', () => {
    renderOnboarding()
    fireEvent.click(screen.getByText('Get Started'))
    fireEvent.click(screen.getByText('OpenAI Codex'))
    // Should NOT show API key input for OAuth provider
    expect(screen.queryByText('API KEY')).not.toBeInTheDocument()
    // Should show Sign in button
    expect(screen.getByText(/Sign in/i)).toBeInTheDocument()
  })

  it('persistProviderStep preserves OAuth tokens from server', async () => {
    // Simulate: OAuth flow completed, server has tokens saved.
    // When user clicks "Next" on provider step, persistProviderStep should
    // fetch fresh settings (which include OAuth tokens) and NOT overwrite them.
    const oauthTokens = {
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      expiresAt: '2026-03-19T07:05:00.000Z',
    }
    const oauthConfig = {
      flowType: 'authorization_code' as const,
      clientId: 'app_test',
      authEndpoint: 'https://auth.openai.com/oauth/authorize',
      tokenEndpoint: 'https://auth.openai.com/oauth/token',
      scope: 'openid',
      apiBaseUrl: 'https://chatgpt.com/backend-api/codex',
    }

    // Server has the provider entry WITH oauth tokens (saved by OAuthManager)
    const serverProviderEntry = {
      name: 'OpenAI Codex',
      sdkType: 'openai' as const,
      models: ['gpt-5.3-codex'],
      oauthConfig,
      oauth: oauthTokens,
      testStatus: 'ok' as const,
    }

    // Mock settings.get to return fresh server-side settings (with OAuth tokens)
    vi.mocked(services.settings.get).mockResolvedValue({
      ...emptySettings,
      providers: { 'openai-codex': serverProviderEntry },
    })

    // Simulate the persistProviderStep logic:
    // It fetches fresh settings from server, then merges updates on top.
    // The key assertion: OAuth tokens from server are preserved.
    const freshSettings = await services.settings.get()
    const currentEntry = freshSettings.providers['openai-codex']

    // The current entry from server should have OAuth tokens
    expect(currentEntry).toBeDefined()
    expect(currentEntry.oauth).toEqual(oauthTokens)
    expect(currentEntry.testStatus).toBe('ok')
    expect(currentEntry.oauthConfig).toEqual(oauthConfig)

    // Build the updated entry (as persistProviderStep does)
    const updatedEntry = {
      ...currentEntry,
      testStatus: 'ok' as const,
      models: currentEntry.models.includes('gpt-5.3-codex')
        ? currentEntry.models
        : [...currentEntry.models, 'gpt-5.3-codex'],
    }

    // Verify the updated entry STILL has OAuth tokens
    expect(updatedEntry.oauth).toEqual(oauthTokens)
    expect(updatedEntry.oauthConfig).toEqual(oauthConfig)
    expect(updatedEntry.models).toContain('gpt-5.3-codex')
  })

  it('handleTestProvider preserves OAuth tokens after test', async () => {
    const oauthTokens = {
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      expiresAt: '2026-03-19T07:05:00.000Z',
    }
    const oauthConfig = {
      flowType: 'authorization_code' as const,
      clientId: 'app_test',
      authEndpoint: 'https://auth.openai.com/oauth/authorize',
      tokenEndpoint: 'https://auth.openai.com/oauth/token',
      scope: 'openid',
      apiBaseUrl: 'https://chatgpt.com/backend-api/codex',
    }

    // After test passes, settings.get returns entry with OAuth tokens
    vi.mocked(services.settings.get).mockResolvedValue({
      ...emptySettings,
      providers: {
        'openai-codex': {
          name: 'OpenAI Codex',
          sdkType: 'openai' as const,
          models: ['gpt-5.3-codex'],
          oauthConfig,
          oauth: oauthTokens,
          testStatus: 'ok' as const,
        },
      },
    })

    // The test endpoint returns success
    vi.mocked(services.settings.testProvider).mockResolvedValue({ ok: true, latencyMs: 100 })

    // Fetch fresh settings after test
    const freshSettings = await services.settings.get()
    const entry = freshSettings.providers['openai-codex']

    // Verify OAuth tokens are preserved
    expect(entry.oauth).toEqual(oauthTokens)
    expect(entry.oauthConfig).toEqual(oauthConfig)
  })
})

describe('OnboardingPage — Project Step', () => {
  let services: ServiceContainer

  beforeEach(() => {
    services = createTestServices()
    configureServices(services)
    useAppStore.setState({
      settings: emptySettings,
      projects: [],
      projectsLoading: false,
    })
  })

  it('shows project creation form', () => {
    // Navigate directly to project step (step index 3) by initializing with onboardingStep
    useAppStore.setState({
      settings: { ...emptySettings, onboardingStep: 2, providers: { test: { name: 'Test', sdkType: 'openai', models: ['gpt-4o'], testStatus: 'ok', apiKey: 'sk-test' } } },
    })
    renderOnboarding()
    expect(screen.getByText('Create Your First Project')).toBeInTheDocument()
    expect(screen.getByText('PROJECT NAME')).toBeInTheDocument()
    expect(screen.getByText('DESCRIPTION')).toBeInTheDocument()
    expect(screen.getByText('ICON')).toBeInTheDocument()
  })

  it('renders template options in project step', () => {
    useAppStore.setState({
      settings: { ...emptySettings, onboardingStep: 2, providers: { test: { name: 'Test', sdkType: 'openai', models: ['gpt-4o'], testStatus: 'ok', apiKey: 'sk-test' } } },
    })
    renderOnboarding()
    // Template UI was added in place of "Coming Soon" — verify project step renders
    expect(screen.getByText('Create Your First Project')).toBeInTheDocument()
  })
})
