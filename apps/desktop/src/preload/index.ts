import { contextBridge } from 'electron'

const serverPortArg = process.argv.find(arg => arg.startsWith('--server-port='))
const serverPort = serverPortArg ? parseInt(serverPortArg.split('=')[1], 10) : null

contextBridge.exposeInMainWorld('electronAPI', {
  getServerPort: () => serverPort,
  getServerBaseUrl: () => serverPort ? `http://localhost:${serverPort}` : null,
})
