import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => {
  const getTools = vi.fn().mockResolvedValue({})
  const mcpPool = { getTools }

  return { mcpPool, getTools }
})

vi.mock('./mcp-pool', () => ({
  mcpPool: mocks.mcpPool,
}))

import { loadAgentMcpTools } from './mcp'
import type { MCPServerConfig, ProjectId, ResolvedPermissionsConfig } from '@golemancy/shared'
import type { MCPLoadOptions } from './mcp'

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

function makeOptions(overrides: Partial<MCPLoadOptions> = {}): MCPLoadOptions {
  return {
    projectId: 'proj-1' as ProjectId,
    workspaceDir: '/tmp/workspace',
    resolvedPermissions: {
      mode: 'sandbox',
      config: {
        allowWrite: [],
        denyRead: [],
        denyWrite: [],
        allowedDomains: ['*'],
        deniedDomains: [],
        deniedCommands: [],
        applyToMCP: true,
      },
    },
    ...overrides,
  }
}

describe('loadAgentMcpTools', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.getTools.mockResolvedValue({})
  })

  it('returns empty object for empty server list', async () => {
    const result = await loadAgentMcpTools([])
    expect(result).toEqual({})
  })

  it('returns empty object when all servers are disabled', async () => {
    const result = await loadAgentMcpTools([
      makeServer({ enabled: false }),
      makeServer({ name: 'another', enabled: false }),
    ])
    expect(result).toEqual({})
    expect(mocks.getTools).not.toHaveBeenCalled()
  })

  it('delegates to mcpPool.getTools for stdio server', async () => {
    mocks.getTools.mockResolvedValue({ myTool: { execute: vi.fn() } })

    const server = makeServer({
      command: '/usr/bin/mcp-server',
      args: ['--verbose'],
      env: { TOKEN: 'abc' },
    })
    const options = makeOptions()

    const result = await loadAgentMcpTools([server], options)

    expect(mocks.getTools).toHaveBeenCalledWith(server, options)
    expect(result).toHaveProperty('myTool')
  })

  it('delegates to mcpPool.getTools for http server', async () => {
    mocks.getTools.mockResolvedValue({ httpTool: { execute: vi.fn() } })

    const server = makeServer({
      transportType: 'http',
      command: undefined,
      url: 'https://mcp.example.com',
      headers: { Authorization: 'Bearer tok' },
    })
    const options = makeOptions()

    const result = await loadAgentMcpTools([server], options)

    expect(mocks.getTools).toHaveBeenCalledWith(server, options)
    expect(result).toHaveProperty('httpTool')
  })

  it('delegates to mcpPool.getTools for sse server', async () => {
    mocks.getTools.mockResolvedValue({ sseTool: { execute: vi.fn() } })

    const server = makeServer({
      transportType: 'sse',
      command: undefined,
      url: 'https://sse.example.com/events',
    })

    const result = await loadAgentMcpTools([server])

    expect(mocks.getTools).toHaveBeenCalledWith(server, undefined)
    expect(result).toHaveProperty('sseTool')
  })

  it('merges tools from multiple servers with name prefixing', async () => {
    mocks.getTools
      .mockResolvedValueOnce({ toolA: { execute: vi.fn() } })
      .mockResolvedValueOnce({ toolB: { execute: vi.fn() } })

    const result = await loadAgentMcpTools([
      makeServer({ name: 'server1' }),
      makeServer({ name: 'server2', command: '/usr/bin/other' }),
    ])

    expect(result).toHaveProperty('server1_toolA')
    expect(result).toHaveProperty('server2_toolB')
  })

  it('does not prefix tool names when single server', async () => {
    mocks.getTools.mockResolvedValue({ myTool: { execute: vi.fn() } })

    const result = await loadAgentMcpTools([makeServer()])

    expect(result).toHaveProperty('myTool')
    expect(result).not.toHaveProperty('test-server_myTool')
  })

  it('handles pool returning empty tools gracefully', async () => {
    mocks.getTools
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ okTool: { execute: vi.fn() } })

    const result = await loadAgentMcpTools([
      makeServer({ name: 'failing' }),
      makeServer({ name: 'working', command: '/usr/bin/other' }),
    ])

    expect(result).toHaveProperty('working_okTool')
  })

  it('returns empty object for unknown transport type', async () => {
    mocks.getTools.mockResolvedValue({})

    const server = makeServer({ transportType: 'grpc' as any, command: undefined })
    const result = await loadAgentMcpTools([server])

    // Pool handles the unknown type and returns empty tools
    expect(result).toEqual({})
  })

  // ── Permission Mode Filtering Tests ────────────────────

  it('restricted mode: filters out stdio servers', async () => {
    mocks.getTools.mockResolvedValue({ httpTool: { execute: vi.fn() } })

    const options = makeOptions({
      resolvedPermissions: {
        mode: 'restricted',
        config: {
          allowWrite: [],
          denyRead: [],
          denyWrite: [],
          allowedDomains: ['*'],
          deniedDomains: [],
          deniedCommands: [],
          applyToMCP: true,
        },
      },
    })

    const result = await loadAgentMcpTools([
      makeServer({ name: 'stdio-server', transportType: 'stdio' }),
      makeServer({ name: 'http-server', transportType: 'http', command: undefined, url: 'https://example.com' }),
    ], options)

    // Only http server should be loaded (stdio filtered out)
    expect(mocks.getTools).toHaveBeenCalledTimes(1)
    expect(mocks.getTools).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'http-server' }),
      options,
    )
    expect(result).toHaveProperty('httpTool')
  })

  it('restricted mode: returns empty when all servers are stdio', async () => {
    const options = makeOptions({
      resolvedPermissions: {
        mode: 'restricted',
        config: {
          allowWrite: [],
          denyRead: [],
          denyWrite: [],
          allowedDomains: ['*'],
          deniedDomains: [],
          deniedCommands: [],
          applyToMCP: true,
        },
      },
    })

    const result = await loadAgentMcpTools([
      makeServer({ name: 's1', transportType: 'stdio' }),
      makeServer({ name: 's2', transportType: 'stdio' }),
    ], options)

    expect(mocks.getTools).not.toHaveBeenCalled()
    expect(result).toEqual({})
  })

  it('sandbox mode: does not filter stdio servers', async () => {
    mocks.getTools.mockResolvedValue({ tool: { execute: vi.fn() } })

    const options = makeOptions({
      resolvedPermissions: {
        mode: 'sandbox',
        config: {
          allowWrite: [],
          denyRead: [],
          denyWrite: [],
          allowedDomains: ['*'],
          deniedDomains: [],
          deniedCommands: [],
          applyToMCP: true,
        },
      },
    })

    await loadAgentMcpTools([makeServer({ transportType: 'stdio' })], options)

    expect(mocks.getTools).toHaveBeenCalledTimes(1)
  })
})
