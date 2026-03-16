import http from 'node:http'

type RouteHandler = (req: http.IncomingMessage, res: http.ServerResponse<http.IncomingMessage>) => void

function renderBrowserPage() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Golemancy Browser Test</title>
  </head>
  <body>
    <main>
      <h1 id="page-title">Deterministic Browser Page</h1>
      <p id="status">ready</p>
      <button id="reveal-btn" type="button">Reveal Secret</button>
      <div id="secret" hidden>browser_secret_marker_2048</div>
    </main>
    <script>
      document.getElementById('reveal-btn').addEventListener('click', () => {
        const status = document.getElementById('status')
        const secret = document.getElementById('secret')
        status.textContent = 'clicked'
        secret.hidden = false
        fetch('/browser/reveal-hit', { method: 'POST' }).catch(() => {})
      })
    </script>
  </body>
</html>`
}

export class LocalHttpTestServer {
  private server?: http.Server
  private port?: number
  private readonly requestCounts = new Map<string, number>()
  private readonly routes: Record<string, RouteHandler> = {
    '/network/allowed': (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('ALLOWED_NETWORK_MARKER')
    },
    '/network/blocked': (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('BLOCKED_NETWORK_MARKER')
    },
    '/browser/basic': (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(renderBrowserPage())
    },
    '/browser/reveal-hit': (_req, res) => {
      res.writeHead(204)
      res.end()
    },
  }

  async start(): Promise<void> {
    if (this.server) return

    this.server = http.createServer((req, res) => {
      const url = req.url ? new URL(req.url, 'http://127.0.0.1') : null
      if (url) {
        this.requestCounts.set(url.pathname, (this.requestCounts.get(url.pathname) ?? 0) + 1)
      }
      const handler = url ? this.routes[url.pathname] : undefined
      if (handler) {
        handler(req, res)
        return
      }

      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('NOT_FOUND')
    })

    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject)
      this.server!.listen(0, '127.0.0.1', () => {
        const address = this.server!.address()
        if (!address || typeof address === 'string') {
          reject(new Error('failed to bind local test server'))
          return
        }
        this.port = address.port
        resolve()
      })
    })
  }

  url(pathname: string, host: '127.0.0.1' | 'localhost' = '127.0.0.1'): string {
    if (!this.port) throw new Error('local test server not started')
    return `http://${host}:${this.port}${pathname}`
  }

  getRequestCount(pathname: string): number {
    return this.requestCounts.get(pathname) ?? 0
  }

  resetRequestCounts(): void {
    this.requestCounts.clear()
  }

  async stop(): Promise<void> {
    if (!this.server) return
    const server = this.server
    this.server = undefined
    this.port = undefined
    await new Promise<void>((resolve, reject) => {
      server.close(err => (err ? reject(err) : resolve()))
    })
  }
}
