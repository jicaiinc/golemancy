import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  getBundledPythonPath,
  getProjectPythonEnvPath,
  getProjectPythonEnvBinPath,
  getPipCachePath,
} from './paths'
import { logger } from '../logger'

const log = logger.child({ component: 'runtime:python' })

export interface PythonPackage {
  name: string
  version: string
}

export interface PythonEnvStatus {
  /** Whether the venv directory exists */
  exists: boolean
  /** Python version string (e.g., "3.13.12"), null if venv doesn't exist */
  pythonVersion: string | null
  /** Number of installed packages (excluding pip itself) */
  packageCount: number
  /** Absolute path to venv */
  path: string
}

/**
 * Manages per-project Python virtual environments.
 *
 * Design:
 * - Uses bundled Python from python-build-standalone
 * - Falls back to system `python3` if bundled not available (dev mode)
 * - Creates venvs with symlinks (POSIX default, saves disk space)
 * - Shares pip cache across projects via PIP_CACHE_DIR env var
 */

/**
 * Find a usable Python binary.
 * Returns bundled path if available, otherwise 'python3' (system).
 */
export function resolvePythonBinary(): string {
  return getBundledPythonPath() ?? 'python3'
}

/**
 * Create a Python venv for a project.
 *
 * Called eagerly on project creation. Uses `python -m venv` CLI
 * (not the Python API) to get correct platform defaults (symlinks on POSIX).
 *
 * @throws Error if Python binary not found or venv creation fails
 */
export async function initProjectPythonEnv(projectId: string): Promise<void> {
  const venvPath = getProjectPythonEnvPath(projectId)
  const pythonBin = resolvePythonBinary()

  log.info({ projectId, venvPath, pythonBin }, 'creating Python venv')

  // Ensure parent directory exists
  await fs.mkdir(path.dirname(venvPath), { recursive: true })

  const result = await execCommand(pythonBin, ['-m', 'venv', venvPath])
  if (result.exitCode !== 0) {
    throw new Error(
      `Failed to create Python venv: ${result.stderr}\n` +
      `Python binary: ${pythonBin}\nVenv path: ${venvPath}`
    )
  }

  log.info({ projectId }, 'Python venv created')
}

/**
 * Delete a project's Python venv.
 */
export async function removeProjectPythonEnv(projectId: string): Promise<void> {
  const venvPath = getProjectPythonEnvPath(projectId)
  log.info({ projectId, venvPath }, 'removing Python venv')
  await fs.rm(venvPath, { recursive: true, force: true })
}

/**
 * Delete and recreate a project's Python venv (clean slate).
 */
export async function resetProjectPythonEnv(projectId: string): Promise<void> {
  await removeProjectPythonEnv(projectId)
  await initProjectPythonEnv(projectId)
}

/**
 * Install packages into a project's venv using pip.
 *
 * Uses the venv's pip directly (not bundled Python + -m pip)
 * so the packages install to the correct site-packages.
 * PIP_CACHE_DIR env var directs cache to shared location.
 *
 * @returns stdout from pip (install summary)
 * @throws Error if pip install fails
 */
export async function installPackages(
  projectId: string,
  packages: string[],
): Promise<string> {
  if (packages.length === 0) throw new Error('No packages specified')

  const pipBin = path.join(getProjectPythonEnvBinPath(projectId), 'pip')
  log.info({ projectId, packages }, 'installing Python packages')

  const result = await execCommand(pipBin, ['install', ...packages], {
    PIP_CACHE_DIR: getPipCachePath(),
  })

  if (result.exitCode !== 0) {
    throw new Error(`pip install failed:\n${result.stderr}`)
  }

  return result.stdout
}

/**
 * Uninstall a package from a project's venv.
 *
 * @throws Error if pip uninstall fails
 */
export async function uninstallPackage(
  projectId: string,
  packageName: string,
): Promise<string> {
  const pipBin = path.join(getProjectPythonEnvBinPath(projectId), 'pip')
  log.info({ projectId, packageName }, 'uninstalling Python package')

  const result = await execCommand(pipBin, ['uninstall', '-y', packageName], {
    PIP_CACHE_DIR: getPipCachePath(),
  })

  if (result.exitCode !== 0) {
    throw new Error(`pip uninstall failed:\n${result.stderr}`)
  }

  return result.stdout
}

/**
 * List installed packages in a project's venv.
 *
 * Uses `pip list --format=json` for structured output.
 */
export async function listPackages(projectId: string): Promise<PythonPackage[]> {
  const pipBin = path.join(getProjectPythonEnvBinPath(projectId), 'pip')

  const result = await execCommand(pipBin, ['list', '--format=json'], {
    PIP_CACHE_DIR: getPipCachePath(),
  })

  if (result.exitCode !== 0) {
    throw new Error(`pip list failed:\n${result.stderr}`)
  }

  try {
    return JSON.parse(result.stdout) as PythonPackage[]
  } catch {
    throw new Error(`Failed to parse pip list output: ${result.stdout}`)
  }
}

/**
 * Check status of a project's Python environment.
 */
export async function getPythonEnvStatus(projectId: string): Promise<PythonEnvStatus> {
  const venvPath = getProjectPythonEnvPath(projectId)

  try {
    await fs.access(venvPath)
  } catch {
    return { exists: false, pythonVersion: null, packageCount: 0, path: venvPath }
  }

  // Get Python version
  let pythonVersion: string | null = null
  try {
    const pythonBin = path.join(getProjectPythonEnvBinPath(projectId), 'python')
    const versionResult = await execCommand(pythonBin, ['--version'])
    if (versionResult.exitCode === 0) {
      // Output: "Python 3.13.12"
      pythonVersion = versionResult.stdout.trim().replace('Python ', '')
    }
  } catch { /* ignore */ }

  // Get package count
  let packageCount = 0
  try {
    const packages = await listPackages(projectId)
    packageCount = packages.length
  } catch { /* ignore */ }

  return { exists: true, pythonVersion, packageCount, path: venvPath }
}

// ── Internal Helpers ────────────────────────────────────────

interface ExecResult {
  stdout: string
  stderr: string
  exitCode: number
}

/**
 * Execute a command and return structured result.
 * Timeout: 120s (pip install can be slow).
 */
function execCommand(
  command: string,
  args: string[],
  extraEnv?: Record<string, string>,
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...extraEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120_000,
    })

    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString() })

    child.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 1 })
    })
    child.on('error', reject)
  })
}
