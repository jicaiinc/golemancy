import type { ReactNode } from 'react'
import { TopBar } from './TopBar'
import { ProjectSidebar } from './ProjectSidebar'
import { useAppStore } from '../../stores'

interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const currentProject = useAppStore(s => s.projects.find(p => p.id === s.currentProjectId))

  return (
    <div data-testid="app-shell" className="flex flex-col h-screen w-full bg-void">
      {/* Header — full width, above everything */}
      <TopBar
        center={
          currentProject && (
            <span className="font-pixel text-[11px] text-accent-cyan truncate">
              {currentProject.name}
            </span>
          )
        }
      />
      {/* Sidebar + Content */}
      <div className="flex flex-1 min-h-0">
        <ProjectSidebar />
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  )
}
