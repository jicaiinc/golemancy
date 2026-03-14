import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { Sandbox, CommandResult } from 'bash-tool'
import type { SandboxConfig } from '@golemancy/shared'
import { validatePathAsync, type PathOperation } from './validate-path'
import { checkCommandBlacklist, CommandBlockedError, type CommandBlacklistConfig } from './check-command-blacklist'
import { getSafeEnv } from './safe-env'
import { logger } from '../logger'

const log = logger.child({ component: 'agent:guarded-sandbox' })

// ── Constants ───────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 120_000   // 120 seconds
const MAX_OUTPUT_BYTES = 1_048_576   // 1 MB
const KILL_GRACE_MS = 5_000          // Grace period before SIGKILL

// ── GuardedSandbox ──────────────────────────────────────────

interface GuardedSandboxOptions {
  config: SandboxConfig
  workspaceRoot: string
  timeoutMs?: number
  /** Runtime env vars (PATH override, pip/npm cache dirs) to inject into subprocess */
  runtimeEnv?: Record<string, string>
}

/**
 * Software-guarded Sandbox for platforms without OS-level sandbox support (e.g. Windows).
 * Enforces command blacklist + path validation in-process, then spawns commands
 * via the platform-native shell (cmd.exe on Windows, bash elsewhere).
 * Implements the bash-tool Sandbox interface.
 */
export class GuardedSandbox implements Sandbox {
  private readonly config: SandboxConfig
  private readonly workspaceRoot: string
  private readonly timeoutMs: number
  private readonly runtimeEnv: Record<string, string>

  constructor(options: GuardedSandboxOptions) {
    this.config = options.config
    this.workspaceRoot = options.workspaceRoot
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.runtimeEnv = options.runtimeEnv ?? {}
    const isWin = process.platform === 'win32'
    const shell = isWin ? (process.env.COMSPEC || 'cmd.exe') : 'bash'
    log.info(
      { workspaceRoot: this.workspaceRoot, shell, platform: process.platform, deniedCommands: this.config.deniedCommands.length },
      'GuardedSandbox initialized',
    )
  }

  // ── Sandbox Interface ─────────────────────────────────────

  async executeCommand(command: string): Promise<CommandResult> {
    try {
      this.checkBlacklist(command)
    } catch (err) {
      if (err instanceof CommandBlockedError) {
        log.warn({ command: command.slice(0, 100), reason: err.reason }, 'command blocked by blacklist')
      }
      throw err
    }
    log.debug({ command: command.slice(0, 200) }, 'executing command')
    const result = await this.spawnCommand(command)
    log.debug({ exitCode: result.exitCode, stdoutLen: result.stdout.length, stderrLen: result.stderr.length }, 'command completed')
    return result
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

  private spawnCommand(command: string): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const isWin = process.platform === 'win32'
      const shell = isWin ? (process.env.COMSPEC || 'cmd.exe') : 'bash'
      const args = isWin ? ['/c', command] : ['-c', command]
      const env = { ...getSafeEnv(), ...this.runtimeEnv }
      log.trace({ shell, cwd: this.workspaceRoot, hasPath: !!env.PATH, hasComspec: !!env.COMSPEC }, 'spawning child process')
      // Normalize cwd on Windows — mixed separators (e.g. C:\foo/bar) can cause
      // cmd.exe startup errors in Electron's forked server process
      const cwd = isWin ? this.workspaceRoot.replace(/\//g, '\\') : this.workspaceRoot
      const child = spawn(shell, args, {
        cwd,
        env,
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
          if (code !== 0) {
            log.info(
              { exitCode: code, cwd, shell, command: command.slice(0, 200), stderr: stderr.slice(0, 200) },
              'command exited with non-zero code',
            )
          }
          resolve({ stdout, stderr, exitCode: code ?? 1 })
        }
      })

      child.on('error', (err) => {
        clearTimeout(timer)
        log.error({ err: err.message, shell, cwd, command: command.slice(0, 100) }, 'child process spawn error')
        reject(err)
      })
    })
  }
}
