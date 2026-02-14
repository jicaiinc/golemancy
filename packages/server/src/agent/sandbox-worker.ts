/**
 * Sandbox Worker — Child process entry point for per-project SandboxManager instances.
 *
 * Spawned by SandboxPool via child_process.fork().
 * Each worker process has its own SandboxManager (module-level const, one per process).
 *
 * IPC protocol:
 *   Main → Worker: init, wrapCommand, cleanupAfterCommand, shutdown
 *   Worker → Main: ready, wrappedCommand, cleanupDone, error, initError
 *
 * @see architecture.md Section 4.4, Section 6
 */

import type { SandboxWorkerRequest, SandboxWorkerResponse } from '@golemancy/shared'

// ── SandboxManager Type (dynamic import) ───────────────────

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

let manager: SandboxManagerAPI | null = null

// ── IPC Helpers ────────────────────────────────────────────

function send(msg: SandboxWorkerResponse): void {
  process.send!(msg)
}

// ── Message Handler ────────────────────────────────────────

process.on('message', async (msg: SandboxWorkerRequest) => {
  switch (msg.type) {
    case 'init': {
      try {
        // Dynamic import — package resolved at runtime only
        const moduleName = '@anthropic-ai/sandbox-runtime'
        const mod = (await import(moduleName)) as { SandboxManager: SandboxManagerAPI }
        manager = mod.SandboxManager

        // Linux: verify bwrap, socat, ripgrep are installed
        if (process.platform === 'linux') {
          await manager.checkDependencies()
        }

        await manager.initialize(msg.config)
        send({ type: 'ready' })
      } catch (err) {
        send({
          type: 'initError',
          message: err instanceof Error ? err.message : String(err),
        })
      }
      break
    }

    case 'wrapCommand': {
      if (!manager) {
        send({ type: 'error', id: msg.id, message: 'SandboxManager not initialized' })
        break
      }
      try {
        const result = await manager.wrapWithSandbox(msg.command)
        send({ type: 'wrappedCommand', id: msg.id, result })
      } catch (err) {
        send({
          type: 'error',
          id: msg.id,
          message: err instanceof Error ? err.message : String(err),
        })
      }
      break
    }

    case 'cleanupAfterCommand': {
      if (!manager) {
        send({ type: 'error', id: msg.id, message: 'SandboxManager not initialized' })
        break
      }
      try {
        await manager.cleanupAfterCommand()
        send({ type: 'cleanupDone', id: msg.id })
      } catch (err) {
        send({
          type: 'error',
          id: msg.id,
          message: err instanceof Error ? err.message : String(err),
        })
      }
      break
    }

    case 'shutdown': {
      await cleanup()
      break
    }
  }
})

// ── Graceful Shutdown ──────────────────────────────────────

async function cleanup(): Promise<void> {
  if (manager) {
    try {
      await manager.reset()
    } catch {
      // Best-effort cleanup
    }
    manager = null
  }
  process.exit(0)
}

process.on('disconnect', () => void cleanup())
process.on('SIGTERM', () => void cleanup())
