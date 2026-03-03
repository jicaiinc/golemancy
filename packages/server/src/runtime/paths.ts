import { execFileSync } from 'node:child_process'
import { accessSync } from 'node:fs'
import path from 'node:path'
import { getDataDir, getProjectPath } from '../utils/paths'

// ── Bundled Runtime Paths (read-only, shipped with Electron) ──

/**
 * Root directory for bundled runtimes.
 *
 * Resolution order:
 * 1. GOLEMANCY_RESOURCES_PATH env var (set by Electron main → fork env)
 *    → joins '/runtime'
 * 2. null (bundled runtimes not available — dev mode without override)
 *
 * Note: The server process is fork()'d from Electron. It does NOT have
 * access to Electron's `process.resourcesPath`. Instead, the Electron
 * main process passes it via GOLEMANCY_RESOURCES_PATH in the fork env.
 */
export function getBundledRuntimeDir(): string | null {
  const resourcesPath = process.env.GOLEMANCY_RESOURCES_PATH
  if (resourcesPath) {
    return path.join(resourcesPath, 'runtime')
  }
  return null
}

/**
 * Path to bundled Python binary.
 *
 * Resolution order:
 * 1. GOLEMANCY_PYTHON_PATH env var (dev/test override, points to binary)
 * 2. {bundledRuntimeDir}/python/python.exe          (Windows)
 *    {bundledRuntimeDir}/python/bin/python3.13       (macOS/Linux)
 * 3. null (not available — caller falls back to system `python3`)
 */
export function getBundledPythonPath(): string | null {
  if (process.env.GOLEMANCY_PYTHON_PATH) {
    return process.env.GOLEMANCY_PYTHON_PATH
  }
  const runtimeDir = getBundledRuntimeDir()
  if (runtimeDir) {
    return process.platform === 'win32'
      ? path.join(runtimeDir, 'python', 'python.exe')
      : path.join(runtimeDir, 'python', 'bin', 'python3.13')
  }
  return null
}

/**
 * Path to bundled Node.js bin directory (contains node, npm, npx).
 *
 * Resolution order:
 * 1. GOLEMANCY_NODE_PATH env var → dirname (points to binary, we want dir)
 * 2. {bundledRuntimeDir}/node/              (Windows — node.exe at root)
 *    {bundledRuntimeDir}/node/bin/           (macOS/Linux)
 * 3. null (not available — caller falls back to system `node`)
 */
export function getBundledNodeBinDir(): string | null {
  if (process.env.GOLEMANCY_NODE_PATH) {
    return path.dirname(process.env.GOLEMANCY_NODE_PATH)
  }
  const runtimeDir = getBundledRuntimeDir()
  if (runtimeDir) {
    return process.platform === 'win32'
      ? path.join(runtimeDir, 'node')
      : path.join(runtimeDir, 'node', 'bin')
  }
  return null
}

/**
 * Path to the CA certificate bundle shipped with bundled Python.
 *
 * python-build-standalone uses a statically compiled OpenSSL that cannot find
 * the host OS certificate store. Without this, any HTTPS request from the
 * bundled Python (pip install, requests, urllib, etc.) fails with SSL errors.
 *
 * Detection: asks the bundled Python where pip's vendored certifi keeps its
 * cacert.pem. Result is cached — subprocess runs at most once per server lifetime.
 *
 * @returns Absolute path to cacert.pem, or null if bundled Python unavailable
 */
let _cachedCertPath: string | null | undefined  // undefined = not yet resolved

export function getBundledCertFilePath(): string | null {
  if (_cachedCertPath !== undefined) return _cachedCertPath

  const pythonPath = getBundledPythonPath()
  if (!pythonPath) {
    _cachedCertPath = null
    return null
  }

  try {
    const result = execFileSync(pythonPath, [
      '-c', 'import pip._vendor.certifi; print(pip._vendor.certifi.where())',
    ], { encoding: 'utf-8', timeout: 10_000 }).trim()

    // Verify the file actually exists
    accessSync(result)
    _cachedCertPath = result
    return result
  } catch {
    _cachedCertPath = null
    return null
  }
}

// ── Per-Project Runtime Paths (read-write, ~/.golemancy/projects/{id}/) ──

/**
 * Per-project runtime root: ~/.golemancy/projects/{projectId}/runtime/
 */
export function getProjectRuntimeDir(projectId: string): string {
  return path.join(getProjectPath(projectId), 'runtime')
}

/**
 * Per-project Python venv: ~/.golemancy/projects/{projectId}/runtime/python-env/
 */
export function getProjectPythonEnvPath(projectId: string): string {
  return path.join(getProjectRuntimeDir(projectId), 'python-env')
}

/**
 * Per-project Python venv bin directory (contains python, pip, installed CLIs).
 * Windows venvs use Scripts/ instead of bin/.
 */
export function getProjectPythonEnvBinPath(projectId: string): string {
  const dir = process.platform === 'win32' ? 'Scripts' : 'bin'
  return path.join(getProjectPythonEnvPath(projectId), dir)
}

// ── Global Shared Paths (read-write, ~/.golemancy/runtime/) ──

/**
 * Global runtime root: ~/.golemancy/runtime/
 */
export function getGlobalRuntimeDir(): string {
  return path.join(getDataDir(), 'runtime')
}

/**
 * Shared pip download cache: ~/.golemancy/runtime/cache/pip/
 */
export function getPipCachePath(): string {
  return path.join(getGlobalRuntimeDir(), 'cache', 'pip')
}

/**
 * Shared npm download cache: ~/.golemancy/runtime/cache/npm/
 */
export function getNpmCachePath(): string {
  return path.join(getGlobalRuntimeDir(), 'cache', 'npm')
}

