import { delimiter, dirname, join } from 'node:path'
import {
  getBundledNodeBinDir,
  getBundledPythonPath,
  getBundledUvBinDir,
  getBundledCertFilePath,
  getNpmCachePath,
  getGlobalBinDir,
} from './paths'
import { buildRuntimeEnv } from './env-builder'
import { getDataDir } from '../utils/paths'
import { logger } from '../logger'
import type { BashRuntimeInfo } from '../agent/builtin-tools/bash-tools'

const log = logger.child({ component: 'runtime:env-manager' })

/**
 * Stateless coordinator for runtime environment variable management.
 *
 * Centralizes all env construction logic that was previously scattered across
 * index.ts, env-builder.ts (buildMCPRuntimeEnv), and individual tool files.
 *
 * **No caching** — all methods dynamically read from paths.ts on every call,
 * ensuring compatibility with tests that modify env vars mid-test (e.g.,
 * setting GOLEMANCY_NODE_PATH and expecting the next call to reflect it).
 *
 * The only side-effect is `augmentProcessEnv()`, which writes to process.env
 * once at server startup.
 */
export class RuntimeEnvManager {
  private _augmented = false

  /** Whether augmentProcessEnv() has been called. Used for defensive warnings. */
  get isAugmented(): boolean { return this._augmented }

  /**
   * One-time startup: inject bundled runtime paths into process.env.
   *
   * After this call, process.env.PATH includes bundled node/uv/python bin dirs,
   * and UV_PYTHON, UV_PYTHON_DOWNLOADS, UV_CACHE_DIR, SSL_CERT_FILE,
   * npm_config_cache are set if applicable.
   *
   * This replaces the ~30 lines of manual env setup in index.ts.
   */
  augmentProcessEnv(): void {
    this._augmented = true
    const currentPath = process.env.PATH ?? ''

    // ── PATH: prepend bundled bin dirs ─────────────────────────
    // Reproduces the original index.ts sequential-prepend order.
    // Each prepend shifts prior entries right, so the LAST prepend
    // ends up first in PATH.
    //
    // Prepend order: node → uv → python
    // Final PATH:    python → uv → node → original
    const prependDirs: string[] = []

    // Global bin dir for runtime shims (e.g., realpath polyfill on macOS < 13).
    // Added first → ends up after bundled dirs when reversed → lowest priority.
    const globalBinDir = getGlobalBinDir()
    if (!currentPath.includes(globalBinDir)) {
      prependDirs.push(globalBinDir)
    }

    const nodeBinDir = getBundledNodeBinDir()
    if (nodeBinDir && !currentPath.includes(nodeBinDir)) {
      prependDirs.push(nodeBinDir)
      log.info({ nodeBinDir }, 'prepended bundled node bin to process.env.PATH')
    }

    const uvBinDir = getBundledUvBinDir()
    if (uvBinDir && !currentPath.includes(uvBinDir)) {
      prependDirs.push(uvBinDir)
      log.info({ uvBinDir }, 'prepended bundled uv bin to process.env.PATH')
    }

    const pythonPath = getBundledPythonPath()
    const pythonBinDir = pythonPath ? dirname(pythonPath) : null
    if (pythonBinDir && !currentPath.includes(pythonBinDir)) {
      prependDirs.push(pythonBinDir)
      log.info({ pythonBinDir }, 'prepended bundled python bin to process.env.PATH')
    }

    if (prependDirs.length > 0) {
      // prependDirs is in prepend order: [node, uv, python]
      // Reversing gives the final PATH order: [python, uv, node, ...original]
      process.env.PATH = [...prependDirs.reverse(), currentPath].join(delimiter)
    }

    // ── UV_* variables: pin bundled Python ─────────────────────
    if (pythonPath && !process.env.UV_PYTHON) {
      process.env.UV_PYTHON = pythonPath
      process.env.UV_PYTHON_DOWNLOADS = 'never'
      log.info({ pythonPath }, 'set UV_PYTHON to bundled Python (downloads disabled)')
    }
    if (!process.env.UV_CACHE_DIR) {
      process.env.UV_CACHE_DIR = join(getDataDir(), 'runtime', 'cache', 'uv')
      log.info({ uvCacheDir: process.env.UV_CACHE_DIR }, 'set UV_CACHE_DIR')
    }

    // ── SSL_CERT_FILE: bundled Python CA certificates ──────────
    // Required for Python MCP servers (uvx) and any HTTPS requests
    // from bundled Python's statically-compiled OpenSSL.
    const certFile = getBundledCertFilePath()
    if (certFile && !process.env.SSL_CERT_FILE) {
      process.env.SSL_CERT_FILE = certFile
      log.info({ certFile }, 'set SSL_CERT_FILE to bundled CA bundle')
    }

    // ── npm_config_cache: shared npm cache directory ───────────
    // Ensures npm/npx uses our managed cache location, not user's global.
    if (!process.env.npm_config_cache) {
      process.env.npm_config_cache = getNpmCachePath()
      log.info({ npmCache: process.env.npm_config_cache }, 'set npm_config_cache')
    }
  }

  /**
   * Project-specific env overlay for bash tools (sandbox/unrestricted modes).
   *
   * Returns env vars to merge into subprocess environment — includes project
   * venv PATH, pip/npm cache dirs, SSL cert, etc.
   *
   * Internally delegates to buildRuntimeEnv() from env-builder.ts.
   */
  getProjectEnvOverlay(projectId: string): Record<string, string> {
    return { ...buildRuntimeEnv(projectId) }
  }

  /**
   * Runtime detection info for system prompt construction.
   * Dynamically reads bundled runtime availability on each call.
   */
  getRuntimeInfo(): BashRuntimeInfo {
    return {
      hasBundledPython: !!getBundledPythonPath(),
      hasBundledNode: !!getBundledNodeBinDir(),
      hasBundledUv: !!getBundledUvBinDir(),
    }
  }
}

/** Module-level singleton — one per server process. */
export const runtimeEnvManager = new RuntimeEnvManager()
