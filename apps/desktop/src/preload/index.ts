import { contextBridge, ipcRenderer } from 'electron'

const serverPortArg = process.argv.find(arg => arg.startsWith('--server-port='))
// S4: Guard against parseInt returning NaN
const parsedPort = serverPortArg ? parseInt(serverPortArg.split('=')[1], 10) : NaN
const serverPort = Number.isNaN(parsedPort) ? null : parsedPort

const serverTokenArg = process.argv.find(arg => arg.startsWith('--server-token='))
const serverToken = serverTokenArg ? serverTokenArg.split('=')[1] ?? null : null

const launchIdArg = process.argv.find(arg => arg.startsWith('--launch-id='))
const launchId = launchIdArg ? launchIdArg.split('=')[1] ?? null : null

const appVersionArg = process.argv.find(arg => arg.startsWith('--app-version='))
const appVersion = appVersionArg ? appVersionArg.split('=')[1] ?? null : null

function getPlatformLabel(): string | null {
  const p = process.platform, a = process.arch
  if (p === 'darwin') return a === 'arm64' ? 'macOS (Apple Silicon)' : 'macOS (Intel)'
  if (p === 'win32') return 'Windows'
  if (p === 'linux') return 'Linux'
  return null
}

contextBridge.exposeInMainWorld('electronAPI', {
  getServerPort: () => serverPort,
  getServerBaseUrl: () => serverPort ? `http://127.0.0.1:${serverPort}` : null,
  getServerToken: () => serverToken,
  getLaunchId: () => launchId,
  openNewWindow: (projectId?: string) => ipcRenderer.invoke('window:open', projectId),
  openPath: (fullPath: string) => ipcRenderer.invoke('shell:openPath', fullPath),
  requestMicrophoneAccess: () => ipcRenderer.invoke('media:requestMicrophoneAccess'),
  getAppVersion: () => appVersion,
  getPlatformLabel: () => getPlatformLabel(),
  onUpdateState: (callback: (state: { status: string; version: string | null; releaseUrl: string | null; downloadProgress: number | null; error: string | null; isLinuxFallback: boolean }) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, state: Parameters<typeof callback>[0]) => callback(state)
    ipcRenderer.on('update:state', handler)
    return () => { ipcRenderer.removeListener('update:state', handler) }
  },
  openReleaseUrl: (version: string) => ipcRenderer.invoke('update:open-release', version),
  checkForUpdatesNow: () => ipcRenderer.invoke('update:check-now'),
  restartAndInstall: () => ipcRenderer.invoke('update:restart-and-install') as Promise<{ blocked: boolean; activeChatCount: number }>,
  forceRestartAndInstall: () => ipcRenderer.invoke('update:force-restart'),
  openExternalUrl: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  onMenuOpenSettings: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('menu:open-settings', handler)
    return () => { ipcRenderer.removeListener('menu:open-settings', handler) }
  },
  reportError: (payload: { type: string; message: string; stack?: string; context?: Record<string, unknown> }) =>
    ipcRenderer.send('renderer:error', payload),
  logRendererEvent: (payload: { scope: string; event: string; level?: string; context?: Record<string, unknown> }) =>
    ipcRenderer.send('renderer:log', payload),
  setTelemetryEnabled: (enabled: boolean) => ipcRenderer.send('telemetry:set', enabled),
})
