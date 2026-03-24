import type { SpawnOptions } from 'node:child_process'

// ── Types ─────────────────────────────────────────────────

interface ShellCommandResult {
  /** Shell binary (cmd.exe on Windows, bash on Unix) */
  shell: string
  /** Shell arguments (['/c', command] or ['-c', command]) */
  args: string[]
  /** Additional spawn options to spread into spawn() call */
  spawnOptions: Pick<SpawnOptions, 'windowsVerbatimArguments'>
}

interface WinSpawnResult {
  /** The command to spawn */
  command: string
  /** The arguments array */
  args: string[]
}

// ── toShellCommand ────────────────────────────────────────

/**
 * Wrap a command string for execution in the platform's native shell.
 *
 * - Windows: cmd.exe /c <command> (with windowsVerbatimArguments to
 *   prevent Node.js from double-escaping shell metacharacters)
 * - Unix: bash -c <command>
 */
export function toShellCommand(command: string): ShellCommandResult {
  if (process.platform === 'win32') {
    return {
      shell: process.env.COMSPEC || 'cmd.exe',
      args: ['/c', command],
      spawnOptions: { windowsVerbatimArguments: true },
    }
  }
  return {
    shell: 'bash',
    args: ['-c', command],
    spawnOptions: {},
  }
}

// ── toWinSpawn ────────────────────────────────────────────

/**
 * Transform a command + args for Windows spawn compatibility.
 *
 * On Windows, commands like "npx", "npm", "corepack" are .cmd batch
 * scripts that cannot be spawned with `shell: false`. This wraps them
 * via `cmd.exe /c` so they resolve through the shell.
 *
 * On non-Windows platforms, returns the input unchanged.
 *
 * Designed for callers that cannot pass `shell: true` to spawn()
 * (e.g., @ai-sdk/mcp's StdioMCPTransport hardcodes shell: false).
 *
 * Note: does NOT set windowsVerbatimArguments — the args array
 * should be escaped normally by Node.js, unlike toShellCommand()
 * which receives a pre-built command string.
 */
export function toWinSpawn(command: string, args: string[]): WinSpawnResult {
  if (process.platform !== 'win32') {
    return { command, args }
  }

  // .exe files are real PE executables — they spawn fine without shell
  if (/\.exe$/i.test(command)) {
    return { command, args }
  }

  // Wrap through cmd.exe /c to handle .cmd/.bat scripts and PATH resolution
  return {
    command: process.env.COMSPEC || 'cmd.exe',
    args: ['/c', command, ...args],
  }
}

// ── normalizeCwd ──────────────────────────────────────────

/**
 * Normalize a working directory path for the current platform.
 *
 * On Windows, mixed path separators (e.g., C:\foo/bar) cause cmd.exe
 * startup errors in Electron's forked server process. This normalizes
 * forward slashes to backslashes.
 *
 * On non-Windows platforms, returns the input unchanged.
 */
export function normalizeCwd(cwd: string): string {
  if (process.platform !== 'win32') return cwd
  return cwd.replace(/\//g, '\\')
}
