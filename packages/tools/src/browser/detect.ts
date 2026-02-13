// ---------------------------------------------------------------------------
// System browser detection — finds Chrome/Chromium/Edge on the user's machine.
// Used by PlaywrightDriver when no explicit executablePath is configured.
// ---------------------------------------------------------------------------

import { existsSync } from 'node:fs'

const CHROME_PATHS: Record<string, string[]> = {
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ],
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    `${process.env.LOCALAPPDATA ?? ''}\\Google\\Chrome\\Application\\chrome.exe`,
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
    '/usr/bin/microsoft-edge',
  ],
}

/**
 * Detect the first available Chrome/Chromium/Edge executable on this platform.
 * Returns the full path, or throws if none found.
 */
export function detectBrowser(): string {
  const paths = CHROME_PATHS[process.platform] ?? CHROME_PATHS.linux
  for (const p of paths) {
    if (existsSync(p)) return p
  }
  throw new Error(
    `No Chrome/Chromium/Edge found on this system (${process.platform}). ` +
    'Please install Chrome or set executablePath in browser tool config.',
  )
}
