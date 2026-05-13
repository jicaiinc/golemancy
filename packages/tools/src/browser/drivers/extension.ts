// ---------------------------------------------------------------------------
// ExtensionDriver — controls browser remotely via WebSocket connection to
// the Golemancy browser extension.
//
// Protocol: JSON-RPC 2.0 over WebSocket
//   → { id, method, params }
//   ← { id, result } | { id, error: { code, message } }
//
// The extension (Service Worker + Content Script) handles:
//   - Tab navigation via chrome.tabs API
//   - DOM interaction via content script injection
//   - Accessibility tree generation via shared snapshot logic
// ---------------------------------------------------------------------------

import type {
  BrowserDriver,
  PageSnapshot,
  SnapshotOptions,
  SnapshotResult,
  DiffResult,
  Screenshot,
  SnapshotElement,
  TabInfo,
  ConsoleMessage,
  NetworkRequest,
} from '../driver'
import { buildPageSnapshot } from '../snapshot'

// Use the global WebSocket available in Node.js 22+ / modern runtimes.
// Minimal type declarations for our usage.
declare const WebSocket: {
  new(url: string): WSInstance
  readonly OPEN: number
}

interface WSInstance {
  readonly readyState: number
  send(data: string): void
  close(): void
  addEventListener(type: string, listener: (e: { data?: unknown }) => void): void
  removeEventListener(type: string, listener: (e: { data?: unknown }) => void): void
}

export interface ExtensionDriverConfig {
  /** WebSocket URL of the extension endpoint (e.g. ws://localhost:9876) */
  wsUrl: string
  /** Authentication token for the connection */
  token?: string
  /** Timeout for RPC calls in ms (default: 30000) */
  timeout?: number
}

interface PendingCall {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export class ExtensionDriver implements BrowserDriver {
  private ws: WSInstance | null = null
  private pending = new Map<string, PendingCall>()
  private _connected = false
  private msgCounter = 0

  constructor(private config: ExtensionDriverConfig) {}

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async connect(): Promise<void> {
    if (this._connected) return

    let url = this.config.wsUrl
    if (this.config.token) {
      const separator = url.includes('?') ? '&' : '?'
      url = `${url}${separator}token=${encodeURIComponent(this.config.token)}`
    }

    this.ws = new WebSocket(url)

    await new Promise<void>((resolve, reject) => {
      const onOpen = () => { cleanup(); resolve() }
      const onError = () => { cleanup(); reject(new Error('WebSocket connection failed')) }
      const cleanup = () => {
        this.ws?.removeEventListener('open', onOpen)
        this.ws?.removeEventListener('error', onError)
      }
      this.ws!.addEventListener('open', onOpen)
      this.ws!.addEventListener('error', onError)
    })

    // Set up message handler
    this.ws.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(String(event.data))
        const pending = this.pending.get(data.id)
        if (!pending) return

        clearTimeout(pending.timer)
        this.pending.delete(data.id)

        if (data.error) {
          pending.reject(new Error(`Extension error [${data.error.code}]: ${data.error.message}`))
        } else {
          pending.resolve(data.result)
        }
      } catch {
        // Ignore malformed messages
      }
    })

    this.ws.addEventListener('close', () => {
      this._connected = false
      // Reject all pending calls
      for (const [id, pending] of this.pending) {
        clearTimeout(pending.timer)
        pending.reject(new Error('WebSocket connection closed'))
        this.pending.delete(id)
      }
    })

    this._connected = true
  }

  async close(): Promise<void> {
    this._connected = false
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.reject(new Error('Driver closing'))
    }
    this.pending.clear()
    try {
      this.ws?.close()
    } catch {
      // Already closed
    }
    this.ws = null
  }

  isConnected(): boolean {
    return this._connected && this.ws?.readyState === WebSocket.OPEN
  }

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  async navigate(url: string): Promise<PageSnapshot> {
    return this.callSnapshot('navigate', { url })
  }

  async goBack(): Promise<PageSnapshot> {
    return this.callSnapshot('goBack', {})
  }

  async goForward(): Promise<PageSnapshot> {
    return this.callSnapshot('goForward', {})
  }

  // ---------------------------------------------------------------------------
  // Page State
  // ---------------------------------------------------------------------------

  async snapshot(_options?: SnapshotOptions): Promise<PageSnapshot> {
    return this.callSnapshot('snapshot', _options ?? {})
  }

  async diffSnapshot(_options?: SnapshotOptions): Promise<DiffResult> {
    // ExtensionDriver does not support snapshot diffing
    return { diff: '', changed: false, additions: 0, removals: 0 }
  }

  async screenshot(fullPage?: boolean): Promise<Screenshot> {
    return this.call('screenshot', { fullPage }) as Promise<Screenshot>
  }

  async consoleMessages(): Promise<ConsoleMessage[]> {
    return this.call('consoleMessages', {}) as Promise<ConsoleMessage[]>
  }

  async networkRequests(): Promise<NetworkRequest[]> {
    return this.call('networkRequests', {}) as Promise<NetworkRequest[]>
  }

  // ---------------------------------------------------------------------------
  // Element Interaction
  // ---------------------------------------------------------------------------

  async click(ref: string): Promise<PageSnapshot> {
    return this.callSnapshot('click', { ref })
  }

  async type(ref: string, text: string, submit?: boolean): Promise<PageSnapshot> {
    return this.callSnapshot('type', { ref, text, submit })
  }

  async fill(ref: string, value: string): Promise<PageSnapshot> {
    return this.callSnapshot('fill', { ref, value })
  }

  async check(ref: string, checked?: boolean): Promise<PageSnapshot> {
    return this.callSnapshot('check', { ref, checked })
  }

  async selectOption(ref: string, values: string[]): Promise<PageSnapshot> {
    return this.callSnapshot('selectOption', { ref, values })
  }

  async hover(ref: string): Promise<PageSnapshot> {
    return this.callSnapshot('hover', { ref })
  }

  async drag(sourceRef: string, targetRef: string): Promise<PageSnapshot> {
    return this.callSnapshot('drag', { sourceRef, targetRef })
  }

  async uploadFile(ref: string, filePaths: string[]): Promise<PageSnapshot> {
    return this.callSnapshot('uploadFile', { ref, filePaths })
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------

  async pressKey(key: string): Promise<void> {
    await this.call('pressKey', { key })
  }

  async scroll(direction: 'up' | 'down', amount?: number): Promise<PageSnapshot> {
    return this.callSnapshot('scroll', { direction, amount })
  }

  // ---------------------------------------------------------------------------
  // Dialog
  // ---------------------------------------------------------------------------

  async handleDialog(action: 'accept' | 'dismiss', promptText?: string): Promise<void> {
    await this.call('handleDialog', { action, promptText })
  }

  // ---------------------------------------------------------------------------
  // Form
  // ---------------------------------------------------------------------------

  async fillForm(fields: Array<{ ref: string; value: string }>): Promise<PageSnapshot> {
    return this.callSnapshot('fillForm', { fields })
  }

  // ---------------------------------------------------------------------------
  // Tabs
  // ---------------------------------------------------------------------------

  async getTabs(): Promise<TabInfo[]> {
    return this.call('getTabs', {}) as Promise<TabInfo[]>
  }

  async switchTab(tabId: string): Promise<PageSnapshot> {
    return this.callSnapshot('switchTab', { tabId })
  }

  async closeTab(tabId?: string): Promise<void> {
    await this.call('closeTab', { tabId })
  }

  // ---------------------------------------------------------------------------
  // Viewport
  // ---------------------------------------------------------------------------

  async resize(width: number, height: number): Promise<PageSnapshot> {
    return this.callSnapshot('resize', { width, height })
  }

  // ---------------------------------------------------------------------------
  // Advanced
  // ---------------------------------------------------------------------------

  async command(_name: string, _params?: Record<string, unknown>): Promise<unknown> {
    throw new Error('ExtensionDriver does not support arbitrary commands. Use dedicated methods instead.')
  }

  async evaluate(script: string): Promise<unknown> {
    return this.call('evaluate', { script })
  }

  async wait(seconds?: number): Promise<void> {
    // Wait locally — no need to round-trip to extension
    await new Promise(resolve => setTimeout(resolve, (seconds ?? 2) * 1000))
  }

  // ---------------------------------------------------------------------------
  // RPC internals
  // ---------------------------------------------------------------------------

  /**
   * Call a method that returns snapshot data.
   * The extension returns { url, title, elements } — we build the
   * PageSnapshot locally using the shared formatter.
   */
  private async callSnapshot(method: string, params: unknown): Promise<PageSnapshot> {
    const raw = await this.call(method, params) as {
      url: string
      title: string
      elements: SnapshotElement[]
    }
    return buildPageSnapshot(raw.url, raw.title, raw.elements)
  }

  /** Send a JSON-RPC request and wait for the response */
  private call(method: string, params: unknown): Promise<unknown> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('WebSocket not connected'))
    }

    const id = `req_${++this.msgCounter}`
    const timeout = this.config.timeout ?? 30_000

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`RPC timeout: ${method} (${timeout}ms)`))
      }, timeout)

      this.pending.set(id, { resolve, reject, timer })
      this.ws!.send(JSON.stringify({ id, method, params }))
    })
  }
}
