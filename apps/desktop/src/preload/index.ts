import { contextBridge, ipcRenderer } from 'electron'

const serverPortArg = process.argv.find(arg => arg.startsWith('--server-port='))
// S4: Guard against parseInt returning NaN
const parsedPort = serverPortArg ? parseInt(serverPortArg.split('=')[1], 10) : NaN
const serverPort = Number.isNaN(parsedPort) ? null : parsedPort

const serverTokenArg = process.argv.find(arg => arg.startsWith('--server-token='))
const serverToken = serverTokenArg ? serverTokenArg.split('=')[1] ?? null : null

const projectIdArg = process.argv.find(arg => arg.startsWith('--project-id='))
const initialProjectId = projectIdArg ? projectIdArg.split('=')[1] ?? null : null

// TODO [S-H-001]: getServerToken() exposes the raw auth token to the renderer process.
// Future improvement: replace getServerToken() + renderer-side fetch with an IPC-based
// fetchAPI(path, init) that injects the Bearer token inside preload, keeping the token
// invisible to renderer code. This would also allow enabling sandbox:true (S-M-001).
contextBridge.exposeInMainWorld('electronAPI', {
  getServerPort: () => serverPort,
  getServerBaseUrl: () => serverPort ? `http://localhost:${serverPort}` : null,
  getServerToken: () => serverToken,
  getInitialProjectId: () => initialProjectId,
  openNewWindow: (projectId?: string) => ipcRenderer.invoke('window:open', projectId),
})
