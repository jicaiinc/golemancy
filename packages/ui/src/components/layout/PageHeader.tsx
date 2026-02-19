import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  subtitle?: ReactNode
  /** Right-side action buttons */
  actions?: ReactNode
  /** Show a back button; provide an onClick handler */
  onBack?: () => void
}

export function PageHeader({ title, subtitle, actions, onBack }: PageHeaderProps) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="font-mono text-[12px] text-text-dim hover:text-text-secondary cursor-pointer"
            >
              ←
            </button>
          )}
          <h1 className="font-pixel text-[14px] text-text-primary">{title}</h1>
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {subtitle && (
        <p className="text-[12px] text-text-secondary mt-1">{subtitle}</p>
      )}
    </div>
  )
}
