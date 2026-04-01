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

/** Track a page view (sanitizes dynamic IDs from path) */
export function trackPageView(path: string): void {
  if (!_initialized || !_impl) return
  const sanitized = path.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    ':id',
  )
  _impl.capture(AnalyticsEvents.ROUTE_VIEWED, { route: sanitized })
}
