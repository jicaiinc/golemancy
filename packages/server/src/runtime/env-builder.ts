import { delimiter } from 'node:path'
import {
  getBundledCertFilePath,
  getBundledNodeBinDir,
  getProjectPythonEnvPath,
  getProjectPythonEnvBinPath,
  getPipCachePath,
  getNpmCachePath,
} from './paths'
import { logger } from '../logger'

const log = logger.child({ component: 'runtime:env-builder' })

/**
 * Environment variables to inject into subprocess for bundled runtime support.
 * All fields are strings suitable for direct use in child_process env.
 */
export interface RuntimeEnvVars {
  /** Modified PATH with venv/bin and/or bundled-node/bin prepended */
  PATH: string
  /** Pip download cache directory */
  PIP_CACHE_DIR: string
  /** Python virtual environment root (conventional, not strictly required) */
  VIRTUAL_ENV: string
  /** npm download cache directory */
  npm_config_cache: string
  /** CA certificate bundle for OpenSSL (Python, curl, git, etc.) */
  SSL_CERT_FILE?: string
}

/**
 * Build full runtime environment for command execution (bash tool).
 * Prepends project venv/bin and bundled Node.js/bin to PATH.
 * Sets pip/npm cache and prefix env vars.
 *
 * Used by: AnthropicSandbox, NativeSandbox (via builtin-tools.ts)
 *
 * @param projectId - Project whose venv to use
 * @param basePath - Base PATH to extend (defaults to process.env.PATH)
 * @returns Env vars to merge into subprocess environment
 */
export function buildRuntimeEnv(projectId: string, basePath?: string): RuntimeEnvVars {
  const currentPath = basePath ?? process.env.PATH ?? ''
  const pathParts: string[] = []

  // 1. Project Python venv bin (highest priority — venv python, pip, installed CLIs)
  pathParts.push(getProjectPythonEnvBinPath(projectId))

  // 2. Bundled Node.js bin (node, npm, npx)
  const nodeBinDir = getBundledNodeBinDir()
  if (nodeBinDir) pathParts.push(nodeBinDir)

  // 3. Original PATH
  pathParts.push(currentPath)

  const env: RuntimeEnvVars = {
    PATH: pathParts.join(delimiter),
    PIP_CACHE_DIR: getPipCachePath(),
    VIRTUAL_ENV: getProjectPythonEnvPath(projectId),
    npm_config_cache: getNpmCachePath(),
  }

  // SSL certificate bundle for bundled Python's statically-compiled OpenSSL.
  // Covers pip, requests, urllib, curl, git — anything using OpenSSL.
  const certFile = getBundledCertFilePath()
  if (certFile) env.SSL_CERT_FILE = certFile

  log.debug({ projectId, env }, 'built runtime env')

  return env
}

/**
 * Build environment for MCP server subprocess.
 * Only injects bundled Node.js PATH and npm config (no Python venv).
 *
 * Used by: mcp-pool.ts buildTransport()
 *
 * @param basePath - Base PATH to extend (defaults to process.env.PATH)
 * @returns Partial env vars to merge, or empty object if no bundled Node
 */
export function buildMCPRuntimeEnv(basePath?: string): Record<string, string> {
  const nodeBinDir = getBundledNodeBinDir()
  if (!nodeBinDir) return {}

  const currentPath = basePath ?? process.env.PATH ?? ''
  const env = {
    PATH: [nodeBinDir, currentPath].join(delimiter),
    npm_config_cache: getNpmCachePath(),
  }

  log.debug({ env }, 'built MCP runtime env')

  return env
}
