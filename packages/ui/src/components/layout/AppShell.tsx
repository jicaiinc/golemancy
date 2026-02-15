import type { ReactNode } from 'react'
import { TopBar } from './TopBar'
import { ProjectSidebar } from './ProjectSidebar'

interface AppShellProps {
  children: ReactNode
  topBarLeft?: ReactNode
  topBarRight?: ReactNode
}

export function AppShell({
  children,
  topBarLeft,
  topBarRight,
}: AppShellProps) {
  return (
    <div data-testid="app-shell" className="flex h-screen w-full bg-void">
      <ProjectSidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <TopBar left={topBarLeft} right={topBarRight} />
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  )
}
