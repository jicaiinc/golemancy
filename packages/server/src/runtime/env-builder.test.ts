import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────

vi.mock('./paths', () => ({
  getBundledNodeBinDir: vi.fn(() => null),
  getProjectPythonEnvPath: vi.fn((id: string) => `/data/projects/${id}/runtime/python-env`),
  getProjectPythonEnvBinPath: vi.fn((id: string) => `/data/projects/${id}/runtime/python-env/bin`),
  getPipCachePath: vi.fn(() => '/data/runtime/cache/pip'),
  getNpmCachePath: vi.fn(() => '/data/runtime/cache/npm'),
  getNpmGlobalPath: vi.fn(() => '/data/runtime/npm-global'),
}))

import { buildRuntimeEnv, buildMCPRuntimeEnv } from './env-builder'
import { getBundledNodeBinDir } from './paths'

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
    expect(result).toHaveProperty('NPM_CONFIG_PREFIX')
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
    expect(pathParts[2]).toBe('/usr/bin')
  })

  it('does not include node bin when not available', () => {
    vi.mocked(getBundledNodeBinDir).mockReturnValue(null)
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

  it('sets NPM_CONFIG_PREFIX to shared global', () => {
    const result = buildRuntimeEnv('proj-abc123')
    expect(result.NPM_CONFIG_PREFIX).toBe('/data/runtime/npm-global')
  })
})

describe('buildMCPRuntimeEnv', () => {
  it('returns empty object when bundled Node not available', () => {
    vi.mocked(getBundledNodeBinDir).mockReturnValue(null)
    const result = buildMCPRuntimeEnv('/usr/bin')
    expect(result).toEqual({})
  })

  it('returns PATH with bundled node prepended when available', () => {
    vi.mocked(getBundledNodeBinDir).mockReturnValue('/bundled/node/bin')
    const result = buildMCPRuntimeEnv('/usr/bin')
    expect(result.PATH).toBe('/bundled/node/bin:/usr/bin')
  })

  it('includes npm cache and prefix when bundled node available', () => {
    vi.mocked(getBundledNodeBinDir).mockReturnValue('/bundled/node/bin')
    const result = buildMCPRuntimeEnv('/usr/bin')
    expect(result.npm_config_cache).toBe('/data/runtime/cache/npm')
    expect(result.NPM_CONFIG_PREFIX).toBe('/data/runtime/npm-global')
  })

  it('does NOT include Python-related env vars', () => {
    vi.mocked(getBundledNodeBinDir).mockReturnValue('/bundled/node/bin')
    const result = buildMCPRuntimeEnv('/usr/bin')
    expect(result).not.toHaveProperty('PIP_CACHE_DIR')
    expect(result).not.toHaveProperty('VIRTUAL_ENV')
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
