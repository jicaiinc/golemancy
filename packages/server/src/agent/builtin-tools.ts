import nodeFs from 'node:fs/promises'
import { createBashTool } from 'bash-tool'
import { Bash, MountableFs, InMemoryFs, OverlayFs, ReadWriteFs } from 'just-bash'
import type { ToolSet } from 'ai'
import type {
  BuiltinToolConfig,
  PermissionsConfig,
  PermissionsConfigId,
  ProjectId,
  ResolvedPermissionsConfig,
  SandboxConfig,
  ResolvedBashToolConfig,
  SupportedPlatform,
  IPermissionsConfigService,
} from '@golemancy/shared'
import { createBrowserTools, type BrowserToolsConfig } from '@golemancy/tools/browser'
import { AnthropicSandbox } from './anthropic-sandbox'
import { NativeSandbox } from './native-sandbox'
import { sandboxPool } from './sandbox-pool'
import { resolvePermissionsConfig } from './resolve-permissions'
import { buildRuntimeEnv } from '../runtime/env-builder'
import { getProjectPath } from '../utils/paths'
import { logger } from '../logger'

const log = logger.child({ component: 'agent:builtin-tools' })

/** Registry of all built-in tools with metadata */
export const BUILTIN_TOOL_REGISTRY = [
  { id: 'bash', name: 'Bash', description: 'Execute bash commands, read/write files', defaultEnabled: true, available: true },
  { id: 'browser', name: 'Browser', description: 'Control web browser for navigation, clicking, typing, and page analysis', defaultEnabled: false, available: true },
  { id: 'os_control', name: 'OS Control', description: 'Desktop automation (coming soon)', defaultEnabled: false, available: false },
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
      try {
        if (!options?.projectId) throw new Error('projectId required for sandbox mode')
        const workspaceDir = await ensureWorkspaceDir(options.projectId)
        const sandboxConfig = permissionsToSandboxConfig(resolved!.config)
        const runtimeEnv = buildRuntimeEnv(options.projectId)

        // Bridge to existing SandboxPool API
        const bridgedConfig: ResolvedBashToolConfig = {
          mode: 'sandbox',
          sandbox: sandboxConfig,
          usesDedicatedWorker: true,
        }

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
        log.warn({ err, mode }, 'sandbox mode unavailable, falling back to restricted')
        return createRestrictedBashTool(options)
      }
    }

    case 'unrestricted': {
      const workspaceDir = options?.projectId
        ? await ensureWorkspaceDir(options.projectId)
        : process.cwd()
      const runtimeEnv = options?.projectId
        ? { ...buildRuntimeEnv(options.projectId) }
        : {}
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

// ── Adapter: PermissionsConfig → SandboxConfig ─────────────

/**
 * Bridge new flat PermissionsConfig to old nested SandboxConfig
 * used by AnthropicSandbox and SandboxPool.
 * This adapter will be removed when the runtime layer is migrated.
 */
function permissionsToSandboxConfig(pc: PermissionsConfig): SandboxConfig {
  return {
    filesystem: {
      allowWrite: pc.allowWrite,
      denyRead: pc.denyRead,
      denyWrite: pc.denyWrite,
      allowGitConfig: false,
    },
    network: {
      allowedDomains: pc.networkRestrictionsEnabled ? pc.allowedDomains : undefined,
    },
    enablePython: true,
    deniedCommands: pc.deniedCommands,
  }
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
  return workspaceDir
}

// ── Public API ─────────────────────────────────────────────

export async function loadBuiltinTools(
  config: BuiltinToolConfig,
  options?: BuiltinToolOptions,
): Promise<{ tools: ToolSet; cleanup: () => Promise<void> } | null> {
  const tools: ToolSet = {}
  const cleanups: Array<() => Promise<void>> = []

  // Bash tools — single entry point for bash/readFile/writeFile
  if (config.bash !== false) {
    try {
      const bashToolkit = await createBashToolForMode(options)
      Object.assign(tools, bashToolkit.tools)
      log.debug({ toolNames: Object.keys(bashToolkit.tools) }, 'loaded bash built-in tools')
    } catch (err) {
      log.error({ err }, 'failed to create bash tools')
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
    cleanup: async () => {
      await Promise.all(cleanups.map(fn => fn().catch(() => {})))
    },
  }
}
