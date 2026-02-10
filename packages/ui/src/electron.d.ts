interface ElectronAPI {
  getServerPort: () => number | null
  getServerBaseUrl: () => string | null
  getServerToken: () => string | null
}

interface Window {
  electronAPI?: ElectronAPI
}
