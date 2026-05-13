// Minimal TFunction signature compatible with i18next's TFunction.
// Using a local type so this file has no runtime dependency on i18next
// until the package is installed and configured.
type TFunc = (key: string, options?: Record<string, unknown>) => string

/**
 * Returns a human-readable relative time string (e.g. "3m ago", "just now",
 * "in 5m"). Handles past times, future times, and null/missing values.
 *
 * @param date - ISO 8601 string, Date object, or null/undefined
 * @param t    - Optional i18next TFunction. When provided, uses common:time.*
 *               keys for i18n. Falls back to hardcoded English strings.
 */
export function relativeTime(date: Date | string | null | undefined, t?: TFunc): string {
  if (date == null) return t ? t('common:time.na') : '--'

  const diff = Date.now() - new Date(date).getTime()

  if (diff < 0) {
    // Future time
    const mins = Math.floor(-diff / 60_000)
    if (mins < 1) return t ? t('common:time.now') : 'now'
    if (mins < 60) return t ? t('common:time.inMins', { count: mins }) : `in ${mins}m`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return t ? t('common:time.inHours', { count: hours }) : `in ${hours}h`
    const days = Math.floor(hours / 24)
    return t ? t('common:time.inDays', { count: days }) : `in ${days}d`
  }

  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return t ? t('common:time.justNow') : 'just now'

  if (mins < 60) {
    return t ? t('common:time.minsAgo', { count: mins }) : `${mins}m ago`
  }

  const hours = Math.floor(mins / 60)
  if (hours < 24) {
    return t ? t('common:time.hoursAgo', { count: hours }) : `${hours}h ago`
  }

  const days = Math.floor(hours / 24)
  return t ? t('common:time.daysAgo', { count: days }) : `${days}d ago`
}
