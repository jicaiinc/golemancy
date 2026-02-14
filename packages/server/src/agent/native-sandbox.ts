import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { Sandbox, CommandResult } from 'bash-tool'

// ── Constants ───────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 120_000   // 120 seconds
const MAX_OUTPUT_BYTES = 1_048_576   // 1 MB
const KILL_GRACE_MS = 5_000          // Grace period before SIGKILL

// ── NativeSandbox ───────────────────────────────────────────

export interface NativeSandboxOptions {
  workspaceRoot: string
  timeoutMs?: number
}

/**
 * No-isolation Sandbox implementation for Unrestricted mode.
 * Executes commands directly via bash without any sandboxing or path validation.
 * Implements the bash-tool Sandbox interface.
 */
export class NativeSandbox implements Sandbox {
  private readonly workspaceRoot: string
  private readonly timeoutMs: number

  constructor(options: NativeSandboxOptions) {
    this.workspaceRoot = options.workspaceRoot
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  // ── Sandbox Interface ─────────────────────────────────────

  async executeCommand(command: string): Promise<CommandResult> {
    return this.spawnCommand(command)
  }

  async readFile(filePath: string): Promise<string> {
    const absolute = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(this.workspaceRoot, filePath)
    return fs.readFile(absolute, 'utf-8')
  }

  async writeFiles(files: Array<{ path: string; content: string | Buffer }>): Promise<void> {
    for (const file of files) {
      const absolute = path.isAbsolute(file.path)
        ? file.path
        : path.resolve(this.workspaceRoot, file.path)
      await fs.mkdir(path.dirname(absolute), { recursive: true })
      await fs.writeFile(absolute, file.content)
    }
  }

  // ── Internal ──────────────────────────────────────────────

  private spawnCommand(command: string): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const child = spawn('bash', ['-c', command], {
        cwd: this.workspaceRoot,
        env: process.env,
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
