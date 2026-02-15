import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { Sandbox, CommandResult } from 'bash-tool'
import type { SandboxConfig } from '@golemancy/shared'
import { validatePathAsync, type PathOperation } from './validate-path'
import { checkCommandBlacklist, type CommandBlacklistConfig } from './check-command-blacklist'
import { logger } from '../logger'

const log = logger.child({ component: 'agent:anthropic-sandbox' })

/** Escape a string for safe use inside single-quoted shell argument */
function shellEscape(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'"
}

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
  /** Runtime env vars (PATH override, pip/npm cache dirs) to inject into subprocess */
  runtimeEnv?: Record<string, string>
}

/**
 * Sandbox implementation using @anthropic-ai/sandbox-runtime for OS-level isolation.
 * Implements the bash-tool Sandbox interface.
 *
 * ALL operations go through sandbox-exec (Seatbelt) for consistent OS-level enforcement:
 *
 * executeCommand: checkBlacklist → wrapWithSandbox → spawn → cleanup
 * readFile:       validatePath (defense-in-depth) → wrapWithSandbox(cat) → spawn → cleanup
 * writeFiles:     validatePath (defense-in-depth) → stage to /tmp → wrapWithSandbox(cp) → spawn → cleanup
 */
export class AnthropicSandbox implements Sandbox {
  private readonly config: SandboxConfig
  private readonly workspaceRoot: string
  private readonly sandboxManager: SandboxManagerHandle
  private readonly timeoutMs: number
  private readonly runtimeEnv: Record<string, string>

  constructor(options: AnthropicSandboxOptions) {
    this.config = options.config
    this.workspaceRoot = options.workspaceRoot
    this.sandboxManager = options.sandboxManager
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.runtimeEnv = options.runtimeEnv ?? {}
  }

  // ── Sandbox Interface ─────────────────────────────────────

  async executeCommand(command: string): Promise<CommandResult> {
    this.checkBlacklist(command)
    return this.executeWrapped(command)
  }

  async readFile(filePath: string): Promise<string> {
    // Defense-in-depth: fast-fail on invalid paths before spawning a sandbox process
    const validated = await this.validatePath(filePath, 'read')

    // Route through sandbox — OS-level enforcement of read permissions
    const result = await this.executeWrapped(`cat ${shellEscape(validated)}`)
    if (result.exitCode !== 0) {
      throw new Error(`Failed to read ${filePath}: ${result.stderr.trim()}`)
    }
    return result.stdout
  }

  async writeFiles(files: Array<{ path: string; content: string | Buffer }>): Promise<void> {
    for (const file of files) {
      // Defense-in-depth: fast-fail on invalid paths before spawning a sandbox process
      const validated = await this.validatePath(file.path, 'write')

      // Stage content in temp file (server process, outside sandbox)
      const tmpFile = path.join(
        os.tmpdir(),
        `golemancy-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      )
      await fs.writeFile(tmpFile, file.content)

      try {
        // Route through sandbox — OS-level enforcement of write permissions
        const result = await this.executeWrapped(
          `mkdir -p ${shellEscape(path.dirname(validated))} && cp ${shellEscape(tmpFile)} ${shellEscape(validated)}`,
        )
        if (result.exitCode !== 0) {
          throw new Error(`Failed to write ${file.path}: ${result.stderr.trim()}`)
        }
      } finally {
        await fs.unlink(tmpFile).catch(() => {})
      }
    }
  }

  // ── Internal ──────────────────────────────────────────────

  /**
   * Wrap a command with sandbox-exec and execute it.
   * Used by all three Sandbox interface methods to ensure consistent OS-level enforcement.
   * Unlike executeCommand(), this skips the user-facing deniedCommands blacklist
   * (internal commands like cat/cp should never be blocked by user config).
   */
  private async executeWrapped(command: string): Promise<CommandResult> {
    const wrappedCommand = await this.sandboxManager.wrapWithSandbox(command)
    try {
      return await this.spawnCommand(wrappedCommand)
    } finally {
      try {
        await this.sandboxManager.cleanupAfterCommand()
      } catch (err) {
        log.warn({ err }, 'cleanupAfterCommand failed (non-fatal)')
      }
    }
  }

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
        env: { ...getSafeEnv(), ...this.runtimeEnv },
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
