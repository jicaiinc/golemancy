import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────

vi.mock('./paths', () => ({
  getBundledCertFilePath: vi.fn(() => null),
  getBundledNodeBinDir: vi.fn(() => null),
  getBundledPythonPath: vi.fn(() => null),
  getBundledUvBinDir: vi.fn(() => null),
  getProjectPythonEnvPath: vi.fn((id: string) => `/data/projects/${id}/runtime/python-env`),
  getProjectPythonEnvBinPath: vi.fn((id: string) => `/data/projects/${id}/runtime/python-env/bin`),
  getPipCachePath: vi.fn(() => '/data/runtime/cache/pip'),
  getNpmCachePath: vi.fn(() => '/data/runtime/cache/npm'),
}))

vi.mock('../utils/paths', () => ({
  getDataDir: vi.fn(() => '/data'),
}))

vi.mock('../logger', () => ({
  logger: { child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}))

import { RuntimeEnvManager } from './runtime-env-manager'
import {
  getBundledNodeBinDir,
  getBundledPythonPath,
  getBundledUvBinDir,
  getBundledCertFilePath,
  getNpmCachePath,
} from './paths'

// ── Helpers ──────────────────────────────────────────────────

let manager: RuntimeEnvManager

/** Save and restore process.env keys we modify */
const savedEnv: Record<string, string | undefined> = {}
const ENV_KEYS = [
  'PATH', 'UV_PYTHON', 'UV_PYTHON_DOWNLOADS', 'UV_CACHE_DIR',
  'SSL_CERT_FILE', 'npm_config_cache',
]

beforeEach(() => {
  vi.clearAllMocks()
  // Reset mock implementations to defaults (clearAllMocks only clears call
  // history, not mockReturnValue set by earlier tests)
  vi.mocked(getBundledNodeBinDir).mockReturnValue(null)
  vi.mocked(getBundledPythonPath).mockReturnValue(null)
  vi.mocked(getBundledUvBinDir).mockReturnValue(null)
  vi.mocked(getBundledCertFilePath).mockReturnValue(null)
  vi.mocked(getNpmCachePath).mockReturnValue('/data/runtime/cache/npm')
  manager = new RuntimeEnvManager()
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key]
  }
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] !== undefined) {
      process.env[key] = savedEnv[key]
    } else {
      delete process.env[key]
    }
  }
})

// ── augmentProcessEnv ────────────────────────────────────────

describe('isAugmented', () => {
  it('returns false before augmentProcessEnv is called', () => {
    expect(manager.isAugmented).toBe(false)
  })

  it('returns true after augmentProcessEnv is called', () => {
    manager.augmentProcessEnv()
    expect(manager.isAugmented).toBe(true)
  })
})

describe('augmentProcessEnv', () => {
  it('prepends bundled node bin to PATH', () => {
    const originalPath = process.env.PATH ?? ''
    vi.mocked(getBundledNodeBinDir).mockReturnValue('/bundled/node/bin')

    manager.augmentProcessEnv()

    expect(process.env.PATH).toContain('/bundled/node/bin')
    expect(process.env.PATH!.indexOf('/bundled/node/bin')).toBeLessThan(
      process.env.PATH!.indexOf(originalPath),
    )
  })

  it('prepends bundled uv bin to PATH', () => {
    vi.mocked(getBundledUvBinDir).mockReturnValue('/bundled/uv')

    manager.augmentProcessEnv()

    expect(process.env.PATH).toContain('/bundled/uv')
  })

  it('prepends bundled python bin dir to PATH', () => {
    vi.mocked(getBundledPythonPath).mockReturnValue('/bundled/python/bin/python3.13')

    manager.augmentProcessEnv()

    expect(process.env.PATH).toContain('/bundled/python/bin')
  })

  it('sets UV_PYTHON when bundled Python is available', () => {
    delete process.env.UV_PYTHON
    vi.mocked(getBundledPythonPath).mockReturnValue('/bundled/python/bin/python3.13')

    manager.augmentProcessEnv()

    expect(process.env.UV_PYTHON).toBe('/bundled/python/bin/python3.13')
    expect(process.env.UV_PYTHON_DOWNLOADS).toBe('never')
  })

  it('does not overwrite existing UV_PYTHON', () => {
    process.env.UV_PYTHON = '/custom/python'
    vi.mocked(getBundledPythonPath).mockReturnValue('/bundled/python/bin/python3.13')

    manager.augmentProcessEnv()

    expect(process.env.UV_PYTHON).toBe('/custom/python')
  })

  it('sets UV_CACHE_DIR when not already set', () => {
    delete process.env.UV_CACHE_DIR

    manager.augmentProcessEnv()

    expect(process.env.UV_CACHE_DIR).toBe('/data/runtime/cache/uv')
  })

  it('sets SSL_CERT_FILE when bundled cert is available', () => {
    delete process.env.SSL_CERT_FILE
    vi.mocked(getBundledCertFilePath).mockReturnValue('/bundled/cacert.pem')

    manager.augmentProcessEnv()

    expect(process.env.SSL_CERT_FILE).toBe('/bundled/cacert.pem')
  })

  it('does not overwrite existing SSL_CERT_FILE', () => {
    process.env.SSL_CERT_FILE = '/custom/cert.pem'
    vi.mocked(getBundledCertFilePath).mockReturnValue('/bundled/cacert.pem')

    manager.augmentProcessEnv()

    expect(process.env.SSL_CERT_FILE).toBe('/custom/cert.pem')
  })

  it('sets npm_config_cache when not already set', () => {
    delete process.env.npm_config_cache

    manager.augmentProcessEnv()

    expect(process.env.npm_config_cache).toBe('/data/runtime/cache/npm')
  })

  it('does not duplicate PATH entries on second call', () => {
    vi.mocked(getBundledNodeBinDir).mockReturnValue('/bundled/node/bin')
    process.env.PATH = '/bundled/node/bin:/usr/bin'

    manager.augmentProcessEnv()

    // Should not add /bundled/node/bin again
    const occurrences = process.env.PATH!.split(':').filter(p => p === '/bundled/node/bin').length
    expect(occurrences).toBe(1)
  })
})

// ── getProjectEnvOverlay ─────────────────────────────────────

describe('getProjectEnvOverlay', () => {
  it('returns env vars with project-specific paths', () => {
    const overlay = manager.getProjectEnvOverlay('proj-abc')

    expect(overlay).toHaveProperty('PATH')
    expect(overlay).toHaveProperty('PIP_CACHE_DIR')
    expect(overlay).toHaveProperty('VIRTUAL_ENV')
    expect(overlay).toHaveProperty('npm_config_cache')
    expect(overlay.VIRTUAL_ENV).toContain('proj-abc')
  })

  it('returns different overlays for different projects', () => {
    const overlayA = manager.getProjectEnvOverlay('proj-a')
    const overlayB = manager.getProjectEnvOverlay('proj-b')

    expect(overlayA.VIRTUAL_ENV).not.toBe(overlayB.VIRTUAL_ENV)
    expect(overlayA.PATH).not.toBe(overlayB.PATH)
  })

  it('returns a fresh copy (not cached)', () => {
    const a = manager.getProjectEnvOverlay('proj-x')
    const b = manager.getProjectEnvOverlay('proj-x')
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
  })
})

// ── getRuntimeInfo ───────────────────────────────────────────

describe('getRuntimeInfo', () => {
  it('returns false for all when no bundled runtimes', () => {
    const info = manager.getRuntimeInfo()
    expect(info).toEqual({
      hasBundledPython: false,
      hasBundledNode: false,
      hasBundledUv: false,
    })
  })

  it('reflects bundled runtime availability', () => {
    vi.mocked(getBundledPythonPath).mockReturnValue('/bundled/python')
    vi.mocked(getBundledNodeBinDir).mockReturnValue('/bundled/node')
    vi.mocked(getBundledUvBinDir).mockReturnValue('/bundled/uv')

    const info = manager.getRuntimeInfo()
    expect(info).toEqual({
      hasBundledPython: true,
      hasBundledNode: true,
      hasBundledUv: true,
    })
  })

  it('dynamically reflects env changes (no caching)', () => {
    vi.mocked(getBundledNodeBinDir).mockReturnValue(null)
    expect(manager.getRuntimeInfo().hasBundledNode).toBe(false)

    vi.mocked(getBundledNodeBinDir).mockReturnValue('/bundled/node')
    expect(manager.getRuntimeInfo().hasBundledNode).toBe(true)
  })
})
