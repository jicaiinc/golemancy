// ---------------------------------------------------------------------------
// PlaywrightDriver — wraps agent-browser's BrowserManager.
//
// Lifecycle:
//   1. connect() — launches browser via BrowserManager
//   2. Operations — navigate, click, type, etc.
//   3. close() — shuts down browser and cleans up
//
// Lazy: Browser is NOT launched until first tool invocation.
// ---------------------------------------------------------------------------

import { BrowserManager } from 'agent-browser/dist/browser.js'
import { getSnapshotStats } from 'agent-browser/dist/snapshot.js'
import { diffSnapshots } from 'agent-browser/dist/diff.js'
import { executeCommand, toAIFriendlyError } from 'agent-browser/dist/actions.js'
import { parseCommand } from 'agent-browser/dist/protocol.js'
import type {
  BrowserDriver,
  SnapshotOptions,
  SnapshotResult,
  DiffResult,
  Screenshot,
  TabInfo,
  ConsoleMessage,
  NetworkRequest,
} from '../driver'

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
  /** Auto-discover and connect to a running Chrome instance via CDP */
  autoConnect?: boolean
  /** Chrome user data directory / profile name for persistent sessions */
  profile?: string
  /** Paths to Chrome extensions to load */
  extensions?: string[]
  /** Proxy configuration */
  proxy?: { server: string; bypass?: string; username?: string; password?: string }
  /** Additional Chrome launch arguments */
  args?: string[]
  /** Custom user agent string */
  userAgent?: string
  /** Path to saved storage state (cookies, localStorage) */
  storageState?: string
}

export class PlaywrightDriver implements BrowserDriver {
  private manager = new BrowserManager()

  constructor(private config: PlaywrightDriverConfig = {}) {}

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async connect(): Promise<void> {
    if (this.isConnected()) return

    await this.manager.launch({
      id: 'launch',
      action: 'launch',
      headless: this.config.headless ?? false,
      viewport: this.config.viewport ?? { width: 1280, height: 720 },
      executablePath: this.config.executablePath,
      cdpUrl: this.config.cdpUrl,
      autoConnect: this.config.autoConnect,
      profile: this.config.profile,
      extensions: this.config.extensions,
      proxy: this.config.proxy,
      args: this.config.args,
      userAgent: this.config.userAgent,
      storageState: this.config.storageState,
    })

    this.manager.startConsoleTracking()
    this.manager.startRequestTracking()
  }

  async close(): Promise<void> {
    try {
      await this.manager.close()
    } catch {
      // Browser may already be closed
    }
  }

  isConnected(): boolean {
    return this.manager.isLaunched()
  }

  private async ensureConnected(): Promise<void> {
    if (!this.isConnected()) await this.connect()
  }

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  async navigate(url: string): Promise<SnapshotResult> {
    await this.ensureConnected()
    const page = this.manager.getPage()
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: this.timeout() })
    await page.waitForTimeout(500)
    return this.snapshot()
  }

  async goBack(): Promise<SnapshotResult> {
    await this.ensureConnected()
    await this.manager.getPage().goBack({ waitUntil: 'domcontentloaded' })
    return this.snapshot()
  }

  async goForward(): Promise<SnapshotResult> {
    await this.ensureConnected()
    await this.manager.getPage().goForward({ waitUntil: 'domcontentloaded' })
    return this.snapshot()
  }

  // ---------------------------------------------------------------------------
  // Page State
  // ---------------------------------------------------------------------------

  async snapshot(options?: SnapshotOptions): Promise<SnapshotResult> {
    await this.ensureConnected()
    const snap = await this.manager.getSnapshot({
      interactive: options?.mode === 'interactive',
      compact: options?.mode === 'compact',
      selector: options?.selector,
      maxDepth: options?.maxDepth,
      cursor: options?.cursor,
    })
    this.manager.setLastSnapshot(snap.tree)
    const stats = getSnapshotStats(snap.tree, snap.refs)
    return { text: snap.tree, refs: snap.refs, stats }
  }

  async diffSnapshot(options?: SnapshotOptions): Promise<DiffResult> {
    await this.ensureConnected()
    const before = this.manager.getLastSnapshot()
    const snap = await this.manager.getSnapshot({
      interactive: options?.mode === 'interactive',
      compact: options?.mode === 'compact',
      selector: options?.selector,
      maxDepth: options?.maxDepth,
      cursor: options?.cursor,
    })
    this.manager.setLastSnapshot(snap.tree)
    const result = diffSnapshots(before, snap.tree)
    return {
      diff: result.diff,
      changed: result.changed,
      additions: result.additions,
      removals: result.removals,
    }
  }

  async screenshot(fullPage?: boolean): Promise<Screenshot> {
    await this.ensureConnected()
    const page = this.manager.getPage()
    const buffer = await page.screenshot({ type: 'png', fullPage: fullPage ?? false })
    const viewport = page.viewportSize() ?? { width: 1280, height: 720 }
    return {
      base64: buffer.toString('base64'),
      width: viewport.width,
      height: viewport.height,
    }
  }

  async consoleMessages(): Promise<ConsoleMessage[]> {
    if (!this.isConnected()) return []
    const messages = this.manager.getConsoleMessages()
    this.manager.clearConsoleMessages()
    return messages.map(m => ({
      type: m.type as ConsoleMessage['type'],
      text: m.text,
      timestamp: m.timestamp,
    }))
  }

  async networkRequests(): Promise<NetworkRequest[]> {
    if (!this.isConnected()) return []
    const requests = this.manager.getRequests()
    this.manager.clearRequests()
    // agent-browser tracks requests at dispatch time (no response status available)
    return requests.map(r => ({
      url: r.url,
      method: r.method,
      status: 0,
      statusText: '',
      resourceType: r.resourceType,
      timestamp: r.timestamp,
    }))
  }

  // ---------------------------------------------------------------------------
  // Element Interaction
  // ---------------------------------------------------------------------------

  async click(ref: string): Promise<SnapshotResult> {
    await this.ensureConnected()
    try {
      const locator = this.manager.getLocator(ref)
      await locator.click({ timeout: this.timeout() })
      await this.manager.getPage().waitForTimeout(300)
    } catch (error) {
      throw toAIFriendlyError(error, ref)
    }
    return this.snapshot()
  }

  async type(ref: string, text: string, submit?: boolean): Promise<SnapshotResult> {
    await this.ensureConnected()
    try {
      const locator = this.manager.getLocator(ref)
      await locator.fill(text, { timeout: this.timeout() })
      if (submit) {
        await locator.press('Enter')
        await this.manager.getPage().waitForTimeout(500)
      }
    } catch (error) {
      throw toAIFriendlyError(error, ref)
    }
    return this.snapshot()
  }

  async fill(ref: string, value: string): Promise<SnapshotResult> {
    await this.ensureConnected()
    try {
      await this.manager.getLocator(ref).fill(value, { timeout: this.timeout() })
    } catch (error) {
      throw toAIFriendlyError(error, ref)
    }
    return this.snapshot()
  }

  async selectOption(ref: string, values: string[]): Promise<SnapshotResult> {
    await this.ensureConnected()
    try {
      await this.manager.getLocator(ref).selectOption(values, { timeout: this.timeout() })
    } catch (error) {
      throw toAIFriendlyError(error, ref)
    }
    return this.snapshot()
  }

  async check(ref: string, checked?: boolean): Promise<SnapshotResult> {
    await this.ensureConnected()
    try {
      const locator = this.manager.getLocator(ref)
      if (checked === false) {
        await locator.uncheck({ timeout: this.timeout() })
      } else {
        await locator.check({ timeout: this.timeout() })
      }
    } catch (error) {
      throw toAIFriendlyError(error, ref)
    }
    return this.snapshot()
  }

  async hover(ref: string): Promise<SnapshotResult> {
    await this.ensureConnected()
    try {
      await this.manager.getLocator(ref).hover({ timeout: this.timeout() })
      await this.manager.getPage().waitForTimeout(300)
    } catch (error) {
      throw toAIFriendlyError(error, ref)
    }
    return this.snapshot()
  }

  async drag(sourceRef: string, targetRef: string): Promise<SnapshotResult> {
    await this.ensureConnected()
    try {
      const source = this.manager.getLocator(sourceRef)
      const target = this.manager.getLocator(targetRef)
      await source.dragTo(target, { timeout: this.timeout() })
    } catch (error) {
      throw toAIFriendlyError(error, sourceRef)
    }
    return this.snapshot()
  }

  async uploadFile(ref: string, filePaths: string[]): Promise<SnapshotResult> {
    await this.ensureConnected()
    try {
      await this.manager.getLocator(ref).setInputFiles(filePaths, { timeout: this.timeout() })
    } catch (error) {
      throw toAIFriendlyError(error, ref)
    }
    return this.snapshot()
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------

  async pressKey(key: string): Promise<void> {
    await this.ensureConnected()
    await this.manager.getPage().keyboard.press(key)
  }

  async scroll(direction: 'up' | 'down', amount?: number): Promise<SnapshotResult> {
    await this.ensureConnected()
    const pages = amount ?? 1
    const delta = direction === 'down' ? 600 * pages : -600 * pages
    const page = this.manager.getPage()
    await page.mouse.wheel(0, delta)
    await page.waitForTimeout(300)
    return this.snapshot()
  }

  // ---------------------------------------------------------------------------
  // Dialog
  // ---------------------------------------------------------------------------

  async handleDialog(action: 'accept' | 'dismiss', promptText?: string): Promise<void> {
    this.manager.setDialogHandler(action, promptText)
  }

  // ---------------------------------------------------------------------------
  // Form
  // ---------------------------------------------------------------------------

  async fillForm(fields: Array<{ ref: string; value: string }>): Promise<SnapshotResult> {
    await this.ensureConnected()
    for (const { ref, value } of fields) {
      try {
        await this.manager.getLocator(ref).fill(value, { timeout: this.timeout() })
      } catch (error) {
        throw toAIFriendlyError(error, ref)
      }
    }
    return this.snapshot()
  }

  // ---------------------------------------------------------------------------
  // Tabs
  // ---------------------------------------------------------------------------

  async getTabs(): Promise<TabInfo[]> {
    await this.ensureConnected()
    const tabs = await this.manager.listTabs()
    return tabs.map(t => ({
      id: String(t.index),
      url: t.url,
      title: t.title,
      active: t.active,
    }))
  }

  async switchTab(tabId: string): Promise<SnapshotResult> {
    await this.ensureConnected()
    await this.manager.switchTo(parseInt(tabId, 10))
    return this.snapshot()
  }

  async closeTab(tabId?: string): Promise<void> {
    await this.ensureConnected()
    const index = tabId != null ? parseInt(tabId, 10) : undefined
    await this.manager.closeTab(index)
  }

  // ---------------------------------------------------------------------------
  // Viewport
  // ---------------------------------------------------------------------------

  async resize(width: number, height: number): Promise<SnapshotResult> {
    await this.ensureConnected()
    await this.manager.setViewport(width, height)
    return this.snapshot()
  }

  // ---------------------------------------------------------------------------
  // Advanced
  // ---------------------------------------------------------------------------

  async command(name: string, params?: Record<string, unknown>): Promise<unknown> {
    await this.ensureConnected()
    const json = JSON.stringify({ id: 'cmd', action: name, ...params })
    const parsed = parseCommand(json)
    if (!parsed.success) throw new Error(parsed.error)
    const response = await executeCommand(parsed.command, this.manager)
    if (!response.success) throw new Error(response.error)
    return response.data
  }

  async evaluate(script: string): Promise<unknown> {
    await this.ensureConnected()
    return this.manager.getPage().evaluate(script)
  }

  async wait(seconds?: number): Promise<void> {
    await this.ensureConnected()
    await this.manager.getPage().waitForTimeout((seconds ?? 2) * 1000)
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private timeout(): number {
    return this.config.timeout ?? 30_000
  }
}
