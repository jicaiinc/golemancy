import { createBashTool } from 'bash-tool'
import type { ToolSet } from 'ai'
import type { BuiltinToolConfig } from '@solocraft/shared'
import { logger } from '../logger'

const log = logger.child({ component: 'agent:builtin-tools' })

/** Registry of all built-in tools with metadata */
export const BUILTIN_TOOL_REGISTRY = [
  { id: 'bash', name: 'Bash', description: 'Execute bash commands, read/write files', defaultEnabled: true, available: true },
  { id: 'browser', name: 'Browser', description: 'Control web browser (coming soon)', defaultEnabled: false, available: false },
  { id: 'os_control', name: 'OS Control', description: 'Desktop automation (coming soon)', defaultEnabled: false, available: false },
] as const

export async function loadBuiltinTools(
  config: BuiltinToolConfig,
): Promise<{ tools: ToolSet; cleanup: () => Promise<void> } | null> {
  const tools: ToolSet = {}

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

  if (Object.keys(tools).length === 0) return null

  return {
    tools,
    cleanup: async () => {
      // Bash tools don't need cleanup; future tools might
    },
  }
}
