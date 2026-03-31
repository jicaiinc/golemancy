type RendererLogLevel = 'info' | 'warning' | 'error'

export function logBootstrapEvent(
  event: string,
  context?: Record<string, unknown>,
  level: RendererLogLevel = 'info',
): void {
  const api = window.electronAPI
  const mergedContext = {
    launchId: api?.getLaunchId?.() ?? null,
    serverPort: api?.getServerPort?.() ?? null,
    hasBaseUrl: !!api?.getServerBaseUrl?.(),
    hasToken: !!api?.getServerToken?.(),
    routeHash: window.location.hash || '#/',
    ...context,
  }

  if (level === 'error') {
    console.error('[bootstrap]', event, mergedContext)
  } else if (level === 'warning') {
    console.warn('[bootstrap]', event, mergedContext)
  } else {
    console.info('[bootstrap]', event, mergedContext)
  }

  api?.logRendererEvent?.({
    scope: 'bootstrap',
    event,
    level,
    context: mergedContext,
  })
}
