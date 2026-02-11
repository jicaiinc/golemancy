import type { ReactNode } from 'react'

interface TopBarProps {
  left?: ReactNode
  right?: ReactNode
}

export function TopBar({ left, right }: TopBarProps) {
  return (
    <header data-testid="top-bar" className="h-12 shrink-0 flex items-center justify-between px-4 bg-deep border-b-2 border-border-dim">
      <div className="flex items-center gap-3">
        {left}
      </div>
      <div className="flex items-center gap-2">
        {right}
      </div>
    </header>
  )
}
