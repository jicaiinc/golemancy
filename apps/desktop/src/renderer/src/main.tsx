import React from 'react'
import ReactDOM from 'react-dom/client'
import * as Sentry from '@sentry/electron/renderer'
import { setErrorCapture } from '@golemancy/ui/lib/error-reporting'
import { App } from '@golemancy/ui'

Sentry.init()

setErrorCapture((error, context) => {
  Sentry.captureException(error, { extra: context })
})

window.onerror = (_msg, _src, _line, _col, error) => {
  window.electronAPI?.reportError({
    type: 'window.onerror',
    message: error?.message ?? String(_msg),
    stack: error?.stack,
  })
}
window.addEventListener('unhandledrejection', (event) => {
  const r = event.reason
  window.electronAPI?.reportError({
    type: 'unhandledrejection',
    message: r instanceof Error ? r.message : String(r),
    stack: r instanceof Error ? r.stack : undefined,
  })
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
