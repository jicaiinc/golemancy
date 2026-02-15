import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => {
  const mockTools = vi.fn()
  const mockClose = vi.fn()
  const mockClient = { tools: mockTools, close: mockClose }
  const createMCPClient = vi.fn().mockResolvedValue(mockClient)
  const StdioTransport = vi.fn()

  return { createMCPClient, StdioTransport, mockClient, mockTools, mockClose }
})

vi.mock('@ai-sdk/mcp', () => ({
  createMCPClient: mocks.createMCPClient,
}))

vi.mock('@ai-sdk/mcp/mcp-stdio', () => ({
  Experimental_StdioMCPTransport: mocks.StdioTransport,
}))

vi.mock('./sandbox-pool', () => ({
  sandboxPool: {
    getHandle: vi.fn(),
  },
}))

import { loadAgentMcpTools } from './mcp'
import type { MCPServerConfig } from '@golemancy/shared'

function makeServer(overrides: Partial<MCPServerConfig> = {}): MCPServerConfig {
  return {
    name: 'test-server',
    transportType: 'stdio',
    command: '/usr/bin/test-mcp',
    args: ['--flag'],
    enabled: true,
    ...overrides,
  }
}

describe('loadAgentMcpTools', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    // Restore default mock behavior after resetAllMocks
    mocks.createMCPClient.mockResolvedValue(mocks.mockClient)
    mocks.mockTools.mockResolvedValue({})
    mocks.mockClose.mockResolvedValue(undefined)
  })

  it('returns null for empty server list', async () => {
    const result = await loadAgentMcpTools([])
    expect(result).toBeNull()
  })

  it('returns null when all servers are disabled', async () => {
    const result = await loadAgentMcpTools([
      makeServer({ enabled: false }),
      makeServer({ name: 'another', enabled: false }),
    ])
    expect(result).toBeNull()
    expect(mocks.createMCPClient).not.toHaveBeenCalled()
  })

  it('creates stdio client with correct transport', async () => {
    mocks.mockTools.mockResolvedValue({ myTool: { execute: vi.fn() } })

    const server = makeServer({
      command: '/usr/bin/mcp-server',
      args: ['--verbose'],
      env: { TOKEN: 'abc' },
    })

    const result = await loadAgentMcpTools([server])

    expect(mocks.StdioTransport).toHaveBeenCalledWith({
      command: '/usr/bin/mcp-server',
      args: ['--verbose'],
      env: expect.objectContaining({ TOKEN: 'abc' }),
    })
    expect(mocks.createMCPClient).toHaveBeenCalled()
    expect(result).not.toBeNull()
    expect(result!.tools).toHaveProperty('myTool')
  })

  it('creates http client with correct config', async () => {
    mocks.mockTools.mockResolvedValue({ httpTool: { execute: vi.fn() } })

    const server = makeServer({
      transportType: 'http',
      command: undefined,
      url: 'https://mcp.example.com',
      headers: { Authorization: 'Bearer tok' },
    })

    const result = await loadAgentMcpTools([server])

    expect(mocks.createMCPClient).toHaveBeenCalledWith({
      transport: {
        type: 'http',
        url: 'https://mcp.example.com',
        headers: { Authorization: 'Bearer tok' },
      },
    })
    expect(result).not.toBeNull()
    expect(result!.tools).toHaveProperty('httpTool')
  })

  it('creates sse client with correct config', async () => {
    mocks.mockTools.mockResolvedValue({ sseTool: { execute: vi.fn() } })

    const server = makeServer({
      transportType: 'sse',
      command: undefined,
      url: 'https://sse.example.com/events',
    })

    const result = await loadAgentMcpTools([server])

    expect(mocks.createMCPClient).toHaveBeenCalledWith({
      transport: {
        type: 'sse',
        url: 'https://sse.example.com/events',
        headers: undefined,
      },
    })
    expect(result).not.toBeNull()
  })

  it('skips stdio server with missing command', async () => {
    const server = makeServer({ command: undefined })

    const result = await loadAgentMcpTools([server])

    expect(mocks.createMCPClient).not.toHaveBeenCalled()
    expect(result).toBeNull()
  })

  it('skips http server with missing url', async () => {
    const server = makeServer({ transportType: 'http', command: undefined, url: undefined })

    const result = await loadAgentMcpTools([server])

    expect(mocks.createMCPClient).not.toHaveBeenCalled()
    expect(result).toBeNull()
  })

  it('skips sse server with missing url', async () => {
    const server = makeServer({ transportType: 'sse', command: undefined, url: undefined })

    const result = await loadAgentMcpTools([server])

    expect(mocks.createMCPClient).not.toHaveBeenCalled()
    expect(result).toBeNull()
  })

  it('merges tools from multiple servers', async () => {
    mocks.mockTools
      .mockResolvedValueOnce({ toolA: { execute: vi.fn() } })
      .mockResolvedValueOnce({ toolB: { execute: vi.fn() } })

    // Reset createMCPClient to return fresh clients for each call
    const client1 = { tools: vi.fn().mockResolvedValue({ toolA: { execute: vi.fn() } }), close: vi.fn() }
    const client2 = { tools: vi.fn().mockResolvedValue({ toolB: { execute: vi.fn() } }), close: vi.fn() }
    mocks.createMCPClient
      .mockResolvedValueOnce(client1)
      .mockResolvedValueOnce(client2)

    const result = await loadAgentMcpTools([
      makeServer({ name: 'server1' }),
      makeServer({ name: 'server2', command: '/usr/bin/other' }),
    ])

    expect(result).not.toBeNull()
    // When multiple servers, tools are prefixed with server name
    expect(result!.tools).toHaveProperty('server1_toolA')
    expect(result!.tools).toHaveProperty('server2_toolB')
  })

  it('does not prefix tool names when single server', async () => {
    mocks.mockTools.mockResolvedValue({ myTool: { execute: vi.fn() } })

    const result = await loadAgentMcpTools([makeServer()])

    expect(result).not.toBeNull()
    expect(result!.tools).toHaveProperty('myTool')
    expect(result!.tools).not.toHaveProperty('test-server_myTool')
  })

  it('handles connection failure gracefully and continues', async () => {
    const client2 = { tools: vi.fn().mockResolvedValue({ okTool: { execute: vi.fn() } }), close: vi.fn() }
    mocks.createMCPClient
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValueOnce(client2)

    const result = await loadAgentMcpTools([
      makeServer({ name: 'failing' }),
      makeServer({ name: 'working', command: '/usr/bin/other' }),
    ])

    // Should still have tools from the working server
    // With 2 enabled servers, tools get prefixed
    expect(result).not.toBeNull()
    expect(result!.tools).toHaveProperty('working_okTool')
  })

  it('cleanup calls close() on all clients', async () => {
    const close1 = vi.fn().mockResolvedValue(undefined)
    const close2 = vi.fn().mockResolvedValue(undefined)
    mocks.createMCPClient
      .mockResolvedValueOnce({ tools: vi.fn().mockResolvedValue({ t1: {} }), close: close1 })
      .mockResolvedValueOnce({ tools: vi.fn().mockResolvedValue({ t2: {} }), close: close2 })

    const result = await loadAgentMcpTools([
      makeServer({ name: 's1' }),
      makeServer({ name: 's2', command: '/usr/bin/other' }),
    ])

    expect(result).not.toBeNull()
    await result!.cleanup()
    expect(close1).toHaveBeenCalled()
    expect(close2).toHaveBeenCalled()
  })

  it('cleanup handles close() errors gracefully', async () => {
    const close1 = vi.fn().mockRejectedValue(new Error('close failed'))
    mocks.createMCPClient
      .mockResolvedValueOnce({ tools: vi.fn().mockResolvedValue({ t1: {} }), close: close1 })

    const result = await loadAgentMcpTools([makeServer()])

    expect(result).not.toBeNull()
    // Should not throw even if close() fails
    await expect(result!.cleanup()).resolves.toBeUndefined()
  })

  it('skips unknown transport type', async () => {
    const server = makeServer({ transportType: 'grpc' as any, command: undefined })

    const result = await loadAgentMcpTools([server])

    expect(mocks.createMCPClient).not.toHaveBeenCalled()
    expect(result).toBeNull()
  })
})
