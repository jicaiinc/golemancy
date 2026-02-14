// ── Execution Mode ──────────────────────────────────────────

/**
 * Three execution modes for Bash Tool:
 * - restricted: Virtual sandbox (just-bash), no real system commands
 * - sandbox: OS-level isolation via Anthropic Sandbox Runtime (default)
 * - unrestricted: No sandbox, full system access (dangerous)
 */
export type BashExecutionMode = 'restricted' | 'sandbox' | 'unrestricted'

// ── Sandbox Preset ─────────────────────────────────────────

/**
 * Built-in preset configurations for Sandbox mode.
 * "custom" means the user has manually configured the sandbox.
 */
export type SandboxPreset = 'balanced' | 'strict' | 'permissive' | 'development' | 'custom'

// ── Filesystem Config ──────────────────────────────────────

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

export interface NetworkConfig {
  /** Allowed domain patterns (supports wildcards like "*.github.com") */
  allowedDomains: string[]
}

// ── Sandbox Config ─────────────────────────────────────────

/**
 * Complete sandbox configuration — the "leaf" config with all resolved values.
 * Used by both presets and custom configurations.
 *
 * NOTE on `enablePython`:
 * - This is an APPLICATION-LAYER toggle, NOT a Sandbox Runtime native feature.
 * - In Sandbox mode: when false, 'python' and 'python3' are appended to deniedCommands
 *   at resolution time (see resolveBashConfig). The stored deniedCommands array does NOT
 *   include python commands — they are injected dynamically.
 * - In Restricted mode (just-bash): maps to the native Bash({ python: boolean }) config
 *   which controls Pyodide availability.
 *
 * NOTE on `deniedCommands`:
 * - This is an APPLICATION-LAYER check, NOT a Sandbox Runtime native feature.
 * - Must be enforced in AnthropicSandbox.executeCommand() BEFORE calling
 *   SandboxManager.wrapWithSandbox().
 */
export interface SandboxConfig {
  filesystem: FilesystemConfig
  network: NetworkConfig
  /**
   * Allow Python execution.
   * - Sandbox mode: when false, blocks 'python'/'python3' via deniedCommands injection
   * - Restricted mode: controls Pyodide availability natively
   */
  enablePython: boolean
  /**
   * Command patterns that are blocked from execution.
   * Supports simple wildcards: "sudo *" matches "sudo apt install".
   * Matched via patternToRegex() conversion.
   * Enforced at application layer before sandbox invocation.
   */
  deniedCommands: string[]
}

/**
 * Paths that SandboxManager ALWAYS denies write access to.
 * These are enforced by the Sandbox Runtime itself and CANNOT be overridden
 * by any configuration (global, project, or preset).
 *
 * Ref: Fact Check finding #3 — SandboxManager mandatory deny paths.
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

// ── Global-Level Config ────────────────────────────────────

/**
 * Global Bash Tool config stored in ~/.golemancy/settings.json
 * under the `bashTool` key.
 */
export interface GlobalBashToolConfig {
  /** Default execution mode for all projects */
  defaultMode: BashExecutionMode
  /** Active preset when mode is "sandbox" */
  sandboxPreset: SandboxPreset
  /**
   * Custom sandbox overrides — only used when sandboxPreset is "custom".
   * When a named preset is selected, the preset values are used directly.
   */
  customConfig?: Partial<SandboxConfig>
}

// ── Project-Level Config ───────────────────────────────────

/**
 * Project-level Bash Tool config stored in
 * ~/.golemancy/projects/{projectId}/config.json under the `bashTool` key.
 */
export interface ProjectBashToolConfig {
  /** Execution mode — if undefined, inherits from global */
  mode?: BashExecutionMode
  /**
   * true = inherit all sandbox config from global settings (default).
   * false = use project-specific custom config below.
   */
  inherit: boolean
  /**
   * Project-specific sandbox overrides — only used when inherit is false.
   * Merged on top of the global effective config (see inheritance rules).
   */
  customConfig?: Partial<SandboxConfig>
}

// ── MCP Safety Config ──────────────────────────────────────

/**
 * MCP sandbox configuration — global level.
 */
export interface GlobalMCPSafetyConfig {
  /** Whether MCP servers run inside the sandbox */
  runInSandbox: boolean
}

/**
 * MCP sandbox configuration — project level.
 */
export interface ProjectMCPSafetyConfig {
  /** true = inherit from global (default) */
  inherit: boolean
  /** Only used when inherit is false */
  runInSandbox?: boolean
}

// ── Resolved Config ────────────────────────────────────────

/**
 * Fully-resolved Bash Tool config after inheritance merging.
 * This is what the runtime (SandboxPool, AnthropicSandbox) consumes.
 * Every field is defined — no optionals.
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
 */
export interface ResolvedMCPSafetyConfig {
  runInSandbox: boolean
}

// ── IPC Message Types (Sandbox Worker Pool) ────────────────

/** Messages from main process → sandbox worker */
export type SandboxWorkerRequest =
  | { type: 'init'; config: Record<string, unknown> }
  | { type: 'wrapCommand'; id: string; command: string }
  | { type: 'cleanupAfterCommand'; id: string }
  | { type: 'shutdown' }

/** Messages from sandbox worker → main process */
export type SandboxWorkerResponse =
  | { type: 'ready' }
  | { type: 'wrappedCommand'; id: string; result: string }
  | { type: 'cleanupDone'; id: string }
  | { type: 'error'; id: string; message: string }
  | { type: 'initError'; message: string }
