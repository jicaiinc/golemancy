interface ElectronAPI {
  getServerPort: () => number | null
  getServerBaseUrl: () => string | null
  getServerToken: () => string | null
  getInitialProjectId: () => string | null
  openNewWindow: (projectId?: string) => Promise<void>
}

interface Window {
  electronAPI?: ElectronAPI
}
