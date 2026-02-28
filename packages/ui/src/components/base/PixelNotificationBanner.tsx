import type { ReactNode } from 'react'

type Severity = 'error' | 'warning' | 'info' | 'success'

interface PixelNotificationBannerProps {
  severity: Severity
  onDismiss?: () => void
  children: ReactNode
}

const severityClasses: Record<Severity, string> = {
  error: 'border-accent-red/40 bg-accent-red/10 text-accent-red',
  warning: 'border-accent-amber/40 bg-accent-amber/10 text-accent-amber',
  info: 'border-accent-blue/40 bg-accent-blue/10 text-accent-blue',
  success: 'border-accent-green/40 bg-accent-green/10 text-accent-green',
}

const dismissClasses: Record<Severity, string> = {
  error: 'hover:bg-accent-red/20',
  warning: 'hover:bg-accent-amber/20',
  info: 'hover:bg-accent-blue/20',
  success: 'hover:bg-accent-green/20',
}

export function PixelNotificationBanner({ severity, onDismiss, children }: PixelNotificationBannerProps) {
  return (
    <div
      role="alert"
      className={`px-4 py-2 border-b-2 flex items-center justify-between gap-2 ${severityClasses[severity]}`}
    >
      <p className="text-[12px] font-mono min-w-0 break-words">{children}</p>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className={`shrink-0 px-1 py-0.5 text-[12px] font-mono hover:text-text-primary ${dismissClasses[severity]} transition-colors cursor-pointer`}
          title="Dismiss"
        >
          [x]
        </button>
      )}
    </div>
  )
}
