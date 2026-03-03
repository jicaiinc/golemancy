import nodeFs from 'node:fs/promises'
import { createBashTool } from 'bash-tool'
import { Bash, MountableFs, InMemoryFs, OverlayFs, ReadWriteFs } from 'just-bash'
import type { ToolSet } from 'ai'
import type {
  BuiltinToolConfig,
  PermissionMode,
  PermissionsConfigId,
  ProjectId,
  ResolvedPermissionsConfig,
  ResolvedBashToolConfig,
  SupportedPlatform,
  IPermissionsConfigService,
} from '@golemancy/shared'
import { createBrowserTools, type BrowserToolsConfig } from '@golemancy/tools/browser'
import { AnthropicSandbox } from './anthropic-sandbox'
import { NativeSandbox } from './native-sandbox'
import { SandboxUnavailableError } from './errors'
import { sandboxPool } from './sandbox-pool'
import { resolvePermissionsConfig } from './resolve-permissions'
import { permissionsToSandboxConfig } from './permissions-adapter'
import { buildRuntimeEnv } from '../runtime/env-builder'
import { getProjectPath } from '../utils/paths'
import { logger } from '../logger'

const log = logger.child({ component: 'agent:builtin-tools' })

/** Registry of all built-in tools with metadata */
export const BUILTIN_TOOL_REGISTRY = [
  { id: 'bash', name: 'Bash', description: 'Execute bash commands, read/write files', defaultEnabled: true, available: true },
  { id: 'browser', name: 'Browser', description: 'Control web browser for navigation, clicking, typing, and page analysis', defaultEnabled: false, available: true },
  { id: 'os_control', name: 'OS Control', description: 'Desktop automation (coming soon)', defaultEnabled: false, available: false },
  { id: 'task', name: 'Task', description: 'Create and manage tasks within the conversation', defaultEnabled: true, available: true },
  { id: 'memory', name: 'Memory', description: 'Persistent memory bank across conversations with priority-based auto-loading', defaultEnabled: true, available: true },
] as const

/** Default browser tool config when only `browser: true` is set */
const DEFAULT_BROWSER_CONFIG: BrowserToolsConfig = {
  driver: 'playwright',
  headless: false,
}

export interface BuiltinToolOptions {
  /** Project ID — used to resolve workspace directory and permissions config */
  projectId?: string
  /** Permissions config ID from project config */
  permissionsConfigId?: PermissionsConfigId
  /** Permissions config storage service */
  permissionsConfigStorage?: IPermissionsConfigService
}

// ── Mode-Aware Sandbox Factory (Strategy Pattern) ──────────

/**
 * Create bash tools using the appropriate sandbox based on the resolved permission mode.
 *
 * Strategy:
 *   restricted   → just-bash virtual sandbox (existing)
 *   sandbox      → AnthropicSandbox via SandboxPool (OS-level isolation)
 *   unrestricted → NativeSandbox (no isolation)
 */
async function createBashToolForMode(options?: BuiltinToolOptions) {
  const resolved = await resolveEffectivePermissions(options)
  const mode = resolved?.mode ?? 'restricted'

  log.info({ mode, projectId: options?.projectId }, 'creating bash tools with permission mode')

  switch (mode) {
    case 'restricted':
      return createRestrictedBashTool(options)

    case 'sandbox': {
      if (!options?.projectId) {
        throw new SandboxUnavailableError('projectId required for sandbox mode')
      }
      try {
        const workspaceDir = await ensureWorkspaceDir(options.projectId)
        const sandboxConfig = permissionsToSandboxConfig(resolved!.config)
        const runtimeEnv = buildRuntimeEnv(options.projectId)

        // Bridge to existing SandboxPool API
        const bridgedConfig: ResolvedBashToolConfig = {
          mode: 'sandbox',
          sandbox: sandboxConfig,
          usesDedicatedWorker: true,
        }

        log.debug({ workspaceDir, runtimeEnv, projectId: options.projectId }, 'sandbox mode: built runtime env')

        const handle = await sandboxPool.getHandle(
          options.projectId as ProjectId,
          bridgedConfig,
        )
        const sandbox = new AnthropicSandbox({
          config: sandboxConfig,
          workspaceRoot: workspaceDir,
          sandboxManager: handle,
          runtimeEnv: { ...runtimeEnv },
        })
        return createBashTool({ sandbox, destination: workspaceDir })
      } catch (err) {
        // Wrap any sandbox setup failure as SandboxUnavailableError
        if (err instanceof SandboxUnavailableError) throw err
        const message = err instanceof Error ? err.message : String(err)
        throw new SandboxUnavailableError(`Sandbox setup failed: ${message}`)
      }
    }

    case 'unrestricted': {
      const workspaceDir = options?.projectId
        ? await ensureWorkspaceDir(options.projectId)
        : process.cwd()
      const runtimeEnv = options?.projectId
        ? { ...buildRuntimeEnv(options.projectId) }
        : {}
      log.debug({ workspaceDir, runtimeEnv, projectId: options?.projectId }, 'unrestricted mode: built runtime env')
      const sandbox = new NativeSandbox({ workspaceRoot: workspaceDir, runtimeEnv })
      return createBashTool({ sandbox, destination: workspaceDir })
    }
  }
}

// ── Permissions Resolution ─────────────────────────────────

async function resolveEffectivePermissions(
  options?: BuiltinToolOptions,
): Promise<ResolvedPermissionsConfig | null> {
  if (!options?.projectId || !options.permissionsConfigStorage) return null

  const workspaceDir = getProjectPath(options.projectId) + '/workspace'
  const platform = process.platform as SupportedPlatform

  return resolvePermissionsConfig(
    options.permissionsConfigStorage,
    options.projectId as ProjectId,
    options.permissionsConfigId,
    workspaceDir,
    platform,
  )
}

// ── Restricted Mode (just-bash) ────────────────────────────

/**
 * Create a just-bash Bash instance with MountableFs:
 *   /project  → OverlayFs (read-only, project root with skills/agents/config)
 *   /workspace → ReadWriteFs (read-write, persistent working directory)
 */
async function createRestrictedBashTool(options?: BuiltinToolOptions) {
  let sandbox: Bash | undefined
  let destination: string | undefined

  if (options?.projectId) {
    const projectDir = getProjectPath(options.projectId)
    const workspaceDir = projectDir + '/workspace'
    await nodeFs.mkdir(workspaceDir, { recursive: true })

    const mountableFs = new MountableFs({
      base: new InMemoryFs(),
      mounts: [
        { mountPoint: '/project', filesystem: new OverlayFs({ root: projectDir, mountPoint: '/' }) },
        { mountPoint: '/workspace', filesystem: new ReadWriteFs({ root: workspaceDir }) },
      ],
    })

    sandbox = new Bash({
      fs: mountableFs,
      python: true,
      network: { dangerouslyAllowFullInternetAccess: true },
      cwd: '/workspace',
    })
    destination = '/workspace'
  }

  return createBashTool({
    sandbox,
    destination,
  })
}

// ── Helpers ────────────────────────────────────────────────

async function ensureWorkspaceDir(projectId: string): Promise<string> {
  const workspaceDir = getProjectPath(projectId) + '/workspace'
  await nodeFs.mkdir(workspaceDir, { recursive: true })

  // Anchor package.json for Node.js runtime — DO NOT REMOVE.
  // Without this file, `npm install` walks up the directory tree and
  // installs packages into the user's home directory instead of workspace.
  const pkgJsonPath = workspaceDir + '/package.json'
  try {
    await nodeFs.access(pkgJsonPath)
  } catch {
    await nodeFs.writeFile(pkgJsonPath, JSON.stringify({
      private: true,
      description: 'Anchor file for Node.js runtime — DO NOT DELETE. Ensures npm install stays in this workspace.',
    }, null, 2) + '\n')
  }

  return workspaceDir
}

// ── Mode Degradation Info ──────────────────────────────────

export interface ModeDegradation {
  requestedMode: PermissionMode
  actualMode: PermissionMode
  reason: string
}

// ── Public API ─────────────────────────────────────────────

export interface BuiltinToolsResult {
  tools: ToolSet
  /** The actual permission mode used (may differ from configured if degraded) */
  actualMode: PermissionMode
  /** Present when mode was degraded from requested to fallback */
  degradation?: ModeDegradation
  cleanup: () => Promise<void>
}

export async function loadBuiltinTools(
  config: BuiltinToolConfig,
  options?: BuiltinToolOptions,
): Promise<BuiltinToolsResult | null> {
  const tools: ToolSet = {}
  const cleanups: Array<() => Promise<void>> = []
  let actualMode: PermissionMode = 'restricted'
  let degradation: ModeDegradation | undefined

  // Resolve the intended mode before loading tools
  const resolved = await resolveEffectivePermissions(options)
  const requestedMode = resolved?.mode ?? 'restricted'
  actualMode = requestedMode

  // Bash tools — single entry point for bash/readFile/writeFile
  if (config.bash !== false) {
    try {
      const bashToolkit = await createBashToolForMode(options)
      Object.assign(tools, bashToolkit.tools)
      log.debug({ toolNames: Object.keys(bashToolkit.tools) }, 'loaded bash built-in tools')
    } catch (err) {
      if (err instanceof SandboxUnavailableError) {
        // Degrade to restricted mode but notify the caller
        log.warn(
          { err: err.message, requestedMode: err.requestedMode, fallbackMode: err.fallbackMode },
          'sandbox unavailable, degrading to restricted mode',
        )
        actualMode = err.fallbackMode
        degradation = {
          requestedMode: err.requestedMode,
          actualMode: err.fallbackMode,
          reason: err.message,
        }
        try {
          const bashToolkit = await createRestrictedBashTool(options)
          Object.assign(tools, bashToolkit.tools)
        } catch (fallbackErr) {
          log.error({ err: fallbackErr }, 'failed to create fallback restricted bash tools')
        }
      } else {
        log.error({ err }, 'failed to create bash tools')
      }
    }
  }

  // Browser tools
  if (config.browser) {
    try {
      const browserConfig: BrowserToolsConfig =
        typeof config.browser === 'object'
          ? { ...DEFAULT_BROWSER_CONFIG, ...(config.browser as object) }
          : DEFAULT_BROWSER_CONFIG
      const browserResult = createBrowserTools(browserConfig)
      Object.assign(tools, browserResult.tools)
      cleanups.push(browserResult.cleanup)
      log.debug({ driver: browserConfig.driver }, 'loaded browser built-in tools')
    } catch (err) {
      log.error({ err }, 'failed to create browser tools')
    }
  }

  if (Object.keys(tools).length === 0) return null

  return {
    tools,
    actualMode,
    degradation,
    cleanup: async () => {
      await Promise.all(cleanups.map(fn => fn().catch(() => {})))
    },
  }
}
