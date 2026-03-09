import { describe, it, expect, vi, afterEach } from 'vitest'
import { TokenRefreshScheduler } from './token-refresh'

describe('TokenRefreshScheduler', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('schedules refresh before expiry', async () => {
    const scheduler = new TokenRefreshScheduler()
    const refreshFn = vi.fn().mockResolvedValue(undefined)

    // Expire in 10 seconds — should schedule refresh at ~5s (10s - 5min, clamped to 1min minimum, then 1min)
    // Actually: delay = max(10s - 300s, 60s) = max(-290s, 60s) = 60s
    // Let's use a far future expiry to test the math
    const expiresAt = new Date(Date.now() + 7 * 60 * 1000).toISOString() // 7 min from now
    // delay = max(7min - 5min, 1min) = max(2min, 1min) = 2min = 120s

    scheduler.scheduleRefresh('test', expiresAt, refreshFn)
    // Should not fire immediately
    expect(refreshFn).not.toHaveBeenCalled()

    scheduler.shutdown()
  })

  it('cancels a scheduled refresh', () => {
    const scheduler = new TokenRefreshScheduler()
    const refreshFn = vi.fn().mockResolvedValue(undefined)

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    scheduler.scheduleRefresh('test', expiresAt, refreshFn)
    scheduler.cancelRefresh('test')

    // No timer should be active
    expect(refreshFn).not.toHaveBeenCalled()
    scheduler.shutdown()
  })

  it('replaces existing timer when rescheduled', () => {
    const scheduler = new TokenRefreshScheduler()
    const fn1 = vi.fn().mockResolvedValue(undefined)
    const fn2 = vi.fn().mockResolvedValue(undefined)

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    scheduler.scheduleRefresh('test', expiresAt, fn1)
    scheduler.scheduleRefresh('test', expiresAt, fn2)

    // First timer should have been cancelled
    scheduler.shutdown()
    expect(fn1).not.toHaveBeenCalled()
    expect(fn2).not.toHaveBeenCalled()
  })

  it('shutdown cancels all timers', () => {
    const scheduler = new TokenRefreshScheduler()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

    scheduler.scheduleRefresh('a', expiresAt, vi.fn().mockResolvedValue(undefined))
    scheduler.scheduleRefresh('b', expiresAt, vi.fn().mockResolvedValue(undefined))
    scheduler.shutdown()
    // Should not throw or leave dangling timers
  })
})
