import { existsSync } from 'node:fs'
import path from 'node:path'
import type { ToolSet } from 'ai'
import { createBrowserTools as createBrowserToolsImpl, type BrowserToolsConfig } from '@golemancy/tools/browser'
import { logger } from '../../logger'

const log = logger.child({ component: 'agent:builtin-tools:browser' })

// ── System Browser Detection ─────────────────────────────────
// Priority: Chrome → Chromium → Edge → undefined (falls back to Playwright cache)

/** Per-platform candidate paths, checked in order. First match wins. */
export const BROWSER_CANDIDATES: Record<string, string[] | ((prefixes: string[]) => string[])> = {
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ],
  win32: (prefixes: string[]) => {
    const suffixes = [
      path.join('Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join('Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join('Chromium', 'Application', 'chrome.exe'),
    ]
    const candidates: string[] = []
    for (const suffix of suffixes) {
      for (const prefix of prefixes) {
        candidates.push(path.join(prefix, suffix))
      }
    }
    return candidates
  },
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/microsoft-edge',
    '/usr/bin/microsoft-edge-stable',
  ],
}

export function getSystemBrowserPath(): string | undefined {
  const spec = BROWSER_CANDIDATES[process.platform]
  if (!spec) return undefined

  const candidates = typeof spec === 'function'
    ? spec([process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean) as string[])
    : spec

  for (const p of candidates) {
    if (existsSync(p)) {
      log.info({ executablePath: p }, 'detected system browser')
      return p
    }
  }
  return undefined
}

/** Default browser tool config when only `browser: true` is set */
const DEFAULT_BROWSER_CONFIG: BrowserToolsConfig = {
  driver: 'playwright',
  headless: false,
  executablePath: getSystemBrowserPath(),
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
    '# Browser',
    '',
    'You can control a browser to interact with web pages.',
    'Primary browser tools: browser_navigate, browser_snapshot, browser_click, browser_type, browser_fill, browser_screenshot.',
    'If you want a single entry point, use browser_command. It can execute navigate, snapshot, click, and many other browser actions.',
    'When the user gives you a URL or asks about page content, do not answer from prior knowledge. Use browser_navigate first.',
    'After navigation, use browser_snapshot to inspect the page structure before clicking or typing.',
    'Use browser_click only with a ref taken from the latest browser_snapshot output.',
    'Both http:// and https:// URLs are supported, including local development URLs such as localhost or 127.0.0.1.',
    'Use browser_screenshot only when visual layout matters; prefer browser_snapshot for content and structure.',
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
