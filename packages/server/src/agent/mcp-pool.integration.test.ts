import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Hoisted Mocks ───────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const mockToolsFn = vi.fn().mockResolvedValue({})
  const mockCloseFn = vi.fn().mockResolvedValue(undefined)
  const mockClient = { tools: mockToolsFn, close: mockCloseFn }
  const createMCPClient = vi.fn().mockResolvedValue(mockClient)
  const StdioTransport = vi.fn()
  const getHandleFn = vi.fn()

  return { createMCPClient, StdioTransport, mockClient, mockToolsFn, mockCloseFn, getHandleFn }
})

vi.mock('@ai-sdk/mcp', () => ({
  createMCPClient: mocks.createMCPClient,
}))

vi.mock('@ai-sdk/mcp/mcp-stdio', () => ({
  Experimental_StdioMCPTransport: mocks.StdioTransport,
}))

vi.mock('./sandbox-pool', () => ({
  sandboxPool: {
    getHandle: mocks.getHandleFn,
  },
}))

import { MCPPool } from './mcp-pool'
import type { MCPServerConfig, ProjectId, PermissionsConfig, ResolvedPermissionsConfig } from '@golemancy/shared'
import type { MCPLoadOptions } from './mcp'

// ── Test Helpers ────────────────────────────────────────────

function makeServer(overrides: Partial<MCPServerConfig> = {}): MCPServerConfig {
  return {
    name: 'test-mcp',
    transportType: 'stdio',
    command: '/usr/bin/test-mcp',
    args: ['--flag'],
    enabled: true,
    ...overrides,
  }
}

function makePermissionsConfig(overrides: Partial<PermissionsConfig> = {}): PermissionsConfig {
  return {
    allowWrite: ['/workspace'],
    denyRead: [],
    denyWrite: [],
    networkRestrictionsEnabled: false,
    allowedDomains: [],
    deniedDomains: [],
    deniedCommands: [],
    applyToMCP: false,
    ...overrides,
  }
}

function makeOptions(overrides: Partial<MCPLoadOptions> = {}): MCPLoadOptions {
  return {
    projectId: 'proj-1' as ProjectId,
    workspaceDir: '/tmp/workspace',
    resolvedPermissions: {
      mode: 'unrestricted',
      config: makePermissionsConfig(),
    },
    ...overrides,
  }
}

function makeSandboxOptions(overrides: Partial<MCPLoadOptions> = {}): MCPLoadOptions {
  return makeOptions({
    resolvedPermissions: {
      mode: 'sandbox',
      config: makePermissionsConfig({ applyToMCP: true }),
    },
    ...overrides,
  })
}

// ── Tests ───────────────────────────────────────────────────

describe('MCPPool integration — sandbox wrapping & fingerprint', () => {
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

  // ── Sandbox Command Wrapping ──────────────────────────────

  describe('sandbox command wrapping for stdio', () => {
    it('wraps command via sandboxPool when mode=sandbox + applyToMCP + stdio', async () => {
      const mockHandle = {
        wrapWithSandbox: vi.fn().mockResolvedValue('sandbox-wrapped /usr/bin/test-mcp --flag'),
        cleanupAfterCommand: vi.fn(),
      }
      mocks.getHandleFn.mockResolvedValue(mockHandle)
      mocks.mockToolsFn.mockResolvedValue({ tool: {} })

      const server = makeServer()
      const options = makeSandboxOptions()

      await pool.getTools(server, options)

      // sandboxPool.getHandle should have been called with sandbox config
      expect(mocks.getHandleFn).toHaveBeenCalledWith(
        'proj-1',
        expect.objectContaining({
          mode: 'sandbox',
          usesDedicatedWorker: true,
          sandbox: expect.objectContaining({
            filesystem: expect.objectContaining({
              allowWrite: ['/workspace'],
            }),
          }),
        }),
      )

      // handle.wrapWithSandbox should have been called with the built shell command
      expect(mockHandle.wrapWithSandbox).toHaveBeenCalledWith('/usr/bin/test-mcp --flag')

      // StdioTransport should use the wrapped command
      expect(mocks.StdioTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'bash',
          args: ['-c', 'sandbox-wrapped /usr/bin/test-mcp --flag'],
        }),
      )
    })

    it('does not wrap when applyToMCP is false', async () => {
      mocks.mockToolsFn.mockResolvedValue({ tool: {} })

      const server = makeServer()
      const options = makeOptions({
        resolvedPermissions: {
          mode: 'sandbox',
          config: makePermissionsConfig({ applyToMCP: false }),
        },
      })

      await pool.getTools(server, options)

      // sandboxPool.getHandle should NOT have been called
      expect(mocks.getHandleFn).not.toHaveBeenCalled()

      // StdioTransport should use original command
      expect(mocks.StdioTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          command: '/usr/bin/test-mcp',
          args: ['--flag'],
        }),
      )
    })

    it('does not wrap when mode is not sandbox', async () => {
      mocks.mockToolsFn.mockResolvedValue({ tool: {} })

      const server = makeServer()
      const options = makeOptions({
        resolvedPermissions: {
          mode: 'unrestricted',
          config: makePermissionsConfig({ applyToMCP: true }),
        },
      })

      await pool.getTools(server, options)

      expect(mocks.getHandleFn).not.toHaveBeenCalled()
    })

    it('does not wrap for http transport even with sandbox mode', async () => {
      mocks.mockToolsFn.mockResolvedValue({ tool: {} })

      const server = makeServer({
        transportType: 'http',
        command: undefined,
        url: 'https://mcp.example.com',
      })

      await pool.getTools(server, makeSandboxOptions())

      expect(mocks.getHandleFn).not.toHaveBeenCalled()
    })

    it('falls back to unwrapped command when sandbox wrapping fails', async () => {
      mocks.getHandleFn.mockRejectedValue(new Error('sandbox unavailable'))
      mocks.mockToolsFn.mockResolvedValue({ tool: {} })

      const server = makeServer()

      const result = await pool.getTools(server, makeSandboxOptions())

      // Should still succeed with original command
      expect(mocks.StdioTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          command: '/usr/bin/test-mcp',
          args: ['--flag'],
        }),
      )
      expect(result.tools).toHaveProperty('tool')
    })
  })

  // ── Shell Command Building ────────────────────────────────

  describe('shell command building and escaping', () => {
    it('builds correct shell command from command + args', async () => {
      const mockHandle = {
        wrapWithSandbox: vi.fn().mockResolvedValue('wrapped'),
        cleanupAfterCommand: vi.fn(),
      }
      mocks.getHandleFn.mockResolvedValue(mockHandle)
      mocks.mockToolsFn.mockResolvedValue({})

      const server = makeServer({
        command: 'npx',
        args: ['-y', '@example/mcp-server'],
      })

      await pool.getTools(server, makeSandboxOptions())

      expect(mockHandle.wrapWithSandbox).toHaveBeenCalledWith('npx -y @example/mcp-server')
    })

    it('shell-escapes args with special characters', async () => {
      const mockHandle = {
        wrapWithSandbox: vi.fn().mockResolvedValue('wrapped'),
        cleanupAfterCommand: vi.fn(),
      }
      mocks.getHandleFn.mockResolvedValue(mockHandle)
      mocks.mockToolsFn.mockResolvedValue({})

      const server = makeServer({
        command: '/usr/bin/mcp',
        args: ['--config', '/path with spaces/config.json'],
      })

      await pool.getTools(server, makeSandboxOptions())

      const wrappedCall = mockHandle.wrapWithSandbox.mock.calls[0][0]
      // The path with spaces should be quoted
      expect(wrappedCall).toContain("'/path with spaces/config.json'")
    })

    it('handles command with no args', async () => {
      const mockHandle = {
        wrapWithSandbox: vi.fn().mockResolvedValue('wrapped'),
        cleanupAfterCommand: vi.fn(),
      }
      mocks.getHandleFn.mockResolvedValue(mockHandle)
      mocks.mockToolsFn.mockResolvedValue({})

      const server = makeServer({
        command: '/usr/bin/simple-mcp',
        args: undefined,
      })

      await pool.getTools(server, makeSandboxOptions())

      expect(mockHandle.wrapWithSandbox).toHaveBeenCalledWith('/usr/bin/simple-mcp')
    })
  })

  // ── Fingerprint with Sandbox ──────────────────────────────

  describe('fingerprint includes sandbox config', () => {
    it('sandbox config change triggers connection recreate', async () => {
      const mockHandle = {
        wrapWithSandbox: vi.fn().mockResolvedValue('wrapped'),
        cleanupAfterCommand: vi.fn(),
      }
      mocks.getHandleFn.mockResolvedValue(mockHandle)

      const close1 = vi.fn().mockResolvedValue(undefined)
      const client1 = { tools: vi.fn().mockResolvedValue({ v1: {} }), close: close1 }
      const client2 = { tools: vi.fn().mockResolvedValue({ v2: {} }), close: vi.fn() }
      mocks.createMCPClient
        .mockResolvedValueOnce(client1)
        .mockResolvedValueOnce(client2)

      const server = makeServer()

      // First call with config A
      await pool.getTools(server, makeSandboxOptions({
        resolvedPermissions: {
          mode: 'sandbox',
          config: makePermissionsConfig({ applyToMCP: true, denyRead: [] }),
        },
      }))

      // Second call with different sandbox config (denyRead changed)
      const result2 = await pool.getTools(server, makeSandboxOptions({
        resolvedPermissions: {
          mode: 'sandbox',
          config: makePermissionsConfig({ applyToMCP: true, denyRead: ['~/.ssh'] }),
        },
      }))

      // Connection should be recreated (fingerprint mismatch due to sandboxConfigHash)
      expect(mocks.createMCPClient).toHaveBeenCalledTimes(2)
      expect(close1).toHaveBeenCalled()
      expect(result2.tools).toHaveProperty('v2')
    })

    it('same sandbox config reuses connection', async () => {
      const mockHandle = {
        wrapWithSandbox: vi.fn().mockResolvedValue('wrapped'),
        cleanupAfterCommand: vi.fn(),
      }
      mocks.getHandleFn.mockResolvedValue(mockHandle)
      mocks.mockToolsFn.mockResolvedValue({ tool: {} })

      const server = makeServer()
      const options = makeSandboxOptions()

      await pool.getTools(server, options)
      await pool.getTools(server, options)

      // Only one client created — cache hit
      expect(mocks.createMCPClient).toHaveBeenCalledTimes(1)
    })
  })

  // ── testConnection ────────────────────────────────────────

  describe('testConnection', () => {
    it('creates temporary connection, returns tool count, then closes', async () => {
      const testClose = vi.fn().mockResolvedValue(undefined)
      const testClient = {
        tools: vi.fn().mockResolvedValue({ toolA: {}, toolB: {} }),
        close: testClose,
      }
      mocks.createMCPClient.mockResolvedValue(testClient)

      const result = await pool.testConnection(makeServer())

      expect(result.ok).toBe(true)
      expect(result.toolCount).toBe(2)
      expect(result.error).toBeUndefined()
      expect(testClose).toHaveBeenCalled()

      // Connection should NOT be added to the pool
      expect(pool.getConnectionCount()).toBe(0)
    })

    it('returns error on connection failure', async () => {
      mocks.createMCPClient.mockRejectedValue(new Error('ECONNREFUSED'))

      const result = await pool.testConnection(makeServer())

      expect(result.ok).toBe(false)
      expect(result.toolCount).toBe(0)
      expect(result.error).toContain('ECONNREFUSED')
    })

    it('returns error for stdio server without command', async () => {
      const result = await pool.testConnection(
        makeServer({ command: undefined }),
      )

      expect(result.ok).toBe(false)
      expect(result.error).toContain('Missing required configuration')
    })

    it('returns error for http server without url', async () => {
      const result = await pool.testConnection(
        makeServer({ transportType: 'http', command: undefined, url: undefined }),
      )

      expect(result.ok).toBe(false)
      expect(result.error).toContain('Missing required configuration')
    })

    it('wraps command with sandbox for testConnection too', async () => {
      const mockHandle = {
        wrapWithSandbox: vi.fn().mockResolvedValue('test-wrapped'),
        cleanupAfterCommand: vi.fn(),
      }
      mocks.getHandleFn.mockResolvedValue(mockHandle)

      const testClient = {
        tools: vi.fn().mockResolvedValue({}),
        close: vi.fn().mockResolvedValue(undefined),
      }
      mocks.createMCPClient.mockResolvedValue(testClient)

      await pool.testConnection(makeServer(), makeSandboxOptions())

      expect(mocks.getHandleFn).toHaveBeenCalled()
      expect(mockHandle.wrapWithSandbox).toHaveBeenCalled()
    })
  })

  // ── Restricted Mode Behavior ──────────────────────────────

  describe('restricted mode', () => {
    it('does not sandbox-wrap stdio in restricted mode', async () => {
      mocks.mockToolsFn.mockResolvedValue({ tool: {} })

      const options = makeOptions({
        resolvedPermissions: {
          mode: 'restricted',
          config: makePermissionsConfig({ applyToMCP: true }),
        },
      })

      await pool.getTools(makeServer(), options)

      // Restricted mode should not trigger sandbox wrapping
      expect(mocks.getHandleFn).not.toHaveBeenCalled()
    })

    it('fingerprint changes when mode switches from restricted to sandbox', async () => {
      const close1 = vi.fn().mockResolvedValue(undefined)
      const client1 = { tools: vi.fn().mockResolvedValue({}), close: close1 }
      const client2 = { tools: vi.fn().mockResolvedValue({}), close: vi.fn() }
      mocks.createMCPClient
        .mockResolvedValueOnce(client1)
        .mockResolvedValueOnce(client2)

      const mockHandle = {
        wrapWithSandbox: vi.fn().mockResolvedValue('wrapped'),
        cleanupAfterCommand: vi.fn(),
      }
      mocks.getHandleFn.mockResolvedValue(mockHandle)

      const server = makeServer()

      // First call with restricted
      await pool.getTools(server, makeOptions({
        resolvedPermissions: {
          mode: 'restricted',
          config: makePermissionsConfig({ applyToMCP: true }),
        },
      }))

      // Second call with sandbox
      await pool.getTools(server, makeSandboxOptions())

      // Connection should be recreated (different mode in fingerprint)
      expect(mocks.createMCPClient).toHaveBeenCalledTimes(2)
      expect(close1).toHaveBeenCalled()
    })
  })

  // ── CWD Resolution ────────────────────────────────────────

  describe('effective cwd resolution', () => {
    it('uses server.cwd when provided', async () => {
      mocks.mockToolsFn.mockResolvedValue({})

      await pool.getTools(
        makeServer({ cwd: '/custom/cwd' }),
        makeOptions(),
      )

      expect(mocks.StdioTransport).toHaveBeenCalledWith(
        expect.objectContaining({ cwd: '/custom/cwd' }),
      )
    })

    it('falls back to workspaceDir when server.cwd is not set', async () => {
      mocks.mockToolsFn.mockResolvedValue({})

      await pool.getTools(
        makeServer({ cwd: undefined }),
        makeOptions({ workspaceDir: '/workspace/fallback' }),
      )

      expect(mocks.StdioTransport).toHaveBeenCalledWith(
        expect.objectContaining({ cwd: '/workspace/fallback' }),
      )
    })

    it('fingerprint changes when cwd changes', async () => {
      const close1 = vi.fn().mockResolvedValue(undefined)
      mocks.createMCPClient
        .mockResolvedValueOnce({ tools: vi.fn().mockResolvedValue({}), close: close1 })
        .mockResolvedValueOnce({ tools: vi.fn().mockResolvedValue({}), close: vi.fn() })

      const server = makeServer()

      await pool.getTools(server, makeOptions({ workspaceDir: '/cwd-1' }))
      await pool.getTools(server, makeOptions({ workspaceDir: '/cwd-2' }))

      // Different cwd → fingerprint mismatch → recreate
      expect(mocks.createMCPClient).toHaveBeenCalledTimes(2)
      expect(close1).toHaveBeenCalled()
    })
  })

  // ── Idle Scanner ──────────────────────────────────────────

  describe('idle scanner integration', () => {
    it('stopIdleScanner is idempotent', () => {
      pool.stopIdleScanner()
      pool.stopIdleScanner()
      // No error thrown
    })

    it('startIdleScanner replaces previous scanner', () => {
      pool.startIdleScanner(100, 100)
      pool.startIdleScanner(200, 200)
      pool.stopIdleScanner()
      // No error — previous timer was cleared
    })
  })
})
