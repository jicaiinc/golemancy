import type { ReactNode } from 'react'
import { GlobalNavDropdown } from './GlobalNavDropdown'

interface TopBarProps {
  center?: ReactNode
  right?: ReactNode
}

export function TopBar({ center, right }: TopBarProps) {
  return (
    <header data-testid="top-bar" className="h-12 shrink-0 flex items-center px-4 bg-deep border-b-2 border-border-dim">
      {/* Left: App branding */}
      <div className="flex items-center gap-3 shrink-0">
        <span className="font-pixel text-[14px] text-accent-green">Golemancy</span>
      </div>

      {/* Center: optional content (e.g. project name) */}
      <div className="flex-1 flex items-center justify-center min-w-0">
        {center}
      </div>

      {/* Right: custom actions + nav dropdown */}
      <div className="flex items-center gap-2 shrink-0">
        {right}
        <GlobalNavDropdown />
      </div>
    </header>
  )
}
