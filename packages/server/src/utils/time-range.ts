import type { TimeRange } from '@golemancy/shared'

/** Local date string (YYYY-MM-DD) using system timezone. */
export function toLocalDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Local midnight expressed as UTC ISO string, for comparing against UTC-stored timestamps. */
export function localMidnightIso(d: Date = new Date()): string {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString()
}

/**
 * Convert a TimeRange enum to a UTC ISO boundary for filtering.
 * Uses local midnight so "today" means "since midnight local time".
 * Returns undefined for 'all' (no filtering).
 */
export function timeRangeToDate(range?: TimeRange): string | undefined {
  if (!range || range === 'all') return undefined
  const now = new Date()
  switch (range) {
    case 'today':
      return localMidnightIso(now)
    case '7d': {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7)
      return d.toISOString()
    }
    case '30d': {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30)
      return d.toISOString()
    }
  }
}

export function parseTimeRange(raw?: string): TimeRange | undefined {
  if (raw === 'today' || raw === '7d' || raw === '30d' || raw === 'all') return raw
  return undefined
}
