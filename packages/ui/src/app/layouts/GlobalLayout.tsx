import type { ReactNode } from 'react'
import { TopBar } from '../../components/layout/TopBar'

interface GlobalLayoutProps {
  children: ReactNode
}

export function GlobalLayout({ children }: GlobalLayoutProps) {
  return (
    <div className="h-screen flex flex-col bg-void">
      <TopBar />
      <div className="flex-1 overflow-auto">
        {children}
      </div>
    </div>
  )
}
