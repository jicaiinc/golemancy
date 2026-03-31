import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query'
import { captureError } from '../lib/error-reporting'

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => captureError(error, { component: 'query' }),
  }),
  mutationCache: new MutationCache({
    onError: (error) => captureError(error, { component: 'mutation' }),
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (error && 'status' in error && (error as any).status >= 400 && (error as any).status < 500)
          return false
        return failureCount < 1
      },
    },
  },
})
