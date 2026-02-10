import '../styles/global.css'
import { ErrorBoundary } from '../components'
import { Providers } from './providers'
import { AppRoutes } from './routes'

export function App() {
  return (
    <ErrorBoundary>
      <Providers>
        <AppRoutes />
      </Providers>
    </ErrorBoundary>
  )
}
