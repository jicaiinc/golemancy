import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { PixelButton } from '../../components'

interface GlobalLayoutProps {
  children: ReactNode
  title: string
  actions?: ReactNode
  showBack?: boolean
  backLabel?: string
}

export function GlobalLayout({ children, title, actions, showBack, backLabel = 'Back' }: GlobalLayoutProps) {
  const navigate = useNavigate()

  return (
    <div className="h-screen flex flex-col bg-void">
      {/* Header */}
      <header className="h-12 shrink-0 bg-deep border-b-2 border-border-dim flex items-center px-4 gap-3">
        {showBack && (
          <PixelButton variant="ghost" size="sm" onClick={() => navigate('/')}>
            &larr; {backLabel}
          </PixelButton>
        )}
        <h1 className="font-pixel text-[14px] text-accent-green">{title}</h1>
        {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {children}
      </div>
    </div>
  )
}
