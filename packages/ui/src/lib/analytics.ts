import type { AnalyticsEventName } from '@golemancy/shared'
import { AnalyticsEvents } from '@golemancy/shared'

interface AnalyticsImpl {
  init(token: string, config: object): void
  capture(event: string, properties?: Record<string, unknown>): void
  identify(distinctId: string, properties?: Record<string, unknown>): void
  opt_in_capturing(): void
  opt_out_capturing(): void
  reset(): void
  register(properties: Record<string, unknown>): void
}

let _impl: AnalyticsImpl | null = null
let _initialized = false

const PROPERTY_DENYLIST = [
  'content', 'text', 'prompt', 'apiKey', 'baseUrl', 'path', 'instruction',
  'title', 'message', 'systemPrompt', 'description', 'name',
  'refreshToken', 'accessToken', 'password', 'secret',
]

/** Inject the PostHog instance (called by renderer entry, before init) */
export function setAnalyticsImpl(impl: AnalyticsImpl): void {
  _impl = impl
}

/** Initialize PostHog with project key and distinct ID (idempotent) */
export function initAnalytics(token: string, distinctId: string): void {
  if (_initialized || !_impl) return
  _impl.init(token, {
    api_host: 'https://us.i.posthog.com',
    persistence: 'localStorage',
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    mask_all_text: true,
    mask_all_element_attributes: true,
    person_profiles: 'identified_only',
    opt_out_capturing_by_default: true,
    property_denylist: PROPERTY_DENYLIST,
    // Reduce network traffic: flush every 5s (max allowed, default 3s)
    request_queue_config: { flush_interval_ms: 5000 },
  })
  _impl.identify(distinctId)
  _initialized = true
}

/** Toggle analytics consent */
export function setAnalyticsEnabled(enabled: boolean): void {
  if (!_initialized || !_impl) return
  if (enabled) _impl.opt_in_capturing()
  else _impl.opt_out_capturing()
}

/** Register static super properties */
export function setAnalyticsContext(properties: Record<string, unknown>): void {
  if (!_initialized || !_impl) return
  _impl.register(properties)
}

/** Track a named event */
export function trackEvent(event: AnalyticsEventName, properties?: Record<string, unknown>): void {
  if (!_initialized || !_impl) return
  _impl.capture(event, properties)
}

// ── Daily active heartbeat ─────────────────────────────────────────
// Sends one `app_active` event per calendar day when the app is visible.
// Ensures accurate DAU tracking even for long-running desktop apps.

let _lastActiveDate = ''

export function startDailyActiveTracking(): void {
  _checkDailyActive()
  document.addEventListener('visibilitychange', _checkDailyActive)
  setInterval(_checkDailyActive, 30 * 60 * 1000)
}

function _checkDailyActive(): void {
  if (!_initialized || !_impl) return
  if (document.visibilityState !== 'visible') return
  const today = new Date().toISOString().slice(0, 10)
  if (today === _lastActiveDate) return
  _lastActiveDate = today
  _impl.capture(AnalyticsEvents.APP_ACTIVE)
}

/** Track a page view (sanitizes dynamic IDs from path) */
export function trackPageView(path: string): void {
  if (!_initialized || !_impl) return
  const sanitized = path.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    ':id',
  )
  _impl.capture(AnalyticsEvents.ROUTE_VIEWED, { route: sanitized })
}
