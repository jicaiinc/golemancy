import http from 'node:http'
import { logger } from '../logger'

const log = logger.child({ component: 'auth:callback-server' })

const CALLBACK_PORT = 1455
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes
const PORT_RETRY_DELAY_MS = 200
const PORT_MAX_RETRIES = 10

const SUCCESS_HTML = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Golemancy</title>
<style>
  body { background: #0B0E14; color: #E8ECF1; font-family: monospace;
         display: flex; align-items: center; justify-content: center;
         min-height: 100vh; margin: 0; }
  .box { text-align: center; border: 2px solid #2A3040; padding: 32px;
         background: #131824; box-shadow: 4px 4px 0 0 rgba(0,0,0,0.4); }
  h1 { font-size: 14px; color: #6BCB77; margin-bottom: 8px; }
  p { font-size: 12px; color: #A0AAB8; }
</style></head><body>
<div class="box">
  <h1>Authentication successful!</h1>
  <p>You can close this tab and return to Golemancy.</p>
</div></body></html>`

/**
 * Attempt to cancel an existing server on the callback port by sending GET /cancel.
 * Returns true if the request succeeded (port may now be free).
 */
async function tryCancelExistingServer(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: '127.0.0.1', port: CALLBACK_PORT, path: '/cancel', method: 'GET', timeout: 2000 },
      (res) => {
        res.resume()
        resolve(res.statusCode === 200)
      },
    )
    req.on('error', () => resolve(false))
    req.on('timeout', () => { req.destroy(); resolve(false) })
    req.end()
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export interface CallbackServerResult {
  promise: Promise<{ code: string }>
  close: () => void
}

/**
 * Start a temporary HTTP server on port 1455 to receive the OAuth callback.
 *
 * - Handles `GET /auth/callback?code=...&state=...`
 * - Validates `state` parameter matches `expectedState`
 * - Returns a pixel-art success page
 * - Handles `GET /cancel` to allow port reuse (Codex CLI compatibility)
 * - Auto-closes after `timeoutMs` (default 5 minutes)
 */
export function startCallbackServer(
  expectedState: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): CallbackServerResult {
  let server: http.Server | null = null
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null
  let settled = false

  let resolve: (value: { code: string }) => void = () => {}
  let reject: (reason: unknown) => void = () => {}
  const promise = new Promise<{ code: string }>((res, rej) => {
    resolve = res
    reject = rej
  })

  function cleanup() {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle)
      timeoutHandle = null
    }
    if (server) {
      server.close()
      server = null
    }
  }

  function close() {
    if (!settled) {
      settled = true
      cleanup()
      reject(new Error('OAuth flow cancelled'))
    }
  }

  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${CALLBACK_PORT}`)

    // Handle cancel request (Codex CLI compatibility)
    if (url.pathname === '/cancel') {
      log.info('received /cancel request, shutting down callback server')
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end('cancelled')
      if (!settled) {
        settled = true
        cleanup()
        reject(new Error('OAuth flow cancelled by another process'))
      }
      return
    }

    if (url.pathname !== '/auth/callback' || req.method !== 'GET') {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('Not Found')
      return
    }

    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    const error = url.searchParams.get('error')

    if (error) {
      res.writeHead(400, { 'Content-Type': 'text/plain' })
      res.end(`Authentication error: ${error}`)
      if (!settled) {
        settled = true
        cleanup()
        reject(new Error(`OAuth error: ${error}`))
      }
      return
    }

    if (!code || !state) {
      res.writeHead(400, { 'Content-Type': 'text/plain' })
      res.end('Missing code or state parameter')
      return
    }

    if (state !== expectedState) {
      log.warn('OAuth state mismatch — possible CSRF')
      res.writeHead(400, { 'Content-Type': 'text/plain' })
      res.end('State mismatch')
      return
    }

    // Success — return HTML page and resolve
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(SUCCESS_HTML)

    if (!settled) {
      settled = true
      cleanup()
      resolve({ code })
    }
  })

  // Timeout auto-close
  timeoutHandle = setTimeout(() => {
    if (!settled) {
      settled = true
      cleanup()
      reject(new Error('OAuth flow timed out (5 minutes)'))
    }
  }, timeoutMs)

  // Bind with retry logic (matching Codex CLI behavior)
  const bindWithRetry = async () => {
    for (let attempt = 0; attempt < PORT_MAX_RETRIES; attempt++) {
      try {
        await new Promise<void>((res, rej) => {
          server!.once('error', rej)
          server!.listen(CALLBACK_PORT, '127.0.0.1', () => {
            server!.removeListener('error', rej)
            res()
          })
        })
        log.info({ port: CALLBACK_PORT }, 'OAuth callback server listening')
        return
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
          if (attempt === 0) {
            log.info('port 1455 in use, sending /cancel to existing server')
            await tryCancelExistingServer()
          }
          log.debug({ attempt: attempt + 1 }, 'retrying port bind')
          await sleep(PORT_RETRY_DELAY_MS)
        } else {
          throw err
        }
      }
    }
    if (!settled) {
      settled = true
      cleanup()
      reject(new Error(`Port ${CALLBACK_PORT} is already in use. Close the application using it and try again.`))
    }
  }

  bindWithRetry().catch((err) => {
    if (!settled) {
      settled = true
      cleanup()
      reject(err)
    }
  })

  return { promise, close }
}
