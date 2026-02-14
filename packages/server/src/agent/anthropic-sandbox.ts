import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { Sandbox, CommandResult } from 'bash-tool'
import type { SandboxConfig } from '@golemancy/shared'
import { validatePathAsync, type PathOperation } from './validate-path'
import { checkCommandBlacklist, type CommandBlacklistConfig } from './check-command-blacklist'
import { logger } from '../logger'

const log = logger.child({ component: 'agent:anthropic-sandbox' })

// ── SandboxManagerHandle ────────────────────────────────────

/**
 * Abstraction over SandboxManager — either local (in-process) or remote (IPC to worker).
 * AnthropicSandbox depends on this interface, not on the concrete SandboxManager.
 *
 * Two implementations (created in sandbox-pool.ts):
 * - LocalSandboxManagerHandle: calls SandboxManager directly
 * - WorkerSandboxManagerHandle: sends IPC messages to worker process
 */
export interface SandboxManagerHandle {
  wrapWithSandbox(command: string, abortSignal?: AbortSignal): Promise<string>
  cleanupAfterCommand(): Promise<void>
}

// ── Constants ───────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 120_000   // 120 seconds
const MAX_OUTPUT_BYTES = 1_048_576   // 1 MB
const KILL_GRACE_MS = 5_000          // Grace period before SIGKILL

/**
 * Safe environment variable allowlist for sandboxed processes.
 * Only these variables are passed to child processes in sandbox mode.
 */
const SAFE_ENV_KEYS = new Set([
  'HOME', 'USER', 'LOGNAME', 'SHELL', 'PATH',
  'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM', 'COLORTERM',
  'TZ', 'TMPDIR', 'XDG_RUNTIME_DIR',
  'NODE_ENV', 'NODE_OPTIONS',
])

function getSafeEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const key of SAFE_ENV_KEYS) {
    if (process.env[key]) env[key] = process.env[key]!
  }
  return env
}

// ── AnthropicSandbox ────────────────────────────────────────

export interface AnthropicSandboxOptions {
  config: SandboxConfig
  workspaceRoot: string
  sandboxManager: SandboxManagerHandle
  timeoutMs?: number
}

/**
 * Sandbox implementation using @anthropic-ai/sandbox-runtime for OS-level isolation.
 * Implements the bash-tool Sandbox interface.
 *
 * executeCommand flow:
 *   1. Check deniedCommands blacklist (app-layer, NOT sandbox-runtime native)
 *   2. Wrap command via SandboxManager.wrapWithSandbox()
 *   3. Spawn wrapped command as child process
 *   4. Collect stdout/stderr with size limits
 *   5. cleanupAfterCommand() in finally block (mandatory)
 *
 * readFile/writeFiles flow:
 *   1. Validate path against filesystem rules (denyRead/denyWrite/allowWrite)
 *   2. Perform Node.js fs operation
 */
export class AnthropicSandbox implements Sandbox {
  private readonly config: SandboxConfig
  private readonly workspaceRoot: string
  private readonly sandboxManager: SandboxManagerHandle
  private readonly timeoutMs: number

  constructor(options: AnthropicSandboxOptions) {
    this.config = options.config
    this.workspaceRoot = options.workspaceRoot
    this.sandboxManager = options.sandboxManager
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  // ── Sandbox Interface ─────────────────────────────────────

  async executeCommand(command: string): Promise<CommandResult> {
    // Step 1: Check command blacklist (app-layer security)
    this.checkBlacklist(command)

    // Step 2: Wrap command with sandbox isolation
    const wrappedCommand = await this.sandboxManager.wrapWithSandbox(command)

    try {
      // Step 3-5: Execute and collect output
      return await this.spawnCommand(wrappedCommand)
    } finally {
      // Step 6: Always clean up (mandatory per sandbox-runtime docs)
      try {
        await this.sandboxManager.cleanupAfterCommand()
      } catch (err) {
        log.warn({ err }, 'cleanupAfterCommand failed (non-fatal)')
      }
    }
  }

  async readFile(filePath: string): Promise<string> {
    const validated = await this.validatePath(filePath, 'read')
    return fs.readFile(validated, 'utf-8')
  }

  async writeFiles(files: Array<{ path: string; content: string | Buffer }>): Promise<void> {
    for (const file of files) {
      const validated = await this.validatePath(file.path, 'write')
      await fs.mkdir(path.dirname(validated), { recursive: true })
      await fs.writeFile(validated, file.content)
    }
  }

  // ── Internal ──────────────────────────────────────────────

  private checkBlacklist(command: string): void {
    const blacklistConfig: CommandBlacklistConfig = {
      deniedCommands: this.config.deniedCommands,
    }
    checkCommandBlacklist(command, blacklistConfig)
  }

  private async validatePath(inputPath: string, operation: PathOperation): Promise<string> {
    return validatePathAsync({
      inputPath,
      workspaceRoot: this.workspaceRoot,
      config: this.config.filesystem,
      operation,
    })
  }

  private spawnCommand(wrappedCommand: string): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const child = spawn('bash', ['-c', wrappedCommand], {
        cwd: this.workspaceRoot,
        env: getSafeEnv(),
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      let stdout = ''
      let stderr = ''
      let stdoutBytes = 0
      let stderrBytes = 0

      child.stdout?.on('data', (chunk: Buffer) => {
        if (stdoutBytes <= MAX_OUTPUT_BYTES) {
          stdoutBytes += chunk.length
          stdout += chunk.toString()
          if (stdoutBytes > MAX_OUTPUT_BYTES) {
            stdout = stdout.slice(0, MAX_OUTPUT_BYTES) + '\n[output truncated at 1MB]'
          }
        }
      })

      child.stderr?.on('data', (chunk: Buffer) => {
        if (stderrBytes <= MAX_OUTPUT_BYTES) {
          stderrBytes += chunk.length
          stderr += chunk.toString()
          if (stderrBytes > MAX_OUTPUT_BYTES) {
            stderr = stderr.slice(0, MAX_OUTPUT_BYTES) + '\n[output truncated at 1MB]'
          }
        }
      })

      const timer = setTimeout(() => {
        child.kill('SIGTERM')
        setTimeout(() => {
          if (!child.killed) child.kill('SIGKILL')
        }, KILL_GRACE_MS)
      }, this.timeoutMs)

      child.on('close', (code, signal) => {
        clearTimeout(timer)
        if (signal === 'SIGTERM' || signal === 'SIGKILL') {
          resolve({
            stdout,
            stderr: stderr + `\n[command timed out after ${this.timeoutMs / 1000}s]`,
            exitCode: 124,
          })
        } else {
          resolve({ stdout, stderr, exitCode: code ?? 1 })
        }
      })

      child.on('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })
    })
  }
}
