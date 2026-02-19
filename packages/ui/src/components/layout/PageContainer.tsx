import type { ReactNode } from 'react'

interface PageContainerProps {
  children: ReactNode
  /** 'contained' = max-width + padding + center; 'full' = h-full no padding */
  variant?: 'contained' | 'full'
  /** Override max-width for contained variant, e.g. "1000px", "640px" */
  maxWidth?: string
  className?: string
}

export function PageContainer({ children, variant = 'contained', maxWidth, className }: PageContainerProps) {
  if (variant === 'full') {
    return <div className={`h-full ${className ?? ''}`}>{children}</div>
  }

  return (
    <div
      className={`mx-auto p-6 ${className ?? ''}`}
      style={{ maxWidth: maxWidth ?? '1400px' }}
    >
      {children}
    </div>
  )
}
