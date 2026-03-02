import { contextBridge, ipcRenderer } from 'electron'

const serverPortArg = process.argv.find(arg => arg.startsWith('--server-port='))
// S4: Guard against parseInt returning NaN
const parsedPort = serverPortArg ? parseInt(serverPortArg.split('=')[1], 10) : NaN
const serverPort = Number.isNaN(parsedPort) ? null : parsedPort

const serverTokenArg = process.argv.find(arg => arg.startsWith('--server-token='))
const serverToken = serverTokenArg ? serverTokenArg.split('=')[1] ?? null : null

const projectIdArg = process.argv.find(arg => arg.startsWith('--project-id='))
const initialProjectId = projectIdArg ? projectIdArg.split('=')[1] ?? null : null

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
  getServerBaseUrl: () => serverPort ? `http://localhost:${serverPort}` : null,
  getServerToken: () => serverToken,
  getInitialProjectId: () => initialProjectId,
  openNewWindow: (projectId?: string) => ipcRenderer.invoke('window:open', projectId),
  openPath: (fullPath: string) => ipcRenderer.invoke('shell:openPath', fullPath),
  requestMicrophoneAccess: () => ipcRenderer.invoke('media:requestMicrophoneAccess'),
  getAppVersion: () => appVersion,
  getPlatformLabel: () => getPlatformLabel(),
  onUpdateAvailable: (callback: (info: { version: string; downloadUrl: string }) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, info: { version: string; downloadUrl: string }) => callback(info)
    ipcRenderer.on('update:available', handler)
    return () => { ipcRenderer.removeListener('update:available', handler) }
  },
  openDownloadUrl: (url: string) => ipcRenderer.invoke('update:open-download', url),
})
