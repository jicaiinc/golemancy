import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => {
  const getTools = vi.fn().mockResolvedValue({ tools: {}, })
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
    mocks.getTools.mockResolvedValue({ tools: {} })
  })

  it('returns empty result for empty server list', async () => {
    const result = await loadAgentMcpTools([])
    expect(result.tools).toEqual({})
    expect(result.warnings).toEqual([])
  })

  it('returns empty result when all servers are disabled', async () => {
    const result = await loadAgentMcpTools([
      makeServer({ enabled: false }),
      makeServer({ name: 'another', enabled: false }),
    ])
    expect(result.tools).toEqual({})
    expect(mocks.getTools).not.toHaveBeenCalled()
  })

  it('delegates to mcpPool.getTools for stdio server', async () => {
    mocks.getTools.mockResolvedValue({ tools: { myTool: { execute: vi.fn() } } })

    const server = makeServer({
      command: '/usr/bin/mcp-server',
      args: ['--verbose'],
      env: { TOKEN: 'abc' },
    })
    const options = makeOptions()

    const result = await loadAgentMcpTools([server], options)

    expect(mocks.getTools).toHaveBeenCalledWith(server, options)
    expect(result.tools).toHaveProperty('myTool')
  })

  it('delegates to mcpPool.getTools for http server', async () => {
    mocks.getTools.mockResolvedValue({ tools: { httpTool: { execute: vi.fn() } } })

    const server = makeServer({
      transportType: 'http',
      command: undefined,
      url: 'https://mcp.example.com',
      headers: { Authorization: 'Bearer tok' },
    })
    const options = makeOptions()

    const result = await loadAgentMcpTools([server], options)

    expect(mocks.getTools).toHaveBeenCalledWith(server, options)
    expect(result.tools).toHaveProperty('httpTool')
  })

  it('delegates to mcpPool.getTools for sse server', async () => {
    mocks.getTools.mockResolvedValue({ tools: { sseTool: { execute: vi.fn() } } })

    const server = makeServer({
      transportType: 'sse',
      command: undefined,
      url: 'https://sse.example.com/events',
    })

    const result = await loadAgentMcpTools([server])

    expect(mocks.getTools).toHaveBeenCalledWith(server, undefined)
    expect(result.tools).toHaveProperty('sseTool')
  })

  it('merges tools from multiple servers with name prefixing', async () => {
    mocks.getTools
      .mockResolvedValueOnce({ tools: { toolA: { execute: vi.fn() } } })
      .mockResolvedValueOnce({ tools: { toolB: { execute: vi.fn() } } })

    const result = await loadAgentMcpTools([
      makeServer({ name: 'server1' }),
      makeServer({ name: 'server2', command: '/usr/bin/other' }),
    ])

    expect(result.tools).toHaveProperty('server1_toolA')
    expect(result.tools).toHaveProperty('server2_toolB')
  })

  it('does not prefix tool names when single server', async () => {
    mocks.getTools.mockResolvedValue({ tools: { myTool: { execute: vi.fn() } } })

    const result = await loadAgentMcpTools([makeServer()])

    expect(result.tools).toHaveProperty('myTool')
    expect(result.tools).not.toHaveProperty('test-server_myTool')
  })

  it('collects warnings for failed servers', async () => {
    mocks.getTools
      .mockResolvedValueOnce({ tools: {}, error: 'connection refused' })
      .mockResolvedValueOnce({ tools: { okTool: { execute: vi.fn() } } })

    const result = await loadAgentMcpTools([
      makeServer({ name: 'failing' }),
      makeServer({ name: 'working', command: '/usr/bin/other' }),
    ])

    expect(result.tools).toHaveProperty('working_okTool')
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('failing')
    expect(result.warnings[0]).toContain('connection refused')
  })

  it('returns empty tools for unknown transport type', async () => {
    mocks.getTools.mockResolvedValue({ tools: {} })

    const server = makeServer({ transportType: 'grpc' as any, command: undefined })
    const result = await loadAgentMcpTools([server])

    // Pool handles the unknown type and returns empty tools
    expect(result.tools).toEqual({})
  })

  // ── Permission Mode Filtering Tests ────────────────────

  it('restricted mode: filters out stdio servers', async () => {
    mocks.getTools.mockResolvedValue({ tools: { httpTool: { execute: vi.fn() } } })

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
    expect(result.tools).toHaveProperty('httpTool')
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('stdio-server')
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
    expect(result.tools).toEqual({})
    expect(result.warnings).toHaveLength(2)
  })

  it('sandbox mode: does not filter stdio servers', async () => {
    mocks.getTools.mockResolvedValue({ tools: { tool: { execute: vi.fn() } } })

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
