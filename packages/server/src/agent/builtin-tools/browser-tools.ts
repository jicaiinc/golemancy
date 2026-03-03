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

/**
 * Build the browser instructions block for injection into the agent's system prompt.
 *
 * TODO: Add guidance that reading full page content is an expensive operation
 * (large token cost). Agent should prefer targeted selectors or screenshots
 * over full page reads when possible.
 */
export function buildBrowserInstructions(): string {
  return [
    '## Browser',
    '',
    'You can control a browser to interact with web pages.',
    'Available actions: navigate to URLs, click elements, type text, take screenshots, and read page content.',
    'Use screenshots to verify visual state when needed.',
  ].join('\n')
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
