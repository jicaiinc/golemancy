import { app } from 'electron'
import * as Sentry from '@sentry/electron/main'
import { readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const DEFAULT_DSN = 'https://40a6c050058adc35550b522da1e62b75@o4511115152457728.ingest.us.sentry.io/4511115772297216'

let telemetryEnabled = false

/**
 * Read telemetryEnabled from settings.json synchronously.
 * Called at startup before the server is running, so we must read the file directly.
 */
function readTelemetrySetting(): boolean {
  try {
    const dataDir = process.env.GOLEMANCY_DATA_DIR ?? join(homedir(), '.golemancy')
    const raw = readFileSync(join(dataDir, 'settings.json'), 'utf-8')
    const settings = JSON.parse(raw)
    return settings.telemetryEnabled !== false
  } catch {
    return true
  }
}

export function initSentry(): void {
  const forceSentry = !!process.env.GOLEMANCY_FORCE_SENTRY
  if (!app.isPackaged && !forceSentry) return

  telemetryEnabled = forceSentry || readTelemetrySetting()

  const dsn = process.env.SENTRY_DSN || DEFAULT_DSN

  Sentry.init({
    dsn,
    release: app.getVersion(),
    environment: app.isPackaged ? 'production' : 'development',
    beforeSend(event) {
      return telemetryEnabled ? event : null
    },
  })
}

/** Runtime toggle — called from IPC when user changes the setting */
export function setTelemetryEnabled(enabled: boolean): void {
  telemetryEnabled = enabled
}
