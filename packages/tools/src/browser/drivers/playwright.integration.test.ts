// ---------------------------------------------------------------------------
// Integration tests — PlaywrightDriver + BrowserManager with a real browser.
//
// These tests are SKIPPED by default in `pnpm test`. To run them:
//   INTEGRATION=1 pnpm --filter @golemancy/tools exec vitest run src/browser/drivers/playwright.integration.test.ts
//
// Requirements: Chrome or Chromium must be installed on the system.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PlaywrightDriver } from './playwright'

const SKIP = !process.env.INTEGRATION

describe.skipIf(SKIP)('PlaywrightDriver integration', () => {
  let driver: PlaywrightDriver

  beforeAll(async () => {
    driver = new PlaywrightDriver({ headless: true, timeout: 15_000 })
    await driver.connect()
  }, 30_000)

  afterAll(async () => {
    await driver.close()
  })

  // =========================================================================
  // Lifecycle
  // =========================================================================

  it('should be connected after connect()', () => {
    expect(driver.isConnected()).toBe(true)
  })

  // =========================================================================
  // Navigation
  // =========================================================================

  it('should navigate to about:blank', async () => {
    const result = await driver.navigate('about:blank')
    expect(result.text).toBeDefined()
    expect(typeof result.text).toBe('string')
  })

  it('should navigate to a data URL and snapshot interactive elements', async () => {
    const html = `data:text/html,<html><body>
      <h1>Test Page</h1>
      <button id="btn">Click Me</button>
      <input type="text" placeholder="Name" />
    </body></html>`
    const result = await driver.navigate(html)

    expect(result.text).toContain('Test Page')
    expect(result.text).toContain('Click Me')
    expect(result.refs).toBeDefined()
    expect(result.stats).toBeDefined()
    expect(result.stats!.refs).toBeGreaterThan(0)
  })

  // =========================================================================
  // Snapshot
  // =========================================================================

  it('should take a full snapshot', async () => {
    const result = await driver.snapshot()
    expect(result.text).toBeDefined()
    expect(result.text.length).toBeGreaterThan(0)
    expect(result.refs).toBeDefined()
    expect(result.stats).toBeDefined()
  })

  it('should take an interactive-only snapshot', async () => {
    const full = await driver.snapshot({ mode: 'full' })
    const interactive = await driver.snapshot({ mode: 'interactive' })
    // Interactive mode should produce equal or fewer lines
    expect(interactive.text.split('\n').length).toBeLessThanOrEqual(
      full.text.split('\n').length,
    )
  })

  // =========================================================================
  // Diff
  // =========================================================================

  it('should produce a diff between snapshots', async () => {
    // Take a baseline snapshot
    await driver.snapshot()
    // Same page, no changes — diff should show no changes
    const diff = await driver.diffSnapshot()
    expect(diff).toHaveProperty('diff')
    expect(diff).toHaveProperty('changed')
    expect(typeof diff.additions).toBe('number')
    expect(typeof diff.removals).toBe('number')
  })

  // =========================================================================
  // Element Interaction
  // =========================================================================

  it('should click a button by ref', async () => {
    // Navigate to a page with a button that changes text on click
    const html = `data:text/html,<html><body>
      <div id="output">before</div>
      <button onclick="document.getElementById('output').textContent='after'">Go</button>
    </body></html>`
    await driver.navigate(html)
    const snap = await driver.snapshot()

    // Find the button ref
    const buttonRef = Object.entries(snap.refs!).find(
      ([, info]) => info.role === 'button' && info.name === 'Go',
    )?.[0]
    expect(buttonRef).toBeDefined()

    const result = await driver.click(buttonRef!)
    expect(result.text).toContain('after')
  })

  it('should type into an input', async () => {
    const html = `data:text/html,<html><body>
      <input type="text" placeholder="Name" />
    </body></html>`
    await driver.navigate(html)
    const snap = await driver.snapshot()

    const inputRef = Object.entries(snap.refs!).find(
      ([, info]) => info.role === 'textbox',
    )?.[0]
    expect(inputRef).toBeDefined()

    const result = await driver.type(inputRef!, 'Alice')
    expect(result.text).toContain('Alice')
  })

  it('should fill a field', async () => {
    const html = `data:text/html,<html><body>
      <input type="text" placeholder="Email" value="old" />
    </body></html>`
    await driver.navigate(html)
    const snap = await driver.snapshot()

    const inputRef = Object.entries(snap.refs!).find(
      ([, info]) => info.role === 'textbox',
    )?.[0]
    expect(inputRef).toBeDefined()

    const result = await driver.fill(inputRef!, 'new@test.com')
    expect(result.text).toContain('new@test.com')
  })

  it('should check a checkbox', async () => {
    const html = `data:text/html,<html><body>
      <label><input type="checkbox" /> Accept</label>
    </body></html>`
    await driver.navigate(html)
    const snap = await driver.snapshot()

    const checkRef = Object.entries(snap.refs!).find(
      ([, info]) => info.role === 'checkbox',
    )?.[0]
    expect(checkRef).toBeDefined()

    const result = await driver.check(checkRef!)
    expect(result.text).toContain('checked')
  })

  // =========================================================================
  // Screenshot
  // =========================================================================

  it('should take a screenshot', async () => {
    const result = await driver.screenshot()
    expect(result.base64).toBeDefined()
    expect(result.base64.length).toBeGreaterThan(0)
    expect(result.width).toBeGreaterThan(0)
    expect(result.height).toBeGreaterThan(0)
  })

  // =========================================================================
  // Input
  // =========================================================================

  it('should press a key', async () => {
    await expect(driver.pressKey('Tab')).resolves.toBeUndefined()
  })

  it('should scroll', async () => {
    const html = `data:text/html,<html><body style="height:5000px">
      <div>Top</div>
    </body></html>`
    await driver.navigate(html)
    const result = await driver.scroll('down', 2)
    expect(result.text).toBeDefined()
  })

  // =========================================================================
  // Dialog
  // =========================================================================

  it('should handle dialog setup without error', async () => {
    await expect(driver.handleDialog('accept')).resolves.toBeUndefined()
    await expect(driver.handleDialog('dismiss')).resolves.toBeUndefined()
  })

  // =========================================================================
  // Command passthrough
  // =========================================================================

  it('should execute a command via command()', async () => {
    await driver.navigate('about:blank')
    const result = await driver.command('url') as { url: string }
    expect(result.url).toBe('about:blank')
  })

  // =========================================================================
  // Tabs
  // =========================================================================

  it('should list tabs', async () => {
    const tabs = await driver.getTabs()
    expect(tabs.length).toBeGreaterThanOrEqual(1)
    expect(tabs[0]).toHaveProperty('id')
    expect(tabs[0]).toHaveProperty('url')
    expect(tabs[0]).toHaveProperty('title')
    expect(tabs[0]).toHaveProperty('active')
  })

  it('should switch tabs', async () => {
    const tabs = await driver.getTabs()
    // Switch to the first (currently active) tab — should not throw
    const result = await driver.switchTab(tabs[0].id)
    expect(result.text).toBeDefined()
  })

  // =========================================================================
  // Viewport
  // =========================================================================

  it('should resize viewport', async () => {
    const result = await driver.resize(800, 600)
    expect(result.text).toBeDefined()
  })

  // =========================================================================
  // Advanced
  // =========================================================================

  it('should evaluate JavaScript', async () => {
    const result = await driver.evaluate('1 + 1')
    expect(result).toBe(2)
  })

  it('should wait without error', async () => {
    await expect(driver.wait(0.1)).resolves.toBeUndefined()
  }, 10_000)

  // =========================================================================
  // Lifecycle — close
  // =========================================================================

  it('should disconnect after close', async () => {
    // Create a separate driver to test close
    const tempDriver = new PlaywrightDriver({ headless: true })
    await tempDriver.connect()
    expect(tempDriver.isConnected()).toBe(true)
    await tempDriver.close()
    expect(tempDriver.isConnected()).toBe(false)
  })
})
