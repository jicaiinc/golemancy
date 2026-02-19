interface ElectronAPI {
  getServerPort: () => number | null
  getServerBaseUrl: () => string | null
  getServerToken: () => string | null
  getInitialProjectId: () => string | null
  openNewWindow: (projectId?: string) => Promise<void>
  openPath: (fullPath: string) => Promise<string>
}

interface Window {
  electronAPI?: ElectronAPI
}
