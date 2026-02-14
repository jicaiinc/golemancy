import nodeFs from 'node:fs/promises'
import { createBashTool } from 'bash-tool'
import { Bash, MountableFs, InMemoryFs, OverlayFs, ReadWriteFs } from 'just-bash'
import type { ToolSet } from 'ai'
import type {
  BuiltinToolConfig,
  GlobalSettings,
  ProjectBashToolConfig,
  ProjectId,
} from '@golemancy/shared'
import { createBrowserTools, type BrowserToolsConfig } from '@golemancy/tools/browser'
import { AnthropicSandbox } from './anthropic-sandbox'
import { NativeSandbox } from './native-sandbox'
import { sandboxPool } from './sandbox-pool'
import { resolveBashConfig } from './resolve-bash-config'
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
  /** Project ID — used to resolve workspace directory */
  projectId?: string
  /** Global settings — used to resolve bash tool mode. When undefined, defaults to restricted mode. */
  settings?: GlobalSettings
  /** Project-level bash tool config override */
  projectBashToolConfig?: ProjectBashToolConfig
}

// ── Mode-Aware Sandbox Factory (Strategy Pattern) ──────────

/**
 * Create bash tools using the appropriate sandbox based on the resolved execution mode.
 *
 * Mode resolution:
 *   settings provided → resolveBashConfig(global, project?) → mode
 *   settings absent   → fallback to 'restricted' (backward compat)
 *
 * Strategy:
 *   restricted   → just-bash virtual sandbox (existing)
 *   sandbox      → AnthropicSandbox via SandboxPool (OS-level isolation)
 *   unrestricted → NativeSandbox (no isolation)
 */
async function createBashToolForMode(options?: BuiltinToolOptions) {
  const resolvedConfig = options?.settings
    ? resolveBashConfig(options.settings.bashTool, options.projectBashToolConfig)
    : null

  const mode = resolvedConfig?.mode ?? 'restricted'

  switch (mode) {
    case 'restricted':
      return createRestrictedBashTool(options, resolvedConfig?.sandbox)

    case 'sandbox': {
      try {
        if (!options?.projectId) throw new Error('projectId required for sandbox mode')
        const handle = await sandboxPool.getHandle(
          options.projectId as ProjectId,
          resolvedConfig!,
        )
        const workspaceDir = await ensureWorkspaceDir(options.projectId)
        const sandbox = new AnthropicSandbox({
          config: resolvedConfig!.sandbox,
          workspaceRoot: workspaceDir,
          sandboxManager: handle,
        })
        return createBashTool({ sandbox, destination: workspaceDir })
      } catch (err) {
        log.warn({ err, mode }, 'sandbox mode unavailable, falling back to restricted')
        return createRestrictedBashTool(options, resolvedConfig?.sandbox)
      }
    }

    case 'unrestricted': {
      const workspaceDir = options?.projectId
        ? await ensureWorkspaceDir(options.projectId)
        : process.cwd()
      const sandbox = new NativeSandbox({ workspaceRoot: workspaceDir })
      return createBashTool({ sandbox, destination: workspaceDir })
    }
  }
}

// ── Restricted Mode (just-bash) ────────────────────────────

/**
 * Create a just-bash Bash instance with MountableFs:
 *   /project  → OverlayFs (read-only, project root with skills/agents/config)
 *   /workspace → ReadWriteFs (read-write, persistent working directory)
 *
 * When SandboxConfig is provided, maps enablePython to just-bash's native python option.
 */
async function createRestrictedBashTool(
  options?: BuiltinToolOptions,
  sandboxConfig?: import('@golemancy/shared').SandboxConfig,
) {
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

    // enablePython maps to just-bash's native python option
    const enablePython = sandboxConfig?.enablePython ?? true

    sandbox = new Bash({
      fs: mountableFs,
      python: enablePython,
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
