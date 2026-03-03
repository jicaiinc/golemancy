import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router'
import { ProjectSettingsPage } from './ProjectSettingsPage'
import { useAppStore } from '../../stores'
import { configureServices } from '../../services/container'
import type { ServiceContainer } from '../../services/container'
import type { Agent, AgentId, ProjectId, GlobalSettings, Project } from '@golemancy/shared'

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => {
      const { initial, animate, exit, transition, variants, ...rest } = props
      return <div {...rest}>{children}</div>
    },
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

// Mock PermissionsSettings since it's complex and tested separately
vi.mock('../../components', async (importOriginal) => {
  const orig: any = await importOriginal()
  return {
    ...orig,
    PermissionsSettings: ({ projectId }: { projectId: string }) => (
      <div data-testid="permissions-settings">Permissions for {projectId}</div>
    ),
  }
})

const PROJECT_ID = 'proj-ps1' as ProjectId
const now = new Date().toISOString()

const baseSettings: GlobalSettings = {
  providers: {
    openai: { name: 'OpenAI', sdkType: 'openai', apiKey: 'sk-test', models: ['gpt-4o'], testStatus: 'ok' },
    anthropic: { name: 'Anthropic', sdkType: 'anthropic', apiKey: 'sk-ant', models: ['claude-sonnet-4-5-20250929'], testStatus: 'ok' },
  },
  theme: 'dark',
}

const testProject: Project = {
  id: PROJECT_ID,
  name: 'My Project',
  description: 'A test project for settings',
  icon: 'sword',
  config: { maxConcurrentAgents: 5 },
  agentCount: 2,
  activeAgentCount: 0,
  lastActivityAt: now,
  createdAt: now,
  updatedAt: now,
}

function makeAgent(overrides?: Partial<Agent>): Agent {
  return {
    id: 'agent-ps1' as AgentId,
    projectId: PROJECT_ID,
    name: 'Main Agent',
    description: 'The default agent',
    status: 'idle',
    systemPrompt: 'You are helpful.',
    modelConfig: { provider: 'openai', model: 'gpt-4o' },
    skillIds: [],
    tools: [],
    subAgents: [],
    mcpServers: [],
    builtinTools: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function createTestServices(): ServiceContainer {
  return {
    projects: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), getTopologyLayout: vi.fn().mockResolvedValue({}), saveTopologyLayout: vi.fn() },
    agents: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    conversations: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), sendMessage: vi.fn(), saveMessage: vi.fn(), getMessages: vi.fn(), searchMessages: vi.fn(), delete: vi.fn() },
    tasks: { list: vi.fn(), getById: vi.fn() },
    workspace: { listDir: vi.fn(), readFile: vi.fn(), deleteFile: vi.fn(), getFileUrl: vi.fn() },
    settings: { get: vi.fn(), update: vi.fn(), testProvider: vi.fn() },
    cronJobs: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    skills: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), importZip: vi.fn() },
    mcp: { list: vi.fn(), getByName: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), resolveNames: vi.fn() },
    dashboard: { getSummary: vi.fn(), getAgentStats: vi.fn(), getRecentChats: vi.fn(), getTokenTrend: vi.fn(), getTokenByModel: vi.fn(), getTokenByAgent: vi.fn(), getRuntimeStatus: vi.fn() },
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

function renderAtRoute() {
  return render(
    <MemoryRouter initialEntries={[`/projects/${PROJECT_ID}/settings`]}>
      <Routes>
        <Route path="/projects/:projectId/settings" element={<ProjectSettingsPage />} />
        <Route path="/projects/:projectId/agents" element={<div>Agents List</div>} />
        <Route path="/projects/:projectId/agents/:agentId" element={<div>Agent Detail</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ProjectSettingsPage', () => {
  beforeEach(() => {
    configureServices(createTestServices())
    useAppStore.setState({
      settings: baseSettings,
      projects: [testProject],
      currentProjectId: PROJECT_ID,
      agents: [makeAgent()],
      updateProject: vi.fn().mockResolvedValue(undefined),
    })
  })

  it('renders nothing when project does not exist', () => {
    useAppStore.setState({ projects: [], currentProjectId: null })
    const { container } = renderAtRoute()
    expect(container.querySelector('.p-6')).toBeNull()
  })

  it('renders page title', () => {
    renderAtRoute()
    expect(screen.getByText('Project Settings')).toBeInTheDocument()
  })

  it('renders all 3 tab labels', () => {
    renderAtRoute()
    expect(screen.getByText('Agent')).toBeInTheDocument()
    expect(screen.getByText('General')).toBeInTheDocument()
    expect(screen.getByText('Permissions')).toBeInTheDocument()
  })

  // ── General Tab (default) ──

  it('shows project name and description inputs in General tab', () => {
    renderAtRoute()
    expect(screen.getByDisplayValue('My Project')).toBeInTheDocument()
    expect(screen.getByDisplayValue('A test project for settings')).toBeInTheDocument()
  })

  it('Save Changes calls updateProject in General tab', async () => {
    const mockUpdate = vi.fn().mockResolvedValue(undefined)
    useAppStore.setState({ updateProject: mockUpdate })

    renderAtRoute()
    fireEvent.click(screen.getByText('Save Changes'))

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(PROJECT_ID, expect.objectContaining({
        name: 'My Project',
        description: 'A test project for settings',
        icon: 'sword',
      }))
    })
  })

  // ── Agent Tab ──

  it('shows Main Agent section with agent selector', () => {
    renderAtRoute()
    fireEvent.click(screen.getByText('Agent'))
    expect(screen.getByText('MAIN AGENT')).toBeInTheDocument()
    expect(screen.getByText('Main Agent')).toBeInTheDocument()
  })

  it('shows "No agents" when agents list is empty', () => {
    useAppStore.setState({ agents: [] })
    renderAtRoute()
    fireEvent.click(screen.getByText('Agent'))
    expect(screen.getByText(/No agents in this project/)).toBeInTheDocument()
  })

  it('calls updateProject when main agent is changed', async () => {
    const agentId = 'agent-ps1' as AgentId
    const projectWithMain: Project = { ...testProject, mainAgentId: agentId }
    useAppStore.setState({ projects: [projectWithMain], currentProjectId: PROJECT_ID })
    const mockUpdate = vi.fn().mockResolvedValue(undefined)
    useAppStore.setState({ updateProject: mockUpdate })

    renderAtRoute()
    fireEvent.click(screen.getByText('Agent'))
    // The select should have the agent selected
    const select = screen.getAllByRole('combobox')[0]
    fireEvent.change(select, { target: { value: '' } })

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(PROJECT_ID, { mainAgentId: undefined })
    })
  })

  // ── Permissions Tab ──

  it('renders PermissionsSettings component in Permissions tab', async () => {
    renderAtRoute()
    fireEvent.click(screen.getByText('Permissions'))

    await waitFor(() => {
      expect(screen.getByTestId('permissions-settings')).toBeInTheDocument()
      expect(screen.getByText(`Permissions for ${PROJECT_ID}`)).toBeInTheDocument()
    })
  })
})
