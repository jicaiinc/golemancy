import { app, BrowserWindow, shell } from 'electron'
import pkg from 'electron-updater'
const { autoUpdater } = pkg
import { logger } from './logger'

const GITHUB_REPO = 'jicaiinc/golemancy'
const CHECK_INTERVAL_MS = 60 * 60 * 1000 // 1 hour
const INITIAL_DELAY_MS = 10 * 1000 // 10 seconds

// ── UpdateState ────────────────────────────────────────────────

export interface UpdateState {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error'
  version: string | null
  releaseUrl: string | null
  downloadProgress: number | null
  error: string | null
  isLinuxFallback: boolean
}

let state: UpdateState = {
  status: 'idle',
  version: null,
  releaseUrl: null,
  downloadProgress: null,
  error: null,
  isLinuxFallback: false,
}

function releaseUrl(version: string): string {
  return `https://github.com/${GITHUB_REPO}/releases/tag/v${version}`
}

function setState(patch: Partial<UpdateState>): void {
  state = { ...state, ...patch }
  broadcastState()
}

function broadcastState(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('update:state', state)
  }
}

// ── macOS / Windows: electron-updater ──────────────────────────

function initElectronUpdater(): void {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = logger

  autoUpdater.on('checking-for-update', () => {
    setState({ status: 'checking', error: null })
  })

  autoUpdater.on('update-available', (info) => {
    setState({
      status: 'downloading',
      version: info.version,
      releaseUrl: releaseUrl(info.version),
    })
  })

  autoUpdater.on('update-not-available', () => {
    setState({ status: 'idle' })
  })

  autoUpdater.on('download-progress', (progress) => {
    setState({
      status: 'downloading',
      downloadProgress: Math.round(progress.percent),
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    setState({
      status: 'downloaded',
      version: info.version,
      downloadProgress: 100,
    })
  })

  autoUpdater.on('error', (err) => {
    logger.error({ err }, 'auto-updater error')
    setState({ status: 'error', error: err.message })
  })

  const check = () => { autoUpdater.checkForUpdates().catch(() => {}) }
  setTimeout(check, INITIAL_DELAY_MS)
  setInterval(check, CHECK_INTERVAL_MS)

  logger.info('auto-updater initialized (electron-updater), first check in %ds', INITIAL_DELAY_MS / 1000)
}

// ── Linux fallback: GitHub API polling ─────────────────────────

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

async function fetchLatestRelease(currentVersion: string): Promise<void> {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { 'User-Agent': 'Golemancy-Desktop' },
    })
    if (!res.ok) {
      logger.debug({ status: res.status }, 'update check: GitHub API error')
      setState({ status: 'idle' })
      return
    }

    const data = await res.json() as {
      tag_name: string
      assets: Array<{ name: string; browser_download_url: string }>
    }
    const latestVersion = data.tag_name.replace(/^v/, '')

    if (compareVersions(latestVersion, currentVersion) <= 0) {
      logger.debug({ current: currentVersion, latest: latestVersion }, 'update check: up to date')
      setState({ status: 'idle' })
      return
    }

    setState({
      status: 'available',
      version: latestVersion,
      releaseUrl: releaseUrl(latestVersion),
    })

    logger.info({ current: currentVersion, latest: latestVersion }, 'update available (linux fallback)')
  } catch (err) {
    logger.debug({ err }, 'update check: fetch error')
    setState({ status: 'error', error: err instanceof Error ? err.message : String(err) })
  }
}

function initLinuxFallback(): void {
  state = { ...state, isLinuxFallback: true }
  const currentVersion = app.getVersion()

  async function check() {
    setState({ status: 'checking', error: null })
    await fetchLatestRelease(currentVersion)
  }

  setTimeout(check, INITIAL_DELAY_MS)
  setInterval(check, CHECK_INTERVAL_MS)

  logger.info({ currentVersion }, 'auto-updater initialized (linux fallback), first check in %ds', INITIAL_DELAY_MS / 1000)
}

// ── Dev mock ───────────────────────────────────────────────────

function initDevMock(): void {
  logger.info('auto-updater initialized (dev mock)')

  setTimeout(() => {
    setState({ status: 'checking' })
    setTimeout(() => {
      setState({ status: 'downloading', version: '99.0.0', releaseUrl: releaseUrl('99.0.0'), downloadProgress: 0 })
      setTimeout(() => {
        setState({ downloadProgress: 45 })
        setTimeout(() => {
          setState({ status: 'downloaded', downloadProgress: 100 })
        }, 2000)
      }, 2000)
    }, 1500)
  }, INITIAL_DELAY_MS)
}

// ── Public API ─────────────────────────────────────────────────

export function initAutoUpdater(): void {
  if (!app.isPackaged && process.env.GOLEMANCY_DEV_UPDATE_CHECK) {
    initDevMock()
    return
  }

  if (!app.isPackaged) {
    logger.debug('auto-updater skipped (not packaged)')
    return
  }

  if (process.platform === 'linux') {
    initLinuxFallback()
  } else {
    initElectronUpdater()
  }
}

export function getUpdateState(): UpdateState {
  return state
}

export function checkForUpdatesNow(): void {
  if (state.isLinuxFallback) {
    const currentVersion = app.getVersion()
    setState({ status: 'checking', error: null })
    fetchLatestRelease(currentVersion)
  } else if (app.isPackaged) {
    autoUpdater.checkForUpdates().catch(() => {})
  }
}

export function quitAndInstall(): void {
  if (process.platform === 'linux') return // Linux uses browser download, not in-app install
  autoUpdater.quitAndInstall()
}

export function openReleaseUrl(version: string): void {
  const url = `https://github.com/${GITHUB_REPO}/releases/tag/v${version}`
  if (!url.startsWith(`https://github.com/${GITHUB_REPO}/`)) return
  shell.openExternal(url)
}
