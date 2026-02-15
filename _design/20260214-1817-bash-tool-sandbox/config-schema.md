# Configuration Schema Design — Bash Tool Sandbox

**Author**: Abstraction Strategist
**Date**: 2026-02-14
**Source**: `_requirement/20260214-1817-bash-tool-sandbox-implementation.md`

---

## 1. TypeScript Type Definitions

All types go in `packages/shared/src/types/bash-tool-config.ts`.

### 1.1 Execution Mode

```typescript
/**
 * Three execution modes for Bash Tool:
 * - restricted: Virtual sandbox (just-bash), no real system commands
 * - sandbox: OS-level isolation via Anthropic Sandbox Runtime (default)
 * - unrestricted: No sandbox, full system access (dangerous)
 */
export type BashExecutionMode = 'restricted' | 'sandbox' | 'unrestricted'
```

### 1.2 Sandbox Preset

```typescript
/**
 * Built-in preset configurations for Sandbox mode.
 * "custom" means the user has manually configured the sandbox.
 */
export type SandboxPreset = 'balanced' | 'strict' | 'permissive' | 'development' | 'custom'
```

### 1.3 Filesystem Config

```typescript
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
```

### 1.4 Network Config

```typescript
export interface NetworkConfig {
  /** Allowed domain patterns (supports wildcards like "*.github.com") */
  allowedDomains: string[]
}
```

### 1.5 Sandbox Config (full detail)

```typescript
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
  '**/.zshrc',
  '**/.git/hooks/**',
  '**/.vscode/**',
  '**/.idea/**',
  '**/.claude/**',
] as const
```

### 1.6 Global-Level Config

```typescript
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
```

### 1.7 Project-Level Config

```typescript
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
```

### 1.8 MCP Safety Config

```typescript
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
```

### 1.9 Resolved Config (output of inheritance resolution)

```typescript
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
```

### 1.10 Extending Existing Types

```typescript
// Extend GlobalSettings (in settings.ts)
export interface GlobalSettings {
  // ... existing fields ...
  bashTool: GlobalBashToolConfig
  mcpSafety: GlobalMCPSafetyConfig
}

// Extend ProjectConfig (in settings.ts)
export interface ProjectConfig {
  // ... existing fields ...
  bashTool?: ProjectBashToolConfig
  mcpSafety?: ProjectMCPSafetyConfig
}
```

### 1.11 IPC Message Types (Worker Pool)

```typescript
/** Messages from main process → worker */
export type WorkerRequest =
  | { type: 'execute'; id: string; command: string }
  | { type: 'shutdown' }

/** Messages from worker → main process */
export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'result'; id: string; stdout: string; stderr: string; exitCode: number }
  | { type: 'error'; id: string; message: string }
```

---

## 2. Preset Configurations

All presets go in `packages/shared/src/types/bash-tool-presets.ts`.

### 2.1 Balanced (Default)

```typescript
export const PRESET_BALANCED: SandboxConfig = {
  filesystem: {
    allowWrite: [
      '/workspace',
      '/tmp',
      '~/.npm',
      '~/.cache',
    ],
    denyRead: [
      '~/.ssh',
      '~/.aws',
      '/etc/passwd',
      '/etc/shadow',
      '**/.env',
      '**/secrets/**',
    ],
    denyWrite: [
      '**/.git/hooks/**',
    ],
    allowGitConfig: true,
  },
  network: {
    allowedDomains: [
      'github.com',
      '*.github.com',
      'api.github.com',
      'raw.githubusercontent.com',
      'registry.npmjs.org',
      '*.npmjs.org',
      'registry.yarnpkg.com',
      'registry.npmmirror.com',
      'pypi.org',
      'files.pythonhosted.org',
      'hub.docker.com',
      'registry.hub.docker.com',
      '*.cloudflare.com',
      '*.jsdelivr.net',
      '*.unpkg.com',
    ],
  },
  enablePython: true,
  deniedCommands: [
    'sudo *',
    'su *',
    'doas *',
    'osascript *',
    'security *',
    'mkfs *',
    'dd if=* of=/dev/*',
    'chmod 777 *',
    'rm -rf /',
  ],
}
```

### 2.2 Strict

More restrictive — no network, no Python, tight filesystem.

```typescript
export const PRESET_STRICT: SandboxConfig = {
  filesystem: {
    allowWrite: [
      '/workspace',
      '/tmp',
    ],
    denyRead: [
      '~/.ssh',
      '~/.aws',
      '~/.gnupg',
      '~/.config',
      '~/.local',
      '/etc/passwd',
      '/etc/shadow',
      '/etc/hosts',
      '**/.env',
      '**/.env.*',
      '**/secrets/**',
      '**/*.pem',
      '**/*.key',
      '**/*.p12',
      '**/credentials*',
    ],
    denyWrite: [
      '**/.git/hooks/**',
      '**/.git/config',
      '**/node_modules/**',
    ],
    allowGitConfig: false,
  },
  network: {
    allowedDomains: [],
  },
  enablePython: false,
  deniedCommands: [
    'sudo *',
    'su *',
    'doas *',
    'osascript *',
    'security *',
    'mkfs *',
    'dd if=* of=/dev/*',
    'chmod 777 *',
    'rm -rf /',
    'curl *',
    'wget *',
    'nc *',
    'ncat *',
    'ssh *',
    'scp *',
    'rsync *',
    'docker *',
    'kubectl *',
    'open *',
  ],
}
```

### 2.3 Permissive

Relaxed — broader network access, more write locations.

```typescript
export const PRESET_PERMISSIVE: SandboxConfig = {
  filesystem: {
    allowWrite: [
      '/workspace',
      '/tmp',
      '~/.npm',
      '~/.cache',
      '~/.config',
      '~/.local',
      '~/Downloads',
    ],
    denyRead: [
      '~/.ssh/id_*',
      '~/.ssh/*_key',
      '~/.aws/credentials',
      '/etc/shadow',
      '**/*.pem',
      '**/*.key',
    ],
    denyWrite: [
      '**/.git/hooks/**',
    ],
    allowGitConfig: true,
  },
  network: {
    allowedDomains: [
      'github.com',
      '*.github.com',
      'api.github.com',
      'raw.githubusercontent.com',
      'registry.npmjs.org',
      '*.npmjs.org',
      'registry.yarnpkg.com',
      'registry.npmmirror.com',
      'pypi.org',
      'files.pythonhosted.org',
      'hub.docker.com',
      'registry.hub.docker.com',
      '*.cloudflare.com',
      '*.jsdelivr.net',
      '*.unpkg.com',
      '*.googleapis.com',
      '*.docker.io',
      '*.docker.com',
      'crates.io',
      '*.crates.io',
      'rubygems.org',
      'api.nuget.org',
      'go.dev',
      'proxy.golang.org',
      'sum.golang.org',
    ],
  },
  enablePython: true,
  deniedCommands: [
    'sudo *',
    'su *',
    'doas *',
    'mkfs *',
    'dd if=* of=/dev/*',
    'rm -rf /',
  ],
}
```

### 2.4 Development

Full access except hard-banned operations. For trusted local environments.

```typescript
export const PRESET_DEVELOPMENT: SandboxConfig = {
  filesystem: {
    allowWrite: [
      '/workspace',
      '/tmp',
      '~/.npm',
      '~/.cache',
      '~/.config',
      '~/.local',
      '~/Downloads',
      '~/Desktop',
      '~/Documents',
    ],
    denyRead: [
      '~/.ssh/id_*',
      '~/.ssh/*_key',
      '/etc/shadow',
    ],
    denyWrite: [],
    allowGitConfig: true,
  },
  network: {
    allowedDomains: ['*'],
  },
  enablePython: true,
  deniedCommands: [
    'sudo *',
    'su *',
    'doas *',
    'mkfs *',
    'dd if=* of=/dev/*',
    'rm -rf /',
  ],
}
```

### 2.5 Preset Lookup

```typescript
import type { SandboxConfig, SandboxPreset } from './bash-tool-config'

export const SANDBOX_PRESETS: Record<Exclude<SandboxPreset, 'custom'>, SandboxConfig> = {
  balanced: PRESET_BALANCED,
  strict: PRESET_STRICT,
  permissive: PRESET_PERMISSIVE,
  development: PRESET_DEVELOPMENT,
}

/** Get the SandboxConfig for a given preset name */
export function getPresetConfig(preset: SandboxPreset, customConfig?: Partial<SandboxConfig>): SandboxConfig {
  if (preset === 'custom') {
    return mergeWithDefaults(PRESET_BALANCED, customConfig ?? {})
  }
  return SANDBOX_PRESETS[preset]
}
```

### 2.6 Preset Metadata (for UI)

```typescript
export interface PresetMetadata {
  id: SandboxPreset
  name: string
  subtitle: string
  description: string
  icon: string // pixel art icon identifier
}

export const PRESET_METADATA: PresetMetadata[] = [
  {
    id: 'balanced',
    name: 'Balanced',
    subtitle: 'Recommended',
    description: 'OS-level isolation. Real commands allowed within safe defaults. Blocks sensitive files and dangerous commands.',
    icon: 'shield-check',
  },
  {
    id: 'strict',
    name: 'Strict',
    subtitle: 'Maximum safety',
    description: 'No network access, no Python, tight filesystem. Only workspace and /tmp writable. Blocks most external tools.',
    icon: 'shield-lock',
  },
  {
    id: 'permissive',
    name: 'Permissive',
    subtitle: 'For trusted projects',
    description: 'Broader network access (package registries, Docker, Go). More writable directories. Fewer command restrictions.',
    icon: 'shield-half',
  },
  {
    id: 'development',
    name: 'Development',
    subtitle: 'Local dev only',
    description: 'Full network access, broad filesystem permissions. Only hard-banned operations (sudo, mkfs) are blocked.',
    icon: 'shield-off',
  },
  {
    id: 'custom',
    name: 'Custom',
    subtitle: 'Manual configuration',
    description: 'Manually configure filesystem, network, and command restrictions.',
    icon: 'settings',
  },
]
```

---

## 3. Configuration Inheritance & Merging Rules

### 3.1 Three-Layer Model

Follows the existing `useResolvedConfig()` pattern in the codebase (Global → Project → Agent). For Bash Tool safety, we use two layers: **Global → Project**.

```
Global Settings (bashTool)
        │
        ▼
Project Config (bashTool)  ← inherit: true → use global as-is
        │                  ← inherit: false → merge project custom on top of global
        ▼
ResolvedBashToolConfig     ← consumed by runtime
```

### 3.2 Resolution Algorithm

```typescript
// packages/server/src/agent/resolve-bash-config.ts

import { getPresetConfig, PRESET_BALANCED } from '@golemancy/shared'
import type {
  GlobalBashToolConfig,
  ProjectBashToolConfig,
  ResolvedBashToolConfig,
  SandboxConfig,
} from '@golemancy/shared'

/** Default global config — used when settings.json has no bashTool key */
export const DEFAULT_GLOBAL_BASH_CONFIG: GlobalBashToolConfig = {
  defaultMode: 'sandbox',
  sandboxPreset: 'balanced',
}

/** Default project config — inherit everything from global */
export const DEFAULT_PROJECT_BASH_CONFIG: ProjectBashToolConfig = {
  inherit: true,
}

/**
 * Resolve the effective Bash Tool config for a project.
 *
 * Rules:
 * 1. If project has no bashTool config or inherit=true → use global config as-is.
 * 2. If project has inherit=false:
 *    a. mode: project.mode ?? global.defaultMode
 *    b. sandbox config: deep merge project.customConfig on top of global effective config
 *    c. deniedCommands: UNION (global + project) — project cannot REMOVE global bans
 *    d. denyRead/denyWrite: UNION — project cannot remove global deny rules
 *    e. allowWrite: project replaces global (project knows its own workspace)
 *    f. network.allowedDomains: project replaces global (scoped to project needs)
 * 3. usesDedicatedWorker = true when inherit=false AND mode=sandbox
 */
export function resolveBashConfig(
  globalConfig: GlobalBashToolConfig | undefined,
  projectConfig?: ProjectBashToolConfig,
): ResolvedBashToolConfig {
  const global = globalConfig ?? DEFAULT_GLOBAL_BASH_CONFIG

  // Step 1: Resolve global effective sandbox config
  const globalSandbox = getPresetConfig(global.sandboxPreset, global.customConfig)

  // Step 2: If project inherits (or has no config)
  if (!projectConfig || projectConfig.inherit) {
    return {
      mode: global.defaultMode,
      sandbox: applyEnablePythonMapping(globalSandbox),
      usesDedicatedWorker: false,
    }
  }

  // Step 3: Project overrides — merge
  const mode = projectConfig.mode ?? global.defaultMode
  const projectCustom = projectConfig.customConfig

  const mergedSandbox: SandboxConfig = projectCustom
    ? mergeSandboxConfig(globalSandbox, projectCustom)
    : globalSandbox

  return {
    mode,
    sandbox: applyEnablePythonMapping(mergedSandbox),
    usesDedicatedWorker: mode === 'sandbox',
  }
}

/**
 * FACT CHECK CORRECTION: enablePython is NOT a Sandbox Runtime native feature.
 * When enablePython is false in Sandbox mode, we inject python/python3 into
 * deniedCommands so the application-layer check blocks them.
 *
 * In Restricted mode (just-bash), enablePython maps to the native Bash({ python })
 * config — that mapping happens in builtin-tools.ts, not here.
 */
const PYTHON_DENY_COMMANDS = ['python', 'python3', 'pip', 'pip3']

function applyEnablePythonMapping(config: SandboxConfig): SandboxConfig {
  if (config.enablePython) return config

  return {
    ...config,
    deniedCommands: deduplicateArray([
      ...config.deniedCommands,
      ...PYTHON_DENY_COMMANDS,
    ]),
  }
}
```

### 3.3 Merge Strategy for SandboxConfig

```typescript
/**
 * Merge project custom config on top of global sandbox config.
 *
 * Security invariant: project CANNOT weaken global deny rules.
 * - denyRead, denyWrite, deniedCommands → UNION (additive only)
 * - allowWrite, allowedDomains → REPLACE (project scopes its own needs)
 * - enablePython → project can only disable (false overrides true), not enable
 * - allowGitConfig → project can only disable, not enable
 */
function mergeSandboxConfig(
  base: SandboxConfig,
  override: Partial<SandboxConfig>,
): SandboxConfig {
  return {
    filesystem: {
      // allowWrite: project REPLACES (project knows its own write paths)
      allowWrite: override.filesystem?.allowWrite ?? base.filesystem.allowWrite,

      // denyRead: UNION — security additive only
      denyRead: deduplicateArray([
        ...base.filesystem.denyRead,
        ...(override.filesystem?.denyRead ?? []),
      ]),

      // denyWrite: UNION — security additive only
      denyWrite: deduplicateArray([
        ...base.filesystem.denyWrite,
        ...(override.filesystem?.denyWrite ?? []),
      ]),

      // allowGitConfig: can only restrict further (AND logic)
      allowGitConfig: base.filesystem.allowGitConfig && (override.filesystem?.allowGitConfig ?? true),
    },
    network: {
      // allowedDomains: project REPLACES
      allowedDomains: override.network?.allowedDomains ?? base.network.allowedDomains,
    },
    // enablePython: can only restrict further (AND logic)
    enablePython: base.enablePython && (override.enablePython ?? true),

    // deniedCommands: UNION — security additive only
    deniedCommands: deduplicateArray([
      ...base.deniedCommands,
      ...(override.deniedCommands ?? []),
    ]),
  }
}

function deduplicateArray(arr: string[]): string[] {
  return [...new Set(arr)]
}
```

### 3.4 Security Invariants (Critical)

| Field | Merge Strategy | Rationale |
|-------|---------------|-----------|
| `denyRead` | UNION (additive) | Project cannot remove global read bans. A project can only add MORE deny rules. |
| `denyWrite` | UNION (additive) | Same — cannot weaken write bans. |
| `deniedCommands` | UNION (additive) | Project cannot remove globally-banned commands. |
| `allowWrite` | REPLACE | Project defines its own workspace. Replacing is safe because denyWrite still applies as override. |
| `allowedDomains` | REPLACE | Project may need different registries. This is acceptable because network isolation is an independent dimension. |
| `enablePython` | AND (can only disable) | If global disables Python, project cannot re-enable it. |
| `allowGitConfig` | AND (can only disable) | Same principle — only restrictive overrides allowed. |

### 3.5 MCP Safety Resolution

```typescript
export function resolveMCPSafetyConfig(
  globalConfig: GlobalMCPSafetyConfig | undefined,
  projectConfig?: ProjectMCPSafetyConfig,
): ResolvedMCPSafetyConfig {
  const global = globalConfig ?? { runInSandbox: false }

  if (!projectConfig || projectConfig.inherit) {
    return { runInSandbox: global.runInSandbox }
  }

  return { runInSandbox: projectConfig.runInSandbox ?? global.runInSandbox }
}
```

---

## 4. Default Values

### 4.1 Default GlobalSettings Extension

```typescript
// In storage/settings.ts, extend DEFAULT_SETTINGS:
const DEFAULT_SETTINGS: GlobalSettings = {
  // ... existing fields ...
  bashTool: {
    defaultMode: 'sandbox',
    sandboxPreset: 'balanced',
    // customConfig is undefined — preset values are used
  },
  mcpSafety: {
    runInSandbox: false,
  },
}
```

### 4.2 Default ProjectConfig Extension

```typescript
// Project config defaults — no bashTool or mcpSafety key means full inheritance
// When a project is created, it starts with no bashTool config → inherits global.
```

### 4.3 Helper: Apply Defaults

```typescript
/**
 * Ensure a GlobalBashToolConfig has all required fields,
 * filling in defaults for any missing keys.
 */
export function withGlobalDefaults(
  config?: Partial<GlobalBashToolConfig>,
): GlobalBashToolConfig {
  return {
    defaultMode: config?.defaultMode ?? 'sandbox',
    sandboxPreset: config?.sandboxPreset ?? 'balanced',
    customConfig: config?.customConfig,
  }
}
```

---

## 5. Validation Rules

No Zod dependency — use plain TypeScript runtime validation to stay consistent with the codebase's lightweight approach (the project uses no Zod elsewhere). Validation functions live alongside config resolution.

### 5.1 Validation Functions

```typescript
// packages/server/src/agent/validate-bash-config.ts

export interface ValidationError {
  field: string
  message: string
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
}

const VALID_MODES: BashExecutionMode[] = ['restricted', 'sandbox', 'unrestricted']
const VALID_PRESETS: SandboxPreset[] = ['balanced', 'strict', 'permissive', 'development', 'custom']

export function validateGlobalBashConfig(config: unknown): ValidationResult {
  const errors: ValidationError[] = []

  if (!config || typeof config !== 'object') {
    return { valid: false, errors: [{ field: 'bashTool', message: 'Must be an object' }] }
  }

  const c = config as Record<string, unknown>

  // defaultMode
  if (c.defaultMode !== undefined) {
    if (!VALID_MODES.includes(c.defaultMode as BashExecutionMode)) {
      errors.push({
        field: 'defaultMode',
        message: `Must be one of: ${VALID_MODES.join(', ')}`,
      })
    }
  }

  // sandboxPreset
  if (c.sandboxPreset !== undefined) {
    if (!VALID_PRESETS.includes(c.sandboxPreset as SandboxPreset)) {
      errors.push({
        field: 'sandboxPreset',
        message: `Must be one of: ${VALID_PRESETS.join(', ')}`,
      })
    }
  }

  // customConfig
  if (c.customConfig !== undefined) {
    const customErrors = validateSandboxConfig(c.customConfig, 'customConfig')
    errors.push(...customErrors)
  }

  return { valid: errors.length === 0, errors }
}

export function validateSandboxConfig(config: unknown, prefix = ''): ValidationError[] {
  const errors: ValidationError[] = []
  const p = prefix ? `${prefix}.` : ''

  if (!config || typeof config !== 'object') {
    return [{ field: `${p}sandboxConfig`, message: 'Must be an object' }]
  }

  const c = config as Record<string, unknown>

  // filesystem
  if (c.filesystem !== undefined) {
    if (typeof c.filesystem !== 'object' || c.filesystem === null) {
      errors.push({ field: `${p}filesystem`, message: 'Must be an object' })
    } else {
      const fs = c.filesystem as Record<string, unknown>
      for (const key of ['allowWrite', 'denyRead', 'denyWrite'] as const) {
        if (fs[key] !== undefined) {
          if (!Array.isArray(fs[key]) || !(fs[key] as unknown[]).every(v => typeof v === 'string')) {
            errors.push({ field: `${p}filesystem.${key}`, message: 'Must be an array of strings' })
          }
        }
      }
      if (fs.allowGitConfig !== undefined && typeof fs.allowGitConfig !== 'boolean') {
        errors.push({ field: `${p}filesystem.allowGitConfig`, message: 'Must be a boolean' })
      }
    }
  }

  // network
  if (c.network !== undefined) {
    if (typeof c.network !== 'object' || c.network === null) {
      errors.push({ field: `${p}network`, message: 'Must be an object' })
    } else {
      const net = c.network as Record<string, unknown>
      if (net.allowedDomains !== undefined) {
        if (!Array.isArray(net.allowedDomains) || !(net.allowedDomains as unknown[]).every(v => typeof v === 'string')) {
          errors.push({ field: `${p}network.allowedDomains`, message: 'Must be an array of strings' })
        }
      }
    }
  }

  // enablePython
  if (c.enablePython !== undefined && typeof c.enablePython !== 'boolean') {
    errors.push({ field: `${p}enablePython`, message: 'Must be a boolean' })
  }

  // deniedCommands
  if (c.deniedCommands !== undefined) {
    if (!Array.isArray(c.deniedCommands) || !(c.deniedCommands as unknown[]).every(v => typeof v === 'string')) {
      errors.push({ field: `${p}deniedCommands`, message: 'Must be an array of strings' })
    }
  }

  return errors
}

export function validateProjectBashConfig(config: unknown): ValidationResult {
  const errors: ValidationError[] = []

  if (!config || typeof config !== 'object') {
    return { valid: false, errors: [{ field: 'bashTool', message: 'Must be an object' }] }
  }

  const c = config as Record<string, unknown>

  // mode (optional)
  if (c.mode !== undefined && !VALID_MODES.includes(c.mode as BashExecutionMode)) {
    errors.push({ field: 'mode', message: `Must be one of: ${VALID_MODES.join(', ')}` })
  }

  // inherit
  if (c.inherit !== undefined && typeof c.inherit !== 'boolean') {
    errors.push({ field: 'inherit', message: 'Must be a boolean' })
  }

  // customConfig — only validated when inherit=false
  if (c.inherit === false && c.customConfig !== undefined) {
    const customErrors = validateSandboxConfig(c.customConfig, 'customConfig')
    errors.push(...customErrors)
  }

  return { valid: errors.length === 0, errors }
}
```

---

## 6. Edge Cases

### 6.1 Missing Config

| Scenario | Resolution |
|----------|-----------|
| `settings.json` has no `bashTool` key | Use `DEFAULT_GLOBAL_BASH_CONFIG` (sandbox + balanced) |
| Project config has no `bashTool` key | Treated as `{ inherit: true }` |
| `sandboxPreset: 'custom'` but no `customConfig` | Fall back to balanced preset as base with no overrides |
| `inherit: false` but no `customConfig` | Use global effective config (merge with empty override = identity) |

### 6.2 Mode Conflicts

| Scenario | Resolution |
|----------|-----------|
| Global is `restricted`, project sets `mode: 'unrestricted'` | Allowed — project explicitly overrides mode. The UI should show a warning. |
| Global is `unrestricted`, project sets `mode: 'sandbox'` | Allowed — project can be MORE restrictive than global. |
| Project sets `inherit: true` but also has `mode` set | `inherit: true` takes precedence — mode is ignored. |

### 6.3 Path Patterns

| Pattern | Expansion | Notes |
|---------|-----------|-------|
| `~/.ssh` | `/Users/<user>/.ssh` | Expanded at validation time using `os.homedir()` |
| `**/.env` | Glob — matches `.env` at any depth | Uses `minimatch` with `{ dot: true }` |
| `/workspace` | Literal prefix match | Workspace root mapped at sandbox creation time |
| `**/secrets/**` | Glob — matches `/path/to/secrets/file` | Recursive wildcard |

### 6.4 Mandatory Deny Paths (Sandbox Runtime)

Per Fact Check finding #3: SandboxManager always blocks writes to these paths regardless of configuration. These are enforced at the Sandbox Runtime layer — our config does NOT need to include them, but we expose `SANDBOX_MANDATORY_DENY_WRITE` as a constant (Section 1.5) so the UI can display them as "always blocked".

| Path | Reason |
|------|--------|
| `**/.bashrc` | Shell config — prevents environment hijacking |
| `**/.zshrc` | Shell config — prevents environment hijacking |
| `**/.git/hooks/**` | Git hooks — prevents code injection via hooks |
| `**/.vscode/**` | IDE config — prevents extension/settings tampering |
| `**/.idea/**` | IDE config — prevents extension/settings tampering |
| `**/.claude/**` | Claude config — prevents agent self-modification |

These should be displayed in the UI under "Always Blocked (by Sandbox Runtime)" but NOT included in editable denyWrite lists.

### 6.5 Lifecycle Awareness

Per Fact Check finding #4: SandboxManager has a required lifecycle that the config schema must be aware of:
- `initialize(config)` must be called before any sandbox operations
- `cleanupAfterCommand()` must be called after each command execution
- `reset()` on shutdown to clean up resources
- `checkDependencies()` on Linux to verify bwrap + socat + ripgrep

The `ResolvedBashToolConfig` is consumed by `SandboxPool.getSandboxForProject()` which handles calling `initialize()` with the resolved config. The lifecycle methods are the Architect's domain (Task #2), but the config schema ensures all values needed by `initialize()` are present in `SandboxConfig`.

### 6.6 Platform Differences

Per Fact Check finding #5:
- macOS: violation detection is real-time (sandbox-exec)
- Linux: violation detection is post-execution (bwrap)

This does NOT affect the config schema — the same `SandboxConfig` is used on both platforms. The difference is in runtime behavior, handled by SandboxManager internally.

### 6.7 deniedCommands Pattern Conversion

```typescript
/**
 * Convert a command deny pattern to a regex.
 * "sudo *" → /\bsudo\s+.*/
 * "rm -rf /" → /\brm\s+-rf\s+\//
 */
export function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // escape regex special chars (except *)
    .replace(/\*/g, '.*')                    // * → .*
    .replace(/\s+/g, '\\s+')                // whitespace → \s+

  return new RegExp(`\\b${escaped}`, 'i')
}
```

---

## 7. File Layout Summary

```
packages/shared/src/types/
├── bash-tool-config.ts      ← Type definitions (Section 1)
├── bash-tool-presets.ts      ← Preset configs + metadata (Section 2)
└── index.ts                  ← Add exports for both new files

packages/server/src/agent/
├── resolve-bash-config.ts    ← Inheritance resolution (Section 3)
├── validate-bash-config.ts   ← Validation functions (Section 5)
├── validate-path.ts          ← Path validation (separate design doc)
└── check-command-blacklist.ts ← Command checking (separate design doc)
```

---

## 8. JSON Storage Examples

### 8.1 Global Settings (default — first launch)

```json
{
  "bashTool": {
    "defaultMode": "sandbox",
    "sandboxPreset": "balanced"
  },
  "mcpSafety": {
    "runInSandbox": false
  }
}
```

### 8.2 Global Settings (custom sandbox config)

```json
{
  "bashTool": {
    "defaultMode": "sandbox",
    "sandboxPreset": "custom",
    "customConfig": {
      "filesystem": {
        "allowWrite": ["/workspace", "/tmp", "~/.npm", "~/.cache", "~/my-tools"],
        "denyRead": ["~/.ssh", "~/.aws", "**/.env", "**/secrets/**"],
        "denyWrite": ["**/.git/hooks/**"],
        "allowGitConfig": true
      },
      "network": {
        "allowedDomains": ["github.com", "*.github.com", "registry.npmjs.org", "my-registry.example.com"]
      },
      "enablePython": true,
      "deniedCommands": ["sudo *", "su *", "rm -rf /"]
    }
  }
}
```

### 8.3 Project Config (inherit)

```json
{
  "bashTool": {
    "inherit": true
  }
}
```

### 8.4 Project Config (custom)

```json
{
  "bashTool": {
    "mode": "sandbox",
    "inherit": false,
    "customConfig": {
      "filesystem": {
        "allowWrite": ["/workspace", "/tmp", "~/project-specific-dir"]
      },
      "network": {
        "allowedDomains": ["github.com", "*.github.com", "internal-api.mycompany.com"]
      },
      "deniedCommands": ["docker rm *"]
    }
  }
}
```

---

**End of Configuration Schema Design**
