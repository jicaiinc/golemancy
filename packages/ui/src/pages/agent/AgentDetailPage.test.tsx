import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router'
import { AgentDetailPage } from './AgentDetailPage'
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

const PROJECT_ID = 'proj-ad1' as ProjectId
const AGENT_ID = 'agent-ad1' as AgentId
const now = new Date().toISOString()

const baseSettings: GlobalSettings = {
  providers: [
    { provider: 'openai', apiKey: 'sk-test', defaultModel: 'gpt-4o' },
  ],
  defaultProvider: 'openai',
  theme: 'dark',
  userProfile: { name: 'Test', email: 'test@test.com' },
  defaultWorkingDirectoryBase: '~/projects',
}

const testProject: Project = {
  id: PROJECT_ID,
  name: 'Test Project',
  description: 'A test project',
  icon: 'sword',
  workingDirectory: '/tmp/test',
  config: { maxConcurrentAgents: 5 },
  agentCount: 1,
  activeAgentCount: 0,
  lastActivityAt: now,
  createdAt: now,
  updatedAt: now,
}

function makeAgent(overrides?: Partial<Agent>): Agent {
  return {
    id: AGENT_ID,
    projectId: PROJECT_ID,
    name: 'Test Agent',
    description: 'A test agent for unit tests',
    status: 'idle',
    systemPrompt: 'You are a helpful assistant.',
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

function renderAtRoute(agentId: string = AGENT_ID) {
  return render(
    <MemoryRouter initialEntries={[`/projects/${PROJECT_ID}/agents/${agentId}`]}>
      <Routes>
        <Route path="/projects/:projectId/agents/:agentId" element={<AgentDetailPage />} />
        <Route path="/projects/:projectId/agents" element={<div>Agent List</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('AgentDetailPage', () => {
  beforeEach(() => {
    configureServices(createTestServices())
    useAppStore.setState({
      settings: baseSettings,
      projects: [testProject],
      currentProjectId: PROJECT_ID,
      agents: [makeAgent()],
      skills: [],
      mcpServers: [],
      updateAgent: vi.fn().mockResolvedValue(undefined),
      deleteAgent: vi.fn().mockResolvedValue(undefined),
    })
  })

  it('shows "not found" when agent does not exist', () => {
    useAppStore.setState({ agents: [] })
    renderAtRoute()
    expect(screen.getByText('Agent not found.')).toBeInTheDocument()
  })

  it('renders agent name and description', () => {
    renderAtRoute()
    expect(screen.getByText('Test Agent')).toBeInTheDocument()
    expect(screen.getByText('A test agent for unit tests')).toBeInTheDocument()
  })

  it('shows agent status badge', () => {
    renderAtRoute()
    expect(screen.getByText('idle')).toBeInTheDocument()
  })

  it('renders all 6 tab labels', () => {
    renderAtRoute()
    expect(screen.getByText('Info')).toBeInTheDocument()
    expect(screen.getByText('Skills')).toBeInTheDocument()
    expect(screen.getByText('Tools')).toBeInTheDocument()
    expect(screen.getByText('MCP')).toBeInTheDocument()
    expect(screen.getByText('Sub-Agents')).toBeInTheDocument()
    expect(screen.getByText('Model Config')).toBeInTheDocument()
  })

  it('shows stats (skills, tools, MCP servers, sub-agents counts)', () => {
    useAppStore.setState({
      agents: [makeAgent({
        skillIds: ['s1' as any, 's2' as any],
        tools: [{ id: 't1', name: 'tool1', description: 'desc', parameters: {} }] as any,
        mcpServers: ['mcp1'],
        subAgents: [{ agentId: 'agent-2' as AgentId, role: 'helper' }],
      })],
    })
    renderAtRoute()
    expect(screen.getByText('2 skills')).toBeInTheDocument()
    expect(screen.getByText('1 tools')).toBeInTheDocument()
    expect(screen.getByText('1 MCP servers')).toBeInTheDocument()
    expect(screen.getByText('1 sub-agents')).toBeInTheDocument()
  })

  it('renders Info tab with name, description, system prompt inputs', () => {
    renderAtRoute()
    // Info tab is default
    expect(screen.getByDisplayValue('Test Agent')).toBeInTheDocument()
    expect(screen.getByDisplayValue('A test agent for unit tests')).toBeInTheDocument()
    expect(screen.getByDisplayValue('You are a helpful assistant.')).toBeInTheDocument()
  })

  it('Save button calls updateAgent', async () => {
    const mockUpdate = vi.fn().mockResolvedValue(undefined)
    useAppStore.setState({ updateAgent: mockUpdate })
    renderAtRoute()

    const saveButton = screen.getByText('Save')
    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(AGENT_ID, {
        name: 'Test Agent',
        description: 'A test agent for unit tests',
        systemPrompt: 'You are a helpful assistant.',
      })
    })
  })

  it('Delete Agent button calls deleteAgent', async () => {
    const mockDelete = vi.fn().mockResolvedValue(undefined)
    useAppStore.setState({ deleteAgent: mockDelete })
    renderAtRoute()

    const deleteButton = screen.getByText('Delete Agent')
    fireEvent.click(deleteButton)

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith(AGENT_ID)
    })
  })

  it('displays running status with correct badge', () => {
    useAppStore.setState({ agents: [makeAgent({ status: 'running' })] })
    renderAtRoute()
    expect(screen.getByText('running')).toBeInTheDocument()
  })

  it('shows model name when agent has model configured', () => {
    useAppStore.setState({
      agents: [makeAgent({ modelConfig: { model: 'gpt-4-turbo' } })],
    })
    renderAtRoute()
    expect(screen.getByText('gpt-4-turbo')).toBeInTheDocument()
  })

  it('switches to Tools tab and shows built-in tools', async () => {
    renderAtRoute()
    fireEvent.click(screen.getByText('Tools'))
    await waitFor(() => {
      expect(screen.getByText('Bash')).toBeInTheDocument()
      expect(screen.getByText('Browser')).toBeInTheDocument()
      expect(screen.getByText('OS Control')).toBeInTheDocument()
    })
  })

  it('switches to Sub-Agents tab and shows empty state', async () => {
    renderAtRoute()
    fireEvent.click(screen.getByText('Sub-Agents'))
    await waitFor(() => {
      expect(screen.getByText('No sub-agents assigned to this agent.')).toBeInTheDocument()
    })
  })

  it('switches to MCP tab and shows empty state', async () => {
    renderAtRoute()
    fireEvent.click(screen.getByText('MCP'))
    await waitFor(() => {
      expect(screen.getByText('No MCP servers assigned to this agent.')).toBeInTheDocument()
    })
  })

  it('switches to Skills tab and shows empty state', async () => {
    renderAtRoute()
    fireEvent.click(screen.getByText('Skills'))
    await waitFor(() => {
      expect(screen.getByText('No skills assigned to this agent.')).toBeInTheDocument()
    })
  })
})
