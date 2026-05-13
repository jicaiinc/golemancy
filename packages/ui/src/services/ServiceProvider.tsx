import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { type ServiceContainer, configureServices } from './container'
import { createHttpServices } from './http'
import { setAuthToken, setBaseUrl } from './http/base'
import { useAppStore } from '../stores'
import { logBootstrapEvent } from '../lib/bootstrap-logging'

const ServiceContext = createContext<ServiceContainer | null>(null)

export function useServiceContext(): ServiceContainer {
  const ctx = useContext(ServiceContext)
  if (!ctx) throw new Error('useServiceContext must be used within ServiceProvider')
  return ctx
}

function initServices(): ServiceContainer {
  const baseUrl = window.electronAPI?.getServerBaseUrl()
  const token = window.electronAPI?.getServerToken()
  const port = window.electronAPI?.getServerPort?.() ?? null

  logBootstrapEvent('initServices.start', {
    baseUrl,
    hasToken: !!token,
    port,
  })

  if (!baseUrl || !token) {
    logBootstrapEvent('initServices.error', {
      baseUrl,
      hasToken: !!token,
      port,
    }, 'error')
    throw new Error('Server connection unavailable: missing baseUrl or token from Electron')
  }

  setAuthToken(token)
  setBaseUrl(baseUrl)
  const container = createHttpServices(baseUrl)
  configureServices(container)
  logBootstrapEvent('initServices.ready', { baseUrl, port })
  return container
}

export function ServiceProvider({ children }: { children: ReactNode }) {
  const [container] = useState<ServiceContainer>(initServices)

  useEffect(() => {
    const cleanup = window.electronAPI?.onUpdateState?.((state) => {
      useAppStore.getState().setUpdateState(state)
    })
    return () => cleanup?.()
  }, [])

  return (
    <ServiceContext.Provider value={container}>
      {children}
    </ServiceContext.Provider>
  )
}
