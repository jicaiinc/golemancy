type CaptureErrorFn = (error: Error, context?: Record<string, unknown>) => void

let _capture: CaptureErrorFn | null = null

/** Inject the actual error capture implementation (called by renderer entry) */
export function setErrorCapture(fn: CaptureErrorFn): void {
  _capture = fn
}

/** Report a caught error (Sentry + local log). Call this in catch blocks. */
export function captureError(error: unknown, context?: Record<string, unknown>): void {
  const err = error instanceof Error ? error : new Error(String(error))
  console.error(err)
  window.electronAPI?.reportError({
    type: 'captured',
    message: err.message,
    stack: err.stack,
  })
  _capture?.(err, context)
}
