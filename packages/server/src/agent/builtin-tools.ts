import { createBashTool } from 'bash-tool'
import type { ToolSet } from 'ai'
import type { BuiltinToolConfig } from '@solocraft/shared'
import { createBrowserTools, type BrowserToolsConfig } from '@solocraft/tools/browser'
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

export async function loadBuiltinTools(
  config: BuiltinToolConfig,
): Promise<{ tools: ToolSet; cleanup: () => Promise<void> } | null> {
  const tools: ToolSet = {}
  const cleanups: Array<() => Promise<void>> = []

  // Bash tools
  if (config.bash !== false) {
    try {
      const bashToolkit = await createBashTool({})
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
