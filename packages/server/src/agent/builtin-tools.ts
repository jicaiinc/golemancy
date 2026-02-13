import nodeFs from 'node:fs/promises'
import { createBashTool } from 'bash-tool'
import { Bash, MountableFs, InMemoryFs, OverlayFs, ReadWriteFs } from 'just-bash'
import type { ToolSet } from 'ai'
import type { BuiltinToolConfig } from '@golemancy/shared'
import { createBrowserTools, type BrowserToolsConfig } from '@golemancy/tools/browser'
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
  /** Project ID — used to resolve workspace directory for ReadWriteFs */
  projectId?: string
}

/**
 * Create a just-bash Bash instance with MountableFs:
 *   /project  → OverlayFs (read-only, project root with skills/agents/config)
 *   /workspace → ReadWriteFs (read-write, persistent working directory)
 *
 * Python and full network access enabled.
 */
async function createBashToolWithSandbox(options?: BuiltinToolOptions) {
  let sandbox: Bash | undefined
  let destination: string | undefined

  if (options?.projectId) {
    const projectDir = getProjectPath(options.projectId)
    const workspaceDir = projectDir + '/workspace'
    await nodeFs.mkdir(workspaceDir, { recursive: true })

    const mountableFs = new MountableFs({
      base: new InMemoryFs(),
      mounts: [
        { mountPoint: '/root', filesystem: new OverlayFs({ root: '/', mountPoint: '/'}) },
        { mountPoint: '/workspace', filesystem: new ReadWriteFs({ root: workspaceDir }) },
      ],
    })

    sandbox = new Bash({
      fs: mountableFs,
      python: true,
      network: { dangerouslyAllowFullInternetAccess: true },
      cwd: '/',
    })
    destination = '/'
  }

  return createBashTool({
    sandbox,
    destination,
  })
}

export async function loadBuiltinTools(
  config: BuiltinToolConfig,
  options?: BuiltinToolOptions,
): Promise<{ tools: ToolSet; cleanup: () => Promise<void> } | null> {
  const tools: ToolSet = {}
  const cleanups: Array<() => Promise<void>> = []

  // Bash tools — single entry point for bash/readFile/writeFile
  if (config.bash !== false) {
    try {
      const bashToolkit = await createBashToolWithSandbox(options)
      Object.assign(tools, bashToolkit.tools)
      log.debug('loaded bash built-in tools')
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
