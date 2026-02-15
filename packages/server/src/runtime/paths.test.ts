import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import path from 'node:path'

// Store original env to restore after tests
const originalEnv = { ...process.env }

beforeEach(() => {
  // Clear runtime-related env vars before each test
  delete process.env.GOLEMANCY_RESOURCES_PATH
  delete process.env.GOLEMANCY_PYTHON_PATH
  delete process.env.GOLEMANCY_NODE_PATH
  delete process.env.GOLEMANCY_DATA_DIR
  // Reset module cache so env vars are re-read
  vi.resetModules()
})

afterEach(() => {
  process.env = { ...originalEnv }
})

async function importPaths() {
  return import('./paths')
}

describe('paths', () => {
  // ── getBundledRuntimeDir ──────────────────────────────────

  describe('getBundledRuntimeDir', () => {
    it('returns null when GOLEMANCY_RESOURCES_PATH is not set', async () => {
      const { getBundledRuntimeDir } = await importPaths()
      expect(getBundledRuntimeDir()).toBeNull()
    })

    it('returns {resourcesPath}/runtime when GOLEMANCY_RESOURCES_PATH is set', async () => {
      process.env.GOLEMANCY_RESOURCES_PATH = '/app/resources'
      const { getBundledRuntimeDir } = await importPaths()
      expect(getBundledRuntimeDir()).toBe(path.join('/app/resources', 'runtime'))
    })
  })

  // ── getBundledPythonPath ──────────────────────────────────

  describe('getBundledPythonPath', () => {
    it('returns null when no env vars set', async () => {
      const { getBundledPythonPath } = await importPaths()
      expect(getBundledPythonPath()).toBeNull()
    })

    it('returns GOLEMANCY_PYTHON_PATH when set (highest priority)', async () => {
      process.env.GOLEMANCY_PYTHON_PATH = '/custom/python3'
      process.env.GOLEMANCY_RESOURCES_PATH = '/app/resources'
      const { getBundledPythonPath } = await importPaths()
      expect(getBundledPythonPath()).toBe('/custom/python3')
    })

    it('returns bundled path from resources when only GOLEMANCY_RESOURCES_PATH set', async () => {
      process.env.GOLEMANCY_RESOURCES_PATH = '/app/resources'
      const { getBundledPythonPath } = await importPaths()
      expect(getBundledPythonPath()).toBe(
        path.join('/app/resources', 'runtime', 'python', 'bin', 'python3.13'),
      )
    })
  })

  // ── getBundledNodeBinDir ──────────────────────────────────

  describe('getBundledNodeBinDir', () => {
    it('returns null when no env vars set', async () => {
      const { getBundledNodeBinDir } = await importPaths()
      expect(getBundledNodeBinDir()).toBeNull()
    })

    it('returns dirname of GOLEMANCY_NODE_PATH when set (highest priority)', async () => {
      process.env.GOLEMANCY_NODE_PATH = '/custom/bin/node'
      process.env.GOLEMANCY_RESOURCES_PATH = '/app/resources'
      const { getBundledNodeBinDir } = await importPaths()
      expect(getBundledNodeBinDir()).toBe('/custom/bin')
    })

    it('returns bundled path from resources when only GOLEMANCY_RESOURCES_PATH set', async () => {
      process.env.GOLEMANCY_RESOURCES_PATH = '/app/resources'
      const { getBundledNodeBinDir } = await importPaths()
      expect(getBundledNodeBinDir()).toBe(
        path.join('/app/resources', 'runtime', 'node', 'bin'),
      )
    })
  })

  // ── Per-Project Paths ─────────────────────────────────────

  describe('per-project paths', () => {
    it('getProjectRuntimeDir returns correct path', async () => {
      const { getProjectRuntimeDir } = await importPaths()
      const result = getProjectRuntimeDir('proj-abc123')
      expect(result).toContain('projects')
      expect(result).toContain('proj-abc123')
      expect(result).toMatch(/runtime$/)
    })

    it('getProjectPythonEnvPath returns python-env under runtime dir', async () => {
      const { getProjectPythonEnvPath } = await importPaths()
      const result = getProjectPythonEnvPath('proj-abc123')
      expect(result).toMatch(/runtime\/python-env$/)
    })

    it('getProjectPythonEnvBinPath returns bin under python-env', async () => {
      const { getProjectPythonEnvBinPath } = await importPaths()
      const result = getProjectPythonEnvBinPath('proj-abc123')
      expect(result).toMatch(/runtime\/python-env\/bin$/)
    })

    it('getProjectNodeModulesPath returns node_modules under runtime dir', async () => {
      const { getProjectNodeModulesPath } = await importPaths()
      const result = getProjectNodeModulesPath('proj-abc123')
      expect(result).toMatch(/runtime\/node_modules$/)
    })

    it('rejects invalid project IDs', async () => {
      const { getProjectRuntimeDir } = await importPaths()
      expect(() => getProjectRuntimeDir('../escape')).toThrow()
    })
  })

  // ── Global Shared Paths ───────────────────────────────────

  describe('global shared paths', () => {
    it('getGlobalRuntimeDir returns runtime under data dir', async () => {
      const { getGlobalRuntimeDir } = await importPaths()
      const result = getGlobalRuntimeDir()
      expect(result).toMatch(/runtime$/)
    })

    it('getPipCachePath returns cache/pip under global runtime', async () => {
      const { getPipCachePath } = await importPaths()
      const result = getPipCachePath()
      expect(result).toMatch(/runtime\/cache\/pip$/)
    })

    it('getNpmCachePath returns cache/npm under global runtime', async () => {
      const { getNpmCachePath } = await importPaths()
      const result = getNpmCachePath()
      expect(result).toMatch(/runtime\/cache\/npm$/)
    })

    it('getNpmGlobalPath returns npm-global under global runtime', async () => {
      const { getNpmGlobalPath } = await importPaths()
      const result = getNpmGlobalPath()
      expect(result).toMatch(/runtime\/npm-global$/)
    })
  })
})
