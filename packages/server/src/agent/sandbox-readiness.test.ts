import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const isSandboxRuntimeSupported = vi.fn().mockReturnValue(true)
  const mockRequireResolve = vi.fn()
  const mockCreateRequire = vi.fn(() => ({ resolve: mockRequireResolve }))
  const mockSpawnSync = vi.fn()
  const getBundledRuntimeDir = vi.fn().mockReturnValue('/bundled/runtime')
  const getProjectPath = vi.fn().mockReturnValue('/data/projects/proj-abc')
  const mockAccessSync = vi.fn()

  return {
    isSandboxRuntimeSupported,
    mockRequireResolve,
    mockCreateRequire,
    mockSpawnSync,
    getBundledRuntimeDir,
    getProjectPath,
    mockAccessSync,
  }
})

vi.mock('@golemancy/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@golemancy/shared')>()
  return {
    ...actual,
    isSandboxRuntimeSupported: mocks.isSandboxRuntimeSupported,
  }
})

vi.mock('node:module', () => ({
  createRequire: mocks.mockCreateRequire,
}))

vi.mock('node:child_process', () => ({
  spawnSync: mocks.mockSpawnSync,
}))

vi.mock('../runtime/paths', () => ({
  getBundledRuntimeDir: mocks.getBundledRuntimeDir,
}))

vi.mock('../utils/paths', () => ({
  getProjectPath: mocks.getProjectPath,
}))

vi.mock('node:fs', () => ({
  default: {
    accessSync: mocks.mockAccessSync,
    constants: { R_OK: 4, W_OK: 2 },
  },
  accessSync: mocks.mockAccessSync,
  constants: { R_OK: 4, W_OK: 2 },
}))

vi.mock('../logger', () => ({
  logger: {
    child: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}))

import { checkSandboxReadiness } from './sandbox-readiness'

// ── Test Helpers ─────────────────────────────────────────────

const PROJECT_ID = 'proj-abc'
const PROJECT_DIR = '/data/projects/proj-abc'
const WORKSPACE_DIR = `${PROJECT_DIR}/workspace`

// ── Tests ────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  // Default: supported platform, all checks pass
  mocks.isSandboxRuntimeSupported.mockReturnValue(true)
  // sandbox-runtime resolve succeeds
  mocks.mockRequireResolve.mockReturnValue('/path/to/sandbox-runtime')
  // createRequire returns object with resolve + @vscode/ripgrep bundled
  mocks.mockCreateRequire.mockReturnValue({
    resolve: mocks.mockRequireResolve,
    '@vscode/ripgrep': { rgPath: '/usr/bin/rg' },
  })
  // spawnSync 'which rg' succeeds (fallback for ripgrep)
  mocks.mockSpawnSync.mockReturnValue({ status: 0, stdout: '/usr/bin/rg\n' })
  // bundled runtime dir available
  mocks.getBundledRuntimeDir.mockReturnValue('/bundled/runtime')
  // project path resolves
  mocks.getProjectPath.mockReturnValue(PROJECT_DIR)
  // accessSync succeeds by default (dirs are accessible)
  mocks.mockAccessSync.mockReturnValue(undefined)
})

describe('checkSandboxReadiness', () => {

  // ── Unsupported platform (Windows / GuardedSandbox path) ──

  describe('unsupported platform', () => {
    beforeEach(() => {
      mocks.isSandboxRuntimeSupported.mockReturnValue(false)
    })

    it('returns available with no issues when no projectId is provided', async () => {
      const result = await checkSandboxReadiness()

      expect(result.available).toBe(true)
      expect(result.issues).toHaveLength(0)
    })

    it('returns available with no issues when workspace is accessible', async () => {
      mocks.mockAccessSync.mockReturnValue(undefined)

      const result = await checkSandboxReadiness(PROJECT_ID)

      expect(result.available).toBe(true)
      expect(result.issues).toHaveLength(0)
    })

    it('returns available when workspace is missing but parent dir is accessible', async () => {
      // First accessSync (workspace) throws, second (project dir) succeeds
      mocks.mockAccessSync
        .mockImplementationOnce(() => { throw new Error('ENOENT') })
        .mockReturnValue(undefined)

      const result = await checkSandboxReadiness(PROJECT_ID)

      expect(result.available).toBe(true)
      expect(result.issues).toHaveLength(0)
    })

    it('returns not available with workspace issue when both workspace and parent are inaccessible', async () => {
      mocks.mockAccessSync.mockImplementation(() => { throw new Error('EACCES') })

      const result = await checkSandboxReadiness(PROJECT_ID)

      expect(result.available).toBe(false)
      expect(result.issues).toHaveLength(1)
      expect(result.issues[0]!.component).toBe('workspace')
      expect(result.issues[0]!.message).toContain(PROJECT_DIR)
    })

    it('skips sandbox-runtime, ripgrep, and resources-path checks', async () => {
      await checkSandboxReadiness()

      // createRequire should never be called for sandbox-runtime or ripgrep
      expect(mocks.mockCreateRequire).not.toHaveBeenCalled()
      // getBundledRuntimeDir should never be called
      expect(mocks.getBundledRuntimeDir).not.toHaveBeenCalled()
    })
  })

  // ── Supported platform ────────────────────────────────────

  describe('supported platform', () => {
    it('returns available with no issues when all checks pass', async () => {
      // createRequire returns resolver that succeeds + vscode/ripgrep bundled
      mocks.mockCreateRequire.mockReturnValue({
        resolve: mocks.mockRequireResolve,
        '@vscode/ripgrep': { rgPath: '/usr/bin/rg' },
      })

      const result = await checkSandboxReadiness()

      expect(result.available).toBe(true)
      expect(result.issues).toHaveLength(0)
    })

    it('returns issue for sandbox-runtime when package is not resolvable', async () => {
      // First createRequire call is for sandbox-runtime resolve
      mocks.mockCreateRequire.mockImplementation(() => ({
        resolve: vi.fn().mockImplementation((id: string) => {
          if (id === '@anthropic-ai/sandbox-runtime') throw new Error('MODULE_NOT_FOUND')
          return '/some/path'
        }),
      }))
      // Make ripgrep check pass via spawnSync
      mocks.mockSpawnSync.mockReturnValue({ status: 0, stdout: '/usr/bin/rg\n' })

      const result = await checkSandboxReadiness()

      expect(result.available).toBe(false)
      const issue = result.issues.find(i => i.component === 'sandbox-runtime')
      expect(issue).toBeDefined()
      expect(issue!.component).toBe('sandbox-runtime')
    })

    it('returns issue for ripgrep when neither bundled nor system rg is found', async () => {
      // createRequire: sandbox-runtime resolves OK, but @vscode/ripgrep throws
      mocks.mockCreateRequire.mockImplementation(() => ({
        resolve: vi.fn().mockImplementation((id: string) => {
          if (id === '@anthropic-ai/sandbox-runtime') return '/path/to/sandbox-runtime'
          throw new Error('MODULE_NOT_FOUND')
        }),
      }))
      // system 'which rg' also fails
      mocks.mockSpawnSync.mockReturnValue({ status: 1, stdout: '' })

      const result = await checkSandboxReadiness()

      expect(result.available).toBe(false)
      const issue = result.issues.find(i => i.component === 'ripgrep')
      expect(issue).toBeDefined()
      expect(issue!.component).toBe('ripgrep')
    })

    it('returns issue for resources-path when bundled runtime dir is not configured', async () => {
      // All require calls succeed
      mocks.mockCreateRequire.mockReturnValue({
        resolve: mocks.mockRequireResolve,
      })
      mocks.mockSpawnSync.mockReturnValue({ status: 0, stdout: '/usr/bin/rg\n' })
      // But bundled runtime dir is missing
      mocks.getBundledRuntimeDir.mockReturnValue(null)

      const result = await checkSandboxReadiness()

      expect(result.available).toBe(false)
      const issue = result.issues.find(i => i.component === 'resources-path')
      expect(issue).toBeDefined()
      expect(issue!.component).toBe('resources-path')
    })

    it('returns multiple issues when several checks fail simultaneously', async () => {
      // sandbox-runtime missing
      mocks.mockCreateRequire.mockImplementation(() => ({
        resolve: vi.fn().mockImplementation(() => { throw new Error('MODULE_NOT_FOUND') }),
      }))
      // ripgrep missing (system also fails)
      mocks.mockSpawnSync.mockReturnValue({ status: 1, stdout: '' })
      // resources-path missing
      mocks.getBundledRuntimeDir.mockReturnValue(null)

      const result = await checkSandboxReadiness()

      expect(result.available).toBe(false)
      expect(result.issues.length).toBeGreaterThanOrEqual(3)

      const components = result.issues.map(i => i.component)
      expect(components).toContain('sandbox-runtime')
      expect(components).toContain('ripgrep')
      expect(components).toContain('resources-path')
    })

    it('also checks workspace when projectId is provided and all OS checks pass', async () => {
      mocks.mockCreateRequire.mockReturnValue({
        resolve: mocks.mockRequireResolve,
      })
      mocks.mockSpawnSync.mockReturnValue({ status: 0, stdout: '/usr/bin/rg\n' })
      // workspace accessible
      mocks.mockAccessSync.mockReturnValue(undefined)

      const result = await checkSandboxReadiness(PROJECT_ID)

      expect(result.available).toBe(true)
      expect(result.issues).toHaveLength(0)
      expect(mocks.mockAccessSync).toHaveBeenCalledWith(WORKSPACE_DIR, expect.any(Number))
    })

    it('returns workspace issue when projectId provided and both dirs inaccessible', async () => {
      mocks.mockCreateRequire.mockReturnValue({
        resolve: mocks.mockRequireResolve,
      })
      mocks.mockSpawnSync.mockReturnValue({ status: 0, stdout: '/usr/bin/rg\n' })
      mocks.mockAccessSync.mockImplementation(() => { throw new Error('EACCES') })

      const result = await checkSandboxReadiness(PROJECT_ID)

      expect(result.available).toBe(false)
      const issue = result.issues.find(i => i.component === 'workspace')
      expect(issue).toBeDefined()
      expect(issue!.message).toContain(PROJECT_DIR)
    })
  })

})
