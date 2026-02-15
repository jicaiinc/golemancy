import type { PermissionsConfigId, Timestamped } from './common'

// ── Permission Mode ────────────────────────────────────────────

/**
 * Three execution modes for agent commands:
 * - restricted: Virtual sandbox (just-bash), no real system commands
 * - sandbox: OS-level isolation via Anthropic Sandbox Runtime (default)
 * - unrestricted: No sandbox, full system access (dangerous)
 */
export type PermissionMode = 'restricted' | 'sandbox' | 'unrestricted'

// ── Permissions Config ─────────────────────────────────────────

/**
 * Unified permissions configuration for both Bash Tool and MCP.
 * Flat structure replaces the old SandboxConfig / FilesystemConfig / NetworkConfig split.
 */
export interface PermissionsConfig {
  /**
   * Directories where write operations are allowed (glob patterns).
   * Supports template variable: {{workspaceDir}} (replaced at resolution time).
   * Default: ['{{workspaceDir}}']
   */
  allowWrite: string[]

  /**
   * Paths/patterns where read operations are denied (glob patterns).
   * Default: sensitive paths (SSH keys, credentials, etc.)
   */
  denyRead: string[]

  /**
   * Paths/patterns where write operations are denied (glob patterns).
   * Takes precedence over allowWrite.
   * Default: [] (allowWrite already restrictive)
   */
  denyWrite: string[]

  /**
   * Allowed domain patterns (supports wildcards like "*.github.com").
   * Default: ['*'] (all domains allowed)
   */
  allowedDomains: string[]

  /**
   * Denied domain patterns (takes precedence over allowedDomains).
   * Default: []
   */
  deniedDomains: string[]

  /**
   * Command patterns that are blocked from execution.
   * Supports simple wildcards: "sudo *" matches "sudo apt install".
   * NOTE: This is application-layer enforcement, not sandbox runtime native.
   * Default: [] (user manually adds python/python3 if needed)
   */
  deniedCommands: string[]

  /**
   * Whether these permissions also apply to MCP servers.
   *
   * When true: MCP server commands are wrapped with `srt` (sandbox runtime).
   * When false: MCP servers run unrestricted.
   * Default: false
   *
   * NOTE: This field is for UI/config storage only in this refactor phase.
   * Actual MCP command wrapping implementation is deferred to future work.
   * Windows doesn't show this option (no sandbox runtime support).
   */
  applyToMCP: boolean
}

// ── Permissions Config File ────────────────────────────────────

/**
 * A named, reusable permissions configuration stored in
 * ~/.golemancy/projects/{projectId}/permissions-config/{id}.json
 */
export interface PermissionsConfigFile extends Timestamped {
  /** Unique identifier (branded type) */
  id: PermissionsConfigId

  /** Human-readable title (e.g., "Default", "Strict Dev", "Python Disabled") */
  title: string

  /** Execution mode for this config */
  mode: PermissionMode

  /** Detailed permissions settings (only used when mode = 'sandbox') */
  config: PermissionsConfig
}

// ── Resolved Config ────────────────────────────────────────────

/**
 * Fully-resolved permissions config after template substitution and platform checks.
 * This is what the runtime (SandboxPool, AnthropicSandbox) consumes.
 */
export interface ResolvedPermissionsConfig {
  mode: PermissionMode
  /** Only meaningful when mode is "sandbox" */
  config: PermissionsConfig
}

// ── Platform Support ───────────────────────────────────────────

/**
 * Platforms that support full sandbox runtime features.
 * Windows only supports deniedCommands (no filesystem/network isolation).
 */
export type SupportedPlatform = 'darwin' | 'linux' | 'win32'

export function isSandboxRuntimeSupported(platform: SupportedPlatform): boolean {
  return platform === 'darwin' || platform === 'linux'
}

// ── Mandatory Deny Paths ───────────────────────────────────────

/**
 * Paths that SandboxManager ALWAYS denies write access to.
 * These are enforced by the Sandbox Runtime itself and CANNOT be overridden
 * by any configuration.
 */
export const SANDBOX_MANDATORY_DENY_WRITE: readonly string[] = [
  '**/.bashrc',
  '**/.bash_profile',
  '**/.zshrc',
  '**/.zprofile',
  '**/.profile',
  '**/.git/hooks/**',
  '**/.git/config',
  '**/.gitmodules',
  '**/.ripgreprc',
  '**/.mcp.json',
  '**/.vscode/**',
  '**/.idea/**',
  '**/.claude/**',
] as const

// ── Default Configuration ──────────────────────────────────────

/** Cross-platform sensitive paths to deny reading */
const COMMON_DENY_READ = [
  '**/.env',
  '**/.env.*',
  '**/secrets/**',
  '**/*.pem',
  '**/*.key',
  '**/*.p12',
  '**/credentials*',
  '**/terraform.tfstate',
  '**/terraform.tfstate.backup',
]

/** Unix (macOS/Linux) sensitive paths to deny reading */
const UNIX_DENY_READ = [
  '~/.ssh',
  '~/.aws',
  '~/.gnupg',
  '~/.docker/config.json',
  '~/.kube/config',
  '~/.npmrc',
  '~/.git-credentials',
  '~/.config/gcloud/**',
  '~/.azure/**',
  '~/.pgpass',
  '~/.my.cnf',
  '/etc/passwd',
  '/etc/shadow',
]

/** Windows sensitive paths to deny reading */
const WINDOWS_DENY_READ = [
  '~/.ssh',
  '~/.aws',
  '~/.docker/config.json',
  '~/.kube/config',
  '~/.npmrc',
  '~/.git-credentials',
  '~/.azure/**',
  '~/.pgpass',
]

/** Unix (macOS/Linux) default denied commands — dangerous system operations */
const UNIX_DENIED_COMMANDS = [
  'sudo',
  'su',
  'shutdown',
  'reboot',
  'halt',
  'poweroff',
  'mkfs',
  'fdisk',
  'dd',
  'passwd',
  'useradd',
  'userdel',
  'groupadd',
  'groupdel',
  'iptables',
  'ufw',
  'systemctl',
]

/** Windows default denied commands — dangerous system operations */
const WINDOWS_DENIED_COMMANDS = [
  'format',
  'shutdown',
  'diskpart',
  'bcdedit',
  'net user',
  'net localgroup',
  'reg',
  'sfc',
  'netsh',
]

/**
 * System default permissions config (base constant).
 * Use `getDefaultPermissionsConfig(platform)` for platform-aware defaults.
 */
export const DEFAULT_PERMISSIONS_CONFIG: PermissionsConfigFile = {
  id: 'default' as PermissionsConfigId,
  title: 'Default',
  mode: 'sandbox',
  config: {
    allowWrite: ['{{workspaceDir}}'],
    denyRead: [...COMMON_DENY_READ, ...UNIX_DENY_READ],
    denyWrite: [],
    allowedDomains: ['*'],
    deniedDomains: [],
    deniedCommands: UNIX_DENIED_COMMANDS,
    applyToMCP: false,
  },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

/**
 * Get the system default permissions config with platform-specific denyRead and deniedCommands.
 */
export function getDefaultPermissionsConfig(platform: SupportedPlatform): PermissionsConfigFile {
  const isWindows = platform === 'win32'
  return {
    ...DEFAULT_PERMISSIONS_CONFIG,
    config: {
      ...DEFAULT_PERMISSIONS_CONFIG.config,
      denyRead: [...COMMON_DENY_READ, ...(isWindows ? WINDOWS_DENY_READ : UNIX_DENY_READ)],
      deniedCommands: isWindows ? [...WINDOWS_DENIED_COMMANDS] : [...UNIX_DENIED_COMMANDS],
    },
  }
}

// ── IPC Message Types (Sandbox Worker Pool) ────────────────────

/** Messages from main process to sandbox worker */
export type SandboxWorkerRequest =
  | { type: 'init'; config: Record<string, unknown> }
  | { type: 'wrapCommand'; id: string; command: string }
  | { type: 'cleanupAfterCommand'; id: string }
  | { type: 'shutdown' }

/** Messages from sandbox worker to main process */
export type SandboxWorkerResponse =
  | { type: 'ready' }
  | { type: 'wrappedCommand'; id: string; result: string }
  | { type: 'cleanupDone'; id: string }
  | { type: 'error'; id: string; message: string }
  | { type: 'initError'; message: string }
