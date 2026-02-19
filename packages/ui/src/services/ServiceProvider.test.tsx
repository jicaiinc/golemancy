import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ServiceProvider, useServiceContext } from './ServiceProvider'
import { getServices } from './container'

// Mock the service factories
vi.mock('./mock', () => ({
  createMockServices: vi.fn(() => ({
    projects: { __type: 'mock' },
    agents: { __type: 'mock' },
    conversations: { __type: 'mock' },
    tasks: { __type: 'mock' },
    workspace: { __type: 'mock' },
    memory: { __type: 'mock' },
    settings: { __type: 'mock' },
    dashboard: { __type: 'mock' },
  })),
}))

vi.mock('./http', () => ({
  createHttpServices: vi.fn((baseUrl: string) => ({
    projects: { __type: 'http', baseUrl },
    agents: { __type: 'http', baseUrl },
    conversations: { __type: 'http', baseUrl },
    tasks: { __type: 'http', baseUrl },
    workspace: { __type: 'http', baseUrl },
    memory: { __type: 'http', baseUrl },
    settings: { __type: 'http', baseUrl },
    dashboard: { __type: 'http', baseUrl },
  })),
}))

vi.mock('./http/base', () => ({
  setAuthToken: vi.fn(),
  setBaseUrl: vi.fn(),
}))

// Helper component to read context and display the service type
function ServiceTypeReader() {
  const services = useServiceContext()
  const type = (services.projects as any).__type
  return <div data-testid="service-type">{type}</div>
}

describe('ServiceProvider', () => {
  const originalElectronAPI = (window as any).electronAPI

  beforeEach(() => {
    vi.clearAllMocks()
    // Clean up electronAPI before each test
    delete (window as any).electronAPI
  })

  afterEach(() => {
    // Restore original state
    if (originalElectronAPI) {
      (window as any).electronAPI = originalElectronAPI
    } else {
      delete (window as any).electronAPI
    }
  })

  it('creates Mock services when electronAPI is undefined', () => {
    // electronAPI is already deleted in beforeEach
    render(
      <ServiceProvider>
        <ServiceTypeReader />
      </ServiceProvider>
    )

    expect(screen.getByTestId('service-type')).toHaveTextContent('mock')
  })

  it('creates HTTP services when electronAPI returns baseUrl and token', async () => {
    ;(window as any).electronAPI = {
      getServerBaseUrl: () => 'http://localhost:3001',
      getServerToken: () => 'test-token-123',
      getServerPort: () => 3001,
    }

    const { setAuthToken, setBaseUrl } = await import('./http/base')

    render(
      <ServiceProvider>
        <ServiceTypeReader />
      </ServiceProvider>
    )

    expect(screen.getByTestId('service-type')).toHaveTextContent('http')
    expect(setAuthToken).toHaveBeenCalledWith('test-token-123')
    expect(setBaseUrl).toHaveBeenCalledWith('http://localhost:3001')
  })

  it('falls back to Mock services when electronAPI returns null baseUrl', () => {
    ;(window as any).electronAPI = {
      getServerBaseUrl: () => null,
      getServerToken: () => 'some-token',
      getServerPort: () => null,
    }

    render(
      <ServiceProvider>
        <ServiceTypeReader />
      </ServiceProvider>
    )

    expect(screen.getByTestId('service-type')).toHaveTextContent('mock')
  })

  it('falls back to Mock services when electronAPI returns null token', () => {
    ;(window as any).electronAPI = {
      getServerBaseUrl: () => 'http://localhost:3001',
      getServerToken: () => null,
      getServerPort: () => 3001,
    }

    render(
      <ServiceProvider>
        <ServiceTypeReader />
      </ServiceProvider>
    )

    expect(screen.getByTestId('service-type')).toHaveTextContent('mock')
  })

  it('configures module-level service container via configureServices', () => {
    render(
      <ServiceProvider>
        <ServiceTypeReader />
      </ServiceProvider>
    )

    // getServices() should not throw — container was configured
    const services = getServices()
    expect(services).toBeTruthy()
    expect((services.projects as any).__type).toBe('mock')
  })

  it('provides services via useServiceContext hook', () => {
    render(
      <ServiceProvider>
        <ServiceTypeReader />
      </ServiceProvider>
    )

    // If useServiceContext threw, the component wouldn't render
    expect(screen.getByTestId('service-type')).toBeInTheDocument()
  })

  it('throws when useServiceContext is used outside ServiceProvider', () => {
    // Suppress console.error for expected error boundary
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => render(<ServiceTypeReader />)).toThrow(
      'useServiceContext must be used within ServiceProvider'
    )

    spy.mockRestore()
  })
})
