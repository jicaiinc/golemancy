import { logger } from '../logger'

const log = logger.child({ component: 'auth:token-refresh' })

/** Refresh 5 minutes before expiry, with a minimum interval of 1 minute. */
const REFRESH_BEFORE_EXPIRY_MS = 5 * 60 * 1000
const MIN_REFRESH_INTERVAL_MS = 60 * 1000

export class TokenRefreshScheduler {
  private timers = new Map<string, ReturnType<typeof setTimeout>>()

  /**
   * Schedule a token refresh for a provider.
   * Will fire `refreshFn` 5 minutes before `expiresAt`, or after 1 minute minimum.
   */
  scheduleRefresh(
    slug: string,
    expiresAt: string,
    refreshFn: () => Promise<void>,
  ): void {
    this.cancelRefresh(slug)

    const expiresMs = new Date(expiresAt).getTime()
    const now = Date.now()
    const delay = Math.max(
      expiresMs - now - REFRESH_BEFORE_EXPIRY_MS,
      MIN_REFRESH_INTERVAL_MS,
    )

    log.debug({ slug, delayMs: delay, expiresAt }, 'scheduling token refresh')

    const timer = setTimeout(async () => {
      this.timers.delete(slug)
      try {
        await refreshFn()
      } catch (err) {
        log.error({ slug, err }, 'scheduled token refresh failed')
      }
    }, delay)

    // Unref so the timer doesn't prevent Node from exiting
    timer.unref()
    this.timers.set(slug, timer)
  }

  /** Cancel a scheduled refresh for a provider. */
  cancelRefresh(slug: string): void {
    const timer = this.timers.get(slug)
    if (timer) {
      clearTimeout(timer)
      this.timers.delete(slug)
    }
  }

  /** Cancel all scheduled refreshes. */
  shutdown(): void {
    for (const [slug, timer] of this.timers) {
      clearTimeout(timer)
      log.debug({ slug }, 'cancelled token refresh timer on shutdown')
    }
    this.timers.clear()
  }
}
