# Code Runtime Architecture Design

Date: 2026-02-16 | Architect

---

## 1. New Module: `packages/server/src/runtime/`

Four new files under `packages/server/src/runtime/`.

### 1.1 `runtime/paths.ts` — Path Resolution

All path resolution for bundled runtimes and per-project environments.

```typescript
import os from 'node:os'
import path from 'node:path'
import { getDataDir, getProjectPath, validateId } from '../utils/paths'

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
 * 2. {bundledRuntimeDir}/python/bin/python3.13
 * 3. null (not available — caller falls back to system `python3`)
 */
export function getBundledPythonPath(): string | null {
  if (process.env.GOLEMANCY_PYTHON_PATH) {
    return process.env.GOLEMANCY_PYTHON_PATH
  }
  const runtimeDir = getBundledRuntimeDir()
  if (runtimeDir) {
    return path.join(runtimeDir, 'python', 'bin', 'python3.13')
  }
  return null
}

/**
 * Path to bundled Node.js bin directory (contains node, npm, npx).
 *
 * Resolution order:
 * 1. GOLEMANCY_NODE_PATH env var → dirname (points to binary, we want dir)
 * 2. {bundledRuntimeDir}/node/bin/
 * 3. null (not available — caller falls back to system `node`)
 */
export function getBundledNodeBinDir(): string | null {
  if (process.env.GOLEMANCY_NODE_PATH) {
    return path.dirname(process.env.GOLEMANCY_NODE_PATH)
  }
  const runtimeDir = getBundledRuntimeDir()
  if (runtimeDir) {
    return path.join(runtimeDir, 'node', 'bin')
  }
  return null
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
 */
export function getProjectPythonEnvBinPath(projectId: string): string {
  return path.join(getProjectPythonEnvPath(projectId), 'bin')
}

/**
 * Per-project node_modules: ~/.golemancy/projects/{projectId}/runtime/node_modules/
 */
export function getProjectNodeModulesPath(projectId: string): string {
  return path.join(getProjectRuntimeDir(projectId), 'node_modules')
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

/**
 * Shared npm global prefix: ~/.golemancy/runtime/npm-global/
 * npx installs go here. Binaries in {prefix}/bin/.
 */
export function getNpmGlobalPath(): string {
  return path.join(getGlobalRuntimeDir(), 'npm-global')
}
```

### 1.2 `runtime/env-builder.ts` — Subprocess Environment Construction

Replaces the originally-planned `command-rewriter.ts`. Instead of rewriting commands (fragile, doesn't cover `python -m pip`, shebangs, etc.), we build subprocess environment variables with PATH injection and cache directory configuration.

```typescript
import {
  getBundledNodeBinDir,
  getProjectPythonEnvPath,
  getProjectPythonEnvBinPath,
  getPipCachePath,
  getNpmCachePath,
  getNpmGlobalPath,
} from './paths'

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
  /** npm global install prefix (for npx global installs) */
  NPM_CONFIG_PREFIX: string
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

  return {
    PATH: pathParts.join(':'),
    PIP_CACHE_DIR: getPipCachePath(),
    VIRTUAL_ENV: getProjectPythonEnvPath(projectId),
    npm_config_cache: getNpmCachePath(),
    NPM_CONFIG_PREFIX: getNpmGlobalPath(),
  }
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
  return {
    PATH: `${nodeBinDir}:${currentPath}`,
    npm_config_cache: getNpmCachePath(),
    NPM_CONFIG_PREFIX: getNpmGlobalPath(),
  }
}
```

**Why env-builder instead of command-rewriter:**

| Aspect | Command Rewriter (original) | Env Builder (chosen) |
|--------|---------------------------|---------------------|
| `python -m pip install` | Must also rewrite `python` | Works automatically (venv python in PATH) |
| pip-installed CLIs (`black`, `pytest`) | Can't handle (not python/pip/node/npm/npx) | Works automatically (venv bin in PATH) |
| `#!/usr/bin/env python3` shebangs | Can't handle | Works automatically (PATH resolves) |
| Scripts calling pip internally | Can't handle | Works automatically (env inherited) |
| Complexity | Must parse + modify command strings | Set 5 env vars |

### 1.3 `runtime/python-manager.ts` — Venv Lifecycle & Package Management

```typescript
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
```

### 1.4 `runtime/node-manager.ts` — Node.js Status

Minimal module — Node.js doesn't need per-project initialization. The env-builder handles all PATH/cache config. This module only provides status information for the REST API.

```typescript
import { spawn } from 'node:child_process'
import { getBundledNodeBinDir } from './paths'
import path from 'node:path'

export interface NodeRuntimeStatus {
  /** Whether bundled Node.js is available */
  available: boolean
  /** Node.js version (e.g., "22.22.0"), null if not available */
  nodeVersion: string | null
  /** npm version (e.g., "10.x.x"), null if not available */
  npmVersion: string | null
  /** Path to bundled node bin directory, null if not available */
  binDir: string | null
}

/**
 * Get status of bundled Node.js runtime.
 */
export async function getNodeRuntimeStatus(): Promise<NodeRuntimeStatus> {
  const binDir = getBundledNodeBinDir()
  if (!binDir) {
    return { available: false, nodeVersion: null, npmVersion: null, binDir: null }
  }

  const nodeBin = path.join(binDir, 'node')
  const npmBin = path.join(binDir, 'npm')

  const [nodeVersion, npmVersion] = await Promise.all([
    getVersionOutput(nodeBin),
    getVersionOutput(npmBin),
  ])

  return {
    available: nodeVersion !== null,
    nodeVersion: nodeVersion?.replace('v', '') ?? null,
    npmVersion,
    binDir,
  }
}

async function getVersionOutput(binary: string): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn(binary, ['--version'], {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5_000,
    })
    let output = ''
    child.stdout?.on('data', (chunk: Buffer) => { output += chunk.toString() })
    child.on('close', (code) => resolve(code === 0 ? output.trim() : null))
    child.on('error', () => resolve(null))
  })
}
```

### 1.5 `runtime/index.ts` — Public API re-export

```typescript
export { buildRuntimeEnv, buildMCPRuntimeEnv } from './env-builder'
export type { RuntimeEnvVars } from './env-builder'
export {
  getBundledPythonPath,
  getBundledNodeBinDir,
  getBundledRuntimeDir,
  getProjectRuntimeDir,
  getProjectPythonEnvPath,
  getProjectPythonEnvBinPath,
  getProjectNodeModulesPath,
  getGlobalRuntimeDir,
  getPipCachePath,
  getNpmCachePath,
  getNpmGlobalPath,
} from './paths'
export {
  initProjectPythonEnv,
  removeProjectPythonEnv,
  resetProjectPythonEnv,
  installPackages,
  uninstallPackage,
  listPackages,
  getPythonEnvStatus,
  resolvePythonBinary,
} from './python-manager'
export type { PythonPackage, PythonEnvStatus } from './python-manager'
export { getNodeRuntimeStatus } from './node-manager'
export type { NodeRuntimeStatus } from './node-manager'
```

---

## 2. Integration Design — Exact Code Changes

### 2.1 `AnthropicSandbox` — Inject runtime env into sandbox subprocess

**File**: `packages/server/src/agent/anthropic-sandbox.ts`

**Problem**: `spawnCommand()` uses `getSafeEnv()` which only allows a whitelist of env vars (HOME, PATH, LANG, etc.). Runtime env vars (PIP_CACHE_DIR, VIRTUAL_ENV, npm_config_cache, NPM_CONFIG_PREFIX) are not in the whitelist.

**Solution**: Accept `runtimeEnv` in constructor options, merge into safe env in `spawnCommand()`.

#### Change 1: Add `runtimeEnv` to options interface

```typescript
// anthropic-sandbox.ts — AnthropicSandboxOptions (currently line ~50)

export interface AnthropicSandboxOptions {
  config: SandboxConfig
  workspaceRoot: string
  sandboxManager: SandboxManagerHandle
  timeoutMs?: number
  /** Runtime env vars (PATH override, pip/npm cache dirs) to inject into subprocess */
  runtimeEnv?: Record<string, string>  // NEW
}
```

#### Change 2: Store runtimeEnv in constructor

```typescript
// anthropic-sandbox.ts — constructor body

constructor(options: AnthropicSandboxOptions) {
  this.config = options.config
  this.workspaceRoot = options.workspaceRoot
  this.sandboxManager = options.sandboxManager
  this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  this.runtimeEnv = options.runtimeEnv ?? {}  // NEW
}
```

#### Change 3: Merge runtime env in `spawnCommand()`

```typescript
// anthropic-sandbox.ts — spawnCommand() (currently line ~119)
// Change: env: getSafeEnv() → env: { ...getSafeEnv(), ...this.runtimeEnv }

private spawnCommand(wrappedCommand: string): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', ['-c', wrappedCommand], {
      cwd: this.workspaceRoot,
      env: { ...getSafeEnv(), ...this.runtimeEnv },  // CHANGED
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    // ... rest unchanged
  })
}
```

**Security note**: The runtime env vars are not secrets — they're directory paths controlled by Golemancy. PATH prepending only adds known bundled binary directories. This is safe to expose in the sandbox.

### 2.2 `NativeSandbox` — Inject runtime env into subprocess

**File**: `packages/server/src/agent/native-sandbox.ts`

**Problem**: `spawnCommand()` passes `process.env` directly. Need to inject runtime env vars.

**Solution**: Accept `runtimeEnv` in constructor options, merge into env in `spawnCommand()`.

#### Change 1: Add `runtimeEnv` to options

```typescript
// native-sandbox.ts — NativeSandboxOptions (currently line ~12)

export interface NativeSandboxOptions {
  workspaceRoot: string
  timeoutMs?: number
  /** Runtime env vars (PATH override, pip/npm cache dirs) to inject into subprocess */
  runtimeEnv?: Record<string, string>  // NEW
}
```

#### Change 2: Store and use in `spawnCommand()`

```typescript
// native-sandbox.ts — spawnCommand() (currently line ~46)
// Change: env: process.env → env: { ...process.env, ...this.runtimeEnv }

private spawnCommand(command: string): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', ['-c', command], {
      cwd: this.workspaceRoot,
      env: { ...process.env, ...this.runtimeEnv },  // CHANGED
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    // ... rest unchanged
  })
}
```

### 2.3 `builtin-tools.ts` — Build and pass runtime env to sandboxes

**File**: `packages/server/src/agent/builtin-tools.ts`

**Problem**: The sandbox/unrestricted mode constructors now accept `runtimeEnv`, but nobody builds and passes it yet.

**Solution**: Import `buildRuntimeEnv` from runtime module, call it when creating sandboxes.

#### Change: In `createBashToolForMode()`, add runtime env to sandbox/unrestricted cases

```typescript
// builtin-tools.ts — top of file, add import
import { buildRuntimeEnv } from '../runtime/env-builder'

// builtin-tools.ts — case 'sandbox' (currently line ~62)
// After: const sandboxConfig = permissionsToSandboxConfig(resolved!.config)
// Add: const runtimeEnv = buildRuntimeEnv(options.projectId)

case 'sandbox': {
  try {
    if (!options?.projectId) throw new Error('projectId required for sandbox mode')
    const workspaceDir = await ensureWorkspaceDir(options.projectId)
    const sandboxConfig = permissionsToSandboxConfig(resolved!.config)
    const runtimeEnv = buildRuntimeEnv(options.projectId)  // NEW

    const bridgedConfig: ResolvedBashToolConfig = {
      mode: 'sandbox',
      sandbox: sandboxConfig,
      usesDedicatedWorker: true,
    }

    const handle = await sandboxPool.getHandle(
      options.projectId as ProjectId,
      bridgedConfig,
    )
    const sandbox = new AnthropicSandbox({
      config: sandboxConfig,
      workspaceRoot: workspaceDir,
      sandboxManager: handle,
      runtimeEnv,  // NEW
    })
    return createBashTool({ sandbox, destination: workspaceDir })
  } catch (err) {
    log.warn({ err, mode }, 'sandbox mode unavailable, falling back to restricted')
    return createRestrictedBashTool(options)
  }
}

// builtin-tools.ts — case 'unrestricted' (currently line ~84)

case 'unrestricted': {
  const workspaceDir = options?.projectId
    ? await ensureWorkspaceDir(options.projectId)
    : process.cwd()
  const runtimeEnv = options?.projectId                      // NEW
    ? buildRuntimeEnv(options.projectId)                     // NEW
    : {}                                                     // NEW
  const sandbox = new NativeSandbox({
    workspaceRoot: workspaceDir,
    runtimeEnv,  // NEW
  })
  return createBashTool({ sandbox, destination: workspaceDir })
}
```

**Note**: The `restricted` mode (just-bash/Pyodide) is NOT changed. It runs in a virtual filesystem and cannot access external binaries. Bundled runtimes are irrelevant in restricted mode.

### 2.4 `mcp-pool.ts` — Inject bundled Node.js env for stdio MCP servers

**File**: `packages/server/src/agent/mcp-pool.ts`

**Problem**: When launching stdio MCP servers (e.g., `npx -y @modelcontextprotocol/server-filesystem`), they should use bundled Node.js, not system Node.js.

**Solution**: In `buildTransport()`, merge `buildMCPRuntimeEnv()` into the transport's env.

#### Change: In `buildTransport()`, stdio branch

```typescript
// mcp-pool.ts — top of file, add import
import { buildMCPRuntimeEnv } from '../runtime/env-builder'

// mcp-pool.ts — buildTransport(), stdio branch (currently near end of method)
// Change the env passed to Experimental_StdioMCPTransport

// BEFORE:
// env: server.env ? { ...process.env, ...server.env } as Record<string, string> : undefined,

// AFTER:
const mcpRuntimeEnv = buildMCPRuntimeEnv()
const transportEnv = Object.keys(mcpRuntimeEnv).length > 0 || server.env
  ? { ...process.env, ...mcpRuntimeEnv, ...server.env } as Record<string, string>
  : undefined

const transport = new Experimental_StdioMCPTransport({
  command: effectiveCommand,
  args: effectiveArgs,
  env: transportEnv,  // CHANGED
  cwd: effectiveCwd,
  stderr: 'pipe',
})
```

**Ordering**: `...process.env` → `...mcpRuntimeEnv` → `...server.env`. User-defined `server.env` takes highest priority (can override bundled paths if needed).

### 2.5 `storage/projects.ts` — Trigger venv creation on project create

**File**: `packages/server/src/storage/projects.ts`

**Problem**: Venv should be created eagerly when a project is created.

**Solution**: The cleanest approach is to trigger venv init from the route handler (not the storage layer), because:
- Storage layer should remain a pure data CRUD layer
- Runtime initialization is infrastructure, not data
- Error in venv creation should NOT prevent project creation (graceful degradation)

#### Change: In `routes/projects.ts`, add venv init after project creation

```typescript
// routes/projects.ts — new version

import { Hono } from 'hono'
import type { IProjectService, ProjectId } from '@golemancy/shared'
import { initProjectPythonEnv } from '../runtime/python-manager'  // NEW
import { logger } from '../logger'

const log = logger.child({ component: 'routes:projects' })

export function createProjectRoutes(storage: IProjectService) {
  const app = new Hono()

  // ... GET / and GET /:id unchanged ...

  app.post('/', async (c) => {
    const data = await c.req.json()
    log.debug('creating project')
    const project = await storage.create(data)
    log.debug({ projectId: project.id }, 'created project')

    // NEW: Eagerly create Python venv (non-blocking, non-fatal)
    initProjectPythonEnv(project.id).catch((err) => {
      log.warn({ err, projectId: project.id }, 'failed to create Python venv on project creation')
    })

    return c.json(project, 201)
  })

  // ... PATCH and DELETE unchanged ...

  return app
}
```

**Design choice**: `initProjectPythonEnv` is fire-and-forget (`.catch()` to log warning). Project creation succeeds even if venv creation fails (bundled Python not available, disk error, etc.). The runtime status API lets the UI know if venv needs to be re-created.

### 2.6 `apps/desktop/src/main/index.ts` — Pass resources path to server

**File**: `apps/desktop/src/main/index.ts`

**Problem**: The server process needs to know where bundled runtimes are located. In packaged mode, they're under `process.resourcesPath + '/runtime/'`. The server process (forked with system node in dev, Electron binary in production) doesn't have direct access to Electron's `process.resourcesPath`.

**Solution**: Pass `process.resourcesPath` via env var when forking the server.

#### Change: In `startServer()`, add GOLEMANCY_RESOURCES_PATH to fork env

```typescript
// apps/desktop/src/main/index.ts — startServer() (currently line ~19)

const child = fork(serverEntry, [], {
  env: {
    ...process.env,
    PORT: '0',
    // NEW: Pass Electron resources path to server for bundled runtime resolution
    ...(app.isPackaged ? { GOLEMANCY_RESOURCES_PATH: process.resourcesPath } : {}),
  },
  execPath: app.isPackaged ? process.execPath : (process.env.GOLEMANCY_FORK_EXEC_PATH || 'node'),
  execArgv: app.isPackaged ? [] : ['--import', 'tsx'],
  cwd: serverCwd,
  stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
})
```

---

## 3. Updated PermissionsConfig Defaults

### 3.1 New Template Variables

**File**: `packages/server/src/agent/resolve-permissions.ts`

Add support for `{{projectRuntimeDir}}` and `{{globalRuntimeDir}}` template expansion in `allowWrite` patterns.

#### Change: Extend template expansion in `resolvePermissionsConfig()`

```typescript
// resolve-permissions.ts — resolvePermissionsConfig()
// After the existing {{workspaceDir}} expansion, add:

import { getProjectRuntimeDir, getGlobalRuntimeDir } from '../runtime/paths'

// Inside resolvePermissionsConfig(), replace the allowWrite mapping:

const projectRuntimeDir = getProjectRuntimeDir(projectId)
const globalRuntimeDir = getGlobalRuntimeDir()

const config: PermissionsConfig = {
  ...configFile.config,
  allowWrite: configFile.config.allowWrite.map(p => {
    // Expand all template variables
    let expanded = p
    if (expanded.includes('{{workspaceDir}}')) {
      expanded = expanded.replace('{{workspaceDir}}', workspaceDir)
    }
    if (expanded.includes('{{projectRuntimeDir}}')) {
      expanded = expanded.replace('{{projectRuntimeDir}}', projectRuntimeDir)
    }
    if (expanded.includes('{{globalRuntimeDir}}')) {
      expanded = expanded.replace('{{globalRuntimeDir}}', globalRuntimeDir)
    }

    // Path traversal check for template-expanded paths
    if (p.includes('{{')) {
      const resolved = path.resolve(expanded)
      // Allow project runtime dir and global runtime dir
      // (they're outside workspace but under controlled paths)
      const isUnderWorkspace = resolved.startsWith(workspaceRealPath + path.sep) || resolved === workspaceRealPath
      const isUnderProjectRuntime = resolved.startsWith(path.resolve(projectRuntimeDir) + path.sep) || resolved === path.resolve(projectRuntimeDir)
      const isUnderGlobalRuntime = resolved.startsWith(path.resolve(globalRuntimeDir) + path.sep) || resolved === path.resolve(globalRuntimeDir)

      if (!isUnderWorkspace && !isUnderProjectRuntime && !isUnderGlobalRuntime) {
        log.warn({ pattern: p, resolved }, 'allowWrite template escapes allowed directories, rejecting')
        return workspaceRealPath
      }
      return resolved
    }
    return path.resolve(expanded)
  }),
}
```

### 3.2 Updated Default allowWrite

**File**: `packages/shared/src/types/permissions.ts`

```typescript
// permissions.ts — DEFAULT_PERMISSIONS_CONFIG.config.allowWrite

allowWrite: [
  '{{workspaceDir}}',
  '{{projectRuntimeDir}}/**',   // NEW: Python venv + node_modules
  '{{globalRuntimeDir}}/**',    // NEW: pip/npm cache + npm-global
  '/tmp',                        // existing (used by sandbox staging)
],
```

### 3.3 Default Allowed Domains

**File**: `packages/shared/src/types/permissions.ts`

Add default allowed domains for when `networkRestrictionsEnabled` is `true`. These are the minimum domains needed for package management.

```typescript
// permissions.ts — DEFAULT_PERMISSIONS_CONFIG.config

allowedDomains: [
  // Python package index
  'pypi.org',
  'files.pythonhosted.org',
  // npm registry
  'registry.npmjs.org',
  // GitHub (packages & MCP tools hosted here)
  'github.com',
  '*.githubusercontent.com',
  // AI provider APIs
  'api.openai.com',
  'api.anthropic.com',
  'generativelanguage.googleapis.com',
  'api.deepseek.com',
  // Common CDNs (npm packages often hosted here)
  '*.cloudflare.com',
  '*.fastly.net',
  '*.amazonaws.com',
],
```

**Note**: These are only enforced when `networkRestrictionsEnabled: true`. The default is `false` (all traffic allowed).

---

## 4. REST API Routes

### 4.1 New Route File: `packages/server/src/routes/runtime.ts`

```typescript
import { Hono } from 'hono'
import type { ProjectId } from '@golemancy/shared'
import {
  getPythonEnvStatus,
  listPackages,
  installPackages,
  uninstallPackage,
  resetProjectPythonEnv,
} from '../runtime/python-manager'
import { getNodeRuntimeStatus } from '../runtime/node-manager'
import { logger } from '../logger'

const log = logger.child({ component: 'routes:runtime' })

export function createRuntimeRoutes() {
  const app = new Hono()

  // GET /status — Combined runtime status
  app.get('/status', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    log.debug({ projectId }, 'getting runtime status')

    const [pythonStatus, nodeStatus] = await Promise.all([
      getPythonEnvStatus(projectId),
      getNodeRuntimeStatus(),
    ])

    return c.json({ python: pythonStatus, node: nodeStatus })
  })

  // GET /python/packages — List installed Python packages
  app.get('/python/packages', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    log.debug({ projectId }, 'listing Python packages')

    try {
      const packages = await listPackages(projectId)
      return c.json(packages)
    } catch (err) {
      log.error({ err, projectId }, 'failed to list Python packages')
      return c.json({ error: 'Failed to list packages', detail: String(err) }, 500)
    }
  })

  // POST /python/packages — Install Python packages
  // Body: { packages: string[] }
  app.post('/python/packages', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const body = await c.req.json<{ packages: string[] }>()

    if (!body.packages || !Array.isArray(body.packages) || body.packages.length === 0) {
      return c.json({ error: 'packages array is required' }, 400)
    }

    // Validate package names (basic sanitization)
    const invalidPackage = body.packages.find(p => !/^[a-zA-Z0-9._\-\[\]>=<!, ]+$/.test(p))
    if (invalidPackage) {
      return c.json({ error: `Invalid package specifier: ${invalidPackage}` }, 400)
    }

    log.info({ projectId, packages: body.packages }, 'installing Python packages')

    try {
      const output = await installPackages(projectId, body.packages)
      return c.json({ ok: true, output })
    } catch (err) {
      log.error({ err, projectId }, 'failed to install Python packages')
      return c.json({ error: 'Install failed', detail: String(err) }, 500)
    }
  })

  // DELETE /python/packages/:name — Uninstall a Python package
  app.delete('/python/packages/:name', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const name = c.req.param('name')

    if (!name || !/^[a-zA-Z0-9._-]+$/.test(name)) {
      return c.json({ error: 'Invalid package name' }, 400)
    }

    log.info({ projectId, packageName: name }, 'uninstalling Python package')

    try {
      const output = await uninstallPackage(projectId, name)
      return c.json({ ok: true, output })
    } catch (err) {
      log.error({ err, projectId, packageName: name }, 'failed to uninstall Python package')
      return c.json({ error: 'Uninstall failed', detail: String(err) }, 500)
    }
  })

  // POST /python/reset — Delete and recreate Python venv
  app.post('/python/reset', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    log.info({ projectId }, 'resetting Python venv')

    try {
      await resetProjectPythonEnv(projectId)
      return c.json({ ok: true })
    } catch (err) {
      log.error({ err, projectId }, 'failed to reset Python venv')
      return c.json({ error: 'Reset failed', detail: String(err) }, 500)
    }
  })

  return app
}
```

### 4.2 Route Registration in `app.ts`

```typescript
// app.ts — add import
import { createRuntimeRoutes } from './routes/runtime'

// app.ts — add route (after permissions-config route)
app.route('/api/projects/:projectId/runtime', createRuntimeRoutes())
```

### 4.3 API Summary

| Method | Path | Request Body | Response | Description |
|--------|------|-------------|----------|-------------|
| GET | `/api/projects/:projectId/runtime/status` | — | `{ python: PythonEnvStatus, node: NodeRuntimeStatus }` | Combined runtime status |
| GET | `/api/projects/:projectId/runtime/python/packages` | — | `PythonPackage[]` | List installed packages |
| POST | `/api/projects/:projectId/runtime/python/packages` | `{ packages: string[] }` | `{ ok: true, output: string }` | Install packages |
| DELETE | `/api/projects/:projectId/runtime/python/packages/:name` | — | `{ ok: true, output: string }` | Uninstall a package |
| POST | `/api/projects/:projectId/runtime/python/reset` | — | `{ ok: true }` | Reset (delete+recreate) venv |

---

## 5. Download Script Design

### 5.1 `scripts/download-runtime.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

# ── Configuration (pinned versions for reproducible builds) ──

PYTHON_VERSION="3.13.12"
PYTHON_RELEASE="20260203"
NODE_VERSION="22.22.0"

# ── Output directory ──

RUNTIME_DIR="$(cd "$(dirname "$0")/../apps/desktop/resources/runtime" && pwd -P 2>/dev/null || echo "$(dirname "$0")/../apps/desktop/resources/runtime")"

# ── Platform detection ──

detect_platform() {
  local os arch

  case "$(uname -s)" in
    Darwin) os="darwin" ;;
    Linux)  os="linux" ;;
    MINGW*|MSYS*|CYGWIN*) os="win32" ;;
    *) echo "ERROR: Unsupported OS: $(uname -s)"; exit 1 ;;
  esac

  case "$(uname -m)" in
    arm64|aarch64) arch="arm64" ;;
    x86_64|amd64)  arch="x64" ;;
    *) echo "ERROR: Unsupported architecture: $(uname -m)"; exit 1 ;;
  esac

  echo "${os}-${arch}"
}

# ── Python download ──

download_python() {
  local platform="$1"
  local python_dir="${RUNTIME_DIR}/python"

  # Idempotent: skip if already downloaded
  if [ -x "${python_dir}/bin/python3.13" ]; then
    echo "Python ${PYTHON_VERSION} already present, skipping"
    return 0
  fi

  # Map platform to python-build-standalone triple
  local triple
  case "$platform" in
    darwin-arm64) triple="aarch64-apple-darwin" ;;
    darwin-x64)   triple="x86_64-apple-darwin" ;;
    linux-x64)    triple="x86_64-unknown-linux-gnu" ;;
    *) echo "ERROR: No Python binary for platform: $platform"; exit 1 ;;
  esac

  local filename="cpython-${PYTHON_VERSION}+${PYTHON_RELEASE}-${triple}-install_only_stripped.tar.gz"
  local url="https://github.com/astral-sh/python-build-standalone/releases/download/${PYTHON_RELEASE}/${filename}"

  echo "Downloading Python ${PYTHON_VERSION} for ${platform}..."
  echo "  URL: ${url}"

  local tmpfile
  tmpfile="$(mktemp)"
  curl -fSL --progress-bar -o "$tmpfile" "$url"

  # Extract: tarball contains python/ top-level directory
  # Extract directly to runtime dir → results in runtime/python/
  echo "Extracting Python to ${python_dir}..."
  mkdir -p "${RUNTIME_DIR}"
  tar xzf "$tmpfile" -C "${RUNTIME_DIR}"
  rm -f "$tmpfile"

  # Verify
  if [ -x "${python_dir}/bin/python3.13" ]; then
    echo "Python ${PYTHON_VERSION} installed successfully"
    "${python_dir}/bin/python3.13" --version
  else
    echo "ERROR: Python binary not found after extraction"
    exit 1
  fi
}

# ── Node.js download ──

download_node() {
  local platform="$1"
  local node_dir="${RUNTIME_DIR}/node"

  # Idempotent: skip if already downloaded
  if [ -x "${node_dir}/bin/node" ]; then
    echo "Node.js ${NODE_VERSION} already present, skipping"
    return 0
  fi

  # Map platform to Node.js naming convention
  local node_os node_arch
  case "$platform" in
    darwin-arm64) node_os="darwin"; node_arch="arm64" ;;
    darwin-x64)   node_os="darwin"; node_arch="x64" ;;
    linux-x64)    node_os="linux";  node_arch="x64" ;;
    *) echo "ERROR: No Node.js binary for platform: $platform"; exit 1 ;;
  esac

  local filename="node-v${NODE_VERSION}-${node_os}-${node_arch}.tar.gz"
  local url="https://nodejs.org/dist/v${NODE_VERSION}/${filename}"

  # SHA256 verification
  local expected_sha256
  case "$platform" in
    darwin-arm64) expected_sha256="5ed4db0fcf1eaf84d91ad12462631d73bf4576c1377e192d222e48026a902640" ;;
    darwin-x64)   expected_sha256="5ea50c9d6dea3dfa3abb66b2656f7a4e1c8cef23432b558d45fb538c7b5dedce" ;;
    linux-x64)    expected_sha256="c33c39ed9c80deddde77c960d00119918b9e352426fd604ba41638d6526a4744" ;;
  esac

  echo "Downloading Node.js ${NODE_VERSION} for ${platform}..."
  echo "  URL: ${url}"

  local tmpfile
  tmpfile="$(mktemp)"
  curl -fSL --progress-bar -o "$tmpfile" "$url"

  # Verify SHA256
  local actual_sha256
  if command -v sha256sum &>/dev/null; then
    actual_sha256="$(sha256sum "$tmpfile" | awk '{print $1}')"
  else
    actual_sha256="$(shasum -a 256 "$tmpfile" | awk '{print $1}')"
  fi

  if [ "$actual_sha256" != "$expected_sha256" ]; then
    echo "ERROR: SHA256 mismatch!"
    echo "  Expected: ${expected_sha256}"
    echo "  Actual:   ${actual_sha256}"
    rm -f "$tmpfile"
    exit 1
  fi
  echo "  SHA256 verified ✓"

  # Extract with --strip-components=1 (removes node-v22.22.0-{os}-{arch}/ prefix)
  echo "Extracting Node.js to ${node_dir}..."
  mkdir -p "${node_dir}"
  tar xzf "$tmpfile" --strip-components=1 -C "${node_dir}"
  rm -f "$tmpfile"

  # Verify
  if [ -x "${node_dir}/bin/node" ]; then
    echo "Node.js ${NODE_VERSION} installed successfully"
    "${node_dir}/bin/node" --version
  else
    echo "ERROR: Node binary not found after extraction"
    exit 1
  fi
}

# ── Main ──

main() {
  local platform
  platform="$(detect_platform)"
  echo "Detected platform: ${platform}"
  echo "Runtime directory: ${RUNTIME_DIR}"
  echo ""

  mkdir -p "${RUNTIME_DIR}"

  download_python "$platform"
  echo ""
  download_node "$platform"

  echo ""
  echo "All runtimes downloaded successfully."
  echo "Total size: $(du -sh "${RUNTIME_DIR}" | awk '{print $1}')"
}

main "$@"
```

### 5.2 `.gitignore` Addition

```
# apps/desktop/.gitignore (or project root .gitignore)
apps/desktop/resources/runtime/
```

### 5.3 `package.json` Script

```jsonc
// apps/desktop/package.json — scripts
{
  "scripts": {
    "download-runtime": "bash ../../scripts/download-runtime.sh"
  }
}
```

---

## 6. Error Handling Strategy

### 6.1 Venv Creation Failure (on project create)

| Scenario | Behavior |
|----------|----------|
| Bundled Python not found (dev mode, no env var) | `initProjectPythonEnv` falls back to system `python3`. If that also fails, logs warning. Project creation succeeds. |
| System python3 not found | Logs warning. Project creation succeeds. Venv doesn't exist. |
| Disk full / permission error | Logs warning. Project creation succeeds. Venv doesn't exist. |
| Venv directory already exists | `python -m venv` is idempotent — it succeeds if the dir already exists. |

**User flow**: If venv creation fails, `GET /runtime/status` shows `python.exists: false`. Future UI can show a "Recreate Environment" button that calls `POST /python/reset`.

### 6.2 pip install Failure

| Scenario | Behavior |
|----------|----------|
| Package not found on PyPI | pip returns exit code 1, stderr contains error message. Route returns 500 with detail. |
| Network error (offline, domain blocked) | pip returns exit code 1, stderr contains network error. Route returns 500 with detail. |
| Venv doesn't exist | pip binary not found. Route returns 500 with detail. |
| Disk full | pip returns error. Route returns 500 with detail. |

**Design**: All pip errors are surfaced verbatim to the caller via the `detail` field. The UI (future) can display these to the user.

### 6.3 Bundled Python Not Found (at command execution time)

| Scenario | Behavior |
|----------|----------|
| Venv exists but bundled Python was deleted/moved | The venv's Python symlinks break. Commands fail with "No such file or directory". The `PATH` includes `{venv}/bin` but symlinks are dangling. |
| Mitigation | The `resetProjectPythonEnv` endpoint recreates the venv. |
| Dev mode, no bundled Python, no system python3 | PATH includes a non-existent venv bin dir (harmless, gets skipped in PATH resolution). `python` commands fall through to whatever is on the system PATH. |

### 6.4 Bundled Node.js Not Found (at MCP launch time)

| Scenario | Behavior |
|----------|----------|
| `getBundledNodeBinDir()` returns null | `buildMCPRuntimeEnv()` returns empty object. Transport env is unchanged. Falls back to system node (existing behavior). |
| Bundled Node exists but binary is corrupt | MCP server fails to start. `mcpPool.getTools()` returns `{ tools: {}, error: "..." }`. Error surfaced to user via existing MCP error handling. |

---

## 7. Dev Mode Strategy

### 7.1 Environment Variables

| Env Var | Purpose | Set By |
|---------|---------|--------|
| `GOLEMANCY_RESOURCES_PATH` | Packaged Electron `process.resourcesPath` | Electron main process (production only) |
| `GOLEMANCY_PYTHON_PATH` | Override bundled Python binary path | Developer / CI |
| `GOLEMANCY_NODE_PATH` | Override bundled Node.js binary path | Developer / CI |

### 7.2 Dev Mode Behavior

In development (`pnpm dev`):
1. `GOLEMANCY_RESOURCES_PATH` is NOT set (Electron main process only sets it when `app.isPackaged`)
2. `getBundledRuntimeDir()` returns `null`
3. `getBundledPythonPath()` returns `GOLEMANCY_PYTHON_PATH` if set, else `null`
4. `getBundledNodeBinDir()` returns `dirname(GOLEMANCY_NODE_PATH)` if set, else `null`
5. `resolvePythonBinary()` returns `GOLEMANCY_PYTHON_PATH` if set, else `'python3'` (system)
6. `buildRuntimeEnv()` still prepends venv bin to PATH (venv works with system python too)
7. `buildMCPRuntimeEnv()` returns empty object (no PATH override) — uses system node

### 7.3 Testing with Bundled Runtimes in Dev

To test bundled runtimes without packaging the Electron app:

```bash
# Download runtimes
bash scripts/download-runtime.sh

# Point server at downloaded runtimes
export GOLEMANCY_PYTHON_PATH="$(pwd)/apps/desktop/resources/runtime/python/bin/python3.13"
export GOLEMANCY_NODE_PATH="$(pwd)/apps/desktop/resources/runtime/node/bin/node"
pnpm dev
```

### 7.4 E2E Test Support

For Playwright E2E tests, add `GOLEMANCY_RESOURCES_PATH` to the test fixture's Electron launch env:

```typescript
// In e2e fixtures, when launching Electron with downloaded runtimes:
const resourcesPath = path.join(rootDir, 'apps/desktop/resources')
// Pass via GOLEMANCY_RESOURCES_PATH in the electron launch env
```

---

## 8. File Summary — All New/Modified Files

### New Files

| File | Purpose |
|------|---------|
| `packages/server/src/runtime/paths.ts` | All path resolution functions |
| `packages/server/src/runtime/env-builder.ts` | Build subprocess env vars (PATH, cache dirs) |
| `packages/server/src/runtime/python-manager.ts` | Venv lifecycle + pip operations |
| `packages/server/src/runtime/node-manager.ts` | Node.js status |
| `packages/server/src/runtime/index.ts` | Public API re-exports |
| `packages/server/src/routes/runtime.ts` | REST API routes |
| `scripts/download-runtime.sh` | Download script |

### Modified Files

| File | Change | Lines Affected |
|------|--------|----------------|
| `packages/server/src/agent/anthropic-sandbox.ts` | Add `runtimeEnv` option, merge into `spawnCommand` env | Options interface (~L50), constructor, `spawnCommand()` (~L119) |
| `packages/server/src/agent/native-sandbox.ts` | Add `runtimeEnv` option, merge into `spawnCommand` env | Options interface (~L12), constructor, `spawnCommand()` (~L46) |
| `packages/server/src/agent/builtin-tools.ts` | Import env-builder, pass `runtimeEnv` to sandbox constructors | Import (~L1), sandbox case (~L62), unrestricted case (~L84) |
| `packages/server/src/agent/mcp-pool.ts` | Import env-builder, inject bundled Node.js env into stdio transport | Import (~L1), `buildTransport()` stdio branch |
| `packages/server/src/agent/resolve-permissions.ts` | Expand `{{projectRuntimeDir}}` and `{{globalRuntimeDir}}` templates | Template expansion loop |
| `packages/shared/src/types/permissions.ts` | Add runtime paths to default `allowWrite`, add default `allowedDomains` | `DEFAULT_PERMISSIONS_CONFIG` |
| `packages/server/src/routes/projects.ts` | Import python-manager, fire-and-forget venv init on project create | POST handler |
| `packages/server/src/app.ts` | Import and register runtime routes | Import, route registration |
| `apps/desktop/src/main/index.ts` | Pass `GOLEMANCY_RESOURCES_PATH` in fork env | `startServer()` fork env |

---

## 9. Data Flow Diagrams

### 9.1 Command Execution (Sandbox Mode)

```
Agent sends command (e.g., "pip install numpy")
    │
    ▼
builtin-tools.ts: createBashToolForMode('sandbox')
    │ calls buildRuntimeEnv(projectId) → RuntimeEnvVars
    │ creates AnthropicSandbox({ ..., runtimeEnv })
    │
    ▼
bash-tool: user runs command
    │
    ▼
AnthropicSandbox.executeCommand(command)
    │ checkBlacklist(command)
    │ wrapWithSandbox(command) → wrappedCommand
    │
    ▼
AnthropicSandbox.spawnCommand(wrappedCommand)
    │ env = { ...getSafeEnv(), ...this.runtimeEnv }
    │ spawn('bash', ['-c', wrappedCommand], { env })
    │
    ▼
bash process (sandboxed via sandbox-exec):
    PATH = /home/user/.golemancy/projects/proj-xxx/runtime/python-env/bin
         : /path/to/bundled/node/bin
         : /usr/local/bin:...
    PIP_CACHE_DIR = /home/user/.golemancy/runtime/cache/pip
    VIRTUAL_ENV = /home/user/.golemancy/projects/proj-xxx/runtime/python-env
    npm_config_cache = /home/user/.golemancy/runtime/cache/npm
    NPM_CONFIG_PREFIX = /home/user/.golemancy/runtime/npm-global
    │
    ▼
"pip install numpy" resolves pip from venv/bin (via PATH)
    → installs to venv/lib/python3.13/site-packages/
    → caches wheels to PIP_CACHE_DIR
```

### 9.2 MCP Server Launch

```
Agent needs MCP tool (e.g., npx -y @modelcontextprotocol/server-filesystem)
    │
    ▼
mcp-pool.ts: buildTransport(server, options, ...)
    │ calls buildMCPRuntimeEnv() → { PATH, npm_config_cache, NPM_CONFIG_PREFIX }
    │ merges: { ...process.env, ...mcpRuntimeEnv, ...server.env }
    │
    ▼
StdioMCPTransport({ command, args, env: mergedEnv })
    │ spawns: npx -y @modelcontextprotocol/server-filesystem
    │ npx uses bundled node (from PATH)
    │ installs to NPM_CONFIG_PREFIX if not cached
    │ caches to npm_config_cache
```

### 9.3 Project Creation

```
POST /api/projects { name, description, ... }
    │
    ▼
routes/projects.ts: storage.create(data) → project
    │
    ├─ return c.json(project, 201) ← immediate response
    │
    └─ initProjectPythonEnv(project.id) ← fire-and-forget
        │ resolvePythonBinary() → bundled or system python3
        │ spawn('python3', ['-m', 'venv', venvPath])
        │ creates: ~/.golemancy/projects/{id}/runtime/python-env/
        │          ├── bin/python → bundled python3.13 (symlink)
        │          ├── bin/pip
        │          └── lib/python3.13/site-packages/
        │
        └─ on failure: log.warn() (non-fatal)
```
