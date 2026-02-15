import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mocks = vi.hoisted(() => {
  const mockToolsFn = vi.fn().mockResolvedValue({})
  const mockCloseFn = vi.fn().mockResolvedValue(undefined)
  const mockClient = { tools: mockToolsFn, close: mockCloseFn }
  const createMCPClient = vi.fn().mockResolvedValue(mockClient)
  const StdioTransport = vi.fn()

  return { createMCPClient, StdioTransport, mockClient, mockToolsFn, mockCloseFn }
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

import { MCPPool } from './mcp-pool'
import type { MCPServerConfig, ProjectId } from '@golemancy/shared'
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
      mode: 'unrestricted',
      config: {
        allowWrite: [],
        denyRead: [],
        denyWrite: [],
        allowedDomains: ['*'],
        deniedDomains: [],
        deniedCommands: [],
        applyToMCP: false,
      },
    },
    ...overrides,
  }
}

describe('MCPPool', () => {
  let pool: MCPPool

  beforeEach(() => {
    vi.resetAllMocks()
    pool = new MCPPool()
    mocks.createMCPClient.mockResolvedValue(mocks.mockClient)
    mocks.mockToolsFn.mockResolvedValue({})
    mocks.mockCloseFn.mockResolvedValue(undefined)
  })

  afterEach(async () => {
    await pool.shutdown()
  })

  // ── Lazy Creation ────────────────────────────────────────

  describe('lazy creation', () => {
    it('creates connection on first getTools() call', async () => {
      mocks.mockToolsFn.mockResolvedValue({ toolA: { execute: vi.fn() } })

      const result = await pool.getTools(makeServer(), makeOptions())

      expect(mocks.createMCPClient).toHaveBeenCalledTimes(1)
      expect(result.tools).toHaveProperty('toolA')
      expect(result.error).toBeUndefined()
      expect(pool.getConnectionCount()).toBe(1)
    })

    it('reuses cached connection on second getTools() call with same config', async () => {
      mocks.mockToolsFn.mockResolvedValue({ toolA: { execute: vi.fn() } })
      const server = makeServer()
      const options = makeOptions()

      const result1 = await pool.getTools(server, options)
      const result2 = await pool.getTools(server, options)

      // Only one client creation
      expect(mocks.createMCPClient).toHaveBeenCalledTimes(1)
      expect(result1.tools).toBe(result2.tools)
      expect(pool.getConnectionCount()).toBe(1)
    })

    it('starts with zero connections', () => {
      expect(pool.getConnectionCount()).toBe(0)
    })
  })

  // ── Fingerprint Mismatch ─────────────────────────────────

  describe('fingerprint mismatch', () => {
    it('recreates connection when command changes', async () => {
      const close1 = vi.fn().mockResolvedValue(undefined)
      const client1 = { tools: vi.fn().mockResolvedValue({ old: {} }), close: close1 }
      const client2 = { tools: vi.fn().mockResolvedValue({ new: {} }), close: vi.fn() }
      mocks.createMCPClient
        .mockResolvedValueOnce(client1)
        .mockResolvedValueOnce(client2)

      const options = makeOptions()

      // First call with original command
      await pool.getTools(makeServer({ command: '/usr/bin/v1' }), options)
      expect(pool.getConnectionCount()).toBe(1)

      // Second call with different command → fingerprint mismatch
      const result2 = await pool.getTools(makeServer({ command: '/usr/bin/v2' }), options)

      expect(mocks.createMCPClient).toHaveBeenCalledTimes(2)
      expect(close1).toHaveBeenCalled() // old connection closed
      expect(result2.tools).toHaveProperty('new')
      expect(pool.getConnectionCount()).toBe(1) // still only 1 entry
    })

    it('recreates connection when args change', async () => {
      const close1 = vi.fn().mockResolvedValue(undefined)
      const client1 = { tools: vi.fn().mockResolvedValue({}), close: close1 }
      const client2 = { tools: vi.fn().mockResolvedValue({}), close: vi.fn() }
      mocks.createMCPClient
        .mockResolvedValueOnce(client1)
        .mockResolvedValueOnce(client2)

      const options = makeOptions()

      await pool.getTools(makeServer({ args: ['--v1'] }), options)
      await pool.getTools(makeServer({ args: ['--v2'] }), options)

      expect(mocks.createMCPClient).toHaveBeenCalledTimes(2)
      expect(close1).toHaveBeenCalled()
    })

    it('recreates connection when env changes', async () => {
      const close1 = vi.fn().mockResolvedValue(undefined)
      const client1 = { tools: vi.fn().mockResolvedValue({}), close: close1 }
      const client2 = { tools: vi.fn().mockResolvedValue({}), close: vi.fn() }
      mocks.createMCPClient
        .mockResolvedValueOnce(client1)
        .mockResolvedValueOnce(client2)

      const options = makeOptions()

      await pool.getTools(makeServer({ env: { KEY: 'old' } }), options)
      await pool.getTools(makeServer({ env: { KEY: 'new' } }), options)

      expect(mocks.createMCPClient).toHaveBeenCalledTimes(2)
      expect(close1).toHaveBeenCalled()
    })

    it('recreates connection when permission mode changes', async () => {
      const close1 = vi.fn().mockResolvedValue(undefined)
      const client1 = { tools: vi.fn().mockResolvedValue({}), close: close1 }
      const client2 = { tools: vi.fn().mockResolvedValue({}), close: vi.fn() }
      mocks.createMCPClient
        .mockResolvedValueOnce(client1)
        .mockResolvedValueOnce(client2)

      const server = makeServer()

      // First call with unrestricted mode
      await pool.getTools(server, makeOptions({
        resolvedPermissions: { mode: 'unrestricted', config: makeOptions().resolvedPermissions.config },
      }))

      // Second call with sandbox mode → fingerprint mismatch
      await pool.getTools(server, makeOptions({
        resolvedPermissions: { mode: 'sandbox', config: makeOptions().resolvedPermissions.config },
      }))

      expect(mocks.createMCPClient).toHaveBeenCalledTimes(2)
      expect(close1).toHaveBeenCalled()
    })
  })

  // ── Connection Failure ───────────────────────────────────

  describe('connection failure', () => {
    it('returns empty tools with error on connection failure', async () => {
      mocks.createMCPClient.mockRejectedValue(new Error('connection refused'))

      const result = await pool.getTools(makeServer(), makeOptions())

      expect(result.tools).toEqual({})
      expect(result.error).toBe('connection refused')
      expect(pool.getConnectionCount()).toBe(0)
    })

    it('retries after previous failure (lazy rebuild)', async () => {
      mocks.createMCPClient
        .mockRejectedValueOnce(new Error('connection refused'))
        .mockResolvedValueOnce({
          tools: vi.fn().mockResolvedValue({ recovered: {} }),
          close: vi.fn(),
        })

      const server = makeServer()
      const options = makeOptions()

      // First call fails
      const result1 = await pool.getTools(server, options)
      expect(result1.tools).toEqual({})
      expect(result1.error).toBeDefined()
      expect(pool.getConnectionCount()).toBe(0)

      // Second call succeeds (entry was removed, so fresh creation)
      const result2 = await pool.getTools(server, options)
      expect(result2.tools).toHaveProperty('recovered')
      expect(result2.error).toBeUndefined()
      expect(pool.getConnectionCount()).toBe(1)
    })

    it('returns error when stdio server has no command', async () => {
      const result = await pool.getTools(
        makeServer({ command: undefined }),
        makeOptions(),
      )

      expect(result.tools).toEqual({})
      expect(result.error).toContain('Missing required configuration')
      expect(mocks.createMCPClient).not.toHaveBeenCalled()
    })

    it('returns error when http server has no url', async () => {
      const result = await pool.getTools(
        makeServer({ transportType: 'http', command: undefined, url: undefined }),
        makeOptions(),
      )

      expect(result.tools).toEqual({})
      expect(result.error).toContain('Missing required configuration')
      expect(mocks.createMCPClient).not.toHaveBeenCalled()
    })
  })

  // ── Transport Types ──────────────────────────────────────

  describe('transport types', () => {
    it('creates stdio transport', async () => {
      mocks.mockToolsFn.mockResolvedValue({ tool: {} })

      await pool.getTools(
        makeServer({ command: '/usr/bin/mcp', args: ['--verbose'] }),
        makeOptions(),
      )

      expect(mocks.StdioTransport).toHaveBeenCalledWith(expect.objectContaining({
        command: '/usr/bin/mcp',
        args: ['--verbose'],
      }))
    })

    it('creates http transport', async () => {
      mocks.mockToolsFn.mockResolvedValue({ tool: {} })

      await pool.getTools(
        makeServer({
          transportType: 'http',
          command: undefined,
          url: 'https://mcp.example.com',
          headers: { Authorization: 'Bearer tok' },
        }),
        makeOptions(),
      )

      expect(mocks.createMCPClient).toHaveBeenCalledWith({
        transport: {
          type: 'http',
          url: 'https://mcp.example.com',
          headers: { Authorization: 'Bearer tok' },
        },
      })
    })

    it('creates sse transport', async () => {
      mocks.mockToolsFn.mockResolvedValue({ tool: {} })

      await pool.getTools(
        makeServer({
          transportType: 'sse',
          command: undefined,
          url: 'https://sse.example.com',
        }),
        makeOptions(),
      )

      expect(mocks.createMCPClient).toHaveBeenCalledWith({
        transport: {
          type: 'sse',
          url: 'https://sse.example.com',
          headers: undefined,
        },
      })
    })
  })

  // ── Invalidation ─────────────────────────────────────────

  describe('invalidateServer', () => {
    it('closes and removes specific server connection', async () => {
      const close = vi.fn().mockResolvedValue(undefined)
      mocks.createMCPClient.mockResolvedValue({
        tools: vi.fn().mockResolvedValue({ tool: {} }),
        close,
      })

      const options = makeOptions()
      await pool.getTools(makeServer({ name: 'server-a' }), options)
      await pool.getTools(makeServer({ name: 'server-b', command: '/other' }), options)
      expect(pool.getConnectionCount()).toBe(2)

      await pool.invalidateServer('proj-1' as ProjectId, 'server-a')

      expect(close).toHaveBeenCalledTimes(1)
      expect(pool.getConnectionCount()).toBe(1)
    })

    it('does nothing for non-existent server', async () => {
      await pool.invalidateServer('proj-1' as ProjectId, 'non-existent')
      expect(pool.getConnectionCount()).toBe(0)
    })

    it('does nothing for non-existent project', async () => {
      await pool.invalidateServer('non-existent' as ProjectId, 'server')
      expect(pool.getConnectionCount()).toBe(0)
    })
  })

  describe('invalidateProject', () => {
    it('closes all connections for a project', async () => {
      const close = vi.fn().mockResolvedValue(undefined)
      mocks.createMCPClient.mockResolvedValue({
        tools: vi.fn().mockResolvedValue({ tool: {} }),
        close,
      })

      const options = makeOptions()
      await pool.getTools(makeServer({ name: 'server-a' }), options)
      await pool.getTools(makeServer({ name: 'server-b', command: '/other' }), options)
      expect(pool.getConnectionCount()).toBe(2)

      await pool.invalidateProject('proj-1' as ProjectId)

      expect(close).toHaveBeenCalledTimes(2)
      expect(pool.getConnectionCount()).toBe(0)
    })

    it('does nothing for non-existent project', async () => {
      await pool.invalidateProject('non-existent' as ProjectId)
      expect(pool.getConnectionCount()).toBe(0)
    })
  })

  // ── Shutdown ─────────────────────────────────────────────

  describe('shutdown', () => {
    it('closes all connections across all projects', async () => {
      const close = vi.fn().mockResolvedValue(undefined)
      mocks.createMCPClient.mockResolvedValue({
        tools: vi.fn().mockResolvedValue({ tool: {} }),
        close,
      })

      await pool.getTools(makeServer({ name: 'a' }), makeOptions({ projectId: 'proj-1' as ProjectId }))
      await pool.getTools(makeServer({ name: 'b' }), makeOptions({ projectId: 'proj-2' as ProjectId }))
      expect(pool.getConnectionCount()).toBe(2)

      await pool.shutdown()

      expect(close).toHaveBeenCalledTimes(2)
      expect(pool.getConnectionCount()).toBe(0)
    })

    it('handles close errors gracefully', async () => {
      mocks.createMCPClient.mockResolvedValue({
        tools: vi.fn().mockResolvedValue({ tool: {} }),
        close: vi.fn().mockRejectedValue(new Error('close error')),
      })

      await pool.getTools(makeServer(), makeOptions())

      // Should not throw
      await expect(pool.shutdown()).resolves.toBeUndefined()
      expect(pool.getConnectionCount()).toBe(0)
    })

    it('stops idle scanner on shutdown', async () => {
      pool.startIdleScanner(100, 100)
      await pool.shutdown()
      // No assertion needed — just verify no errors and pool is empty
      expect(pool.getConnectionCount()).toBe(0)
    })
  })

  // ── Idle Timeout ─────────────────────────────────────────

  describe('idle timeout', () => {
    it('removes idle connections after timeout', async () => {
      const close = vi.fn().mockResolvedValue(undefined)
      mocks.createMCPClient.mockResolvedValue({
        tools: vi.fn().mockResolvedValue({ tool: {} }),
        close,
      })

      await pool.getTools(makeServer(), makeOptions())
      expect(pool.getConnectionCount()).toBe(1)

      // Start scanner with very short timeout
      pool.startIdleScanner(50, 0) // maxIdleMs=0 means immediately idle

      // Wait for scanner to fire
      await new Promise(r => setTimeout(r, 100))

      expect(close).toHaveBeenCalled()
      expect(pool.getConnectionCount()).toBe(0)

      pool.stopIdleScanner()
    })

    it('does not remove recently used connections', async () => {
      const close = vi.fn().mockResolvedValue(undefined)
      mocks.createMCPClient.mockResolvedValue({
        tools: vi.fn().mockResolvedValue({ tool: {} }),
        close,
      })

      await pool.getTools(makeServer(), makeOptions())

      // Start scanner with long timeout
      pool.startIdleScanner(50, 60_000) // 60 seconds

      // Wait for scanner to fire
      await new Promise(r => setTimeout(r, 100))

      // Connection should still be active (not idle enough)
      expect(close).not.toHaveBeenCalled()
      expect(pool.getConnectionCount()).toBe(1)

      pool.stopIdleScanner()
    })
  })

  // ── Multiple Projects ────────────────────────────────────

  describe('multiple projects', () => {
    it('maintains isolated pool entries per project', async () => {
      const client1 = { tools: vi.fn().mockResolvedValue({ toolA: {} }), close: vi.fn() }
      const client2 = { tools: vi.fn().mockResolvedValue({ toolB: {} }), close: vi.fn() }
      mocks.createMCPClient
        .mockResolvedValueOnce(client1)
        .mockResolvedValueOnce(client2)

      const server = makeServer({ name: 'shared-server' })

      const result1 = await pool.getTools(server, makeOptions({ projectId: 'proj-1' as ProjectId }))
      const result2 = await pool.getTools(server, makeOptions({ projectId: 'proj-2' as ProjectId }))

      // Two separate connections
      expect(mocks.createMCPClient).toHaveBeenCalledTimes(2)
      expect(pool.getConnectionCount()).toBe(2)
      expect(result1.tools).toHaveProperty('toolA')
      expect(result2.tools).toHaveProperty('toolB')
    })

    it('invalidating one project does not affect another', async () => {
      const close1 = vi.fn().mockResolvedValue(undefined)
      const close2 = vi.fn().mockResolvedValue(undefined)
      mocks.createMCPClient
        .mockResolvedValueOnce({ tools: vi.fn().mockResolvedValue({}), close: close1 })
        .mockResolvedValueOnce({ tools: vi.fn().mockResolvedValue({}), close: close2 })

      await pool.getTools(makeServer(), makeOptions({ projectId: 'proj-1' as ProjectId }))
      await pool.getTools(makeServer(), makeOptions({ projectId: 'proj-2' as ProjectId }))
      expect(pool.getConnectionCount()).toBe(2)

      await pool.invalidateProject('proj-1' as ProjectId)

      expect(close1).toHaveBeenCalled()
      expect(close2).not.toHaveBeenCalled()
      expect(pool.getConnectionCount()).toBe(1)
    })
  })

  // ── Concurrent Access (connectPromise deduplication) ─────

  describe('concurrent access', () => {
    it('deduplicates concurrent getTools() calls for same server', async () => {
      let resolveConnect: (value: unknown) => void
      const connectPromise = new Promise(r => { resolveConnect = r })

      const client = {
        tools: vi.fn().mockResolvedValue({ tool: {} }),
        close: vi.fn(),
      }
      mocks.createMCPClient.mockImplementation(async () => {
        await connectPromise
        return client
      })

      const server = makeServer()
      const options = makeOptions()

      // Start two concurrent getTools() calls
      const promise1 = pool.getTools(server, options)
      const promise2 = pool.getTools(server, options)

      // Resolve the connection
      resolveConnect!(undefined)

      const [tools1, tools2] = await Promise.all([promise1, promise2])

      // Both should resolve to the same tools
      expect(tools1).toEqual(tools2)
      // Only one client created
      expect(mocks.createMCPClient).toHaveBeenCalledTimes(1)
    })
  })

  // ── No Options (undefined) ──────────────────────────────

  describe('no options', () => {
    it('works with undefined options', async () => {
      mocks.mockToolsFn.mockResolvedValue({ tool: {} })

      const result = await pool.getTools(makeServer(), undefined)

      expect(result.tools).toHaveProperty('tool')
      expect(pool.getConnectionCount()).toBe(1)
    })
  })
})
