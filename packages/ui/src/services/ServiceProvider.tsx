import { createContext, useContext, useState, type ReactNode } from 'react'
import { type ServiceContainer, configureServices } from './container'
import { createMockServices } from './mock'
import { createHttpServices } from './http'
import { setAuthToken, setBaseUrl } from './http/base'

const ServiceContext = createContext<ServiceContainer | null>(null)

export function useServiceContext(): ServiceContainer {
  const ctx = useContext(ServiceContext)
  if (!ctx) throw new Error('useServiceContext must be used within ServiceProvider')
  return ctx
}

function initServices(): ServiceContainer {
  const baseUrl = window.electronAPI?.getServerBaseUrl()
  const token = window.electronAPI?.getServerToken()

  if (baseUrl && token) {
    setAuthToken(token)
    setBaseUrl(baseUrl)
    const container = createHttpServices(baseUrl)
    configureServices(container)
    return container
  }

  // Fallback: mock services for dev without Electron or tests
  const mock = createMockServices()
  configureServices(mock)
  return mock
}

export function ServiceProvider({ children }: { children: ReactNode }) {
  const [container] = useState<ServiceContainer>(initServices)

  return (
    <ServiceContext.Provider value={container}>
      {children}
    </ServiceContext.Provider>
  )
}
