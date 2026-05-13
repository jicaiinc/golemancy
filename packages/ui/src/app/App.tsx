import '@fontsource/press-start-2p'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/600.css'
import '@fontsource/jetbrains-mono/700.css'
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
