import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // API methods will be added here
})
