import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MCPServersPage } from './MCPServersPage'
import { useAppStore } from '../../stores'
import { configureServices } from '../../services/container'
import type { ServiceContainer } from '../../services/container'
import type { AgentId, ProjectId, MCPServerConfig } from '@solocraft/shared'

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
  {
    id: 'agent-1' as AgentId,
    projectId: 'proj-1' as ProjectId,
    name: 'Writer',
    description: '',
    status: 'idle' as const,
    systemPrompt: '',
    modelConfig: { provider: 'openai' },
    skillIds: [],
    tools: [],
    subAgents: [],
    mcpServers: ['filesystem'],
    builtinTools: { bash: true },
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'agent-2' as AgentId,
    projectId: 'proj-1' as ProjectId,
    name: 'Researcher',
    description: '',
    status: 'idle' as const,
    systemPrompt: '',
    modelConfig: { provider: 'openai' },
    skillIds: [],
    tools: [],
    subAgents: [],
    mcpServers: ['filesystem', 'web-search'],
    builtinTools: { bash: true },
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
]

const mockMCPServers: MCPServerConfig[] = [
  {
    name: 'filesystem',
    transportType: 'stdio',
    description: 'Access local files',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem'],
    enabled: true,
  },
  {
    name: 'web-search',
    transportType: 'sse',
    url: 'http://localhost:3100/sse',
    enabled: false,
  },
  {
    name: 'api-gateway',
    transportType: 'http',
    url: 'http://localhost:8080',
    enabled: true,
  },
]

function createTestServices(): ServiceContainer {
  return {
    projects: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    agents: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    conversations: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), sendMessage: vi.fn(), saveMessage: vi.fn(), getMessages: vi.fn(), searchMessages: vi.fn(), delete: vi.fn() },
    tasks: { list: vi.fn(), getById: vi.fn(), cancel: vi.fn(), getLogs: vi.fn() },
    artifacts: { list: vi.fn(), getById: vi.fn(), delete: vi.fn() },
    memory: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    settings: { get: vi.fn(), update: vi.fn() },
    cronJobs: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    skills: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    mcp: {
      list: vi.fn(),
      getByName: vi.fn(),
      create: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      resolveNames: vi.fn(),
    },
    dashboard: {
      getSummary: vi.fn().mockResolvedValue({}),
      getActiveAgents: vi.fn().mockResolvedValue([]),
      getRecentTasks: vi.fn().mockResolvedValue([]),
      getActivityFeed: vi.fn().mockResolvedValue([]),
    },
  }
}

describe('MCPServersPage', () => {
  let services: ServiceContainer

  beforeEach(() => {
    services = createTestServices()
    configureServices(services)
    useAppStore.setState({
      currentProjectId: 'proj-1' as ProjectId,
      projects: [{ id: 'proj-1' as ProjectId, name: 'Test Project', description: '', createdAt: '', updatedAt: '' }] as any,
      agents: mockAgents as any,
      mcpServers: [],
      mcpServersLoading: false,
    })
  })

  it('shows spinner when loading', () => {
    useAppStore.setState({ mcpServersLoading: true })
    const { container } = render(<MCPServersPage />)
    expect(container.querySelector('[class*="animate-"]')).toBeTruthy()
  })

  it('shows empty state when no servers', () => {
    render(<MCPServersPage />)
    expect(screen.getByText('No MCP servers configured')).toBeInTheDocument()
    expect(screen.getByText('Add Your First Server')).toBeInTheDocument()
  })

  it('renders server count in header', () => {
    useAppStore.setState({ mcpServers: mockMCPServers })
    render(<MCPServersPage />)
    expect(screen.getByText('MCP Servers')).toBeInTheDocument()
    expect(screen.getByText('3 servers')).toBeInTheDocument()
  })

  it('renders server names', () => {
    useAppStore.setState({ mcpServers: mockMCPServers })
    render(<MCPServersPage />)
    expect(screen.getByText('filesystem')).toBeInTheDocument()
    expect(screen.getByText('web-search')).toBeInTheDocument()
    expect(screen.getByText('api-gateway')).toBeInTheDocument()
  })

  it('shows transport type badge for each server', () => {
    useAppStore.setState({ mcpServers: mockMCPServers })
    render(<MCPServersPage />)
    expect(screen.getByText('STDIO')).toBeInTheDocument()
    expect(screen.getByText('SSE')).toBeInTheDocument()
    expect(screen.getByText('HTTP')).toBeInTheDocument()
  })

  it('shows description when available', () => {
    useAppStore.setState({ mcpServers: mockMCPServers })
    render(<MCPServersPage />)
    expect(screen.getByText('Access local files')).toBeInTheDocument()
  })

  it('shows agent reference count', () => {
    useAppStore.setState({ mcpServers: mockMCPServers })
    render(<MCPServersPage />)
    // filesystem is used by 2 agents (Writer + Researcher)
    expect(screen.getByText('Used by 2 agents')).toBeInTheDocument()
    // web-search is used by 1 agent (Researcher)
    expect(screen.getByText('Used by 1 agent')).toBeInTheDocument()
    // api-gateway is used by 0 agents
    expect(screen.getByText('Used by 0 agents')).toBeInTheDocument()
  })

  it('toggle calls updateMCPServer', async () => {
    useAppStore.setState({ mcpServers: mockMCPServers })
    vi.mocked(services.mcp.update).mockResolvedValue({ ...mockMCPServers[0], enabled: false })
    render(<MCPServersPage />)

    const toggles = screen.getAllByRole('switch')
    // First toggle is for 'filesystem' (enabled: true)
    fireEvent.click(toggles[0])

    await waitFor(() => {
      expect(services.mcp.update).toHaveBeenCalled()
    })
  })

  it('shows error when deleting server referenced by agents', async () => {
    useAppStore.setState({ mcpServers: mockMCPServers })
    render(<MCPServersPage />)

    // Click the delete button (×) for 'filesystem' which is referenced by 2 agents
    const deleteButtons = screen.getAllByText('\u00d7')
    fireEvent.click(deleteButtons[0])

    await waitFor(() => {
      expect(screen.getByText(/is used by 2 agent/)).toBeInTheDocument()
    })
  })

  it('shows "+ New Server" button', () => {
    render(<MCPServersPage />)
    expect(screen.getByText('+ New Server')).toBeInTheDocument()
  })

  it('opens form modal when clicking "+ New Server"', () => {
    render(<MCPServersPage />)
    fireEvent.click(screen.getByText('+ New Server'))
    expect(screen.getByText('New MCP Server')).toBeInTheDocument()
  })

  it('opens form modal when clicking empty state button', () => {
    render(<MCPServersPage />)
    fireEvent.click(screen.getByText('Add Your First Server'))
    expect(screen.getByText('New MCP Server')).toBeInTheDocument()
  })

  it('opens edit modal when clicking Edit', () => {
    useAppStore.setState({ mcpServers: mockMCPServers })
    render(<MCPServersPage />)
    const editButtons = screen.getAllByText('Edit')
    fireEvent.click(editButtons[0])
    expect(screen.getByText('Edit MCP Server')).toBeInTheDocument()
  })

  it('has Edit and delete buttons for each server', () => {
    useAppStore.setState({ mcpServers: mockMCPServers })
    render(<MCPServersPage />)
    expect(screen.getAllByText('Edit')).toHaveLength(3)
    expect(screen.getAllByText('\u00d7')).toHaveLength(3)
  })

  it('shows "Coming Soon" for marketplace tab', () => {
    render(<MCPServersPage />)
    fireEvent.click(screen.getByText('Marketplace'))
    expect(screen.getByText('Coming Soon')).toBeInTheDocument()
  })
})
