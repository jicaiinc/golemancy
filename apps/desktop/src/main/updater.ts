import { BrowserWindow, shell } from 'electron'
import { logger } from './logger'

const GITHUB_REPO = 'jicaiinc/golemancy'
const CHECK_INTERVAL_MS = 60 * 60 * 1000 // 1 hour
const INITIAL_DELAY_MS = 10 * 1000 // 10 seconds

const PLATFORM_KEYWORDS: Record<string, string> = {
  'darwin-arm64': 'mac-arm64.dmg',
  'darwin-x64': 'mac-x64.dmg',
  'win32-x64': 'win-x64.exe',
  'linux-x64': '.deb',
}

export interface UpdateInfo {
  version: string
  downloadUrl: string
}

let cachedUpdateInfo: UpdateInfo | null = null

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const na = pa[i] ?? 0
    const nb = pb[i] ?? 0
    if (na > nb) return 1
    if (na < nb) return -1
  }
  return 0
}

async function fetchLatestRelease(currentVersion: string): Promise<UpdateInfo | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { 'User-Agent': 'Golemancy-Desktop' },
    })
    if (!res.ok) {
      logger.debug({ status: res.status }, 'update check: GitHub API error')
      return null
    }

    const data = await res.json() as { tag_name: string; assets: Array<{ name: string; browser_download_url: string }> }
    const latestVersion = data.tag_name.replace(/^v/, '')

    if (compareVersions(latestVersion, currentVersion) <= 0) {
      logger.debug({ current: currentVersion, latest: latestVersion }, 'update check: up to date')
      return null
    }

    // Find matching asset for current platform
    const platformKey = `${process.platform}-${process.arch}`
    const keyword = PLATFORM_KEYWORDS[platformKey]
    const asset = keyword
      ? data.assets.find(a => a.name.includes(keyword))
      : null

    const downloadUrl = asset?.browser_download_url
      ?? `https://github.com/${GITHUB_REPO}/releases/tag/v${latestVersion}`

    logger.info({ current: currentVersion, latest: latestVersion, downloadUrl }, 'update available')
    return { version: latestVersion, downloadUrl }
  } catch (err) {
    logger.debug({ err }, 'update check: fetch error')
    return null
  }
}

function broadcastUpdate(info: UpdateInfo): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('update:available', info)
  }
}

export function getLatestUpdateInfo(): UpdateInfo | null {
  return cachedUpdateInfo
}

export function startUpdateChecker(currentVersion: string): void {
  async function check() {
    const info = await fetchLatestRelease(currentVersion)
    if (info) {
      cachedUpdateInfo = info
      broadcastUpdate(info)
    }
  }

  setTimeout(check, INITIAL_DELAY_MS)
  setInterval(check, CHECK_INTERVAL_MS)
}

const ALLOWED_DOWNLOAD_PREFIX = `https://github.com/${GITHUB_REPO}/`

export async function openDownloadUrl(url: string): Promise<void> {
  if (!url.startsWith(ALLOWED_DOWNLOAD_PREFIX)) {
    throw new Error('Invalid download URL')
  }
  await shell.openExternal(url)
}
