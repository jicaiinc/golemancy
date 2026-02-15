// ── Types ──────────────────────────────────────────────────

export interface CommandBlacklistConfig {
  /** Simple command names to block entirely (e.g., 'sudo', 'su') */
  deniedCommands: string[]
  /** Additional regex patterns for dangerous command+arg combos */
  deniedPatterns?: string[]
}

// ── Custom Error ───────────────────────────────────────────

export class CommandBlockedError extends Error {
  public readonly command: string
  public readonly reason: string

  constructor(command: string, reason: string) {
    super(`Command blocked: ${reason}`)
    this.name = 'CommandBlockedError'
    this.command = command
    this.reason = reason
  }
}

// ── Builtin Dangerous Patterns ─────────────────────────────

/**
 * Pre-compiled regex patterns for dangerous commands.
 * These are always checked regardless of user configuration.
 */
const BUILTIN_DANGEROUS_PATTERNS: Array<{ regex: RegExp; description: string }> = [
  // Destructive filesystem operations
  { regex: /\brm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?(-[a-zA-Z]*r[a-zA-Z]*\s+)?\s*\/($|\s)/, description: 'rm on root filesystem' },
  { regex: /\brm\s+.*--no-preserve-root/, description: 'rm with --no-preserve-root' },

  // Disk-level destruction
  { regex: /\bmkfs\b/, description: 'filesystem format command' },
  { regex: /\bdd\b.*\bof\s*=\s*\/dev\//, description: 'dd writing to device' },

  // Fork bomb patterns
  { regex: /:\(\)\{.*\|.*\};:/, description: 'fork bomb' },

  // Privilege escalation
  { regex: /\bsudo\b/, description: 'sudo privilege escalation' },
  { regex: /\bsu\b\s+/, description: 'su user switch' },
  { regex: /\bdoas\b/, description: 'doas privilege escalation' },

  // macOS specific dangerous commands
  { regex: /\bosascript\b/, description: 'macOS AppleScript execution' },
  { regex: /\bsecurity\b\s+(delete-|remove-)/, description: 'macOS keychain modification' },

  // Chmod world-writable
  { regex: /\bchmod\b.*\b[0-7]*7[0-7]{2}\b.*\//, description: 'chmod world-writable on system path' },
  { regex: /\bchmod\b\s+-R\s+777\b/, description: 'recursive chmod 777' },

  // Network exfiltration indicators
  { regex: /\bcurl\b.*\|\s*\bbash\b/, description: 'curl pipe to bash' },
  { regex: /\bwget\b.*\|\s*\bsh\b/, description: 'wget pipe to shell' },

  // Crontab modification
  { regex: /\bcrontab\b\s+-r/, description: 'crontab removal' },

  // Shutdown / reboot
  { regex: /\bshutdown\b/, description: 'system shutdown' },
  { regex: /\breboot\b/, description: 'system reboot' },
  { regex: /\binit\s+[06]\b/, description: 'system init level change' },

  // Python -c with dangerous imports
  { regex: /\bpython[23]?\b.*-c\s+.*\bimport\s+(os|subprocess|shutil)\b/, description: 'python inline with dangerous imports' },
]

// ── Main Entry Point ───────────────────────────────────────

/**
 * Check a command against the blacklist. Throws CommandBlockedError if blocked.
 *
 * Tiers:
 * 1. Simple command name match (first token)
 * 2. Pipeline/subshell segment analysis
 * 3. Builtin dangerous patterns (always active)
 * 4. User-defined wildcard patterns
 */
export function checkCommandBlacklist(
  command: string,
  config: CommandBlacklistConfig,
): void {
  // Normalize: collapse whitespace, trim
  const normalized = command.trim().replace(/\s+/g, ' ')

  // Pre-compile denied command patterns (supports wildcards like "sudo *")
  const deniedPatterns = config.deniedCommands.map(cmd => ({
    pattern: cmd,
    regex: cmd.includes('*') ? patternToRegex(cmd) : null,
    simpleName: cmd.includes('*') ? null : cmd,
  }))

  // ── Tier 1: Command match against first token + full command ──
  const firstToken = extractCommandName(normalized)

  for (const { pattern, regex, simpleName } of deniedPatterns) {
    if (simpleName) {
      // Exact match for simple names (no wildcards)
      if (firstToken === simpleName || firstToken.endsWith('/' + simpleName)) {
        throw new CommandBlockedError(command, `Command '${simpleName}' is blocked`)
      }
    } else if (regex) {
      // Pattern match for wildcard entries (e.g., "sudo *", "dd if=* of=/dev/*")
      if (regex.test(normalized)) {
        throw new CommandBlockedError(command, `Matches blocked pattern: ${pattern}`)
      }
    }
  }

  // ── Tier 2: Check commands in pipelines and subshells ────
  const segments = splitCommandSegments(normalized)
  for (const segment of segments) {
    const segTrimmed = segment.trim()
    const segToken = extractCommandName(segTrimmed)
    for (const { pattern, regex, simpleName } of deniedPatterns) {
      if (simpleName) {
        if (segToken === simpleName || segToken.endsWith('/' + simpleName)) {
          throw new CommandBlockedError(command, `Command '${simpleName}' is blocked (in subcommand)`)
        }
      } else if (regex) {
        if (regex.test(segTrimmed)) {
          throw new CommandBlockedError(command, `Matches blocked pattern: ${pattern} (in subcommand)`)
        }
      }
    }
  }

  // ── Tier 3: Builtin dangerous patterns ───────────────────
  for (const { regex, description } of BUILTIN_DANGEROUS_PATTERNS) {
    if (regex.test(normalized)) {
      throw new CommandBlockedError(command, `Matches dangerous pattern: ${description}`)
    }
  }

  // ── Tier 4: User-defined patterns ────────────────────────
  if (config.deniedPatterns) {
    for (const pattern of config.deniedPatterns) {
      const userRegex = patternToRegex(pattern)
      if (userRegex.test(normalized)) {
        throw new CommandBlockedError(command, `Matches blacklist pattern: ${pattern}`)
      }
    }
  }
}

// ── Helper Functions ───────────────────────────────────────

/**
 * Extract the command name from a command string.
 * Handles: env vars prefix, absolute paths, common wrappers.
 *
 * "FOO=bar sudo rm -rf /" → "sudo" (skips env assignment)
 * "/usr/bin/rm -rf /"     → "/usr/bin/rm"
 * "command -v git"        → "git" (unwrap command/exec wrappers)
 */
export function extractCommandName(command: string): string {
  const tokens = command.split(/\s+/)

  for (const token of tokens) {
    // Skip environment variable assignments (VAR=value)
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) continue
    // Strip inline quotes to prevent bypass (su'do' → sudo, s"u"do → sudo)
    const unquoted = token.replace(/['"]/g, '')
    // Skip common wrappers (check both original and unquoted)
    if (['env', 'command', 'exec', 'nohup', 'nice', 'time'].includes(unquoted)) continue
    return unquoted
  }

  return tokens[0]?.replace(/['"]/g, '') ?? ''
}

/**
 * Split a compound command into individual segments.
 * Splits on: |, ;, &&, ||, $(...), `...`
 * Respects single/double quotes to avoid splitting inside strings.
 */
export function splitCommandSegments(command: string): string[] {
  const segments: string[] = []
  let current = ''
  let inSingleQuote = false
  let inDoubleQuote = false
  let i = 0

  while (i < command.length) {
    const ch = command[i]

    if (ch === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote
      current += ch
      i++
    } else if (ch === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote
      current += ch
      i++
    } else if (!inSingleQuote && !inDoubleQuote) {
      if (ch === '|' && command[i + 1] !== '|') {
        // Pipe
        segments.push(current)
        current = ''
        i++
      } else if (ch === ';') {
        // Semicolon
        segments.push(current)
        current = ''
        i++
      } else if (ch === '&' && command[i + 1] === '&') {
        // AND
        segments.push(current)
        current = ''
        i += 2
      } else if (ch === '|' && command[i + 1] === '|') {
        // OR
        segments.push(current)
        current = ''
        i += 2
      } else if (ch === '$' && command[i + 1] === '(') {
        // Subshell $() — extract inner command as a segment
        const end = command.indexOf(')', i + 2)
        if (end !== -1) {
          segments.push(command.slice(i + 2, end))
          current += command.slice(i, end + 1)
          i = end + 1
        } else {
          current += ch
          i++
        }
      } else if (ch === '`') {
        // Backtick subshell — extract inner command as a segment
        const end = command.indexOf('`', i + 1)
        if (end !== -1) {
          segments.push(command.slice(i + 1, end))
          current += command.slice(i, end + 1)
          i = end + 1
        } else {
          current += ch
          i++
        }
      } else {
        current += ch
        i++
      }
    } else {
      current += ch
      i++
    }
  }

  if (current.trim()) segments.push(current)
  return segments
}

/**
 * Convert a user-friendly wildcard pattern to a regex.
 * "sudo *"   → /\bsudo\s+.* /
 * "rm -rf /" → /\brm\s+-rf\s+\//
 */
export function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // Escape regex special chars (except *)
    .replace(/\*/g, '.*')                    // * → .*
    .replace(/\s+/g, '\\s+')                // Whitespace → flexible match

  return new RegExp('\\b' + escaped, 'i')
}
