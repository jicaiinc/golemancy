import { useEffect, type ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { ServiceProvider } from '../services'
import { WebSocketProvider } from '../providers/WebSocketProvider'
import { queryClient } from '../queries/query-client'
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
      <QueryClientProvider client={queryClient}>
        <WebSocketProvider>
          <DataLoader>
            {children}
          </DataLoader>
        </WebSocketProvider>
      </QueryClientProvider>
    </ServiceProvider>
  )
}
