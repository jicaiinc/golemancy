// ---------------------------------------------------------------------------
// PlaywrightDriver — controls browser locally via playwright-core + CDP.
//
// Lifecycle:
//   1. connect() — launches browser or connects via CDP
//   2. Operations — navigate, click, type, etc.
//   3. close() — shuts down browser and cleans up
//
// Lazy: Browser is NOT launched until first tool invocation.
// ---------------------------------------------------------------------------

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core'
import type {
  BrowserDriver,
  PageSnapshot,
  Screenshot,
  SnapshotElement,
  TabInfo,
  ConsoleMessage,
  NetworkRequest,
} from '../driver'
import { SNAPSHOT_SCRIPT, buildPageSnapshot } from '../snapshot'
import { detectBrowser } from '../detect'

export interface PlaywrightDriverConfig {
  /** Path to Chrome/Chromium executable. Auto-detected if omitted. */
  executablePath?: string
  /** Run in headless mode (default: false for desktop app visibility) */
  headless?: boolean
  /** Connect to an existing browser via CDP endpoint URL */
  cdpUrl?: string
  /** Viewport dimensions */
  viewport?: { width: number; height: number }
  /** Default timeout for operations in ms (default: 30000) */
  timeout?: number
}

export class PlaywrightDriver implements BrowserDriver {
  private browser: Browser | null = null
  private context: BrowserContext | null = null
  private _page: Page | null = null
  private _connected = false

  private consoleLogs: ConsoleMessage[] = []
  private networkLogs: NetworkRequest[] = []

  // Dialog auto-handling: stores the last pending dialog action
  private pendingDialogAction: { action: 'accept' | 'dismiss'; text?: string } | null = null

  constructor(private config: PlaywrightDriverConfig = {}) {}

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async connect(): Promise<void> {
    if (this.isConnected()) return

    // Clean up stale state from a previously crashed browser
    if (this._connected) {
      await this.close()
    }

    if (this.config.cdpUrl) {
      this.browser = await chromium.connectOverCDP(this.config.cdpUrl)
      const contexts = this.browser.contexts()
      this.context = contexts[0] ?? await this.browser.newContext()
    } else {
      const executablePath = this.config.executablePath ?? detectBrowser()
      this.browser = await chromium.launch({
        executablePath,
        headless: this.config.headless ?? false,
        args: [
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-extensions',
        ],
      })
      const viewport = this.config.viewport ?? { width: 1280, height: 720 }
      this.context = await this.browser.newContext({ viewport })
    }

    this._page = this.context.pages()[0] ?? await this.context.newPage()
    this.setupPageListeners(this._page)
    this._connected = true
  }

  async close(): Promise<void> {
    this._connected = false
    this.consoleLogs = []
    this.networkLogs = []
    this.pendingDialogAction = null
    try {
      await this.browser?.close()
    } catch {
      // Browser may already be closed
    }
    this.browser = null
    this.context = null
    this._page = null
  }

  isConnected(): boolean {
    return this._connected && this.browser?.isConnected() === true
  }

  private async ensureConnected(): Promise<void> {
    if (!this.isConnected()) {
      await this.connect()
    }
  }

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  async navigate(url: string): Promise<PageSnapshot> {
    await this.ensureConnected()
    const page = this.requirePage()
    const timeout = this.config.timeout ?? 30_000
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout })
    // Give dynamic content a moment to render
    await page.waitForTimeout(500)
    return this.snapshot()
  }

  async goBack(): Promise<PageSnapshot> {
    await this.ensureConnected()
    const page = this.requirePage()
    await page.goBack({ waitUntil: 'domcontentloaded' })
    return this.snapshot()
  }

  async goForward(): Promise<PageSnapshot> {
    await this.ensureConnected()
    const page = this.requirePage()
    await page.goForward({ waitUntil: 'domcontentloaded' })
    return this.snapshot()
  }

  // ---------------------------------------------------------------------------
  // Page State
  // ---------------------------------------------------------------------------

  async snapshot(): Promise<PageSnapshot> {
    await this.ensureConnected()
    const page = this.requirePage()
    const elements = await page.evaluate(SNAPSHOT_SCRIPT) as SnapshotElement[]
    const url = page.url()
    const title = await page.title()
    return buildPageSnapshot(url, title, elements)
  }

  async screenshot(fullPage?: boolean): Promise<Screenshot> {
    await this.ensureConnected()
    const page = this.requirePage()
    const buffer = await page.screenshot({
      type: 'png',
      fullPage: fullPage ?? false,
    })
    const viewport = page.viewportSize() ?? { width: 1280, height: 720 }
    return {
      base64: buffer.toString('base64'),
      width: viewport.width,
      height: viewport.height,
    }
  }

  async consoleMessages(): Promise<ConsoleMessage[]> {
    // Return collected logs and clear
    const logs = [...this.consoleLogs]
    this.consoleLogs = []
    return logs
  }

  async networkRequests(): Promise<NetworkRequest[]> {
    // Return collected requests and clear
    const reqs = [...this.networkLogs]
    this.networkLogs = []
    return reqs
  }

  // ---------------------------------------------------------------------------
  // Element Interaction
  // ---------------------------------------------------------------------------

  async click(ref: string): Promise<PageSnapshot> {
    const page = this.requirePage()
    const locator = this.refLocator(page, ref)
    await locator.click({ timeout: this.timeout() })
    await page.waitForTimeout(300)
    return this.snapshot()
  }

  async type(ref: string, text: string, submit?: boolean): Promise<PageSnapshot> {
    const page = this.requirePage()
    const locator = this.refLocator(page, ref)
    await locator.fill(text, { timeout: this.timeout() })
    if (submit) {
      await locator.press('Enter')
      await page.waitForTimeout(500)
    }
    return this.snapshot()
  }

  async selectOption(ref: string, values: string[]): Promise<PageSnapshot> {
    const page = this.requirePage()
    const locator = this.refLocator(page, ref)
    await locator.selectOption(values, { timeout: this.timeout() })
    return this.snapshot()
  }

  async hover(ref: string): Promise<PageSnapshot> {
    const page = this.requirePage()
    const locator = this.refLocator(page, ref)
    await locator.hover({ timeout: this.timeout() })
    await page.waitForTimeout(300)
    return this.snapshot()
  }

  async drag(sourceRef: string, targetRef: string): Promise<PageSnapshot> {
    const page = this.requirePage()
    const source = this.refLocator(page, sourceRef)
    const target = this.refLocator(page, targetRef)
    await source.dragTo(target, { timeout: this.timeout() })
    return this.snapshot()
  }

  async uploadFile(ref: string, filePaths: string[]): Promise<PageSnapshot> {
    const page = this.requirePage()
    const locator = this.refLocator(page, ref)
    await locator.setInputFiles(filePaths, { timeout: this.timeout() })
    return this.snapshot()
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------

  async pressKey(key: string): Promise<void> {
    const page = this.requirePage()
    await page.keyboard.press(key)
  }

  async scroll(direction: 'up' | 'down', amount?: number): Promise<PageSnapshot> {
    const page = this.requirePage()
    const pages = amount ?? 1
    const delta = direction === 'down' ? 600 * pages : -600 * pages
    await page.mouse.wheel(0, delta)
    await page.waitForTimeout(300)
    return this.snapshot()
  }

  // ---------------------------------------------------------------------------
  // Dialog
  // ---------------------------------------------------------------------------

  async handleDialog(action: 'accept' | 'dismiss', promptText?: string): Promise<void> {
    this.pendingDialogAction = { action, text: promptText }
  }

  // ---------------------------------------------------------------------------
  // Form
  // ---------------------------------------------------------------------------

  async fillForm(fields: Array<{ ref: string; value: string }>): Promise<PageSnapshot> {
    const page = this.requirePage()
    for (const { ref, value } of fields) {
      const locator = this.refLocator(page, ref)
      await locator.fill(value, { timeout: this.timeout() })
    }
    return this.snapshot()
  }

  // ---------------------------------------------------------------------------
  // Tabs
  // ---------------------------------------------------------------------------

  async getTabs(): Promise<TabInfo[]> {
    const context = this.requireContext()
    const pages = context.pages()
    const activePage = this._page
    return Promise.all(pages.map(async (p, i) => ({
      id: String(i),
      url: p.url(),
      title: await p.title(),
      active: p === activePage,
    })))
  }

  async switchTab(tabId: string): Promise<PageSnapshot> {
    const context = this.requireContext()
    const pages = context.pages()
    const index = parseInt(tabId, 10)
    if (index < 0 || index >= pages.length) {
      throw new Error(`Tab index ${tabId} out of range (0-${pages.length - 1})`)
    }
    this._page = pages[index]
    this.setupPageListeners(this._page)
    await this._page.bringToFront()
    return this.snapshot()
  }

  async closeTab(tabId?: string): Promise<void> {
    const context = this.requireContext()
    const pages = context.pages()

    if (tabId != null) {
      const index = parseInt(tabId, 10)
      if (index >= 0 && index < pages.length) {
        await pages[index].close()
        // Switch to last remaining page
        const remaining = context.pages()
        if (remaining.length > 0) {
          this._page = remaining[remaining.length - 1]
          this.setupPageListeners(this._page)
        }
      }
    } else if (this._page) {
      await this._page.close()
      const remaining = context.pages()
      if (remaining.length > 0) {
        this._page = remaining[remaining.length - 1]
        this.setupPageListeners(this._page)
      } else {
        this._page = await context.newPage()
        this.setupPageListeners(this._page)
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Viewport
  // ---------------------------------------------------------------------------

  async resize(width: number, height: number): Promise<PageSnapshot> {
    const page = this.requirePage()
    await page.setViewportSize({ width, height })
    return this.snapshot()
  }

  // ---------------------------------------------------------------------------
  // Advanced
  // ---------------------------------------------------------------------------

  async evaluate(script: string): Promise<unknown> {
    const page = this.requirePage()
    return page.evaluate(script)
  }

  async wait(seconds?: number): Promise<void> {
    const page = this.requirePage()
    await page.waitForTimeout((seconds ?? 2) * 1000)
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private requirePage(): Page {
    if (!this._page) throw new Error('Browser not connected. Call connect() first.')
    return this._page
  }

  private requireContext(): BrowserContext {
    if (!this.context) throw new Error('Browser not connected. Call connect() first.')
    return this.context
  }

  private refLocator(page: Page, ref: string) {
    if (!/^e\d+$/.test(ref)) {
      throw new Error(`Invalid element ref "${ref}". Expected format: e0, e1, e2, ...`)
    }
    return page.locator(`[data-golemancy-ref="${ref}"]`)
  }

  private timeout(): number {
    return this.config.timeout ?? 30_000
  }

  private setupPageListeners(page: Page): void {
    // Remove any old listeners to avoid duplicates
    page.removeAllListeners('console')
    page.removeAllListeners('response')
    page.removeAllListeners('dialog')

    // Console messages (keep last 100)
    page.on('console', (msg) => {
      this.consoleLogs.push({
        type: msg.type() as ConsoleMessage['type'],
        text: msg.text(),
        timestamp: Date.now(),
      })
      if (this.consoleLogs.length > 100) this.consoleLogs.shift()
    })

    // Network responses (keep last 100)
    page.on('response', (response) => {
      this.networkLogs.push({
        url: response.url(),
        method: response.request().method(),
        status: response.status(),
        statusText: response.statusText(),
        resourceType: response.request().resourceType(),
        timestamp: Date.now(),
      })
      if (this.networkLogs.length > 100) this.networkLogs.shift()
    })

    // Dialog auto-handling
    page.on('dialog', async (dialog) => {
      if (this.pendingDialogAction) {
        const { action, text } = this.pendingDialogAction
        this.pendingDialogAction = null
        if (action === 'accept') {
          await dialog.accept(text)
        } else {
          await dialog.dismiss()
        }
      } else {
        // Default: dismiss unexpected dialogs
        await dialog.dismiss()
      }
    })
  }
}
