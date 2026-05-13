/**
 * Python runtime integration tests — real venv creation with system python3.
 *
 * These tests create actual Python virtual environments in temp directories.
 * They require `python3` to be available on the system PATH.
 * Skipped automatically when python3 is not available.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'

// ── Check python3 availability synchronously (for describe.skipIf) ──
const pythonAvailable = spawnSync('python3', ['--version'], {
  stdio: 'ignore',
  timeout: 5_000,
}).status === 0

import {
  resolvePythonBinary,
  initProjectPythonEnv,
  installPackages,
  uninstallPackage,
  listPackages,
  getPythonEnvStatus,
  resetProjectPythonEnv,
  removeProjectPythonEnv,
} from './python-manager'
import { getProjectPythonEnvPath, getProjectPythonEnvBinPath } from './paths'

const PROJECT_A = 'proj-pythonTestA'
const PROJECT_B = 'proj-pythonTestB'

describe.skipIf(!pythonAvailable)('Python integration — real venv', () => {
  // ── resolvePythonBinary ──────────────────────────────────────

  describe('resolvePythonBinary', () => {
    it('returns a valid python binary path (system python3 in dev mode)', () => {
      const binary = resolvePythonBinary()
      expect(typeof binary).toBe('string')
      // In dev mode (no GOLEMANCY_PYTHON_PATH), should be 'python3'
      expect(binary).toBe('python3')
    })
  })

  // ── Venv Creation ────────────────────────────────────────────

  describe('initProjectPythonEnv', () => {
    afterAll(async () => {
      await removeProjectPythonEnv(PROJECT_A)
    })

    it('creates a venv directory with python and pip binaries', async () => {
      await initProjectPythonEnv(PROJECT_A)

      const venvPath = getProjectPythonEnvPath(PROJECT_A)
      const binPath = getProjectPythonEnvBinPath(PROJECT_A)

      // Venv directory exists
      const stat = await fs.stat(venvPath)
      expect(stat.isDirectory()).toBe(true)

      // python binary exists (may be a symlink)
      const pythonBin = path.join(binPath, 'python')
      const pythonStat = await fs.lstat(pythonBin)
      expect(pythonStat.isFile() || pythonStat.isSymbolicLink()).toBe(true)

      // pip binary exists (may be a symlink)
      const pipBin = path.join(binPath, 'pip')
      const pipStat = await fs.lstat(pipBin)
      expect(pipStat.isFile() || pipStat.isSymbolicLink()).toBe(true)
    }, 60_000) // venv creation can be slow
  })

  // ── Package Management ───────────────────────────────────────

  describe('package management', () => {
    beforeAll(async () => {
      await initProjectPythonEnv(PROJECT_A)
    }, 60_000)

    afterAll(async () => {
      await removeProjectPythonEnv(PROJECT_A)
    })

    it('lists initial packages (pip + setuptools at minimum)', async () => {
      const packages = await listPackages(PROJECT_A)
      expect(Array.isArray(packages)).toBe(true)
      // Every venv has at least pip
      const pipPkg = packages.find(p => p.name === 'pip')
      expect(pipPkg).toBeDefined()
      expect(pipPkg!.version).toBeTruthy()
    })

    it('installs a real package (six — small and fast)', async () => {
      const output = await installPackages(PROJECT_A, ['six'])
      expect(output).toBeTruthy()

      // Verify it's listed
      const packages = await listPackages(PROJECT_A)
      const sixPkg = packages.find(p => p.name === 'six')
      expect(sixPkg).toBeDefined()
    }, 30_000)

    it('uninstalls a package', async () => {
      // Ensure six is installed first
      const beforePkgs = await listPackages(PROJECT_A)
      if (!beforePkgs.find(p => p.name === 'six')) {
        await installPackages(PROJECT_A, ['six'])
      }

      const output = await uninstallPackage(PROJECT_A, 'six')
      expect(output).toBeTruthy()

      // Verify it's gone
      const packages = await listPackages(PROJECT_A)
      const sixPkg = packages.find(p => p.name === 'six')
      expect(sixPkg).toBeUndefined()
    }, 30_000)

    it('throws on install of invalid package name', async () => {
      await expect(
        installPackages(PROJECT_A, ['this-package-definitely-does-not-exist-xyz-999']),
      ).rejects.toThrow('pip install failed')
    }, 30_000)

    it('throws when packages array is empty', async () => {
      await expect(installPackages(PROJECT_A, [])).rejects.toThrow('No packages specified')
    })
  })

  // ── Env Status ───────────────────────────────────────────────

  describe('getPythonEnvStatus', () => {
    it('returns exists: false when no venv exists', async () => {
      const status = await getPythonEnvStatus('proj-nonexistent999')
      expect(status.exists).toBe(false)
      expect(status.pythonVersion).toBeNull()
      expect(status.packageCount).toBe(0)
    })

    it('returns correct status for existing venv', async () => {
      await initProjectPythonEnv(PROJECT_B)
      try {
        const status = await getPythonEnvStatus(PROJECT_B)
        expect(status.exists).toBe(true)
        expect(status.pythonVersion).toMatch(/^\d+\.\d+\.\d+$/)
        expect(status.packageCount).toBeGreaterThan(0) // at least pip
        expect(status.path).toBe(getProjectPythonEnvPath(PROJECT_B))
      } finally {
        await removeProjectPythonEnv(PROJECT_B)
      }
    }, 60_000)
  })

  // ── Reset ────────────────────────────────────────────────────

  describe('resetProjectPythonEnv', () => {
    it('removes and recreates venv (clean slate)', async () => {
      await initProjectPythonEnv(PROJECT_B)
      // Install a package
      await installPackages(PROJECT_B, ['six'])
      const beforePkgs = await listPackages(PROJECT_B)
      expect(beforePkgs.find(p => p.name === 'six')).toBeDefined()

      // Reset
      await resetProjectPythonEnv(PROJECT_B)

      // six should be gone
      const afterPkgs = await listPackages(PROJECT_B)
      expect(afterPkgs.find(p => p.name === 'six')).toBeUndefined()

      // But venv still exists and works
      const status = await getPythonEnvStatus(PROJECT_B)
      expect(status.exists).toBe(true)

      await removeProjectPythonEnv(PROJECT_B)
    }, 120_000)
  })

  // ── Multi-project Isolation ──────────────────────────────────

  describe('multi-project isolation', () => {
    afterAll(async () => {
      await Promise.all([
        removeProjectPythonEnv(PROJECT_A),
        removeProjectPythonEnv(PROJECT_B),
      ])
    })

    it('packages installed in one project do not appear in another', { retry: 2, timeout: 60_000 }, async () => {
      await Promise.all([
        initProjectPythonEnv(PROJECT_A),
        initProjectPythonEnv(PROJECT_B),
      ])

      // Install six only in project A
      await installPackages(PROJECT_A, ['six'])

      // Project A has six
      const pkgsA = await listPackages(PROJECT_A)
      expect(pkgsA.find(p => p.name === 'six')).toBeDefined()

      // Project B does NOT have six
      const pkgsB = await listPackages(PROJECT_B)
      expect(pkgsB.find(p => p.name === 'six')).toBeUndefined()
    })
  })
})
