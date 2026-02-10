import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { type ServiceContainer, getServices, configureServices } from './container'
import { createMockServices } from './mock'

const ServiceContext = createContext<ServiceContainer | null>(null)

export function useServiceContext(): ServiceContainer {
  const ctx = useContext(ServiceContext)
  if (!ctx) throw new Error('useServiceContext must be used within ServiceProvider')
  return ctx
}

export function ServiceProvider({ children }: { children: ReactNode }) {
  const [container] = useState<ServiceContainer>(() => {
    // Initialize with mock services; swap for real services later
    const mock = createMockServices()
    configureServices(mock)
    return mock
  })

  return (
    <ServiceContext.Provider value={container}>
      {children}
    </ServiceContext.Provider>
  )
}
