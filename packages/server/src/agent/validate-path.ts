import path from 'node:path'
import { homedir } from 'node:os'
import fs from 'node:fs/promises'
import { minimatch } from 'minimatch'
import type { FilesystemConfig } from '@golemancy/shared'

// ── Types ──────────────────────────────────────────────────

export type PathOperation = 'read' | 'write'

export interface ValidatePathOptions {
  /** The raw path from user/AI input */
  inputPath: string
  /** Absolute path to project workspace root */
  workspaceRoot: string
  /** Filesystem permission config */
  config: FilesystemConfig
  /** read or write operation */
  operation: PathOperation
}

// ── Mandatory Deny Paths ───────────────────────────────────

/**
 * Mandatory Deny Paths — enforced by Sandbox Runtime at OS level.
 * These are ALWAYS blocked regardless of user config and cannot be overridden.
 * Listed here for defense in depth — we check them too, not just rely on OS sandbox.
 */
const MANDATORY_DENY_WRITE: string[] = [
  // Shell configuration (prevents persistent backdoor via shell startup)
  '**/.bashrc',
  '**/.bash_profile',
  '**/.zshrc',
  '**/.zprofile',
  '**/.profile',
  // Git hooks (prevents code execution on git operations)
  '**/.git/hooks/**',
  '**/.git/config',      // unless allowGitConfig: true
  // Sensitive project files
  '**/.gitmodules',
  '**/.ripgreprc',
  '**/.mcp.json',
  // IDE configurations
  '**/.vscode/**',
  '**/.idea/**',
  // Claude Code configuration
  '**/.claude/**',
]

// ── Constants ──────────────────────────────────────────────

const MAX_PATH_LENGTH = 1024

// ── Custom Error ───────────────────────────────────────────

export class PathAccessError extends Error {
  public readonly path: string
  public readonly reason: string

  constructor(path: string, reason: string) {
    super(`Access denied: ${path} — ${reason}`)
    this.name = 'PathAccessError'
    this.path = path
    this.reason = reason
  }
}

// ── Synchronous Path Validation ────────────────────────────

/**
 * Validates and resolves a path against security rules.
 * Returns the resolved absolute path if allowed, throws PathAccessError if denied.
 *
 * Steps execute in security-critical order:
 * 1. Reject null bytes and excessive length
 * 2. Expand tilde (~) → absolute home dir path
 * 3. Resolve to absolute path (relative to workspaceRoot)
 * 4. Normalize (collapse ., .., redundant separators)
 * 5. Post-normalization traversal check (..)
 * 6. Check Mandatory Deny Paths (write only, OS sandbox mirror)
 * 7. Check user-configured denyRead / denyWrite
 * 8. Check allowWrite whitelist (write only)
 * 9. Return validated absolute path
 */
export function validatePath(options: ValidatePathOptions): string {
  const { inputPath, workspaceRoot, config, operation } = options

  // ── Step 0: Reject null bytes and long paths ─────────────
  if (inputPath.includes('\0')) {
    throw new PathAccessError(inputPath, 'Path contains null byte')
  }
  if (inputPath.length > MAX_PATH_LENGTH) {
    throw new PathAccessError(inputPath, 'Path exceeds maximum length')
  }

  // ── Step 1: Expand tilde ─────────────────────────────────
  let expanded = inputPath
  if (expanded === '~') {
    expanded = homedir()
  } else if (expanded.startsWith('~/')) {
    expanded = path.join(homedir(), expanded.slice(2))
  }
  // Guard against "~otheruser" expansion — block it entirely
  if (expanded.startsWith('~')) {
    throw new PathAccessError(inputPath, 'Tilde paths for other users are not allowed')
  }

  // ── Step 2: Resolve to absolute path ─────────────────────
  const absolute = path.isAbsolute(expanded)
    ? expanded
    : path.resolve(workspaceRoot, expanded)

  // ── Step 3: Normalize ────────────────────────────────────
  const normalized = path.normalize(absolute)

  // ── Step 4: Post-normalization traversal check ───────────
  // Check the raw input for ".." to catch intentional traversal attempts.
  // Exception: resolved path is still within workspace.
  if (inputPath.includes('..')) {
    if (!normalized.startsWith(workspaceRoot + path.sep) && normalized !== workspaceRoot) {
      throw new PathAccessError(inputPath, 'Path traversal detected (..)')
    }
  }

  // ── Step 5: Check Mandatory Deny Paths (OS-level mirror) ─
  if (operation === 'write') {
    const mandatoryDeny = config.allowGitConfig
      ? MANDATORY_DENY_WRITE.filter(p => p !== '**/.git/config')
      : MANDATORY_DENY_WRITE
    const mandatoryMatch = findMatchingPattern(normalized, mandatoryDeny)
    if (mandatoryMatch) {
      throw new PathAccessError(inputPath, `Blocked by mandatory deny (OS sandbox): ${mandatoryMatch}`)
    }
  }

  // ── Step 6: Check deny lists (user-configured) ───────────
  if (operation === 'read') {
    const denyMatch = findMatchingPattern(normalized, config.denyRead)
    if (denyMatch) {
      throw new PathAccessError(inputPath, `Matches denyRead pattern: ${denyMatch}`)
    }
  }

  if (operation === 'write') {
    const denyMatch = findMatchingPattern(normalized, config.denyWrite)
    if (denyMatch) {
      throw new PathAccessError(inputPath, `Matches denyWrite pattern: ${denyMatch}`)
    }
  }

  // ── Step 7: Check allowWrite whitelist (write only) ──────
  if (operation === 'write') {
    const allowed = config.allowWrite.some(pattern =>
      matchesExpandedPattern(normalized, pattern)
    )
    if (!allowed) {
      throw new PathAccessError(inputPath, 'Not in allowWrite whitelist')
    }
  }

  // ── Step 8: Return validated path ────────────────────────
  return normalized
}

// ── Async Variant with Symlink Resolution ──────────────────

/**
 * Async variant that also resolves symlinks to defend against symlink attacks.
 * Runs synchronous checks first (fast-fail), then resolves real path.
 *
 * NOTE: There is an inherent TOCTOU (time-of-check-time-of-use) gap between
 * realpath() resolution and actual file access by the subprocess. A malicious
 * process could swap a symlink target between validation and use. This is a
 * known limitation of userspace path validation — the OS-level sandbox
 * (sandbox-exec on macOS, bubblewrap on Linux) is the authoritative boundary
 * that enforces filesystem permissions at the kernel level, closing this gap.
 */
export async function validatePathAsync(options: ValidatePathOptions): Promise<string> {
  // Run synchronous checks first (fast-fail)
  const normalized = validatePath(options)

  // Resolve symlinks to get the real filesystem path
  try {
    const realPath = await fs.realpath(normalized)

    // Re-run deny checks on the resolved real path
    // This catches symlinks pointing to denied locations
    if (realPath !== normalized) {
      validatePath({
        ...options,
        inputPath: realPath,
      })
    }

    return realPath
  } catch (e) {
    // File doesn't exist yet (write operation) — validate parent dir
    if (isNodeError(e) && e.code === 'ENOENT' && options.operation === 'write') {
      const parentDir = path.dirname(normalized)
      try {
        const realParent = await fs.realpath(parentDir)
        // Verify parent is also in allowed territory
        validatePath({
          ...options,
          inputPath: realParent,
        })
      } catch {
        // Parent doesn't exist either — will be created by mkdir -p
        // The synchronous validation already confirmed it's in allowWrite
      }
      return normalized
    }
    throw e
  }
}

// ── Pattern Matching ───────────────────────────────────────

/**
 * Expand a config pattern: tilde → home dir.
 */
function expandPattern(pattern: string): string {
  if (pattern === '~') return homedir()
  if (pattern.startsWith('~/')) return path.join(homedir(), pattern.slice(2))
  return pattern
}

/**
 * Match a normalized absolute path against an expanded pattern.
 *
 * Supported pattern formats:
 *   ~/.ssh        → /Users/alice/.ssh (tilde expansion + prefix match)
 *   /etc/passwd   → exact prefix match
 *   ** /.env      → glob match (any .env file at any depth)
 *   ** /secrets/** → glob match (anything under any secrets/ directory)
 */
function matchesExpandedPattern(
  normalizedPath: string,
  pattern: string,
): boolean {
  const expanded = expandPattern(pattern)
  const nocase = isCaseInsensitiveFS()

  // If the pattern is an absolute path without globs, use prefix matching
  if (path.isAbsolute(expanded) && !expanded.includes('*')) {
    if (nocase) {
      const lower = normalizedPath.toLowerCase()
      const expandedLower = expanded.toLowerCase()
      return lower.startsWith(expandedLower + path.sep) || lower === expandedLower
    }
    return normalizedPath.startsWith(expanded + path.sep) || normalizedPath === expanded
  }

  // For glob patterns, use minimatch with dot:true to match dotfiles
  return minimatch(normalizedPath, expanded, {
    dot: true,
    nocase,
    matchBase: !expanded.includes('/'),
  })
}

/**
 * Find the first pattern in the list that matches the normalized path.
 * Returns the original pattern string if matched, null otherwise.
 */
function findMatchingPattern(normalizedPath: string, patterns: string[]): string | null {
  for (const pattern of patterns) {
    if (matchesExpandedPattern(normalizedPath, pattern)) {
      return pattern
    }
  }
  return null
}

// ── Helpers ────────────────────────────────────────────────

function isCaseInsensitiveFS(): boolean {
  // macOS HFS+/APFS (default) is case-insensitive
  // Linux ext4 is case-sensitive
  return process.platform === 'darwin'
}

function isNodeError(e: unknown): e is NodeJS.ErrnoException {
  return e instanceof Error && 'code' in e
}
