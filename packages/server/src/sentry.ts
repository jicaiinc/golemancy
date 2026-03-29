import * as Sentry from '@sentry/node'

let initialized = false
let telemetryEnabled = false

/**
 * Initialize Sentry for the server process.
 * Configuration is passed via environment variables from the Electron main process:
 *   SENTRY_DSN, GOLEMANCY_VERSION, GOLEMANCY_TELEMETRY_ENABLED
 *
 * Also listens for IPC messages from the main process to toggle telemetry at runtime.
 */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN
  if (!dsn) return

  telemetryEnabled = process.env.GOLEMANCY_TELEMETRY_ENABLED !== 'false'

  Sentry.init({
    dsn,
    release: process.env.GOLEMANCY_VERSION,
    environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    integrations(defaults) {
      return defaults.filter(i =>
        i.name !== 'OnUncaughtException' && i.name !== 'OnUnhandledRejection',
      )
    },
    beforeSend(event) {
      return telemetryEnabled ? event : null
    },
  })

  initialized = true

  // Listen for telemetry toggle from Electron main process via IPC
  process.on('message', (msg: unknown) => {
    const m = msg as Record<string, unknown> | null
    if (m?.type === 'telemetry-toggle') {
      telemetryEnabled = !!m.enabled
    }
  })
}

/** Report an exception to Sentry (no-op if not initialized) */
export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!initialized) return
  Sentry.captureException(err, context ? { extra: context } : undefined)
}

/** Report a message to Sentry (no-op if not initialized) */
export function captureMessage(message: string, context?: Record<string, unknown>): void {
  if (!initialized) return
  Sentry.captureMessage(message, { extra: context })
}

/** Flush pending events (call before process.exit) */
export async function flush(timeout = 2000): Promise<void> {
  if (!initialized) return
  await Sentry.flush(timeout)
}
