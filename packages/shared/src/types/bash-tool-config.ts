// ── Execution Mode ──────────────────────────────────────────

/**
 * Three execution modes for Bash Tool:
 * - restricted: Virtual sandbox (just-bash), no real system commands
 * - sandbox: OS-level isolation via Anthropic Sandbox Runtime (default)
 * - unrestricted: No sandbox, full system access (dangerous)
 *
 * @deprecated Use PermissionMode from permissions.ts instead.
 * Kept temporarily for server-side code that hasn't migrated yet.
 */
export type BashExecutionMode = 'restricted' | 'sandbox' | 'unrestricted'

// ── Filesystem Config ──────────────────────────────────────

/**
 * @deprecated Use PermissionsConfig from permissions.ts instead.
 */
export interface FilesystemConfig {
  /** Directories where write operations are allowed (glob patterns) */
  allowWrite: string[]
  /** Paths/patterns where read operations are denied (glob patterns) */
  denyRead: string[]
  /** Paths/patterns where write operations are denied — takes precedence over allowWrite (glob patterns) */
  denyWrite: string[]
  /** Allow writing to git config files (~/.gitconfig, .git/config) */
  allowGitConfig: boolean
}

// ── Network Config ─────────────────────────────────────────

/**
 * @deprecated Use PermissionsConfig from permissions.ts instead.
 */
export interface NetworkConfig {
  /** Allowed domain patterns (supports wildcards like "*.github.com") */
  allowedDomains: string[]
}

// ── Sandbox Config ─────────────────────────────────────────

/**
 * Complete sandbox configuration — the "leaf" config with all resolved values.
 *
 * @deprecated Use PermissionsConfig from permissions.ts instead.
 */
export interface SandboxConfig {
  filesystem: FilesystemConfig
  network: NetworkConfig
  enablePython: boolean
  deniedCommands: string[]
}

// ── Resolved Config ────────────────────────────────────────

/**
 * Fully-resolved Bash Tool config after inheritance merging.
 * This is what the runtime (SandboxPool, AnthropicSandbox) consumes.
 *
 * @deprecated Use ResolvedPermissionsConfig from permissions.ts instead.
 */
export interface ResolvedBashToolConfig {
  mode: BashExecutionMode
  /** Only meaningful when mode is "sandbox" */
  sandbox: SandboxConfig
  /** Whether this project uses a dedicated worker (custom config) or shares global */
  usesDedicatedWorker: boolean
}

/**
 * Fully-resolved MCP safety config.
 *
 * @deprecated MCP safety is now part of PermissionsConfig.applyToMCP.
 */
export interface ResolvedMCPSafetyConfig {
  runInSandbox: boolean
}
