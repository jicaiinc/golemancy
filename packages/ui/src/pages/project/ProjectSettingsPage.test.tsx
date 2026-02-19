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
  providers: [
    { provider: 'openai', apiKey: 'sk-test', defaultModel: 'gpt-4o' },
    { provider: 'anthropic', apiKey: 'sk-ant', defaultModel: 'claude-sonnet-4-5-20250929' },
  ],
  defaultProvider: 'openai',
  theme: 'dark',
  userProfile: { name: 'Test', email: 'test@test.com' },
  defaultWorkingDirectoryBase: '~/projects',
}

const testProject: Project = {
  id: PROJECT_ID,
  name: 'My Project',
  description: 'A test project for settings',
  icon: 'sword',
  workingDirectory: '/home/user/projects/my-project',
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
    modelConfig: {},
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
    dashboard: { getSummary: vi.fn(), getAgentStats: vi.fn(), getRecentChats: vi.fn(), getTokenTrend: vi.fn() },
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

  it('renders all 4 tab labels', () => {
    renderAtRoute()
    expect(screen.getByText('Agent')).toBeInTheDocument()
    expect(screen.getByText('General')).toBeInTheDocument()
    expect(screen.getByText('Provider')).toBeInTheDocument()
    expect(screen.getByText('Permissions')).toBeInTheDocument()
  })

  // ── Agent Tab (default) ──

  it('shows Main Agent section with agent selector', () => {
    renderAtRoute()
    expect(screen.getByText('MAIN AGENT')).toBeInTheDocument()
    expect(screen.getByText('Main Agent')).toBeInTheDocument()
  })

  it('shows "No agents" when agents list is empty', () => {
    useAppStore.setState({ agents: [] })
    renderAtRoute()
    expect(screen.getByText(/No agents in this project/)).toBeInTheDocument()
  })

  it('calls updateProject when main agent is changed', async () => {
    const agentId = 'agent-ps1' as AgentId
    const projectWithMain: Project = { ...testProject, mainAgentId: agentId }
    useAppStore.setState({ projects: [projectWithMain], currentProjectId: PROJECT_ID })
    const mockUpdate = vi.fn().mockResolvedValue(undefined)
    useAppStore.setState({ updateProject: mockUpdate })

    renderAtRoute()
    // The select should have the agent selected
    const select = screen.getAllByRole('combobox')[0]
    fireEvent.change(select, { target: { value: '' } })

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(PROJECT_ID, { mainAgentId: undefined })
    })
  })

  // ── General Tab ──

  it('shows project name and description inputs in General tab', async () => {
    renderAtRoute()
    fireEvent.click(screen.getByText('General'))

    await waitFor(() => {
      expect(screen.getByDisplayValue('My Project')).toBeInTheDocument()
      expect(screen.getByDisplayValue('A test project for settings')).toBeInTheDocument()
    })
  })

  it('shows working directory path', async () => {
    renderAtRoute()
    fireEvent.click(screen.getByText('General'))

    await waitFor(() => {
      expect(screen.getByText('/home/user/projects/my-project')).toBeInTheDocument()
    })
  })

  it('Save Changes calls updateProject in General tab', async () => {
    const mockUpdate = vi.fn().mockResolvedValue(undefined)
    useAppStore.setState({ updateProject: mockUpdate })

    renderAtRoute()
    fireEvent.click(screen.getByText('General'))

    await waitFor(() => {
      expect(screen.getByText('Save Changes')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Save Changes'))

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(PROJECT_ID, expect.objectContaining({
        name: 'My Project',
        description: 'A test project for settings',
        icon: 'sword',
      }))
    })
  })

  // ── Provider Tab ──

  it('shows provider override section in Provider tab', async () => {
    renderAtRoute()
    fireEvent.click(screen.getByText('Provider'))

    await waitFor(() => {
      expect(screen.getByText('PROVIDER OVERRIDE')).toBeInTheDocument()
      expect(screen.getByText(/Inherit from global/)).toBeInTheDocument()
    })
  })

  it('shows global default provider name in description', async () => {
    renderAtRoute()
    fireEvent.click(screen.getByText('Provider'))

    await waitFor(() => {
      expect(screen.getByText(/openai/)).toBeInTheDocument()
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
