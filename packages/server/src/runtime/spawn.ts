import { existsSync } from 'node:fs'
import path from 'node:path'
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
 * On Windows, Node.js `spawn()` with `shell: false` uses CreateProcessW
 * which only resolves `.exe` and `.com` files. Commands that are actually
 * `.cmd`/`.bat` batch scripts (like `npx`, `npm`) fail with ENOENT.
 *
 * This function resolves the command against PATH + PATHEXT to determine
 * whether the first matching file is a `.cmd`/`.bat` script. If so, it
 * wraps via `cmd.exe /c`. Otherwise, returns unchanged.
 *
 * On non-Windows platforms, returns the input unchanged.
 *
 * @param command  The command to spawn (e.g., "npx", "node", "/path/to/bin")
 * @param args     The arguments array
 * @param pathEnv  Optional PATH override (e.g., from server.env).
 *                 Falls back to process.env.PATH.
 * @param cwd      Optional working directory for resolving relative commands
 *                 (e.g., ./bin/tool). Falls back to server process cwd.
 */
export function toWinSpawn(command: string, args: string[], pathEnv?: string, cwd?: string): WinSpawnResult {
  if (process.platform !== 'win32') {
    return { command, args }
  }

  if (resolveWindowsCommand(command, pathEnv, cwd) !== 'cmd-wrap') {
    return { command, args }
  }

  // For path-based commands, resolve to absolute and normalize separators.
  // cmd.exe can't handle forward-slash relative paths (./bin/tool fails,
  // .\bin\tool or absolute path works).
  let cmdCommand = command
  if (command.includes('/') || command.includes('\\')) {
    cmdCommand = path.isAbsolute(command) ? command : path.resolve(cwd || '', command)
    cmdCommand = cmdCommand.replace(/\//g, '\\')
  }

  return {
    command: process.env.COMSPEC || 'cmd.exe',
    args: ['/c', cmdCommand, ...args],
  }
}

/**
 * Determine whether a command needs cmd.exe wrapping on Windows.
 *
 * Simulates the Windows shell resolution order (PATH directories × PATHEXT
 * extensions) to find the first matching file. If it's a `.cmd`/`.bat`
 * script, returns 'cmd-wrap'; otherwise 'direct'.
 *
 * Uses synchronous fs checks — acceptable because this only runs at
 * MCP server startup (infrequent, one-time cost per server).
 *
 * @param cwd  Working directory for resolving relative paths.
 * @internal Exported for testing only.
 */
export function resolveWindowsCommand(command: string, pathEnv?: string, cwd?: string): 'direct' | 'cmd-wrap' {
  const ext = path.extname(command).toLowerCase()

  // ── 1. Explicit extension — judge directly ──────────────
  if (ext) {
    return (ext === '.cmd' || ext === '.bat') ? 'cmd-wrap' : 'direct'
  }

  // ── 2. Path with separators — check specific location ───
  if (path.isAbsolute(command) || command.includes('\\') || command.includes('/')) {
    // Resolve relative paths against the transport cwd, not the server process cwd
    const resolved = path.isAbsolute(command) ? command : path.resolve(cwd || '', command)
    return resolveAtPath(resolved)
  }

  // ── 3. Bare command — resolve on PATH using PATHEXT ─────
  const pathDirs = (pathEnv ?? process.env.PATH ?? '').split(path.delimiter)
  const pathExtList = (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD')
    .split(';')
    .filter(Boolean)

  for (const dir of pathDirs) {
    if (!dir) continue
    for (const pext of pathExtList) {
      if (existsSync(path.join(dir, command + pext))) {
        const lowerExt = pext.toLowerCase()
        return (lowerExt === '.cmd' || lowerExt === '.bat') ? 'cmd-wrap' : 'direct'
      }
    }
  }

  // Not found anywhere — wrap as fallback (will fail either way,
  // but cmd.exe gives a better error message than raw ENOENT)
  return 'cmd-wrap'
}

/** Check a specific path (with separators) for .exe/.com vs .cmd/.bat variants. */
function resolveAtPath(command: string): 'direct' | 'cmd-wrap' {
  // Try spawn-resolvable extensions first
  if (existsSync(command + '.exe') || existsSync(command + '.com')) return 'direct'
  if (existsSync(command + '.cmd') || existsSync(command + '.bat')) return 'cmd-wrap'
  // File might exist as-is (extensionless binary) — let spawn try
  if (existsSync(command)) return 'direct'
  return 'cmd-wrap'
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
