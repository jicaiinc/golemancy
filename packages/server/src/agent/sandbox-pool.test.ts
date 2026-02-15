import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import type { ProjectId, SandboxConfig, ResolvedBashToolConfig } from '@golemancy/shared'

// ── Mocks ────────────────────────────────────────────────────

const mockSandboxManager = {
  checkDependencies: vi.fn().mockResolvedValue(undefined),
  initialize: vi.fn().mockResolvedValue(undefined),
  wrapWithSandbox: vi.fn().mockResolvedValue('wrapped-cmd'),
  cleanupAfterCommand: vi.fn().mockResolvedValue(undefined),
  reset: vi.fn().mockResolvedValue(undefined),
}

vi.mock('@anthropic-ai/sandbox-runtime', () => ({
  SandboxManager: mockSandboxManager,
}))

// Mock child_process.fork — returns a fake ChildProcess EventEmitter
function createMockChild() {
  const child = new EventEmitter() as EventEmitter & {
    send: ReturnType<typeof vi.fn>
    kill: ReturnType<typeof vi.fn>
    connected: boolean
  }
  child.send = vi.fn()
  child.kill = vi.fn()
  child.connected = true
  return child
}

let mockChildren: ReturnType<typeof createMockChild>[] = []

vi.mock('node:child_process', () => ({
  fork: vi.fn(() => {
    const child = createMockChild()
    mockChildren.push(child)
    return child
  }),
}))

import { LocalSandboxManagerHandle, WorkerSandboxManagerHandle, SandboxPool } from './sandbox-pool'

// ── Test Helpers ─────────────────────────────────────────────

const TEST_CONFIG: SandboxConfig = {
  filesystem: {
    allowWrite: ['/workspace'],
    denyRead: ['~/.ssh'],
    denyWrite: ['**/.git/hooks/**'],
    allowGitConfig: false,
  },
  network: {
    allowedDomains: ['github.com'],
  },
  enablePython: false,
  deniedCommands: ['sudo *'],
}

const GLOBAL_CONFIG: ResolvedBashToolConfig = {
  mode: 'sandbox',
  sandbox: TEST_CONFIG,
  usesDedicatedWorker: false,
}

const PROJECT_CONFIG: ResolvedBashToolConfig = {
  mode: 'sandbox',
  sandbox: TEST_CONFIG,
  usesDedicatedWorker: true,
}

const PROJECT_ID = 'proj-1' as ProjectId

// ── Tests ────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  mockChildren = []
})

afterEach(() => {
  vi.useRealTimers()
})

// ── LocalSandboxManagerHandle ────────────────────────────────

describe('LocalSandboxManagerHandle', () => {
  it('delegates wrapWithSandbox to underlying manager', async () => {
    const handle = new LocalSandboxManagerHandle(mockSandboxManager as any)
    const result = await handle.wrapWithSandbox('echo hello')
    expect(mockSandboxManager.wrapWithSandbox).toHaveBeenCalledWith(
      'echo hello', undefined, undefined, undefined,
    )
    expect(result).toBe('wrapped-cmd')
  })

  it('passes abortSignal to wrapWithSandbox', async () => {
    const handle = new LocalSandboxManagerHandle(mockSandboxManager as any)
    const ac = new AbortController()
    await handle.wrapWithSandbox('ls', ac.signal)
    expect(mockSandboxManager.wrapWithSandbox).toHaveBeenCalledWith(
      'ls', undefined, undefined, ac.signal,
    )
  })

  it('delegates cleanupAfterCommand to underlying manager', async () => {
    const handle = new LocalSandboxManagerHandle(mockSandboxManager as any)
    await handle.cleanupAfterCommand()
    expect(mockSandboxManager.cleanupAfterCommand).toHaveBeenCalled()
  })
})

// ── WorkerSandboxManagerHandle ──────────────────────────────

describe('WorkerSandboxManagerHandle', () => {
  function makeHandle(child?: ReturnType<typeof createMockChild>, onDestroy = vi.fn()) {
    const c = child ?? createMockChild()
    const handle = new WorkerSandboxManagerHandle(c as any, onDestroy)
    return { handle, child: c, onDestroy }
  }

  describe('wrapWithSandbox', () => {
    it('sends wrapCommand message to child', async () => {
      const { handle, child } = makeHandle()

      // Start the request — will be pending until we send response
      const promise = handle.wrapWithSandbox('echo hello')

      // Verify the child received the message
      expect(child.send).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'wrapCommand', command: 'echo hello' }),
      )

      // Simulate response from worker
      const sentMsg = child.send.mock.calls[0][0]
      child.emit('message', { type: 'wrappedCommand', id: sentMsg.id, result: 'sandbox echo hello' })

      await expect(promise).resolves.toBe('sandbox echo hello')
    })

    it('throws when handle is destroyed', async () => {
      const { handle } = makeHandle()
      handle.destroy()
      await expect(handle.wrapWithSandbox('test')).rejects.toThrow('Worker handle destroyed')
    })

    it('rejects on IPC timeout', async () => {
      const { handle } = makeHandle()
      const promise = handle.wrapWithSandbox('slow-cmd')

      // Advance timers past the IPC timeout (30s)
      vi.advanceTimersByTime(30_001)

      await expect(promise).rejects.toThrow('IPC wrapCommand timeout')
    })
  })

  describe('cleanupAfterCommand', () => {
    it('sends cleanupAfterCommand message to child', async () => {
      const { handle, child } = makeHandle()
      const promise = handle.cleanupAfterCommand()

      expect(child.send).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'cleanupAfterCommand' }),
      )

      const sentMsg = child.send.mock.calls[0][0]
      child.emit('message', { type: 'cleanupDone', id: sentMsg.id })

      await expect(promise).resolves.toBeUndefined()
    })

    it('throws when handle is destroyed', async () => {
      const { handle } = makeHandle()
      handle.destroy()
      await expect(handle.cleanupAfterCommand()).rejects.toThrow('Worker handle destroyed')
    })
  })

  describe('error handling', () => {
    it('rejects pending request on worker error message', async () => {
      const { handle, child } = makeHandle()
      const promise = handle.wrapWithSandbox('bad-cmd')

      const sentMsg = child.send.mock.calls[0][0]
      child.emit('message', { type: 'error', id: sentMsg.id, message: 'Command failed' })

      await expect(promise).rejects.toThrow('Command failed')
    })

    it('ignores messages with unknown request IDs', () => {
      const { child } = makeHandle()
      // Should not throw
      child.emit('message', { type: 'wrappedCommand', id: 'unknown-id', result: 'foo' })
      child.emit('message', { type: 'cleanupDone', id: 'unknown-id' })
      child.emit('message', { type: 'error', id: 'unknown-id', message: 'err' })
    })
  })

  describe('timeout escalation', () => {
    it('destroys worker after 3 consecutive timeouts', async () => {
      const onDestroy = vi.fn()
      const { handle, child } = makeHandle(undefined, onDestroy)

      // Trigger 3 timeouts
      for (let i = 0; i < 3; i++) {
        const promise = handle.wrapWithSandbox(`cmd-${i}`)
        vi.advanceTimersByTime(30_001)
        await promise.catch(() => {}) // Swallow timeout errors
      }

      // After 3 timeouts, worker should be destroyed
      expect(onDestroy).toHaveBeenCalled()
    })

    it('resets timeout counter on successful response', async () => {
      const onDestroy = vi.fn()
      const { handle, child } = makeHandle(undefined, onDestroy)

      // Timeout twice
      for (let i = 0; i < 2; i++) {
        const promise = handle.wrapWithSandbox(`cmd-${i}`)
        vi.advanceTimersByTime(30_001)
        await promise.catch(() => {})
      }

      // Successful response — resets counter
      const successPromise = handle.wrapWithSandbox('good-cmd')
      const sentMsg = child.send.mock.calls[child.send.mock.calls.length - 1][0]
      child.emit('message', { type: 'wrappedCommand', id: sentMsg.id, result: 'ok' })
      await successPromise

      // One more timeout should NOT destroy (counter was reset)
      const promise = handle.wrapWithSandbox('another-cmd')
      vi.advanceTimersByTime(30_001)
      await promise.catch(() => {})

      expect(onDestroy).not.toHaveBeenCalled()
    })
  })

  describe('destroy', () => {
    it('calls onDestroy callback', () => {
      const onDestroy = vi.fn()
      const { handle } = makeHandle(undefined, onDestroy)
      handle.destroy()
      expect(onDestroy).toHaveBeenCalledTimes(1)
    })

    it('sends shutdown message to child', () => {
      const { handle, child } = makeHandle()
      handle.destroy()
      expect(child.send).toHaveBeenCalledWith({ type: 'shutdown' })
    })

    it('rejects all pending requests', async () => {
      const { handle, child } = makeHandle()
      const p1 = handle.wrapWithSandbox('cmd-1')
      const p2 = handle.cleanupAfterCommand()

      handle.destroy()

      await expect(p1).rejects.toThrow('Worker destroyed')
      await expect(p2).rejects.toThrow('Worker destroyed')
    })

    it('is idempotent (second destroy is no-op)', () => {
      const onDestroy = vi.fn()
      const { handle } = makeHandle(undefined, onDestroy)
      handle.destroy()
      handle.destroy()
      expect(onDestroy).toHaveBeenCalledTimes(1)
    })

    it('force-kills child after grace period if still connected', () => {
      const { handle, child } = makeHandle()
      handle.destroy()

      // Advance past the 5s grace period
      vi.advanceTimersByTime(5_001)

      expect(child.kill).toHaveBeenCalledWith('SIGKILL')
    })

    it('does NOT force-kill if child disconnected', () => {
      const { handle, child } = makeHandle()
      child.connected = false
      handle.destroy()

      vi.advanceTimersByTime(5_001)

      expect(child.kill).not.toHaveBeenCalled()
    })
  })
})

// ── SandboxPool ─────────────────────────────────────────────

describe('SandboxPool', () => {
  describe('getHandle (global)', () => {
    it('returns a LocalSandboxManagerHandle for non-dedicated workers', async () => {
      const pool = new SandboxPool()
      const handle = await pool.getHandle(PROJECT_ID, GLOBAL_CONFIG)
      expect(handle).toBeInstanceOf(LocalSandboxManagerHandle)
    })

    it('initializes the global SandboxManager on first call', async () => {
      const pool = new SandboxPool()
      await pool.getHandle(PROJECT_ID, GLOBAL_CONFIG)
      expect(mockSandboxManager.initialize).toHaveBeenCalledWith(
        expect.objectContaining({
          network: {
            allowedDomains: TEST_CONFIG.network.allowedDomains,
            deniedDomains: [],
          },
          filesystem: expect.objectContaining({
            allowWrite: TEST_CONFIG.filesystem.allowWrite,
          }),
        }),
      )
    })

    it('reuses global manager on subsequent calls', async () => {
      const pool = new SandboxPool()
      await pool.getHandle(PROJECT_ID, GLOBAL_CONFIG)
      await pool.getHandle('proj-2' as ProjectId, GLOBAL_CONFIG)
      // initialize should be called only once
      expect(mockSandboxManager.initialize).toHaveBeenCalledTimes(1)
    })
  })

  describe('getHandle (dedicated worker)', () => {
    it('creates a worker via fork for dedicated configs', async () => {
      const { fork } = await import('node:child_process')
      const pool = new SandboxPool()

      // Start getHandle — this will fork a worker and wait for 'ready'
      const handlePromise = pool.getHandle(PROJECT_ID, PROJECT_CONFIG)

      // Simulate worker sending 'ready' message
      const child = mockChildren[0]
      child.emit('message', { type: 'ready' })

      const handle = await handlePromise
      expect(handle).toBeInstanceOf(WorkerSandboxManagerHandle)
      expect(fork).toHaveBeenCalled()
    })

    it('sends init config to worker', async () => {
      const pool = new SandboxPool()
      const handlePromise = pool.getHandle(PROJECT_ID, PROJECT_CONFIG)

      const child = mockChildren[0]
      child.emit('message', { type: 'ready' })

      await handlePromise

      expect(child.send).toHaveBeenCalledWith(expect.objectContaining({
        type: 'init',
        config: expect.objectContaining({
          filesystem: expect.objectContaining({
            allowWrite: TEST_CONFIG.filesystem.allowWrite,
          }),
        }),
      }))
    })

    it('reuses existing worker on subsequent calls', async () => {
      const { fork } = await import('node:child_process')
      const pool = new SandboxPool()

      const p1 = pool.getHandle(PROJECT_ID, PROJECT_CONFIG)
      mockChildren[0].emit('message', { type: 'ready' })
      await p1

      const handle2 = await pool.getHandle(PROJECT_ID, PROJECT_CONFIG)
      // fork should only be called once — handle is reused
      expect(fork).toHaveBeenCalledTimes(1)
    })

    it('rejects if worker sends initError', async () => {
      const pool = new SandboxPool()
      const handlePromise = pool.getHandle(PROJECT_ID, PROJECT_CONFIG)

      mockChildren[0].emit('message', { type: 'initError', message: 'module not found' })

      await expect(handlePromise).rejects.toThrow('Worker init failed: module not found')
    })

    it('rejects if worker exits during init', async () => {
      const pool = new SandboxPool()
      const handlePromise = pool.getHandle(PROJECT_ID, PROJECT_CONFIG)

      mockChildren[0].emit('exit', 1)

      await expect(handlePromise).rejects.toThrow('Worker exited during init with code 1')
    })

    it('rejects if worker init times out', async () => {
      const pool = new SandboxPool()
      const handlePromise = pool.getHandle(PROJECT_ID, PROJECT_CONFIG)

      // Advance past the IPC timeout (30s)
      vi.advanceTimersByTime(30_001)

      await expect(handlePromise).rejects.toThrow('Worker initialization timeout')
    })

    it('increments worker count', async () => {
      const pool = new SandboxPool()
      expect(pool.getWorkerCount()).toBe(0)

      const p1 = pool.getHandle(PROJECT_ID, PROJECT_CONFIG)
      mockChildren[0].emit('message', { type: 'ready' })
      await p1

      expect(pool.getWorkerCount()).toBe(1)
    })
  })

  describe('updateGlobalConfig', () => {
    it('resets existing global manager', async () => {
      const pool = new SandboxPool()
      // Initialize global manager
      await pool.getHandle(PROJECT_ID, GLOBAL_CONFIG)
      expect(mockSandboxManager.initialize).toHaveBeenCalledTimes(1)

      // Update config
      await pool.updateGlobalConfig(TEST_CONFIG)
      expect(mockSandboxManager.reset).toHaveBeenCalled()

      // Next getHandle should re-initialize
      await pool.getHandle(PROJECT_ID, GLOBAL_CONFIG)
      expect(mockSandboxManager.initialize).toHaveBeenCalledTimes(2)
    })

    it('is safe to call when no global manager exists', async () => {
      const pool = new SandboxPool()
      await expect(pool.updateGlobalConfig(TEST_CONFIG)).resolves.toBeUndefined()
    })
  })

  describe('removeProject', () => {
    it('destroys a project worker', async () => {
      const pool = new SandboxPool()
      const p1 = pool.getHandle(PROJECT_ID, PROJECT_CONFIG)
      mockChildren[0].emit('message', { type: 'ready' })
      await p1

      expect(pool.getWorkerCount()).toBe(1)
      await pool.removeProject(PROJECT_ID)
      expect(pool.getWorkerCount()).toBe(0)
    })

    it('is safe to call for non-existent project', async () => {
      const pool = new SandboxPool()
      await expect(pool.removeProject('nonexistent' as ProjectId)).resolves.toBeUndefined()
    })
  })

  describe('shutdown', () => {
    it('destroys all project workers', async () => {
      const pool = new SandboxPool()

      // Create two project workers
      const p1 = pool.getHandle(PROJECT_ID, PROJECT_CONFIG)
      mockChildren[0].emit('message', { type: 'ready' })
      await p1

      const p2 = pool.getHandle('proj-2' as ProjectId, PROJECT_CONFIG)
      mockChildren[1].emit('message', { type: 'ready' })
      await p2

      expect(pool.getWorkerCount()).toBe(2)

      await pool.shutdown()
      expect(pool.getWorkerCount()).toBe(0)
    })

    it('resets global manager', async () => {
      const pool = new SandboxPool()
      await pool.getHandle(PROJECT_ID, GLOBAL_CONFIG)

      await pool.shutdown()
      expect(mockSandboxManager.reset).toHaveBeenCalled()
    })

    it('is safe to call when empty', async () => {
      const pool = new SandboxPool()
      await expect(pool.shutdown()).resolves.toBeUndefined()
    })
  })

  describe('getWorkerCount', () => {
    it('returns 0 initially', () => {
      const pool = new SandboxPool()
      expect(pool.getWorkerCount()).toBe(0)
    })
  })
})
