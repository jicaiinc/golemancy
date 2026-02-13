// ---------------------------------------------------------------------------
// Browser tools — public API
//
// Usage:
//   import { createBrowserTools } from '@solocraft/tools/browser'
//   const { tools, cleanup } = createBrowserTools({ driver: 'playwright' })
// ---------------------------------------------------------------------------

import type { ToolsResult } from '../types'
import type { BrowserDriver } from './driver'
import { PlaywrightDriver, type PlaywrightDriverConfig } from './drivers/playwright'
import { ExtensionDriver, type ExtensionDriverConfig } from './drivers/extension'
import { defineBrowserTools } from './tools'

export type BrowserDriverType = 'playwright' | 'extension'

export interface BrowserToolsConfig {
  /** Which driver to use */
  driver: BrowserDriverType

  // --- Playwright-specific ---
  /** Path to Chrome/Chromium executable (auto-detected if omitted) */
  executablePath?: string
  /** Run headless (default: false) */
  headless?: boolean
  /** Connect to an existing browser via CDP URL */
  cdpUrl?: string
  /** Viewport dimensions (default: 1280x720) */
  viewport?: { width: number; height: number }

  // --- Extension-specific ---
  /** WebSocket URL for extension connection */
  wsUrl?: string
  /** Authentication token */
  token?: string

  // --- Common ---
  /** Operation timeout in ms (default: 30000) */
  timeout?: number
}

/**
 * Create browser tools for an AI agent.
 *
 * The driver is NOT connected immediately — connection happens lazily
 * when the first tool is invoked. This means creating browser tools
 * has zero resource cost until the agent actually uses them.
 */
export function createBrowserTools(config: BrowserToolsConfig): ToolsResult {
  const driver = createDriver(config)
  const tools = defineBrowserTools(driver)

  return {
    tools,
    cleanup: () => driver.close(),
  }
}

function createDriver(config: BrowserToolsConfig): BrowserDriver {
  switch (config.driver) {
    case 'playwright': {
      const driverConfig: PlaywrightDriverConfig = {
        executablePath: config.executablePath,
        headless: config.headless,
        cdpUrl: config.cdpUrl,
        viewport: config.viewport,
        timeout: config.timeout,
      }
      return new PlaywrightDriver(driverConfig)
    }

    case 'extension': {
      if (!config.wsUrl) {
        throw new Error('ExtensionDriver requires wsUrl in config')
      }
      const driverConfig: ExtensionDriverConfig = {
        wsUrl: config.wsUrl,
        token: config.token,
        timeout: config.timeout,
      }
      return new ExtensionDriver(driverConfig)
    }

    default:
      throw new Error(`Unknown browser driver: ${config.driver}`)
  }
}

// Re-export types for consumers
export type { BrowserDriver, PageSnapshot, Screenshot, TabInfo, SnapshotElement } from './driver'
export type { PlaywrightDriverConfig } from './drivers/playwright'
export type { ExtensionDriverConfig } from './drivers/extension'
export { PlaywrightDriver } from './drivers/playwright'
export { ExtensionDriver } from './drivers/extension'
