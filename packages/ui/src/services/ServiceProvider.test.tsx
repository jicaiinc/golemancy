import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ServiceProvider, useServiceContext } from './ServiceProvider'
import { getServices } from './container'

vi.mock('./http', () => ({
  createHttpServices: vi.fn((baseUrl: string) => ({
    projects: { __type: 'http', baseUrl },
    agents: { __type: 'http', baseUrl },
    conversations: { __type: 'http', baseUrl },
    tasks: { __type: 'http', baseUrl },
    workspace: { __type: 'http', baseUrl },
    settings: { __type: 'http', baseUrl },
    dashboard: { __type: 'http', baseUrl },
    globalDashboard: { __type: 'http', baseUrl },
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

function setupElectronAPI(baseUrl: string | null = 'http://127.0.0.1:3001', token: string | null = 'test-token') {
  ;(window as any).electronAPI = {
    getServerBaseUrl: () => baseUrl,
    getServerToken: () => token,
    getServerPort: () => baseUrl ? 3001 : null,
  }
}

describe('ServiceProvider', () => {
  const originalElectronAPI = (window as any).electronAPI

  beforeEach(() => {
    vi.clearAllMocks()
    delete (window as any).electronAPI
  })

  afterEach(() => {
    if (originalElectronAPI) {
      (window as any).electronAPI = originalElectronAPI
    } else {
      delete (window as any).electronAPI
    }
  })

  it('throws when electronAPI is undefined', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(
      <ServiceProvider><ServiceTypeReader /></ServiceProvider>,
    )).toThrow('Server connection unavailable')
    spy.mockRestore()
  })

  it('throws when electronAPI returns null baseUrl', () => {
    setupElectronAPI(null, 'some-token')
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(
      <ServiceProvider><ServiceTypeReader /></ServiceProvider>,
    )).toThrow('Server connection unavailable')
    spy.mockRestore()
  })

  it('throws when electronAPI returns null token', () => {
    setupElectronAPI('http://127.0.0.1:3001', null)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(
      <ServiceProvider><ServiceTypeReader /></ServiceProvider>,
    )).toThrow('Server connection unavailable')
    spy.mockRestore()
  })

  it('creates HTTP services when electronAPI returns baseUrl and token', async () => {
    setupElectronAPI('http://127.0.0.1:3001', 'test-token-123')

    const { setAuthToken, setBaseUrl } = await import('./http/base')

    render(
      <ServiceProvider>
        <ServiceTypeReader />
      </ServiceProvider>,
    )

    expect(screen.getByTestId('service-type')).toHaveTextContent('http')
    expect(setAuthToken).toHaveBeenCalledWith('test-token-123')
    expect(setBaseUrl).toHaveBeenCalledWith('http://127.0.0.1:3001')
  })

  it('configures module-level service container via configureServices', () => {
    setupElectronAPI()

    render(
      <ServiceProvider>
        <ServiceTypeReader />
      </ServiceProvider>,
    )

    const services = getServices()
    expect(services).toBeTruthy()
    expect((services.projects as any).__type).toBe('http')
  })

  it('provides services via useServiceContext hook', () => {
    setupElectronAPI()

    render(
      <ServiceProvider>
        <ServiceTypeReader />
      </ServiceProvider>,
    )

    expect(screen.getByTestId('service-type')).toBeInTheDocument()
  })

  it('throws when useServiceContext is used outside ServiceProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => render(<ServiceTypeReader />)).toThrow(
      'useServiceContext must be used within ServiceProvider',
    )

    spy.mockRestore()
  })
})
