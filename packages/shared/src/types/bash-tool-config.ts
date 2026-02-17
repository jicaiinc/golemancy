// ── Execution Mode ──────────────────────────────────────────

/**
 * Three execution modes for Bash Tool:
 * - restricted: Virtual sandbox (just-bash), no real system commands
 * - sandbox: OS-level isolation via Anthropic Sandbox Runtime (default)
 * - unrestricted: No sandbox, full system access (dangerous)
 *
 * Also exported as PermissionMode from permissions.ts.
 * Both types are actively used: this one by the sandbox runtime layer,
 * PermissionMode by the permissions config layer.
 */
export type BashExecutionMode = 'restricted' | 'sandbox' | 'unrestricted'

// ── Filesystem Config ──────────────────────────────────────

/** Filesystem permission config consumed by sandbox runtime layer. */
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

/** Network permission config consumed by sandbox runtime layer. */
export interface NetworkConfig {
  /** Allowed domain patterns (supports wildcards like "*.github.com"). undefined = all allowed (no proxy). */
  allowedDomains?: string[]
}

// ── Sandbox Config ─────────────────────────────────────────

/**
 * Complete sandbox configuration — the "leaf" config with all resolved values.
 * Consumed by SandboxPool, AnthropicSandbox, and MCP sandbox wrapping.
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
 * MCP safety is also configurable via PermissionsConfig.applyToMCP.
 */
export interface ResolvedMCPSafetyConfig {
  runInSandbox: boolean
}
