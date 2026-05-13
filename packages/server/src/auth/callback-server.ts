import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { logger } from '../logger'

const log = logger.child({ component: 'auth:callback-server' })

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes
const PORT_RETRY_DELAY_MS = 200
const PORT_MAX_RETRIES = 10

/**
 * Loopback success page. Pixel-art styled to match Golemancy desktop & web
 * design (see `consent-ui.md` § 2 Wireframe 4). Self-contained — no external
 * font/CDN dependencies, so it works offline and in locked-down browsers.
 */
const SUCCESS_HTML = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Golemancy</title>
<style>
  body { background: #0B0E14; color: #E8ECF1;
         font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
         display: flex; align-items: center; justify-content: center;
         min-height: 100vh; margin: 0; }
  .box { text-align: center; border: 2px solid #2A3040; padding: 40px 56px;
         background: #131824; box-shadow: 6px 6px 0 0 rgba(0,0,0,0.45);
         max-width: 440px; }
  h1 { font-size: 20px; color: #6BCB77; margin: 0 0 18px 0;
       letter-spacing: 3px; text-transform: uppercase; }
  p { font-size: 13px; color: #A0AAB8; line-height: 1.75; margin: 6px 0; }
  .dim { color: #6B7380; font-size: 11px; margin-top: 22px; letter-spacing: 1px; }
</style></head><body>
<div class="box">
  <h1>Authorized</h1>
  <p>You can close this tab.</p>
  <p>Return to the Golemancy Desktop app to continue.</p>
  <p class="dim">-- golemancy --</p>
</div></body></html>`

/**
 * Attempt to cancel an existing server on the given callback port by sending
 * GET /cancel. Only meaningful for fixed ports (Codex-legacy 1455) where port
 * collision with another in-flight flow can happen.
 */
async function tryCancelExistingServer(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path: '/cancel', method: 'GET', timeout: 2000 },
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

export interface StartCallbackServerOptions {
  /**
   * Port to bind on 127.0.0.1.
   * - `0` (default) → OS-assigned dynamic port, per RFC 8252 §7.3 (Golemancy).
   * - Fixed (e.g. `1455`) → retries with `/cancel` handshake on EADDRINUSE (Codex-legacy).
   */
  port?: number
  timeoutMs?: number
}

export interface CallbackServerResult {
  /** Resolves with `{ code }` on successful callback, rejects on error/cancel/timeout. */
  promise: Promise<{ code: string }>
  /** Cancel the flow and tear down the server. */
  close: () => void
  /** Resolves with the port actually bound. Necessary for dynamic (`port=0`) flows. */
  listening: Promise<number>
}

/**
 * Start a temporary HTTP server on 127.0.0.1 to receive the OAuth callback.
 *
 * - Handles `GET {callbackPath}?code=...&state=...` — validates state, resolves `promise` with code.
 * - Handles `GET /cancel` — allows another process to steal a fixed port (Codex CLI compat).
 * - Auto-closes after `timeoutMs` (default 5 min).
 */
export function startCallbackServer(
  expectedState: string,
  opts: StartCallbackServerOptions = {},
): CallbackServerResult {
  const { port = 0, timeoutMs = DEFAULT_TIMEOUT_MS } = opts
  const isDynamicPort = port === 0

  let server: http.Server | null = null
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null
  let settled = false

  let resolve: (value: { code: string }) => void = () => {}
  let reject: (reason: unknown) => void = () => {}
  const promise = new Promise<{ code: string }>((res, rej) => {
    resolve = res
    reject = rej
  })

  let resolveListening: (actual: number) => void = () => {}
  let rejectListening: (reason: unknown) => void = () => {}
  const listening = new Promise<number>((res, rej) => {
    resolveListening = res
    rejectListening = rej
  })
  // Prevent unhandledRejection when the caller doesn't await `listening`
  // (e.g. Codex flows that don't care about the dynamic port).
  listening.catch(() => {})

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
      rejectListening(new Error('OAuth flow cancelled before binding'))
    }
  }

  server = http.createServer((req, res) => {
    // `URL` just needs *some* base — pathname parsing is host-independent.
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')

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

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(SUCCESS_HTML)

    if (!settled) {
      settled = true
      cleanup()
      resolve({ code })
    }
  })

  timeoutHandle = setTimeout(() => {
    if (!settled) {
      settled = true
      cleanup()
      reject(new Error('OAuth flow timed out (5 minutes)'))
      rejectListening(new Error('OAuth flow timed out before binding'))
    }
  }, timeoutMs)

  const bindDynamic = async () => {
    await new Promise<void>((res, rej) => {
      server!.once('error', rej)
      server!.listen(0, '127.0.0.1', () => {
        server!.removeListener('error', rej)
        res()
      })
    })
    const addr = server!.address() as AddressInfo | null
    const actualPort = addr?.port ?? 0
    log.info({ port: actualPort, dynamic: true }, 'OAuth callback server listening')
    resolveListening(actualPort)
  }

  const bindFixed = async (fixedPort: number) => {
    for (let attempt = 0; attempt < PORT_MAX_RETRIES; attempt++) {
      try {
        await new Promise<void>((res, rej) => {
          server!.once('error', rej)
          server!.listen(fixedPort, '127.0.0.1', () => {
            server!.removeListener('error', rej)
            res()
          })
        })
        log.info({ port: fixedPort }, 'OAuth callback server listening')
        resolveListening(fixedPort)
        return
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
          if (attempt === 0) {
            log.info({ port: fixedPort }, 'port in use, sending /cancel to existing server')
            await tryCancelExistingServer(fixedPort)
          }
          log.debug({ attempt: attempt + 1, port: fixedPort }, 'retrying port bind')
          await sleep(PORT_RETRY_DELAY_MS)
        } else {
          throw err
        }
      }
    }
    if (!settled) {
      settled = true
      cleanup()
      const err = new Error(`Port ${fixedPort} is already in use. Close the application using it and try again.`)
      reject(err)
      rejectListening(err)
    }
  }

  const bindPromise = isDynamicPort ? bindDynamic() : bindFixed(port)
  bindPromise.catch((err) => {
    if (!settled) {
      settled = true
      cleanup()
      reject(err)
      rejectListening(err)
    }
  })

  return { promise, close, listening }
}
