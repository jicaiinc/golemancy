import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import path from 'node:path'

// vi.hoisted ensures mockExistsSync is initialized before vi.mock (both are hoisted)
const { mockExistsSync } = vi.hoisted(() => ({
  mockExistsSync: vi.fn<(p: string) => boolean>().mockReturnValue(false),
}))
vi.mock('node:fs', () => ({ existsSync: mockExistsSync }))

vi.mock('@golemancy/tools/browser', () => ({
  createBrowserTools: vi.fn().mockReturnValue({ tools: { browser_navigate: {} }, cleanup: vi.fn() }),
}))

import { getSystemBrowserPath, BROWSER_CANDIDATES, loadBrowserTools, buildBrowserInstructions } from './browser-tools'
import { createBrowserTools } from '@golemancy/tools/browser'

const originalPlatform = process.platform

function setPlatform(platform: string) {
  Object.defineProperty(process, 'platform', { value: platform, writable: true })
}

describe('BROWSER_CANDIDATES', () => {
  it('has entries for darwin, win32, and linux', () => {
    expect(BROWSER_CANDIDATES).toHaveProperty('darwin')
    expect(BROWSER_CANDIDATES).toHaveProperty('win32')
    expect(BROWSER_CANDIDATES).toHaveProperty('linux')
  })

  it('darwin candidates are a static array starting with Chrome', () => {
    const candidates = BROWSER_CANDIDATES.darwin as string[]
    expect(Array.isArray(candidates)).toBe(true)
    expect(candidates[0]).toContain('Google Chrome')
    expect(candidates[1]).toContain('Microsoft Edge')
    expect(candidates[2]).toContain('Chromium')
  })

  it('linux candidates are a static array starting with google-chrome', () => {
    const candidates = BROWSER_CANDIDATES.linux as string[]
    expect(Array.isArray(candidates)).toBe(true)
    expect(candidates[0]).toBe('/usr/bin/google-chrome')
  })

  it('win32 candidates is a function that expands prefixes × suffixes', () => {
    const factory = BROWSER_CANDIDATES.win32 as (prefixes: string[]) => string[]
    expect(typeof factory).toBe('function')

    const candidates = factory(['C:\\Program Files', 'C:\\Users\\test\\AppData\\Local'])
    // 3 browsers × 2 prefixes = 6 candidates
    expect(candidates).toHaveLength(6)
    // Chrome candidates come first (both prefixes), then Chromium, then Edge
    expect(candidates[0]).toBe(path.join('C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'))
    expect(candidates[1]).toBe(path.join('C:\\Users\\test\\AppData\\Local', 'Google', 'Chrome', 'Application', 'chrome.exe'))
  })
})

describe('getSystemBrowserPath', () => {
  beforeEach(() => {
    mockExistsSync.mockReset()
  })

  afterEach(() => {
    setPlatform(originalPlatform)
  })

  // ── macOS ────────────────────────────────────────────────

  it('returns Chrome path on macOS when Chrome exists', () => {
    setPlatform('darwin')
    mockExistsSync.mockImplementation((p: string) =>
      p === '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    )

    expect(getSystemBrowserPath()).toBe('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
  })

  it('falls back to Edge on macOS when Chrome is missing', () => {
    setPlatform('darwin')
    mockExistsSync.mockImplementation((p: string) =>
      p === '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    )

    expect(getSystemBrowserPath()).toBe('/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge')
  })

  it('falls back to Chromium on macOS when Chrome and Edge are missing', () => {
    setPlatform('darwin')
    mockExistsSync.mockImplementation((p: string) =>
      p === '/Applications/Chromium.app/Contents/MacOS/Chromium',
    )

    expect(getSystemBrowserPath()).toBe('/Applications/Chromium.app/Contents/MacOS/Chromium')
  })

  it('returns undefined on macOS when no browser is found', () => {
    setPlatform('darwin')
    mockExistsSync.mockReturnValue(false)

    expect(getSystemBrowserPath()).toBeUndefined()
  })

  it('returns first match when multiple browsers exist on macOS', () => {
    setPlatform('darwin')
    mockExistsSync.mockReturnValue(true) // all exist

    // Chrome should win (first in list)
    expect(getSystemBrowserPath()).toBe('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
  })

  // ── Windows ──────────────────────────────────────────────

  it('returns Chrome path on Windows', () => {
    setPlatform('win32')
    const chromePath = path.join('C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe')
    process.env.PROGRAMFILES = 'C:\\Program Files'
    process.env['PROGRAMFILES(X86)'] = 'C:\\Program Files (x86)'
    process.env.LOCALAPPDATA = 'C:\\Users\\test\\AppData\\Local'

    mockExistsSync.mockImplementation((p: string) => p === chromePath)

    expect(getSystemBrowserPath()).toBe(chromePath)
  })

  it('falls back to Edge on Windows when Chrome is missing (Edge is pre-installed)', () => {
    setPlatform('win32')
    const edgePath = path.join('C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe')
    process.env.PROGRAMFILES = 'C:\\Program Files'
    process.env['PROGRAMFILES(X86)'] = ''
    process.env.LOCALAPPDATA = ''

    mockExistsSync.mockImplementation((p: string) => p === edgePath)

    expect(getSystemBrowserPath()).toBe(edgePath)
  })

  it('returns undefined on Windows when no browser is found', () => {
    setPlatform('win32')
    process.env.PROGRAMFILES = 'C:\\Program Files'
    process.env['PROGRAMFILES(X86)'] = ''
    process.env.LOCALAPPDATA = ''
    mockExistsSync.mockReturnValue(false)

    expect(getSystemBrowserPath()).toBeUndefined()
  })

  // ── Linux ────────────────────────────────────────────────

  it('returns google-chrome on Linux when it exists', () => {
    setPlatform('linux')
    mockExistsSync.mockImplementation((p: string) => p === '/usr/bin/google-chrome')

    expect(getSystemBrowserPath()).toBe('/usr/bin/google-chrome')
  })

  it('falls back to chromium-browser on Linux', () => {
    setPlatform('linux')
    mockExistsSync.mockImplementation((p: string) => p === '/usr/bin/chromium-browser')

    expect(getSystemBrowserPath()).toBe('/usr/bin/chromium-browser')
  })

  it('returns undefined on Linux when no browser is found', () => {
    setPlatform('linux')
    mockExistsSync.mockReturnValue(false)

    expect(getSystemBrowserPath()).toBeUndefined()
  })

  // ── Unsupported platform ─────────────────────────────────

  it('returns undefined on unsupported platform', () => {
    setPlatform('freebsd')

    expect(getSystemBrowserPath()).toBeUndefined()
  })
})

describe('loadBrowserTools', () => {
  beforeEach(() => {
    vi.mocked(createBrowserTools).mockReturnValue({
      tools: { browser_navigate: {} as any },
      cleanup: vi.fn().mockResolvedValue(undefined),
    })
  })

  it('returns tools and cleanup on success', () => {
    const result = loadBrowserTools(true)

    expect(result).not.toBeNull()
    expect(result!.tools).toHaveProperty('browser_navigate')
    expect(typeof result!.cleanup).toBe('function')
  })

  it('passes default config when config is boolean true', () => {
    loadBrowserTools(true)

    expect(createBrowserTools).toHaveBeenCalledWith(
      expect.objectContaining({ driver: 'playwright', headless: false }),
    )
  })

  it('merges object config with defaults', () => {
    loadBrowserTools({ headless: true, viewport: { width: 800, height: 600 } })

    expect(createBrowserTools).toHaveBeenCalledWith(
      expect.objectContaining({
        driver: 'playwright',
        headless: true,
        viewport: { width: 800, height: 600 },
      }),
    )
  })

  it('allows object config to override executablePath', () => {
    loadBrowserTools({ executablePath: '/custom/browser' })

    expect(createBrowserTools).toHaveBeenCalledWith(
      expect.objectContaining({ executablePath: '/custom/browser' }),
    )
  })

  it('returns null when createBrowserTools throws', () => {
    vi.mocked(createBrowserTools).mockImplementation(() => { throw new Error('boom') })

    const result = loadBrowserTools(true)

    expect(result).toBeNull()
  })
})

describe('buildBrowserInstructions', () => {
  it('returns a non-empty string with browser guidance', () => {
    const instructions = buildBrowserInstructions()

    expect(instructions).toContain('# Browser')
    expect(instructions).toContain('browser_navigate')
    expect(instructions).toContain('browser_snapshot')
  })
})
