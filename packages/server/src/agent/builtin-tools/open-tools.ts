import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import nodePath from 'node:path'
import fs from 'node:fs/promises'
import { logger } from '../../logger'

const log = logger.child({ component: 'agent:open-tools' })

// ── IPC Bridge ────────────────────────────────────────────

interface PendingRequest {
  resolve: (error: string) => void
  timer: ReturnType<typeof setTimeout>
}

const pendingRequests = new Map<string, PendingRequest>()
const IPC_TIMEOUT_MS = 10_000

/** IPC send function, set by initOpenToolsIPC(). null when IPC is unavailable. */
let ipcSend: ((msg: unknown) => void) | null = null

/**
 * Initialize the IPC bridge for the open file tool.
 * Called by the server on startup when running as an Electron child process.
 * Registers a message listener for `open-path-result` responses from Electron main.
 */
export function initOpenToolsIPC(): void {
  if (!process.send) return
  ipcSend = process.send.bind(process)
  process.on('message', (msg: unknown) => {
    const m = msg as { type?: string; requestId?: string; error?: string }
    if (m?.type === 'open-path-result' && m.requestId) {
      const pending = pendingRequests.get(m.requestId)
      if (pending) {
        clearTimeout(pending.timer)
        pendingRequests.delete(m.requestId)
        pending.resolve(m.error || '')
      }
    }
  })
}

// ── Path Opening ──────────────────────────────────────────

/**
 * Open a file via IPC to Electron main process (shell.openPath).
 * Falls back to native platform commands when IPC is unavailable (standalone dev).
 */
export async function openPath(filePath: string): Promise<string> {
  const resolved = nodePath.resolve(filePath)

  // Check file exists before attempting to open (better error message)
  try {
    await fs.access(resolved)
  } catch {
    return `File not found: ${resolved}`
  }

  if (ipcSend) {
    return openPathViaIPC(resolved)
  }
  return openPathNative(resolved)
}

function openPathViaIPC(filePath: string): Promise<string> {
  return new Promise((resolve) => {
    const requestId = randomUUID()

    const timer = setTimeout(() => {
      pendingRequests.delete(requestId)
      resolve('Request timed out — host process did not respond')
    }, IPC_TIMEOUT_MS)

    pendingRequests.set(requestId, { resolve, timer })
    ipcSend!({ type: 'open-path', path: filePath, requestId })
  })
}

/** Fallback for standalone mode (no Electron parent). */
export function openPathNative(filePath: string): Promise<string> {
  return new Promise((resolve) => {
    const [cmd, args]: [string, string[]] =
      process.platform === 'darwin'
        ? ['open', [filePath]]
        : process.platform === 'win32'
          ? ['cmd', ['/c', 'start', '""', filePath]]
          : ['xdg-open', [filePath]]

    const child = spawn(cmd, args, { stdio: 'ignore' })
    child.on('error', (err) => resolve(err.message))
    child.on('close', (code) => resolve(code === 0 ? '' : `Exit code ${code}`))
  })
}

// ── Tool Creation ─────────────────────────────────────────

export interface OpenToolsContext {
  workspaceRoot: string
}

export function createOpenTools(ctx: OpenToolsContext): ToolSet {
  const { workspaceRoot } = ctx

  return {
    OpenFile: tool({
      description:
        'Open a file with the system\'s default application (e.g., browser for HTML, image viewer for PNG). ' +
        'Use this instead of shell commands like `open`, `xdg-open`, or `start`. ' +
        'Accepts absolute paths or paths relative to the workspace.',
      inputSchema: z.object({
        path: z.string().describe('File path to open (absolute or relative to workspace)'),
      }),
      execute: async ({ path: filePath }) => {
        log.debug({ filePath, workspaceRoot }, 'OpenFile tool called')

        const absolute = nodePath.isAbsolute(filePath)
          ? filePath
          : nodePath.resolve(workspaceRoot, filePath)

        const error = await openPath(absolute)
        if (error) {
          log.warn({ filePath: absolute, error }, 'OpenFile failed')
          return { success: false, error }
        }

        log.info({ filePath: absolute }, 'OpenFile succeeded')
        return { success: true, path: absolute }
      },
    }),
  }
}

// ── Instructions ──────────────────────────────────────────

export function buildOpenInstructions(): string {
  return [
    '## File Opening',
    '',
    'You have an `OpenFile` tool to open files with the system\'s default application.',
    'Always use `OpenFile` instead of shell commands like `open` (macOS), `xdg-open` (Linux), or `start` (Windows).',
    'Shell open commands do not work in sandboxed environments.',
  ].join('\n')
}
