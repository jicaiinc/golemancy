import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineBrowserTools } from './tools'
import type { BrowserDriver, SnapshotResult, DiffResult, Screenshot, TabInfo } from './driver'

/** Create a mock BrowserDriver with vi.fn() stubs */
function createMockDriver(): BrowserDriver & { [K in keyof BrowserDriver]: ReturnType<typeof vi.fn> } {
  const snapResult: SnapshotResult = {
    text: 'page "Test Page"\n  button "Submit" [ref=e0]',
    refs: { e0: { selector: 'button', role: 'button', name: 'Submit' } },
    stats: { lines: 2, chars: 42, tokens: 10, refs: 1, interactive: 1 },
  }

  const diffResult: DiffResult = {
    diff: '- button "Submit"\n+ button "Submitted"',
    changed: true,
    additions: 1,
    removals: 1,
  }

  const screenshot: Screenshot = {
    base64: 'iVBORw0KGgoAAAANSUhEUg==',
    width: 1280,
    height: 720,
  }

  const tabs: TabInfo[] = [
    { id: '0', url: 'https://example.com', title: 'Example', active: true },
    { id: '1', url: 'https://other.com', title: 'Other', active: false },
  ]

  return {
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    isConnected: vi.fn().mockReturnValue(true),
    navigate: vi.fn().mockResolvedValue(snapResult),
    goBack: vi.fn().mockResolvedValue(snapResult),
    goForward: vi.fn().mockResolvedValue(snapResult),
    snapshot: vi.fn().mockResolvedValue(snapResult),
    diffSnapshot: vi.fn().mockResolvedValue(diffResult),
    screenshot: vi.fn().mockResolvedValue(screenshot),
    consoleMessages: vi.fn().mockResolvedValue([]),
    networkRequests: vi.fn().mockResolvedValue([]),
    click: vi.fn().mockResolvedValue(snapResult),
    type: vi.fn().mockResolvedValue(snapResult),
    fill: vi.fn().mockResolvedValue(snapResult),
    selectOption: vi.fn().mockResolvedValue(snapResult),
    check: vi.fn().mockResolvedValue(snapResult),
    hover: vi.fn().mockResolvedValue(snapResult),
    drag: vi.fn().mockResolvedValue(snapResult),
    uploadFile: vi.fn().mockResolvedValue(snapResult),
    pressKey: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(snapResult),
    handleDialog: vi.fn().mockResolvedValue(undefined),
    fillForm: vi.fn().mockResolvedValue(snapResult),
    getTabs: vi.fn().mockResolvedValue(tabs),
    switchTab: vi.fn().mockResolvedValue(snapResult),
    closeTab: vi.fn().mockResolvedValue(undefined),
    resize: vi.fn().mockResolvedValue(snapResult),
    command: vi.fn().mockResolvedValue({ url: 'https://example.com' }),
    evaluate: vi.fn().mockResolvedValue(42),
    wait: vi.fn().mockResolvedValue(undefined),
  }
}

describe('defineBrowserTools', () => {
  let driver: ReturnType<typeof createMockDriver>
  let tools: ReturnType<typeof defineBrowserTools>

  beforeEach(() => {
    driver = createMockDriver()
    tools = defineBrowserTools(driver)
  })

  it('should return exactly 16 tools', () => {
    expect(Object.keys(tools)).toHaveLength(16)
  })

  it('should return all expected tool names', () => {
    const names = Object.keys(tools).sort()
    expect(names).toEqual([
      'browser_check',
      'browser_click',
      'browser_command',
      'browser_diff_snapshot',
      'browser_fill',
      'browser_hover',
      'browser_navigate',
      'browser_press',
      'browser_screenshot',
      'browser_scroll',
      'browser_select',
      'browser_snapshot',
      'browser_tab_list',
      'browser_tab_switch',
      'browser_type',
      'browser_wait',
    ])
  })

  describe('ensureConnected', () => {
    it('should call connect() when driver is not connected', async () => {
      driver.isConnected.mockReturnValue(false)
      await tools.browser_navigate.execute!({ url: 'https://example.com' }, { toolCallId: '1', messages: [], abortSignal: undefined as any })
      expect(driver.connect).toHaveBeenCalledOnce()
    })

    it('should not call connect() when driver is already connected', async () => {
      driver.isConnected.mockReturnValue(true)
      await tools.browser_navigate.execute!({ url: 'https://example.com' }, { toolCallId: '1', messages: [], abortSignal: undefined as any })
      expect(driver.connect).not.toHaveBeenCalled()
    })
  })

  describe('browser_navigate', () => {
    it('should call driver.navigate and return text', async () => {
      const result = await tools.browser_navigate.execute!({ url: 'https://example.com' }, { toolCallId: '1', messages: [], abortSignal: undefined as any })
      expect(driver.navigate).toHaveBeenCalledWith('https://example.com')
      expect(result).toBe('page "Test Page"\n  button "Submit" [ref=e0]')
    })
  })

  describe('browser_snapshot', () => {
    it('should call driver.snapshot with options and append stats', async () => {
      const result = await tools.browser_snapshot.execute!(
        { mode: 'interactive', selector: '#main', maxDepth: 3, cursor: true },
        { toolCallId: '1', messages: [], abortSignal: undefined as any },
      )
      expect(driver.snapshot).toHaveBeenCalledWith({
        mode: 'interactive',
        selector: '#main',
        maxDepth: 3,
        cursor: true,
      })
      expect(result).toContain('Stats: 1 refs, 42 chars, ~10 tokens')
    })

    it('should work with no options', async () => {
      const result = await tools.browser_snapshot.execute!(
        {},
        { toolCallId: '1', messages: [], abortSignal: undefined as any },
      )
      expect(driver.snapshot).toHaveBeenCalledWith({
        mode: undefined,
        selector: undefined,
        maxDepth: undefined,
        cursor: undefined,
      })
      expect(result).toContain('Stats:')
    })

    it('should omit stats line when stats not available', async () => {
      driver.snapshot.mockResolvedValue({ text: 'page content', refs: {} })
      const result = await tools.browser_snapshot.execute!(
        {},
        { toolCallId: '1', messages: [], abortSignal: undefined as any },
      )
      expect(result).toBe('page content')
    })
  })

  describe('browser_diff_snapshot', () => {
    it('should return diff text when changed', async () => {
      const result = await tools.browser_diff_snapshot.execute!(
        {},
        { toolCallId: '1', messages: [], abortSignal: undefined as any },
      )
      expect(driver.diffSnapshot).toHaveBeenCalled()
      expect(result).toBe('- button "Submit"\n+ button "Submitted"')
    })

    it('should return "No changes detected." when not changed', async () => {
      driver.diffSnapshot.mockResolvedValue({
        diff: '',
        changed: false,
        additions: 0,
        removals: 0,
      })
      const result = await tools.browser_diff_snapshot.execute!(
        {},
        { toolCallId: '1', messages: [], abortSignal: undefined as any },
      )
      expect(result).toBe('No changes detected.')
    })

    it('should pass options to driver', async () => {
      await tools.browser_diff_snapshot.execute!(
        { mode: 'compact', selector: '.content' },
        { toolCallId: '1', messages: [], abortSignal: undefined as any },
      )
      expect(driver.diffSnapshot).toHaveBeenCalledWith({
        mode: 'compact',
        selector: '.content',
        maxDepth: undefined,
        cursor: undefined,
      })
    })
  })

  describe('browser_screenshot', () => {
    it('should return image object', async () => {
      const result = await tools.browser_screenshot.execute!(
        { fullPage: true },
        { toolCallId: '1', messages: [], abortSignal: undefined as any },
      )
      expect(driver.screenshot).toHaveBeenCalledWith(true)
      expect(result).toEqual({
        type: 'image',
        data: 'iVBORw0KGgoAAAANSUhEUg==',
        mimeType: 'image/png',
        width: 1280,
        height: 720,
      })
    })
  })

  describe('browser_click', () => {
    it('should call driver.click with ref', async () => {
      const result = await tools.browser_click.execute!(
        { ref: 'e3' },
        { toolCallId: '1', messages: [], abortSignal: undefined as any },
      )
      expect(driver.click).toHaveBeenCalledWith('e3')
      expect(result).toBe('page "Test Page"\n  button "Submit" [ref=e0]')
    })

    it('should accept optional description without passing it to driver', async () => {
      await tools.browser_click.execute!(
        { ref: 'e3', description: 'Click the submit button' },
        { toolCallId: '1', messages: [], abortSignal: undefined as any },
      )
      expect(driver.click).toHaveBeenCalledWith('e3')
    })
  })

  describe('browser_type', () => {
    it('should call driver.type with all params', async () => {
      await tools.browser_type.execute!(
        { ref: 'e5', text: 'hello', submit: true },
        { toolCallId: '1', messages: [], abortSignal: undefined as any },
      )
      expect(driver.type).toHaveBeenCalledWith('e5', 'hello', true)
    })
  })

  describe('browser_fill', () => {
    it('should call driver.fill', async () => {
      await tools.browser_fill.execute!(
        { ref: 'e5', value: 'test value' },
        { toolCallId: '1', messages: [], abortSignal: undefined as any },
      )
      expect(driver.fill).toHaveBeenCalledWith('e5', 'test value')
    })
  })

  describe('browser_select', () => {
    it('should call driver.selectOption', async () => {
      await tools.browser_select.execute!(
        { ref: 'e2', values: ['opt1', 'opt2'] },
        { toolCallId: '1', messages: [], abortSignal: undefined as any },
      )
      expect(driver.selectOption).toHaveBeenCalledWith('e2', ['opt1', 'opt2'])
    })
  })

  describe('browser_check', () => {
    it('should call driver.check with default checked', async () => {
      await tools.browser_check.execute!(
        { ref: 'e1' },
        { toolCallId: '1', messages: [], abortSignal: undefined as any },
      )
      expect(driver.check).toHaveBeenCalledWith('e1', undefined)
    })

    it('should call driver.check with checked=false', async () => {
      await tools.browser_check.execute!(
        { ref: 'e1', checked: false },
        { toolCallId: '1', messages: [], abortSignal: undefined as any },
      )
      expect(driver.check).toHaveBeenCalledWith('e1', false)
    })
  })

  describe('browser_hover', () => {
    it('should call driver.hover', async () => {
      await tools.browser_hover.execute!(
        { ref: 'e4' },
        { toolCallId: '1', messages: [], abortSignal: undefined as any },
      )
      expect(driver.hover).toHaveBeenCalledWith('e4')
    })
  })

  describe('browser_press', () => {
    it('should call driver.pressKey and return confirmation', async () => {
      const result = await tools.browser_press.execute!(
        { key: 'Enter' },
        { toolCallId: '1', messages: [], abortSignal: undefined as any },
      )
      expect(driver.pressKey).toHaveBeenCalledWith('Enter')
      expect(result).toBe('Key pressed: Enter')
    })

    it('should handle key combinations', async () => {
      const result = await tools.browser_press.execute!(
        { key: 'Control+a' },
        { toolCallId: '1', messages: [], abortSignal: undefined as any },
      )
      expect(result).toBe('Key pressed: Control+a')
    })
  })

  describe('browser_scroll', () => {
    it('should call driver.scroll', async () => {
      await tools.browser_scroll.execute!(
        { direction: 'down', amount: 3 },
        { toolCallId: '1', messages: [], abortSignal: undefined as any },
      )
      expect(driver.scroll).toHaveBeenCalledWith('down', 3)
    })

    it('should handle default amount', async () => {
      await tools.browser_scroll.execute!(
        { direction: 'up' },
        { toolCallId: '1', messages: [], abortSignal: undefined as any },
      )
      expect(driver.scroll).toHaveBeenCalledWith('up', undefined)
    })
  })

  describe('browser_wait', () => {
    it('should default to 2 seconds', async () => {
      const result = await tools.browser_wait.execute!(
        {},
        { toolCallId: '1', messages: [], abortSignal: undefined as any },
      )
      expect(driver.wait).toHaveBeenCalledWith(2)
      expect(result).toBe('Waited 2 seconds')
    })

    it('should cap at 30 seconds', async () => {
      const result = await tools.browser_wait.execute!(
        { seconds: 60 },
        { toolCallId: '1', messages: [], abortSignal: undefined as any },
      )
      expect(driver.wait).toHaveBeenCalledWith(30)
      expect(result).toBe('Waited 30 seconds')
    })

    it('should respect custom seconds', async () => {
      const result = await tools.browser_wait.execute!(
        { seconds: 5 },
        { toolCallId: '1', messages: [], abortSignal: undefined as any },
      )
      expect(driver.wait).toHaveBeenCalledWith(5)
      expect(result).toBe('Waited 5 seconds')
    })
  })

  describe('browser_tab_list', () => {
    it('should format tab list with active marker', async () => {
      const result = await tools.browser_tab_list.execute!(
        {},
        { toolCallId: '1', messages: [], abortSignal: undefined as any },
      )
      expect(driver.getTabs).toHaveBeenCalled()
      expect(result).toContain('→ [0] Example')
      expect(result).toContain('  [1] Other')
      expect(result).toContain('https://example.com')
      expect(result).toContain('https://other.com')
    })
  })

  describe('browser_tab_switch', () => {
    it('should call driver.switchTab with index string', async () => {
      await tools.browser_tab_switch.execute!(
        { index: '1' },
        { toolCallId: '1', messages: [], abortSignal: undefined as any },
      )
      expect(driver.switchTab).toHaveBeenCalledWith('1')
    })
  })

  describe('browser_command', () => {
    it('should call driver.command and return JSON result', async () => {
      const result = await tools.browser_command.execute!(
        { command: 'url' },
        { toolCallId: '1', messages: [], abortSignal: undefined as any },
      )
      expect(driver.command).toHaveBeenCalledWith('url', undefined)
      expect(result).toBe('{\n  "url": "https://example.com"\n}')
    })

    it('should pass params to driver.command', async () => {
      await tools.browser_command.execute!(
        { command: 'evaluate', params: { script: 'document.title' } },
        { toolCallId: '1', messages: [], abortSignal: undefined as any },
      )
      expect(driver.command).toHaveBeenCalledWith('evaluate', { script: 'document.title' })
    })

    it('should return string result directly', async () => {
      driver.command.mockResolvedValue('https://example.com')
      const result = await tools.browser_command.execute!(
        { command: 'url' },
        { toolCallId: '1', messages: [], abortSignal: undefined as any },
      )
      expect(result).toBe('https://example.com')
    })
  })
})
