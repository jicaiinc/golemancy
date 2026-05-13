import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock agent-browser modules before importing PlaywrightDriver
vi.mock('agent-browser/dist/browser.js', () => ({
  BrowserManager: vi.fn().mockImplementation(() => mockManager),
}))

vi.mock('agent-browser/dist/snapshot.js', () => ({
  getSnapshotStats: vi.fn().mockReturnValue({
    lines: 10,
    chars: 200,
    tokens: 50,
    refs: 3,
    interactive: 3,
  }),
}))

vi.mock('agent-browser/dist/diff.js', () => ({
  diffSnapshots: vi.fn().mockReturnValue({
    diff: '- old\n+ new',
    changed: true,
    additions: 1,
    removals: 1,
  }),
}))

vi.mock('agent-browser/dist/actions.js', () => ({
  executeCommand: vi.fn().mockResolvedValue({ success: true, data: { result: 'ok' } }),
  toAIFriendlyError: vi.fn((error: unknown, ref: string) => {
    return new Error(`Element ${ref}: ${error instanceof Error ? error.message : String(error)}`)
  }),
}))

vi.mock('agent-browser/dist/types.js', () => ({}))

// Shared mock objects
const mockPage = {
  goto: vi.fn().mockResolvedValue(undefined),
  goBack: vi.fn().mockResolvedValue(undefined),
  goForward: vi.fn().mockResolvedValue(undefined),
  screenshot: vi.fn().mockResolvedValue(Buffer.from('fakepng')),
  viewportSize: vi.fn().mockReturnValue({ width: 1280, height: 720 }),
  waitForTimeout: vi.fn().mockResolvedValue(undefined),
  keyboard: { press: vi.fn().mockResolvedValue(undefined) },
  mouse: { wheel: vi.fn().mockResolvedValue(undefined) },
  evaluate: vi.fn().mockResolvedValue(42),
}

const mockLocator = {
  click: vi.fn().mockResolvedValue(undefined),
  fill: vi.fn().mockResolvedValue(undefined),
  selectOption: vi.fn().mockResolvedValue(undefined),
  check: vi.fn().mockResolvedValue(undefined),
  uncheck: vi.fn().mockResolvedValue(undefined),
  hover: vi.fn().mockResolvedValue(undefined),
  dragTo: vi.fn().mockResolvedValue(undefined),
  setInputFiles: vi.fn().mockResolvedValue(undefined),
  press: vi.fn().mockResolvedValue(undefined),
}

const mockManager = {
  launch: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  isLaunched: vi.fn().mockReturnValue(false),
  getPage: vi.fn().mockReturnValue(mockPage),
  getLocator: vi.fn().mockReturnValue(mockLocator),
  getSnapshot: vi.fn().mockResolvedValue({
    tree: 'page "Test"\n  button "OK" [ref=e0]',
    refs: { e0: { selector: 'button', role: 'button', name: 'OK' } },
  }),
  setLastSnapshot: vi.fn(),
  getLastSnapshot: vi.fn().mockReturnValue('page "Test"\n  button "OK" [ref=e0]'),
  startConsoleTracking: vi.fn(),
  startRequestTracking: vi.fn(),
  getConsoleMessages: vi.fn().mockReturnValue([]),
  clearConsoleMessages: vi.fn(),
  getRequests: vi.fn().mockReturnValue([]),
  clearRequests: vi.fn(),
  listTabs: vi.fn().mockResolvedValue([
    { index: 0, url: 'https://test.com', title: 'Test', active: true },
  ]),
  switchTo: vi.fn().mockResolvedValue(undefined),
  closeTab: vi.fn().mockResolvedValue(undefined),
  setViewport: vi.fn().mockResolvedValue(undefined),
  setDialogHandler: vi.fn(),
}

import { PlaywrightDriver } from './playwright'
import { getSnapshotStats } from 'agent-browser/dist/snapshot.js'
import { diffSnapshots } from 'agent-browser/dist/diff.js'
import { executeCommand, toAIFriendlyError } from 'agent-browser/dist/actions.js'

describe('PlaywrightDriver', () => {
  let driver: PlaywrightDriver

  beforeEach(() => {
    vi.clearAllMocks()
    mockManager.isLaunched.mockReturnValue(false)
    driver = new PlaywrightDriver({ headless: true, timeout: 5000 })
  })

  // =========================================================================
  // Lifecycle
  // =========================================================================

  describe('connect', () => {
    it('should call manager.launch with config', async () => {
      await driver.connect()
      expect(mockManager.launch).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'launch',
          action: 'launch',
          headless: true,
        }),
      )
    })

    it('should start tracking after launch', async () => {
      await driver.connect()
      expect(mockManager.startConsoleTracking).toHaveBeenCalled()
      expect(mockManager.startRequestTracking).toHaveBeenCalled()
    })

    it('should not launch if already connected', async () => {
      mockManager.isLaunched.mockReturnValue(true)
      await driver.connect()
      expect(mockManager.launch).not.toHaveBeenCalled()
    })
  })

  describe('close', () => {
    it('should call manager.close', async () => {
      await driver.close()
      expect(mockManager.close).toHaveBeenCalled()
    })

    it('should not throw if browser already closed', async () => {
      mockManager.close.mockRejectedValueOnce(new Error('Browser already closed'))
      await expect(driver.close()).resolves.toBeUndefined()
    })
  })

  describe('isConnected', () => {
    it('should return false when not launched', () => {
      mockManager.isLaunched.mockReturnValue(false)
      expect(driver.isConnected()).toBe(false)
    })

    it('should return true when launched', () => {
      mockManager.isLaunched.mockReturnValue(true)
      expect(driver.isConnected()).toBe(true)
    })
  })

  // =========================================================================
  // Navigation
  // =========================================================================

  describe('navigate', () => {
    it('should goto url and return snapshot', async () => {
      mockManager.isLaunched.mockReturnValue(true)
      const result = await driver.navigate('https://example.com')

      expect(mockPage.goto).toHaveBeenCalledWith('https://example.com', {
        waitUntil: 'domcontentloaded',
        timeout: 5000,
      })
      expect(result.text).toContain('page "Test"')
      expect(result.stats).toBeDefined()
    })
  })

  describe('goBack', () => {
    it('should call page.goBack and return snapshot', async () => {
      mockManager.isLaunched.mockReturnValue(true)
      const result = await driver.goBack()
      expect(mockPage.goBack).toHaveBeenCalledWith({ waitUntil: 'domcontentloaded' })
      expect(result.text).toBeDefined()
    })
  })

  describe('goForward', () => {
    it('should call page.goForward and return snapshot', async () => {
      mockManager.isLaunched.mockReturnValue(true)
      const result = await driver.goForward()
      expect(mockPage.goForward).toHaveBeenCalledWith({ waitUntil: 'domcontentloaded' })
      expect(result.text).toBeDefined()
    })
  })

  // =========================================================================
  // Page State
  // =========================================================================

  describe('snapshot', () => {
    beforeEach(() => {
      mockManager.isLaunched.mockReturnValue(true)
    })

    it('should call getSnapshot with mapped options', async () => {
      await driver.snapshot({ mode: 'interactive', selector: '#app', maxDepth: 5, cursor: true })

      expect(mockManager.getSnapshot).toHaveBeenCalledWith({
        interactive: true,
        compact: false,
        selector: '#app',
        maxDepth: 5,
        cursor: true,
      })
    })

    it('should store lastSnapshot', async () => {
      await driver.snapshot()
      expect(mockManager.setLastSnapshot).toHaveBeenCalledWith(
        'page "Test"\n  button "OK" [ref=e0]',
      )
    })

    it('should call getSnapshotStats', async () => {
      const result = await driver.snapshot()
      expect(getSnapshotStats).toHaveBeenCalled()
      expect(result.stats).toEqual({
        lines: 10, chars: 200, tokens: 50, refs: 3, interactive: 3,
      })
    })

    it('should map compact mode correctly', async () => {
      await driver.snapshot({ mode: 'compact' })
      expect(mockManager.getSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({ interactive: false, compact: true }),
      )
    })

    it('should map full mode correctly', async () => {
      await driver.snapshot({ mode: 'full' })
      expect(mockManager.getSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({ interactive: false, compact: false }),
      )
    })
  })

  describe('diffSnapshot', () => {
    beforeEach(() => {
      mockManager.isLaunched.mockReturnValue(true)
    })

    it('should call diffSnapshots with before and current', async () => {
      const result = await driver.diffSnapshot()

      expect(mockManager.getLastSnapshot).toHaveBeenCalled()
      expect(mockManager.getSnapshot).toHaveBeenCalled()
      expect(diffSnapshots).toHaveBeenCalledWith(
        'page "Test"\n  button "OK" [ref=e0]',
        'page "Test"\n  button "OK" [ref=e0]',
      )
      expect(result.changed).toBe(true)
      expect(result.diff).toBe('- old\n+ new')
    })

    it('should update lastSnapshot after diff', async () => {
      await driver.diffSnapshot()
      expect(mockManager.setLastSnapshot).toHaveBeenCalled()
    })
  })

  describe('screenshot', () => {
    it('should return base64 screenshot', async () => {
      mockManager.isLaunched.mockReturnValue(true)
      const result = await driver.screenshot(false)

      expect(mockPage.screenshot).toHaveBeenCalledWith({ type: 'png', fullPage: false })
      expect(result.base64).toBeDefined()
      expect(result.width).toBe(1280)
      expect(result.height).toBe(720)
    })

    it('should default fullPage to false', async () => {
      mockManager.isLaunched.mockReturnValue(true)
      await driver.screenshot()
      expect(mockPage.screenshot).toHaveBeenCalledWith({ type: 'png', fullPage: false })
    })
  })

  // =========================================================================
  // Element Interaction
  // =========================================================================

  describe('click', () => {
    beforeEach(() => {
      mockManager.isLaunched.mockReturnValue(true)
    })

    it('should get locator and click', async () => {
      const result = await driver.click('e0')
      expect(mockManager.getLocator).toHaveBeenCalledWith('e0')
      expect(mockLocator.click).toHaveBeenCalledWith({ timeout: 5000 })
      expect(result.text).toBeDefined()
    })

    it('should wrap errors with toAIFriendlyError', async () => {
      mockLocator.click.mockRejectedValueOnce(new Error('element not found'))
      await expect(driver.click('e99')).rejects.toThrow('Element e99')
      expect(toAIFriendlyError).toHaveBeenCalled()
    })
  })

  describe('type', () => {
    beforeEach(() => {
      mockManager.isLaunched.mockReturnValue(true)
    })

    it('should fill text into locator', async () => {
      await driver.type('e1', 'hello')
      expect(mockLocator.fill).toHaveBeenCalledWith('hello', { timeout: 5000 })
    })

    it('should press Enter when submit is true', async () => {
      await driver.type('e1', 'hello', true)
      expect(mockLocator.press).toHaveBeenCalledWith('Enter')
      expect(mockPage.waitForTimeout).toHaveBeenCalledWith(500)
    })

    it('should not press Enter when submit is false', async () => {
      await driver.type('e1', 'hello', false)
      expect(mockLocator.press).not.toHaveBeenCalled()
    })
  })

  describe('fill', () => {
    it('should fill value directly', async () => {
      mockManager.isLaunched.mockReturnValue(true)
      await driver.fill('e2', 'value')
      expect(mockLocator.fill).toHaveBeenCalledWith('value', { timeout: 5000 })
    })
  })

  describe('selectOption', () => {
    it('should select options', async () => {
      mockManager.isLaunched.mockReturnValue(true)
      await driver.selectOption('e3', ['opt1'])
      expect(mockLocator.selectOption).toHaveBeenCalledWith(['opt1'], { timeout: 5000 })
    })
  })

  describe('check', () => {
    beforeEach(() => {
      mockManager.isLaunched.mockReturnValue(true)
    })

    it('should check by default', async () => {
      await driver.check('e4')
      expect(mockLocator.check).toHaveBeenCalledWith({ timeout: 5000 })
    })

    it('should uncheck when checked=false', async () => {
      await driver.check('e4', false)
      expect(mockLocator.uncheck).toHaveBeenCalledWith({ timeout: 5000 })
    })

    it('should check when checked=true', async () => {
      await driver.check('e4', true)
      expect(mockLocator.check).toHaveBeenCalledWith({ timeout: 5000 })
    })
  })

  describe('hover', () => {
    it('should hover over element', async () => {
      mockManager.isLaunched.mockReturnValue(true)
      await driver.hover('e5')
      expect(mockLocator.hover).toHaveBeenCalledWith({ timeout: 5000 })
    })
  })

  // =========================================================================
  // Input
  // =========================================================================

  describe('pressKey', () => {
    it('should press key on page keyboard', async () => {
      mockManager.isLaunched.mockReturnValue(true)
      await driver.pressKey('Enter')
      expect(mockPage.keyboard.press).toHaveBeenCalledWith('Enter')
    })
  })

  describe('scroll', () => {
    it('should scroll down', async () => {
      mockManager.isLaunched.mockReturnValue(true)
      await driver.scroll('down', 2)
      expect(mockPage.mouse.wheel).toHaveBeenCalledWith(0, 1200)
    })

    it('should scroll up with negative delta', async () => {
      mockManager.isLaunched.mockReturnValue(true)
      await driver.scroll('up', 1)
      expect(mockPage.mouse.wheel).toHaveBeenCalledWith(0, -600)
    })

    it('should default to 1 page', async () => {
      mockManager.isLaunched.mockReturnValue(true)
      await driver.scroll('down')
      expect(mockPage.mouse.wheel).toHaveBeenCalledWith(0, 600)
    })
  })

  // =========================================================================
  // Tabs
  // =========================================================================

  describe('getTabs', () => {
    it('should return formatted tab list', async () => {
      mockManager.isLaunched.mockReturnValue(true)
      const tabs = await driver.getTabs()
      expect(tabs).toEqual([
        { id: '0', url: 'https://test.com', title: 'Test', active: true },
      ])
    })
  })

  describe('switchTab', () => {
    it('should switch by index', async () => {
      mockManager.isLaunched.mockReturnValue(true)
      await driver.switchTab('1')
      expect(mockManager.switchTo).toHaveBeenCalledWith(1)
    })
  })

  describe('closeTab', () => {
    it('should close by index', async () => {
      mockManager.isLaunched.mockReturnValue(true)
      await driver.closeTab('2')
      expect(mockManager.closeTab).toHaveBeenCalledWith(2)
    })

    it('should close current tab when no id given', async () => {
      mockManager.isLaunched.mockReturnValue(true)
      await driver.closeTab()
      expect(mockManager.closeTab).toHaveBeenCalledWith(undefined)
    })
  })

  // =========================================================================
  // Advanced
  // =========================================================================

  describe('command', () => {
    it('should execute command via executeCommand', async () => {
      mockManager.isLaunched.mockReturnValue(true)
      const result = await driver.command('url')
      expect(executeCommand).toHaveBeenCalledWith(
        { id: 'cmd', action: 'url' },
        mockManager,
      )
      expect(result).toEqual({ result: 'ok' })
    })

    it('should merge params into command', async () => {
      mockManager.isLaunched.mockReturnValue(true)
      await driver.command('evaluate', { script: 'document.title' })
      expect(executeCommand).toHaveBeenCalledWith(
        { id: 'cmd', action: 'evaluate', script: 'document.title' },
        mockManager,
      )
    })

    it('should throw validation error for unknown command', async () => {
      mockManager.isLaunched.mockReturnValue(true)
      await expect(driver.command('invalid')).rejects.toThrow('Validation error')
    })

    it('should throw on failed command execution', async () => {
      mockManager.isLaunched.mockReturnValue(true)
      const { executeCommand: mockExec } = await import('agent-browser/dist/actions.js')
      vi.mocked(mockExec).mockResolvedValueOnce({ success: false, error: 'Execution failed' })
      await expect(driver.command('url')).rejects.toThrow('Execution failed')
    })
  })

  describe('evaluate', () => {
    it('should evaluate script on page', async () => {
      mockManager.isLaunched.mockReturnValue(true)
      const result = await driver.evaluate('1 + 1')
      expect(mockPage.evaluate).toHaveBeenCalledWith('1 + 1')
      expect(result).toBe(42)
    })
  })

  describe('wait', () => {
    it('should wait for specified seconds', async () => {
      mockManager.isLaunched.mockReturnValue(true)
      await driver.wait(3)
      expect(mockPage.waitForTimeout).toHaveBeenCalledWith(3000)
    })

    it('should default to 2 seconds', async () => {
      mockManager.isLaunched.mockReturnValue(true)
      await driver.wait()
      expect(mockPage.waitForTimeout).toHaveBeenCalledWith(2000)
    })
  })

  // =========================================================================
  // Config
  // =========================================================================

  describe('config', () => {
    it('should use default viewport when not configured', async () => {
      const defaultDriver = new PlaywrightDriver()
      await defaultDriver.connect()
      expect(mockManager.launch).toHaveBeenCalledWith(
        expect.objectContaining({
          viewport: { width: 1280, height: 720 },
          headless: false,
        }),
      )
    })

    it('should pass all config options to launch', async () => {
      const fullDriver = new PlaywrightDriver({
        headless: true,
        viewport: { width: 800, height: 600 },
        executablePath: '/usr/bin/chrome',
        cdpUrl: 'http://localhost:9222',
        autoConnect: true,
        profile: 'default',
        extensions: ['/ext1'],
        proxy: { server: 'http://proxy:8080' },
        args: ['--no-sandbox'],
        userAgent: 'TestBot',
        storageState: '/tmp/state.json',
      })
      await fullDriver.connect()
      expect(mockManager.launch).toHaveBeenCalledWith(
        expect.objectContaining({
          headless: true,
          viewport: { width: 800, height: 600 },
          executablePath: '/usr/bin/chrome',
          cdpUrl: 'http://localhost:9222',
          autoConnect: true,
          profile: 'default',
          extensions: ['/ext1'],
          proxy: { server: 'http://proxy:8080' },
          args: ['--no-sandbox'],
          userAgent: 'TestBot',
          storageState: '/tmp/state.json',
        }),
      )
    })
  })
})
