import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  })
}

export function TestQueryProvider({ children, client }: { children: ReactNode; client?: QueryClient }) {
  const qc = client ?? createTestQueryClient()
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}
