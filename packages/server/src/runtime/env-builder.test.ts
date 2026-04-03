import { describe, it, expect, vi, beforeEach } from 'vitest'

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

vi.mock('../logger', () => ({
  logger: { child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}))

import { buildRuntimeEnv, buildMCPRuntimeEnv } from './env-builder'
import { getBundledNodeBinDir, getBundledPythonPath, getBundledUvBinDir, getBundledCertFilePath } from './paths'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('buildRuntimeEnv', () => {
  it('returns all required env vars', () => {
    const result = buildRuntimeEnv('proj-abc123', '/usr/bin:/usr/local/bin')
    expect(result).toHaveProperty('PATH')
    expect(result).toHaveProperty('PIP_CACHE_DIR')
    expect(result).toHaveProperty('VIRTUAL_ENV')
    expect(result).toHaveProperty('npm_config_cache')
  })

  it('prepends venv bin to PATH (highest priority)', () => {
    const result = buildRuntimeEnv('proj-abc123', '/usr/bin')
    const pathParts = result.PATH.split(':')
    expect(pathParts[0]).toBe('/data/projects/proj-abc123/runtime/python-env/bin')
  })

  it('appends bundled node bin after venv bin when available', () => {
    vi.mocked(getBundledNodeBinDir).mockReturnValue('/bundled/node/bin')
    const result = buildRuntimeEnv('proj-abc123', '/usr/bin')
    const pathParts = result.PATH.split(':')
    expect(pathParts[0]).toBe('/data/projects/proj-abc123/runtime/python-env/bin')
    expect(pathParts[1]).toBe('/bundled/node/bin')
    expect(pathParts).toContain('/usr/bin')
  })

  it('appends bundled uv bin after node bin when available', () => {
    vi.mocked(getBundledNodeBinDir).mockReturnValue('/bundled/node/bin')
    vi.mocked(getBundledUvBinDir).mockReturnValue('/bundled/uv')
    const result = buildRuntimeEnv('proj-abc123', '/usr/bin')
    const pathParts = result.PATH.split(':')
    expect(pathParts[0]).toBe('/data/projects/proj-abc123/runtime/python-env/bin')
    expect(pathParts[1]).toBe('/bundled/node/bin')
    expect(pathParts[2]).toBe('/bundled/uv')
    expect(pathParts[3]).toBe('/usr/bin')
  })

  it('does not include node or uv bin when not available', () => {
    vi.mocked(getBundledNodeBinDir).mockReturnValue(null)
    vi.mocked(getBundledUvBinDir).mockReturnValue(null)
    const result = buildRuntimeEnv('proj-abc123', '/usr/bin')
    const pathParts = result.PATH.split(':')
    expect(pathParts[0]).toBe('/data/projects/proj-abc123/runtime/python-env/bin')
    expect(pathParts[1]).toBe('/usr/bin')
    expect(pathParts).toHaveLength(2)
  })

  it('preserves original PATH at the end', () => {
    const originalPath = '/usr/bin:/usr/local/bin:/opt/bin'
    const result = buildRuntimeEnv('proj-abc123', originalPath)
    expect(result.PATH).toContain(originalPath)
    expect(result.PATH.endsWith(originalPath)).toBe(true)
  })

  it('uses process.env.PATH when basePath not provided', () => {
    const saved = process.env.PATH
    process.env.PATH = '/test/path'
    try {
      const result = buildRuntimeEnv('proj-abc123')
      expect(result.PATH).toContain('/test/path')
    } finally {
      process.env.PATH = saved
    }
  })

  it('sets VIRTUAL_ENV to project python env path', () => {
    const result = buildRuntimeEnv('proj-abc123')
    expect(result.VIRTUAL_ENV).toBe('/data/projects/proj-abc123/runtime/python-env')
  })

  it('sets PIP_CACHE_DIR to shared cache', () => {
    const result = buildRuntimeEnv('proj-abc123')
    expect(result.PIP_CACHE_DIR).toBe('/data/runtime/cache/pip')
  })

  it('sets npm_config_cache to shared cache', () => {
    const result = buildRuntimeEnv('proj-abc123')
    expect(result.npm_config_cache).toBe('/data/runtime/cache/npm')
  })

  it('sets PIP_USE_DEPRECATED when bundled cert is available', () => {
    vi.mocked(getBundledCertFilePath).mockReturnValue('/bundled/python/certifi/cacert.pem')
    const result = buildRuntimeEnv('proj-abc123')
    expect(result.SSL_CERT_FILE).toBe('/bundled/python/certifi/cacert.pem')
    expect(result.PIP_USE_DEPRECATED).toBe('legacy-certs')
  })

  it('does not set PIP_USE_DEPRECATED when bundled cert is not available', () => {
    vi.mocked(getBundledCertFilePath).mockReturnValue(null)
    const result = buildRuntimeEnv('proj-abc123')
    expect(result.SSL_CERT_FILE).toBeUndefined()
    expect(result.PIP_USE_DEPRECATED).toBeUndefined()
  })

})

describe('buildMCPRuntimeEnv', () => {
  it('returns empty object when no bundled runtimes available', () => {
    vi.mocked(getBundledNodeBinDir).mockReturnValue(null)
    vi.mocked(getBundledUvBinDir).mockReturnValue(null)
    vi.mocked(getBundledPythonPath).mockReturnValue(null)
    const result = buildMCPRuntimeEnv('/usr/bin')
    expect(result).toEqual({})
  })

  it('returns PATH with bundled node prepended when available', () => {
    vi.mocked(getBundledNodeBinDir).mockReturnValue('/bundled/node/bin')
    const result = buildMCPRuntimeEnv('/usr/bin')
    expect(result.PATH).toBe('/bundled/node/bin:/usr/bin')
  })

  it('returns PATH with both node and uv when both available', () => {
    vi.mocked(getBundledNodeBinDir).mockReturnValue('/bundled/node/bin')
    vi.mocked(getBundledUvBinDir).mockReturnValue('/bundled/uv')
    const result = buildMCPRuntimeEnv('/usr/bin')
    expect(result.PATH).toBe('/bundled/node/bin:/bundled/uv:/usr/bin')
  })

  it('returns PATH with uv only when node not available', () => {
    vi.mocked(getBundledNodeBinDir).mockReturnValue(null)
    vi.mocked(getBundledUvBinDir).mockReturnValue('/bundled/uv')
    const result = buildMCPRuntimeEnv('/usr/bin')
    expect(result.PATH).toBe('/bundled/uv:/usr/bin')
    expect(result).not.toHaveProperty('npm_config_cache')
  })

  it('includes bundled Python bin dir in PATH when available', () => {
    vi.mocked(getBundledNodeBinDir).mockReturnValue(null)
    vi.mocked(getBundledUvBinDir).mockReturnValue(null)
    vi.mocked(getBundledPythonPath).mockReturnValue('/bundled/python/bin/python3.13')
    const result = buildMCPRuntimeEnv('/usr/bin')
    expect(result.PATH).toBe('/bundled/python/bin:/usr/bin')
  })

  it('includes all three runtimes in correct order: node > uv > python', () => {
    vi.mocked(getBundledNodeBinDir).mockReturnValue('/bundled/node/bin')
    vi.mocked(getBundledUvBinDir).mockReturnValue('/bundled/uv')
    vi.mocked(getBundledPythonPath).mockReturnValue('/bundled/python/bin/python3.13')
    const result = buildMCPRuntimeEnv('/usr/bin')
    expect(result.PATH).toBe('/bundled/node/bin:/bundled/uv:/bundled/python/bin:/usr/bin')
  })

  it('returns non-empty when only Python is available', () => {
    vi.mocked(getBundledNodeBinDir).mockReturnValue(null)
    vi.mocked(getBundledUvBinDir).mockReturnValue(null)
    vi.mocked(getBundledPythonPath).mockReturnValue('/bundled/python/bin/python3.13')
    const result = buildMCPRuntimeEnv('/usr/bin')
    expect(result.PATH).toBe('/bundled/python/bin:/usr/bin')
  })

  it('includes npm cache when bundled node available', () => {
    vi.mocked(getBundledNodeBinDir).mockReturnValue('/bundled/node/bin')
    const result = buildMCPRuntimeEnv('/usr/bin')
    expect(result.npm_config_cache).toBe('/data/runtime/cache/npm')
  })

  it('does NOT include Python venv env vars (PIP_CACHE_DIR, VIRTUAL_ENV)', () => {
    vi.mocked(getBundledNodeBinDir).mockReturnValue('/bundled/node/bin')
    vi.mocked(getBundledPythonPath).mockReturnValue('/bundled/python/bin/python3.13')
    const result = buildMCPRuntimeEnv('/usr/bin')
    expect(result).not.toHaveProperty('PIP_CACHE_DIR')
    expect(result).not.toHaveProperty('VIRTUAL_ENV')
  })

  it('sets SSL_CERT_FILE when bundled cert is available', () => {
    vi.mocked(getBundledNodeBinDir).mockReturnValue('/bundled/node/bin')
    vi.mocked(getBundledCertFilePath).mockReturnValue('/bundled/python/certifi/cacert.pem')
    const result = buildMCPRuntimeEnv('/usr/bin')
    expect(result.SSL_CERT_FILE).toBe('/bundled/python/certifi/cacert.pem')
  })

  it('does not set SSL_CERT_FILE when bundled cert is not available', () => {
    vi.mocked(getBundledNodeBinDir).mockReturnValue('/bundled/node/bin')
    vi.mocked(getBundledCertFilePath).mockReturnValue(null)
    const result = buildMCPRuntimeEnv('/usr/bin')
    expect(result).not.toHaveProperty('SSL_CERT_FILE')
  })

  it('uses process.env.PATH when basePath not provided', () => {
    vi.mocked(getBundledNodeBinDir).mockReturnValue('/bundled/node/bin')
    const saved = process.env.PATH
    process.env.PATH = '/test/path'
    try {
      const result = buildMCPRuntimeEnv()
      expect(result.PATH).toContain('/test/path')
    } finally {
      process.env.PATH = saved
    }
  })
})
