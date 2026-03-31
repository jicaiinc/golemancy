interface UpdateState {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error'
  version: string | null
  releaseUrl: string | null
  downloadProgress: number | null
  error: string | null
  isLinuxFallback: boolean
}

interface ElectronAPI {
  getServerPort: () => number | null
  getServerBaseUrl: () => string | null
  getServerToken: () => string | null
  getLaunchId?: () => string | null
  openNewWindow: (projectId?: string) => Promise<void>
  openPath: (fullPath: string) => Promise<string>
  requestMicrophoneAccess: () => Promise<string>
  getAppVersion: () => string | null
  getPlatformLabel: () => string | null
  onUpdateState: (callback: (state: UpdateState) => void) => () => void
  openReleaseUrl: (version: string) => Promise<void>
  checkForUpdatesNow: () => Promise<void>
  restartAndInstall: () => Promise<{ blocked: boolean; activeChatCount: number }>
  forceRestartAndInstall: () => Promise<void>
  openExternalUrl: (url: string) => Promise<void>
  onMenuOpenSettings: (callback: () => void) => () => void
  reportError: (payload: { type: string; message: string; stack?: string; context?: Record<string, unknown> }) => void
  logRendererEvent?: (payload: { scope: string; event: string; level?: string; context?: Record<string, unknown> }) => void
  setTelemetryEnabled: (enabled: boolean) => void
}

interface Window {
  electronAPI?: ElectronAPI
}
