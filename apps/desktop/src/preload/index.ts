import { contextBridge, ipcRenderer } from 'electron'

const serverPortArg = process.argv.find(arg => arg.startsWith('--server-port='))
// S4: Guard against parseInt returning NaN
const parsedPort = serverPortArg ? parseInt(serverPortArg.split('=')[1], 10) : NaN
const serverPort = Number.isNaN(parsedPort) ? null : parsedPort

const serverTokenArg = process.argv.find(arg => arg.startsWith('--server-token='))
const serverToken = serverTokenArg ? serverTokenArg.split('=')[1] ?? null : null

const projectIdArg = process.argv.find(arg => arg.startsWith('--project-id='))
const initialProjectId = projectIdArg ? projectIdArg.split('=')[1] ?? null : null

contextBridge.exposeInMainWorld('electronAPI', {
  getServerPort: () => serverPort,
  getServerBaseUrl: () => serverPort ? `http://localhost:${serverPort}` : null,
  getServerToken: () => serverToken,
  getInitialProjectId: () => initialProjectId,
  openNewWindow: (projectId?: string) => ipcRenderer.invoke('window:open', projectId),
  openPath: (fullPath: string) => ipcRenderer.invoke('shell:openPath', fullPath),
  requestMicrophoneAccess: () => ipcRenderer.invoke('media:requestMicrophoneAccess'),
})
