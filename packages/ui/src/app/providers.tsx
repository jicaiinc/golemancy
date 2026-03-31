import { useEffect, type ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { ServiceProvider } from '../services'
import { WebSocketProvider } from '../providers/WebSocketProvider'
import { queryClient } from '../queries/query-client'
import { useAppStore } from '../stores'
import { captureError } from '../lib/error-reporting'

function DataLoader({ children }: { children: ReactNode }) {
  const loadProjects = useAppStore(s => s.loadProjects)
  const loadSettings = useAppStore(s => s.loadSettings)

  useEffect(() => {
    loadProjects()
    loadSettings()
  }, [loadProjects, loadSettings])

  // Bootstrap stall detection: if not ready after 15s, report to Sentry
  // so all [bootstrap] breadcrumbs are captured for diagnosis.
  // Only fires when still waiting (pending) — known errors are already reported by captureError.
  useEffect(() => {
    const timer = setTimeout(() => {
      const { settings, settingsError, projectsLoading, projectsError } = useAppStore.getState()
      const isPending = (!settings && !settingsError) || (projectsLoading && !projectsError)
      if (isPending) {
        captureError(new Error('Bootstrap stalled: UI not ready after 15s'), {
          component: 'DataLoader',
          hasSettings: !!settings,
          settingsError,
          projectsLoading,
          projectsError,
        })
      }
    }, 15_000)
    return () => clearTimeout(timer)
  }, [])

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
