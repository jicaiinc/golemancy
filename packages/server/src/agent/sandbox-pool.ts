import { fork, type ChildProcess } from 'node:child_process'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  ProjectId,
  SandboxConfig,
  ResolvedBashToolConfig,
  SandboxWorkerRequest,
  SandboxWorkerResponse,
} from '@golemancy/shared'
import type { SandboxManagerHandle } from './anthropic-sandbox'
import { logger } from '../logger'

const log = logger.child({ component: 'agent:sandbox-pool' })

const IPC_TIMEOUT_MS = 30_000
const MAX_CONSECUTIVE_TIMEOUTS = 3
const WORKER_KILL_GRACE_MS = 5_000

// ── Ripgrep Resolution ──────────────────────────────────────
// @anthropic-ai/sandbox-runtime requires ripgrep (rg) for initialize().
// On macOS, rg is only needed to pass the dependency check (not used at runtime).
// On Linux, rg is used to expand glob patterns for bubblewrap.

function resolveRipgrepPath(): string | null {
  // 1. Try bundled @vscode/ripgrep (ships prebuilt rg binary per platform)
  try {
    const require = createRequire(import.meta.url)
    const { rgPath } = require('@vscode/ripgrep') as { rgPath: string }
    if (rgPath) return rgPath
  } catch { /* not installed */ }

  // 2. Try system rg in PATH
  const result = spawnSync('which', ['rg'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 1_000,
  })
  if (result.status === 0 && result.stdout?.trim()) {
    return result.stdout.trim()
  }

  return null
}

/** Resolved once at module load. null = not available. */
const resolvedRgPath = resolveRipgrepPath()

// ── SandboxManager Type Declaration ────────────────────────
// @anthropic-ai/sandbox-runtime is dynamically imported at runtime.
// We define the subset of the API we use.

interface SandboxManagerAPI {
  checkDependencies(): unknown
  initialize(config: Record<string, unknown>): Promise<void>
  wrapWithSandbox(
    command: string,
    binShell?: string,
    customConfig?: unknown,
    abortSignal?: AbortSignal,
  ): Promise<string>
  cleanupAfterCommand(): void
  reset(): Promise<void>
}

// ── LocalSandboxManagerHandle ──────────────────────────────

/**
 * In-process SandboxManagerHandle — wraps the global SandboxManager directly.
 * Used for projects that inherit the global sandbox config (no dedicated worker).
 */
export class LocalSandboxManagerHandle implements SandboxManagerHandle {
  constructor(private readonly manager: SandboxManagerAPI) {}

  async wrapWithSandbox(command: string, abortSignal?: AbortSignal): Promise<string> {
    return this.manager.wrapWithSandbox(command, undefined, undefined, abortSignal)
  }

  async cleanupAfterCommand(): Promise<void> {
    return this.manager.cleanupAfterCommand()
  }
}

// ── WorkerSandboxManagerHandle ─────────────────────────────

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
}

/**
 * IPC-proxy SandboxManagerHandle — sends messages to a worker process
 * and correlates responses via UUID-based request IDs.
 *
 * Error recovery: 3 consecutive IPC timeouts → destroy worker.
 * Worker crash → SandboxPool detects via 'exit' event, lazy re-create.
 */
export class WorkerSandboxManagerHandle implements SandboxManagerHandle {
  private readonly pendingRequests = new Map<string, PendingRequest>()
  private consecutiveTimeouts = 0
  private destroyed = false

  constructor(
    private readonly child: ChildProcess,
    private readonly onDestroy: () => void,
  ) {
    child.on('message', (msg: SandboxWorkerResponse) => {
      this.handleMessage(msg)
    })
  }

  async wrapWithSandbox(command: string): Promise<string> {
    if (this.destroyed) throw new Error('Worker handle destroyed')

    const id = randomUUID()
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id)
        this.handleTimeout()
        reject(new Error(`IPC wrapCommand timeout after ${IPC_TIMEOUT_MS}ms`))
      }, IPC_TIMEOUT_MS)

      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      })
      this.child.send({ type: 'wrapCommand', id, command } satisfies SandboxWorkerRequest)
    })
  }

  async cleanupAfterCommand(): Promise<void> {
    if (this.destroyed) throw new Error('Worker handle destroyed')

    const id = randomUUID()
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id)
        this.handleTimeout()
        reject(new Error(`IPC cleanupAfterCommand timeout after ${IPC_TIMEOUT_MS}ms`))
      }, IPC_TIMEOUT_MS)

      this.pendingRequests.set(id, {
        resolve: () => resolve(),
        reject,
        timer,
      })
      this.child.send({ type: 'cleanupAfterCommand', id } satisfies SandboxWorkerRequest)
    })
  }

  async reinitialize(runtimeConfig: Record<string, unknown>): Promise<void> {
    if (this.destroyed) throw new Error('Worker handle destroyed')

    const id = randomUUID()
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id)
        this.handleTimeout()
        reject(new Error(`IPC reinitialize timeout after ${IPC_TIMEOUT_MS}ms`))
      }, IPC_TIMEOUT_MS)

      this.pendingRequests.set(id, {
        resolve: () => resolve(),
        reject,
        timer,
      })
      this.child.send({ type: 'reinitialize', id, config: runtimeConfig } satisfies SandboxWorkerRequest)
    })
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true

    // Reject all pending requests
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timer)
      pending.reject(new Error('Worker destroyed'))
    }
    this.pendingRequests.clear()

    // Send graceful shutdown, force kill after grace period
    try {
      this.child.send({ type: 'shutdown' } satisfies SandboxWorkerRequest)
    } catch {
      // Child may already be disconnected
    }

    setTimeout(() => {
      if (this.child.connected) {
        this.child.kill('SIGKILL')
      }
    }, WORKER_KILL_GRACE_MS)

    this.onDestroy()
  }

  // ── Internal ──────────────────────────────────────────────

  private handleMessage(msg: SandboxWorkerResponse): void {
    switch (msg.type) {
      case 'wrappedCommand': {
        const pending = this.pendingRequests.get(msg.id)
        if (pending) {
          clearTimeout(pending.timer)
          this.pendingRequests.delete(msg.id)
          this.consecutiveTimeouts = 0
          pending.resolve(msg.result)
        }
        break
      }

      case 'reinitialized': {
        const pending = this.pendingRequests.get(msg.id)
        if (pending) {
          clearTimeout(pending.timer)
          this.pendingRequests.delete(msg.id)
          this.consecutiveTimeouts = 0
          pending.resolve(undefined)
        }
        break
      }

      case 'cleanupDone': {
        const pending = this.pendingRequests.get(msg.id)
        if (pending) {
          clearTimeout(pending.timer)
          this.pendingRequests.delete(msg.id)
          this.consecutiveTimeouts = 0
          pending.resolve(undefined)
        }
        break
      }

      case 'error': {
        const pending = this.pendingRequests.get(msg.id)
        if (pending) {
          clearTimeout(pending.timer)
          this.pendingRequests.delete(msg.id)
          pending.reject(new Error(msg.message))
        }
        break
      }
    }
  }

  private handleTimeout(): void {
    this.consecutiveTimeouts++
    if (this.consecutiveTimeouts >= MAX_CONSECUTIVE_TIMEOUTS) {
      log.error(
        { count: this.consecutiveTimeouts },
        'Worker exceeded max consecutive timeouts, destroying',
      )
      this.destroy()
    }
  }
}

// ── WorkerState ────────────────────────────────────────────

interface WorkerState {
  child: ChildProcess
  handle: WorkerSandboxManagerHandle
  config: SandboxConfig
}

// ── SandboxPool ────────────────────────────────────────────

/**
 * Manages SandboxManager instances across the server:
 *
 * - **Global manager** (in-process): Shared by all projects that inherit global config.
 *   Uses LocalSandboxManagerHandle for direct calls.
 *
 * - **Per-project workers** (child processes): Each project with custom sandbox config
 *   gets a dedicated worker process with its own SandboxManager.
 *   Uses WorkerSandboxManagerHandle for IPC-proxied calls.
 *
 * Workers are lazily created on first `getHandle()` call and reused across conversations.
 * Worker crashes are detected via 'exit' events; lazy re-creation on next `getHandle()`.
 */
export class SandboxPool {
  private globalManager: SandboxManagerAPI | null = null
  private globalConfig: SandboxConfig | null = null
  private readonly projectWorkers = new Map<ProjectId, WorkerState>()

  // ── Public API ────────────────────────────────────────────

  /**
   * Get a SandboxManagerHandle for a project.
   * Returns either the shared global handle or a per-project worker handle.
   * Workers are lazily created on first call.
   */
  async getHandle(
    projectId: ProjectId,
    config: ResolvedBashToolConfig,
  ): Promise<SandboxManagerHandle> {
    if (!config.usesDedicatedWorker) {
      return this.getGlobalHandle(config.sandbox)
    }

    const existing = this.projectWorkers.get(projectId)
    if (existing) {
      // Hot-reload if config changed
      if (!sandboxConfigEquals(existing.config, config.sandbox)) {
        log.info({ projectId }, 'sandbox config changed, hot-reloading worker')
        try {
          await existing.handle.reinitialize(sandboxConfigToRuntimeConfig(config.sandbox))
          existing.config = config.sandbox
        } catch (err) {
          log.warn({ err, projectId }, 'hot-reload failed, destroying and recreating worker')
          existing.handle.destroy()
          return this.createWorker(projectId, config.sandbox)
        }
      }
      return existing.handle
    }

    return this.createWorker(projectId, config.sandbox)
  }

  /**
   * Called when global settings change.
   * Resets the global SandboxManager so it will be re-initialized with new config.
   */
  async updateGlobalConfig(config: SandboxConfig): Promise<void> {
    this.globalConfig = config
    if (this.globalManager) {
      await this.globalManager.reset()
      this.globalManager = null
    }
  }

  /**
   * Remove a project's worker (project deleted, mode changed, or config changed).
   * Gracefully shuts down the worker process.
   */
  async removeProject(projectId: ProjectId): Promise<void> {
    const state = this.projectWorkers.get(projectId)
    if (state) {
      state.handle.destroy()
      // destroy() calls onDestroy which removes from map
    }
  }

  /**
   * Graceful shutdown of all workers and the global manager.
   * Called on server shutdown (SIGTERM).
   */
  async shutdown(): Promise<void> {
    const projectIds = [...this.projectWorkers.keys()]
    await Promise.allSettled(projectIds.map(id => this.removeProject(id)))

    if (this.globalManager) {
      await this.globalManager.reset()
      this.globalManager = null
    }
  }

  /** Number of active per-project worker processes. */
  getWorkerCount(): number {
    return this.projectWorkers.size
  }

  // ── Internal ──────────────────────────────────────────────

  private async getGlobalHandle(config: SandboxConfig): Promise<SandboxManagerHandle> {
    if (!this.globalManager) {
      await this.initGlobalManager(config)
    }
    return new LocalSandboxManagerHandle(this.globalManager!)
  }

  private async initGlobalManager(config: SandboxConfig): Promise<void> {
    // Dynamic import — package resolved at runtime only
    const moduleName = '@anthropic-ai/sandbox-runtime'
    const mod = (await import(moduleName)) as { SandboxManager: SandboxManagerAPI }
    this.globalManager = mod.SandboxManager
    this.globalConfig = config

    // initialize() internally calls checkDependencies() which requires ripgrep.
    // We pass the resolved rg path (bundled or system) via the ripgrep config field.
    await this.globalManager.initialize(sandboxConfigToRuntimeConfig(config))
  }

  private async createWorker(
    projectId: ProjectId,
    config: SandboxConfig,
  ): Promise<SandboxManagerHandle> {
    const workerPath = path.join(import.meta.dirname, 'sandbox-worker.js')
    const child = fork(workerPath, { serialization: 'json' })

    // Wait for worker to initialize
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        child.kill('SIGKILL')
        reject(new Error('Worker initialization timeout'))
      }, IPC_TIMEOUT_MS)

      const onMessage = (msg: SandboxWorkerResponse) => {
        if (msg.type === 'ready') {
          clearTimeout(timeout)
          child.off('message', onMessage)
          child.off('exit', onExit)
          resolve()
        } else if (msg.type === 'initError') {
          clearTimeout(timeout)
          child.off('message', onMessage)
          child.off('exit', onExit)
          child.kill('SIGKILL')
          reject(new Error(`Worker init failed: ${msg.message}`))
        }
      }

      const onExit = (code: number | null) => {
        clearTimeout(timeout)
        child.off('message', onMessage)
        reject(new Error(`Worker exited during init with code ${code}`))
      }

      child.on('message', onMessage)
      child.on('exit', onExit)

      // Send init config
      child.send({
        type: 'init',
        config: sandboxConfigToRuntimeConfig(config),
      } satisfies SandboxWorkerRequest)
    })

    const handle = new WorkerSandboxManagerHandle(child, () => {
      this.projectWorkers.delete(projectId)
    })

    // Crash recovery: detect unexpected worker exit
    child.on('exit', (code) => {
      if (this.projectWorkers.has(projectId)) {
        log.warn(
          { projectId, code },
          'Sandbox worker exited unexpectedly — will re-create on next use',
        )
        handle.destroy()
        // destroy() calls onDestroy which removes from map
      }
    })

    this.projectWorkers.set(projectId, { child, handle, config })

    log.debug(
      { projectId, workerCount: this.projectWorkers.size },
      'Created sandbox worker for project',
    )

    return handle
  }
}

// ── Config Comparison ──────────────────────────────────────

function sandboxConfigEquals(a: SandboxConfig, b: SandboxConfig): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

// ── Config Mapping ─────────────────────────────────────────

/**
 * Map our application-level SandboxConfig to the format expected by
 * @anthropic-ai/sandbox-runtime SandboxManager.initialize().
 *
 * SandboxRuntimeConfig shape:
 *   network:    { allowedDomains, deniedDomains, ... }
 *   filesystem: { allowWrite, denyRead, denyWrite, allowGitConfig? }
 *   ripgrep?:   { command, args? }
 */
function sandboxConfigToRuntimeConfig(config: SandboxConfig): Record<string, unknown> {
  // Ripgrep resolution:
  //   1. resolvedRgPath from bundled @vscode/ripgrep or system PATH → use it
  //   2. macOS: rg not used at runtime, but initialize() checks for it → placeholder
  //   3. Linux: rg is required → omit field, let initialize() throw a clear error
  const ripgrep = resolvedRgPath
    ? { command: resolvedRgPath }
    : process.platform === 'darwin'
      ? { command: '/usr/bin/true' }  // macOS doesn't use rg at runtime
      : undefined

  return {
    network: {
      ...(config.network.allowedDomains !== undefined && {
        allowedDomains: config.network.allowedDomains,
      }),
      deniedDomains: [],
    },
    filesystem: {
      allowWrite: config.filesystem.allowWrite,
      denyRead: config.filesystem.denyRead,
      denyWrite: config.filesystem.denyWrite,
      allowGitConfig: config.filesystem.allowGitConfig,
    },
    ...(ripgrep && { ripgrep }),
  }
}

// ── Module-Level Singleton ─────────────────────────────────

/** Global SandboxPool instance — one per server process. */
export const sandboxPool = new SandboxPool()
