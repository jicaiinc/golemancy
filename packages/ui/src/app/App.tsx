import '../styles/global.css'
import '../i18n/config'
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
