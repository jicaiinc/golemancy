import type { ToolSet } from 'ai'
import type { BuiltinToolConfig, PermissionMode } from '@golemancy/shared'
import { SandboxUnavailableError } from '../errors'
import { createBashToolForMode, createRestrictedBashTool, resolveEffectivePermissions, type BuiltinToolOptions } from './bash-tools'
import { loadBrowserTools } from './browser-tools'
import { logger } from '../../logger'

const log = logger.child({ component: 'agent:builtin-tools' })

/** Registry of all built-in tools with metadata */
export const BUILTIN_TOOL_REGISTRY = [
  { id: 'bash', name: 'Bash', description: 'Execute bash commands, read/write files', defaultEnabled: true, available: true },
  { id: 'browser', name: 'Browser', description: 'Control web browser for navigation, clicking, typing, and page analysis', defaultEnabled: false, available: true },
  { id: 'computer_use', name: 'Computer Use', description: 'Desktop automation (coming soon)', defaultEnabled: false, available: false },
  { id: 'task', name: 'Task', description: 'Create and manage tasks within the conversation', defaultEnabled: true, available: true },
  { id: 'memory', name: 'Memory', description: 'Persistent memory bank across conversations with priority-based auto-loading', defaultEnabled: true, available: true },
] as const

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
    const browserResult = loadBrowserTools(config.browser)
    if (browserResult) {
      Object.assign(tools, browserResult.tools)
      cleanups.push(browserResult.cleanup)
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

export type { BuiltinToolOptions } from './bash-tools'
