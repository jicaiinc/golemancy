import { getPresetConfig } from '@golemancy/shared'
import type {
  GlobalBashToolConfig,
  GlobalMCPSafetyConfig,
  ProjectBashToolConfig,
  ProjectMCPSafetyConfig,
  ResolvedBashToolConfig,
  ResolvedMCPSafetyConfig,
  SandboxConfig,
} from '@golemancy/shared'

// ── Default Configs ────────────────────────────────────────

/** Default global config — used when settings.json has no bashTool key */
export const DEFAULT_GLOBAL_BASH_CONFIG: GlobalBashToolConfig = {
  defaultMode: 'restricted',
  sandboxPreset: 'balanced',
}

/** Default project config — inherit everything from global */
export const DEFAULT_PROJECT_BASH_CONFIG: ProjectBashToolConfig = {
  inherit: true,
}

// ── Bash Config Resolution ─────────────────────────────────

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

// ── MCP Safety Resolution ──────────────────────────────────

/**
 * Resolve the effective MCP safety config for a project.
 * Simple two-layer inheritance: global → project.
 */
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

// ── Defaults Helper ────────────────────────────────────────

/**
 * Ensure a GlobalBashToolConfig has all required fields,
 * filling in defaults for any missing keys.
 */
export function withGlobalDefaults(
  config?: Partial<GlobalBashToolConfig>,
): GlobalBashToolConfig {
  return {
    defaultMode: config?.defaultMode ?? 'restricted',
    sandboxPreset: config?.sandboxPreset ?? 'balanced',
    customConfig: config?.customConfig,
  }
}

// ── Internal: enablePython Mapping ─────────────────────────

/**
 * enablePython is NOT a Sandbox Runtime native feature.
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

// ── Internal: Merge Strategy ───────────────────────────────

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
