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

import { WorkerSandboxManagerHandle, SandboxPool } from './sandbox-pool'

// ── Test Constants ──────────────────────────────────────────

const CONFIG_A: SandboxConfig = {
  filesystem: {
    allowWrite: ['/workspace'],
    denyRead: ['~/.ssh'],
    denyWrite: [],
    allowGitConfig: false,
  },
  network: { allowedDomains: ['github.com'] },
  enablePython: false,
  deniedCommands: ['sudo'],
}

const CONFIG_B: SandboxConfig = {
  filesystem: {
    allowWrite: ['/workspace', '/tmp/**'],
    denyRead: ['~/.ssh', '**/.env'],
    denyWrite: [],
    allowGitConfig: true,
  },
  network: { allowedDomains: ['github.com', 'npm.io'] },
  enablePython: true,
  deniedCommands: ['sudo', 'rm'],
}

const PROJECT_ID = 'proj-1' as ProjectId
const PROJECT_ID_2 = 'proj-2' as ProjectId

function makeDedicatedConfig(sandbox: SandboxConfig): ResolvedBashToolConfig {
  return { mode: 'sandbox', sandbox, usesDedicatedWorker: true }
}

// ── Tests ───────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  mockChildren = []
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Sandbox integration — hot-reload and crash recovery', () => {
  // ── Config Change → Hot Reload ──────────────────────────

  describe('config change triggers reinitialize', () => {
    it('sends reinitialize IPC when config changes', async () => {
      const pool = new SandboxPool()

      // Create initial worker
      const p1 = pool.getHandle(PROJECT_ID, makeDedicatedConfig(CONFIG_A))
      mockChildren[0].emit('message', { type: 'ready' })
      await p1

      // Second call with different config — should trigger reinitialize
      const p2 = pool.getHandle(PROJECT_ID, makeDedicatedConfig(CONFIG_B))

      // Worker should receive reinitialize message
      const calls = mockChildren[0].send.mock.calls
      const reinitMsg = calls.find((c: any) => c[0]?.type === 'reinitialize')
      expect(reinitMsg).toBeTruthy()
      expect(reinitMsg![0].config).toBeDefined()

      // Simulate reinitialize success
      mockChildren[0].emit('message', { type: 'reinitialized', id: reinitMsg![0].id })

      const handle = await p2
      expect(handle).toBeDefined()
      // No new fork — reused existing worker
      expect(mockChildren.length).toBe(1)
    })

    it('same config does NOT trigger reinitialize', async () => {
      const pool = new SandboxPool()

      const p1 = pool.getHandle(PROJECT_ID, makeDedicatedConfig(CONFIG_A))
      mockChildren[0].emit('message', { type: 'ready' })
      await p1

      // Second call with same config
      const handle2 = await pool.getHandle(PROJECT_ID, makeDedicatedConfig(CONFIG_A))

      // Only init message sent, no reinitialize
      const calls = mockChildren[0].send.mock.calls
      const reinitMsgs = calls.filter((c: any) => c[0]?.type === 'reinitialize')
      expect(reinitMsgs.length).toBe(0)
      expect(handle2).toBeDefined()
    })
  })

  // ── Failed Hot Reload → Destroy + Recreate ────────────────

  describe('failed hot-reload destroys and recreates worker', () => {
    it('creates new worker when reinitialize fails', async () => {
      const pool = new SandboxPool()

      // Create initial worker
      const p1 = pool.getHandle(PROJECT_ID, makeDedicatedConfig(CONFIG_A))
      mockChildren[0].emit('message', { type: 'ready' })
      await p1
      expect(pool.getWorkerCount()).toBe(1)

      // Second call with different config
      const p2 = pool.getHandle(PROJECT_ID, makeDedicatedConfig(CONFIG_B))

      // Simulate reinitialize failure (error response)
      const calls = mockChildren[0].send.mock.calls
      const reinitMsg = calls.find((c: any) => c[0]?.type === 'reinitialize')
      mockChildren[0].emit('message', { type: 'error', id: reinitMsg![0].id, message: 'reinit failed' })

      // The pool should fork a new worker (second child)
      // Wait a tick for the error handler to process
      await vi.advanceTimersByTimeAsync(0)

      // If a second child was created, emit 'ready'
      if (mockChildren.length > 1) {
        mockChildren[1].emit('message', { type: 'ready' })
      }

      const handle = await p2
      expect(handle).toBeDefined()
    })
  })

  // ── Worker Crash → Lazy Re-create ────────────────────────

  describe('worker crash recovery', () => {
    it('removes crashed worker from pool and re-creates on next use', async () => {
      const pool = new SandboxPool()

      // Create worker
      const p1 = pool.getHandle(PROJECT_ID, makeDedicatedConfig(CONFIG_A))
      mockChildren[0].emit('message', { type: 'ready' })
      await p1
      expect(pool.getWorkerCount()).toBe(1)

      // Simulate unexpected worker crash
      mockChildren[0].emit('exit', 1)

      // Worker should be removed from pool
      expect(pool.getWorkerCount()).toBe(0)

      // Next getHandle should fork a new worker
      const p2 = pool.getHandle(PROJECT_ID, makeDedicatedConfig(CONFIG_A))
      expect(mockChildren.length).toBe(2)

      mockChildren[1].emit('message', { type: 'ready' })
      const handle = await p2
      expect(handle).toBeDefined()
      expect(pool.getWorkerCount()).toBe(1)
    })

    it('crash does not affect other project workers', async () => {
      const pool = new SandboxPool()

      // Create two project workers
      const p1 = pool.getHandle(PROJECT_ID, makeDedicatedConfig(CONFIG_A))
      mockChildren[0].emit('message', { type: 'ready' })
      await p1

      const p2 = pool.getHandle(PROJECT_ID_2, makeDedicatedConfig(CONFIG_A))
      mockChildren[1].emit('message', { type: 'ready' })
      await p2

      expect(pool.getWorkerCount()).toBe(2)

      // Crash proj-1 worker
      mockChildren[0].emit('exit', 1)

      // proj-2 should still be active
      expect(pool.getWorkerCount()).toBe(1)
    })
  })

  // ── Concurrent IPC Commands ────────────────────────────────

  describe('concurrent IPC commands', () => {
    it('handles multiple pending wrapWithSandbox calls', async () => {
      const child = createMockChild()
      const onDestroy = vi.fn()
      const handle = new WorkerSandboxManagerHandle(child as any, onDestroy)

      // Fire 3 concurrent commands
      const p1 = handle.wrapWithSandbox('cmd-1')
      const p2 = handle.wrapWithSandbox('cmd-2')
      const p3 = handle.wrapWithSandbox('cmd-3')

      expect(child.send).toHaveBeenCalledTimes(3)

      // Resolve out of order
      const msg2 = child.send.mock.calls[1][0]
      const msg1 = child.send.mock.calls[0][0]
      const msg3 = child.send.mock.calls[2][0]

      child.emit('message', { type: 'wrappedCommand', id: msg2.id, result: 'result-2' })
      child.emit('message', { type: 'wrappedCommand', id: msg3.id, result: 'result-3' })
      child.emit('message', { type: 'wrappedCommand', id: msg1.id, result: 'result-1' })

      expect(await p1).toBe('result-1')
      expect(await p2).toBe('result-2')
      expect(await p3).toBe('result-3')
    })

    it('handles interleaved wrapWithSandbox and cleanupAfterCommand', async () => {
      const child = createMockChild()
      const handle = new WorkerSandboxManagerHandle(child as any, vi.fn())

      const pWrap = handle.wrapWithSandbox('echo hello')
      const pCleanup = handle.cleanupAfterCommand()

      expect(child.send).toHaveBeenCalledTimes(2)

      const wrapMsg = child.send.mock.calls[0][0]
      const cleanupMsg = child.send.mock.calls[1][0]

      // Cleanup resolves first
      child.emit('message', { type: 'cleanupDone', id: cleanupMsg.id })
      await expect(pCleanup).resolves.toBeUndefined()

      // Then wrap resolves
      child.emit('message', { type: 'wrappedCommand', id: wrapMsg.id, result: 'wrapped' })
      await expect(pWrap).resolves.toBe('wrapped')
    })
  })

  // ── Reinitialize IPC ──────────────────────────────────────

  describe('WorkerSandboxManagerHandle.reinitialize', () => {
    it('sends reinitialize message with config', async () => {
      const child = createMockChild()
      const handle = new WorkerSandboxManagerHandle(child as any, vi.fn())

      const runtimeConfig = { filesystem: { allowWrite: ['/tmp'] } }
      const p = handle.reinitialize(runtimeConfig)

      expect(child.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'reinitialize',
          config: runtimeConfig,
        }),
      )

      const sentMsg = child.send.mock.calls[0][0]
      child.emit('message', { type: 'reinitialized', id: sentMsg.id })

      await expect(p).resolves.toBeUndefined()
    })

    it('rejects on reinitialize timeout', async () => {
      const child = createMockChild()
      const handle = new WorkerSandboxManagerHandle(child as any, vi.fn())

      const p = handle.reinitialize({ filesystem: {} })
      vi.advanceTimersByTime(30_001)

      await expect(p).rejects.toThrow('IPC reinitialize timeout')
    })

    it('rejects when handle is destroyed', async () => {
      const child = createMockChild()
      const handle = new WorkerSandboxManagerHandle(child as any, vi.fn())
      handle.destroy()

      await expect(handle.reinitialize({})).rejects.toThrow('Worker handle destroyed')
    })
  })

  // ── Multi-project Isolation ────────────────────────────────

  describe('multi-project worker isolation', () => {
    it('maintains separate workers for different projects', async () => {
      const pool = new SandboxPool()

      const p1 = pool.getHandle(PROJECT_ID, makeDedicatedConfig(CONFIG_A))
      mockChildren[0].emit('message', { type: 'ready' })
      await p1

      const p2 = pool.getHandle(PROJECT_ID_2, makeDedicatedConfig(CONFIG_B))
      mockChildren[1].emit('message', { type: 'ready' })
      await p2

      expect(pool.getWorkerCount()).toBe(2)
      expect(mockChildren.length).toBe(2)

      // Removing one project doesn't affect the other
      await pool.removeProject(PROJECT_ID)
      expect(pool.getWorkerCount()).toBe(1)
    })

    it('config change on one project does not affect another', async () => {
      const pool = new SandboxPool()

      // Create workers for both projects with CONFIG_A
      const p1 = pool.getHandle(PROJECT_ID, makeDedicatedConfig(CONFIG_A))
      mockChildren[0].emit('message', { type: 'ready' })
      await p1

      const p2 = pool.getHandle(PROJECT_ID_2, makeDedicatedConfig(CONFIG_A))
      mockChildren[1].emit('message', { type: 'ready' })
      await p2

      // Change config for proj-1 only
      const p3 = pool.getHandle(PROJECT_ID, makeDedicatedConfig(CONFIG_B))

      // proj-1 worker should receive reinitialize
      const proj1Calls = mockChildren[0].send.mock.calls
      const reinitMsg = proj1Calls.find((c: any) => c[0]?.type === 'reinitialize')
      expect(reinitMsg).toBeTruthy()

      // proj-2 worker should NOT receive reinitialize
      const proj2Calls = mockChildren[1].send.mock.calls
      const proj2Reinit = proj2Calls.filter((c: any) => c[0]?.type === 'reinitialize')
      expect(proj2Reinit.length).toBe(0)

      // Resolve reinitialize
      mockChildren[0].emit('message', { type: 'reinitialized', id: reinitMsg![0].id })
      await p3
    })
  })
})
