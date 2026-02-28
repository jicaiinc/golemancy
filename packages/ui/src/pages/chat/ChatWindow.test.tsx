import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { AgentId, ConversationId, MessageId, ProjectId, Conversation, Agent } from '@golemancy/shared'
import type { UIMessage } from 'ai'
import { ChatWindow } from './ChatWindow'
import { useAppStore } from '../../stores'
import { configureServices } from '../../services/container'
import type { ServiceContainer } from '../../services/container'

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

// Mock chat-instances module
const mockChat = { id: 'conv-1', messages: [], status: 'ready', stop: vi.fn() }
vi.mock('../../lib/chat-instances', () => ({
  getOrCreateChat: vi.fn(() => mockChat),
}))

// Mock @ai-sdk/react — useChat returns what we configure per-test
const mockChatSendMessage = vi.fn()
const mockClearError = vi.fn()
let useChatMessages: UIMessage[] = []
let useChatError: Error | undefined = undefined
vi.mock('@ai-sdk/react', () => ({
  useChat: vi.fn(() => ({
    messages: useChatMessages,
    status: 'ready',
    error: useChatError,
    clearError: mockClearError,
    sendMessage: mockChatSendMessage,
  })),
}))

// Mock ai module
vi.mock('ai', () => ({
  DefaultChatTransport: class MockTransport {
    constructor(public opts: any) {}
  },
}))

const now = '2024-06-01T10:00:00.000Z'

function makeConversation(overrides?: Partial<Conversation>): Conversation {
  return {
    id: 'conv-1' as ConversationId,
    projectId: 'proj-1' as ProjectId,
    agentId: 'agent-1' as AgentId,
    title: 'Test Chat',
    messages: [],
    lastMessageAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function makeAgent(overrides?: Partial<Agent>): Agent {
  return {
    id: 'agent-1' as AgentId,
    projectId: 'proj-1' as ProjectId,
    name: 'Writer',
    description: 'A writing agent',
    status: 'idle',
    systemPrompt: 'You are a writer.',
    modelConfig: { provider: 'google', model: 'gemini-pro' },
    skillIds: [],
    tools: [],
    subAgents: [],
    mcpServers: [],
    builtinTools: { bash: true },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function makeUIMessage(overrides?: Partial<UIMessage>): UIMessage {
  return {
    id: 'msg-1',
    role: 'user',
    parts: [{ type: 'text', text: 'Hello' }],
    ...overrides,
  } as UIMessage
}

function createTestServices(): ServiceContainer {
  return {
    projects: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), getTopologyLayout: vi.fn().mockResolvedValue({}), saveTopologyLayout: vi.fn() },
    agents: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    conversations: {
      list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(),
      sendMessage: vi.fn().mockResolvedValue(undefined),
      getMessages: vi.fn(), searchMessages: vi.fn(), delete: vi.fn(),
    },
    tasks: { list: vi.fn(), getById: vi.fn() },
    workspace: { listDir: vi.fn(), readFile: vi.fn(), deleteFile: vi.fn(), getFileUrl: vi.fn() },
    memory: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    settings: { get: vi.fn(), update: vi.fn(), testProvider: vi.fn() },
    dashboard: { getSummary: vi.fn(), getAgentStats: vi.fn(), getRecentChats: vi.fn(), getTokenTrend: vi.fn(), getTokenByModel: vi.fn(), getTokenByAgent: vi.fn(), getRuntimeStatus: vi.fn() },
    globalDashboard: {
      getSummary: vi.fn().mockResolvedValue({ todayTokens: { total: 0, input: 0, output: 0, callCount: 0 }, totalAgents: 0, activeChats: 0, totalChats: 0 }),
      getTokenByModel: vi.fn().mockResolvedValue([]),
      getTokenByAgent: vi.fn().mockResolvedValue([]),
      getTokenByProject: vi.fn().mockResolvedValue([]),
      getTokenTrend: vi.fn().mockResolvedValue([]),
      getRuntimeStatus: vi.fn().mockResolvedValue({ runningChats: [], runningCrons: [], upcoming: [], recentCompleted: [] }),
    },
  } as unknown as ServiceContainer
}

const defaultSidebarProps = {
  chatHistoryExpanded: false,
  onToggleChatHistory: vi.fn(),
  onNewChat: vi.fn(),
  canNewChat: true,
  agents: [makeAgent()],
  onSwitchAgent: vi.fn(),
}

describe('ChatWindow', () => {
  const originalElectronAPI = (window as any).electronAPI
  let services: ServiceContainer

  beforeEach(() => {
    vi.clearAllMocks()
    useChatMessages = [] // reset to empty
    useChatError = undefined
    Element.prototype.scrollIntoView = vi.fn()
    delete (window as any).electronAPI
    services = createTestServices()
    configureServices(services)
    useAppStore.setState({
      currentProjectId: 'proj-1' as ProjectId,
    })
  })

  afterEach(() => {
    if (originalElectronAPI) {
      (window as any).electronAPI = originalElectronAPI
    } else {
      delete (window as any).electronAPI
    }
  })

  it('renders conversation title and agent name', () => {
    render(<ChatWindow conversation={makeConversation()} agent={makeAgent()} {...defaultSidebarProps} />)

    expect(screen.getByText('Test Chat')).toBeInTheDocument()
    expect(screen.getByText('@Writer')).toBeInTheDocument()
  })

  it('shows empty state when no messages', () => {
    render(<ChatWindow conversation={makeConversation()} agent={makeAgent()} {...defaultSidebarProps} />)

    expect(screen.getByText('Start the conversation...')).toBeInTheDocument()
  })

  it('renders messages from useChat', () => {
    useChatMessages = [
      makeUIMessage({ id: 'msg-1', role: 'user', parts: [{ type: 'text', text: 'Hello there' }] }),
      makeUIMessage({ id: 'msg-2', role: 'assistant', parts: [{ type: 'text', text: 'Hi! How can I help?' }] }),
    ]

    render(<ChatWindow conversation={makeConversation()} agent={makeAgent()} {...defaultSidebarProps} />)

    expect(screen.getByText('Hello there')).toBeInTheDocument()
    expect(screen.getByText('Hi! How can I help?')).toBeInTheDocument()
  })

  it('renders the Delete button', () => {
    render(<ChatWindow conversation={makeConversation()} agent={makeAgent()} {...defaultSidebarProps} />)

    expect(screen.getByText('Delete')).toBeInTheDocument()
  })

  it('renders the Send button (disabled when input is empty)', () => {
    render(<ChatWindow conversation={makeConversation()} agent={makeAgent()} {...defaultSidebarProps} />)

    const sendButton = screen.getByText('Send')
    expect(sendButton).toBeInTheDocument()
    expect(sendButton.closest('button')).toBeDisabled()
  })

  it('renders ChatInput with placeholder', () => {
    render(<ChatWindow conversation={makeConversation()} agent={makeAgent()} {...defaultSidebarProps} />)

    expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument()
  })

  it('sends message via service in mock mode (no electronAPI)', async () => {
    const conv = makeConversation()
    const updatedConv = { ...conv, messages: [{ id: 'msg-1' as MessageId, conversationId: conv.id, role: 'assistant' as const, parts: [{ type: 'text', text: 'response' }], content: 'response', inputTokens: 0, outputTokens: 0, provider: '', model: '', createdAt: now, updatedAt: now }] }
    ;(services.conversations.sendMessage as any).mockResolvedValue(undefined)
    ;(services.conversations.getById as any).mockResolvedValue(updatedConv)

    render(<ChatWindow conversation={conv} agent={makeAgent()} {...defaultSidebarProps} />)

    const input = screen.getByPlaceholderText('Type a message...')
    fireEvent.change(input, { target: { value: 'Test message' } })
    fireEvent.click(screen.getByText('Send'))

    await waitFor(() => {
      expect(services.conversations.sendMessage).toHaveBeenCalledWith('proj-1', 'conv-1', 'Test message')
    })
  })

  it('sends message via chatSendMessage in server mode', async () => {
    ;(window as any).electronAPI = {
      getServerBaseUrl: () => 'http://localhost:3001',
      getServerToken: () => 'test-token',
      getServerPort: () => 3001,
    }

    render(<ChatWindow conversation={makeConversation()} agent={makeAgent()} {...defaultSidebarProps} />)

    const input = screen.getByPlaceholderText('Type a message...')
    fireEvent.change(input, { target: { value: 'Server message' } })
    fireEvent.click(screen.getByText('Send'))

    await waitFor(() => {
      expect(mockChatSendMessage).toHaveBeenCalledWith({ text: 'Server message' })
    })
  })

  it('renders without agent name when agent is undefined', () => {
    render(<ChatWindow conversation={makeConversation()} agent={undefined} {...defaultSidebarProps} />)

    expect(screen.getByText('Test Chat')).toBeInTheDocument()
    expect(screen.queryByText(/@/)).not.toBeInTheDocument()
  })

  it('calls getOrCreateChat with correct config', async () => {
    const { getOrCreateChat } = await import('../../lib/chat-instances')

    render(<ChatWindow conversation={makeConversation()} agent={makeAgent()} {...defaultSidebarProps} />)

    expect(getOrCreateChat).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      projectId: 'proj-1',
      agentId: 'agent-1',
      initialMessages: [],
      serverConfig: null,
    })
  })

  it('delete button calls deleteConversation and clears selection after confirmation', async () => {
    const mockDelete = vi.fn().mockResolvedValue(undefined)
    const mockSelect = vi.fn()
    useAppStore.setState({
      deleteConversation: mockDelete,
      selectConversation: mockSelect,
    })

    render(<ChatWindow conversation={makeConversation()} agent={makeAgent()} {...defaultSidebarProps} />)

    // First click shows confirmation
    fireEvent.click(screen.getByText('Delete'))
    expect(mockDelete).not.toHaveBeenCalled()
    expect(screen.getByText('Confirm')).toBeInTheDocument()
    expect(screen.getByText('Cancel')).toBeInTheDocument()

    // Second click (Confirm) actually deletes
    fireEvent.click(screen.getByText('Confirm'))

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith('conv-1')
      expect(mockSelect).toHaveBeenCalledWith(null)
    })
  })

  describe('error display', () => {
    it('shows parsed error message from server JSON response', () => {
      // AI SDK v6 throws raw response body as error.message
      useChatError = new Error('{"error":"API key for provider \\"openai\\" is not set.","code":"API_KEY_MISSING"}')
      render(<ChatWindow conversation={makeConversation()} agent={makeAgent()} {...defaultSidebarProps} />)

      expect(screen.getByText('API key for provider "openai" is not set.')).toBeInTheDocument()
    })

    it('shows friendly message for Internal Server Error', () => {
      useChatError = new Error('{"error":"Internal Server Error"}')
      render(<ChatWindow conversation={makeConversation()} agent={makeAgent()} {...defaultSidebarProps} />)

      expect(screen.getByText('Something went wrong. Please try again later.')).toBeInTheDocument()
    })

    it('calls clearError when dismiss button is clicked on error banner', () => {
      useChatError = new Error('Something went wrong')
      render(<ChatWindow conversation={makeConversation()} agent={makeAgent()} {...defaultSidebarProps} />)

      fireEvent.click(screen.getByTitle('Dismiss'))
      expect(mockClearError).toHaveBeenCalledOnce()
    })
  })
})
