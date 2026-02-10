import { useEffect, type ReactNode } from 'react'
import { ServiceProvider } from '../services'
import { useAppStore } from '../stores'

function DataLoader({ children }: { children: ReactNode }) {
  const loadProjects = useAppStore(s => s.loadProjects)
  const loadSettings = useAppStore(s => s.loadSettings)

  useEffect(() => {
    loadProjects()
    loadSettings()
  }, [loadProjects, loadSettings])

  return <>{children}</>
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ServiceProvider>
      <DataLoader>
        {children}
      </DataLoader>
    </ServiceProvider>
  )
}
