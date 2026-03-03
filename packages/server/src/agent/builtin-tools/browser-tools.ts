import type { ToolSet } from 'ai'
import { createBrowserTools as createBrowserToolsImpl, type BrowserToolsConfig } from '@golemancy/tools/browser'
import { logger } from '../../logger'

const log = logger.child({ component: 'agent:builtin-tools:browser' })

/** Default browser tool config when only `browser: true` is set */
const DEFAULT_BROWSER_CONFIG: BrowserToolsConfig = {
  driver: 'playwright',
  headless: false,
}

export interface BrowserToolsResult {
  tools: ToolSet
  cleanup: () => Promise<void>
}

export function loadBrowserTools(config: boolean | Record<string, unknown>): BrowserToolsResult | null {
  try {
    const browserConfig: BrowserToolsConfig =
      typeof config === 'object'
        ? { ...DEFAULT_BROWSER_CONFIG, ...(config as object) }
        : DEFAULT_BROWSER_CONFIG
    const result = createBrowserToolsImpl(browserConfig)
    log.debug({ driver: browserConfig.driver }, 'loaded browser built-in tools')
    return result
  } catch (err) {
    log.error({ err }, 'failed to create browser tools')
    return null
  }
}
