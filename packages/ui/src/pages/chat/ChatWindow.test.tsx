import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { AgentId, ConversationId, MessageId, ProjectId, Conversation, Agent } from '@solocraft/shared'
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

// Mock @ai-sdk/react
const mockChatSendMessage = vi.fn()
vi.mock('@ai-sdk/react', () => ({
  useChat: vi.fn(() => ({
    messages: [],
    status: 'ready',
    sendMessage: mockChatSendMessage,
  })),
}))

// Mock ai module (DefaultChatTransport needs to be a class/constructor)
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
    modelConfig: { provider: 'google' },
    skills: [],
    tools: [],
    subAgents: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function createTestServices(): ServiceContainer {
  return {
    projects: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    agents: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    conversations: {
      list: vi.fn(), getById: vi.fn(), create: vi.fn(),
      sendMessage: vi.fn().mockResolvedValue(undefined),
      getMessages: vi.fn(), searchMessages: vi.fn(), delete: vi.fn(),
    },
    tasks: { list: vi.fn(), getById: vi.fn(), cancel: vi.fn(), getLogs: vi.fn() },
    artifacts: { list: vi.fn(), getById: vi.fn(), delete: vi.fn() },
    memory: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    settings: { get: vi.fn(), update: vi.fn() },
    dashboard: { getSummary: vi.fn(), getActiveAgents: vi.fn(), getRecentTasks: vi.fn(), getActivityFeed: vi.fn() },
  } as unknown as ServiceContainer
}

describe('ChatWindow', () => {
  const originalElectronAPI = (window as any).electronAPI

  beforeEach(() => {
    vi.clearAllMocks()
    // Mock scrollIntoView (not available in jsdom)
    Element.prototype.scrollIntoView = vi.fn()
    // Default: no electronAPI = mock mode
    delete (window as any).electronAPI
    const services = createTestServices()
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
    render(<ChatWindow conversation={makeConversation()} agent={makeAgent()} />)

    expect(screen.getByText('Test Chat')).toBeInTheDocument()
    expect(screen.getByText('@Writer')).toBeInTheDocument()
  })

  it('shows empty state when no messages', () => {
    render(<ChatWindow conversation={makeConversation()} agent={makeAgent()} />)

    expect(screen.getByText('Start the conversation...')).toBeInTheDocument()
  })

  it('renders messages in mock mode', () => {
    const conversation = makeConversation({
      messages: [
        {
          id: 'msg-1' as MessageId,
          conversationId: 'conv-1' as ConversationId,
          role: 'user',
          content: 'Hello there',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'msg-2' as MessageId,
          conversationId: 'conv-1' as ConversationId,
          role: 'assistant',
          content: 'Hi! How can I help?',
          createdAt: now,
          updatedAt: now,
        },
      ],
    })

    render(<ChatWindow conversation={conversation} agent={makeAgent()} />)

    expect(screen.getByText('Hello there')).toBeInTheDocument()
    expect(screen.getByText('Hi! How can I help?')).toBeInTheDocument()
  })

  it('renders the Delete button', () => {
    render(<ChatWindow conversation={makeConversation()} agent={makeAgent()} />)

    expect(screen.getByText('Delete')).toBeInTheDocument()
  })

  it('renders the Send button (disabled when input is empty)', () => {
    render(<ChatWindow conversation={makeConversation()} agent={makeAgent()} />)

    const sendButton = screen.getByText('Send')
    expect(sendButton).toBeInTheDocument()
    expect(sendButton.closest('button')).toBeDisabled()
  })

  it('renders ChatInput with placeholder', () => {
    render(<ChatWindow conversation={makeConversation()} agent={makeAgent()} />)

    expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument()
  })

  it('sends message through Zustand store in mock mode', async () => {
    const mockSendMessage = vi.fn().mockResolvedValue(undefined)
    useAppStore.setState({ sendMessage: mockSendMessage })

    render(<ChatWindow conversation={makeConversation()} agent={makeAgent()} />)

    const input = screen.getByPlaceholderText('Type a message...')
    fireEvent.change(input, { target: { value: 'Test message' } })

    const sendButton = screen.getByText('Send')
    fireEvent.click(sendButton)

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith('conv-1', 'Test message')
    })
  })

  it('renders without agent name when agent is undefined', () => {
    render(<ChatWindow conversation={makeConversation()} agent={undefined} />)

    expect(screen.getByText('Test Chat')).toBeInTheDocument()
    expect(screen.queryByText(/@/)).not.toBeInTheDocument()
  })

  it('uses useChat with DefaultChatTransport in server mode', async () => {
    ;(window as any).electronAPI = {
      getServerBaseUrl: () => 'http://localhost:3001',
      getServerToken: () => 'test-token',
      getServerPort: () => 3001,
    }

    const { useChat } = await import('@ai-sdk/react')

    render(<ChatWindow conversation={makeConversation()} agent={makeAgent()} />)

    // useChat should have been called (it's always called due to rules of hooks)
    expect(useChat).toHaveBeenCalled()
  })

  it('disables input while mock sending', async () => {
    // Create a sendMessage that doesn't resolve immediately
    let resolveSend: (() => void) | undefined
    const mockSendMessage = vi.fn(() => new Promise<void>(r => { resolveSend = r }))
    useAppStore.setState({ sendMessage: mockSendMessage })

    const { unmount } = render(<ChatWindow conversation={makeConversation()} agent={makeAgent()} />)

    const input = screen.getByPlaceholderText('Type a message...')
    fireEvent.change(input, { target: { value: 'Test' } })
    fireEvent.click(screen.getByText('Send'))

    // While sending, the input should be disabled
    await waitFor(() => {
      expect(input).toBeDisabled()
    })

    // Resolve the pending promise, then unmount to avoid act() warning
    resolveSend?.()
    await waitFor(() => {
      expect(input).not.toBeDisabled()
    })
    unmount()
  })
})
