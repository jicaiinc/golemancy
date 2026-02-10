import type { ReactNode } from 'react'
import { TopBar } from './TopBar'
import { StatusBar } from './StatusBar'
import { ProjectSidebar } from './ProjectSidebar'

interface AppShellProps {
  children: ReactNode
  topBarLeft?: ReactNode
  topBarRight?: ReactNode
  tokenUsage?: string
  activeAgents?: number
}

export function AppShell({
  children,
  topBarLeft,
  topBarRight,
  tokenUsage,
  activeAgents,
}: AppShellProps) {
  return (
    <div className="flex h-screen w-screen bg-void">
      <ProjectSidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <TopBar left={topBarLeft} right={topBarRight} />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
        <StatusBar tokenUsage={tokenUsage} activeAgents={activeAgents} />
      </div>
    </div>
  )
}
