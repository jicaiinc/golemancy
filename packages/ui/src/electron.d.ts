interface ElectronAPI {
  getServerPort: () => number | null
  getServerBaseUrl: () => string | null
  getServerToken: () => string | null
  getInitialProjectId: () => string | null
  openNewWindow: (projectId?: string) => Promise<void>
  openPath: (fullPath: string) => Promise<string>
  requestMicrophoneAccess: () => Promise<string>
  getAppVersion: () => string | null
  getPlatformLabel: () => string | null
  onUpdateAvailable: (callback: (info: { version: string; downloadUrl: string }) => void) => () => void
  openDownloadUrl: (url: string) => Promise<void>
}

interface Window {
  electronAPI?: ElectronAPI
}
