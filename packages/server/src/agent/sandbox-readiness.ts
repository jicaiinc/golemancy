import fs from 'node:fs'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import type {
  SandboxReadinessIssue,
  SandboxReadinessResult,
  SupportedPlatform,
} from '@golemancy/shared'
import { isSandboxRuntimeSupported } from '@golemancy/shared'
import { getBundledRuntimeDir } from '../runtime/paths'
import { getProjectPath } from '../utils/paths'
import { logger } from '../logger'

const log = logger.child({ component: 'agent:sandbox-readiness' })

/**
 * Check all prerequisites for sandbox mode to function.
 *
 * Checks (in order):
 * 1. Platform support (darwin/linux)
 * 2. @anthropic-ai/sandbox-runtime package availability
 * 3. Ripgrep binary availability
 * 4. Bundled resources path (GOLEMANCY_RESOURCES_PATH)
 * 5. Workspace directory (if projectId provided)
 */
export async function checkSandboxReadiness(
  projectId?: string,
): Promise<SandboxReadinessResult> {
  const issues: SandboxReadinessIssue[] = []
  const platform = process.platform as SupportedPlatform

  // 1. Platform support
  if (!isSandboxRuntimeSupported(platform)) {
    issues.push({
      component: 'platform',
      message: `Sandbox mode is not supported on ${platform}`,
      fix: 'Use macOS or Linux for sandbox mode, or switch to restricted mode',
    })
    // Early return — other checks are meaningless if platform isn't supported
    return { available: false, issues }
  }

  // 2. sandbox-runtime package
  const runtimeAvailable = checkSandboxRuntimePackage()
  if (!runtimeAvailable) {
    issues.push({
      component: 'sandbox-runtime',
      message: '@anthropic-ai/sandbox-runtime package is not available',
      fix: 'Install @anthropic-ai/sandbox-runtime via pnpm',
    })
  }

  // 3. Ripgrep binary
  const rgPath = resolveRipgrepForCheck()
  if (!rgPath) {
    issues.push({
      component: 'ripgrep',
      message: 'ripgrep (rg) binary not found',
      fix: 'Install ripgrep: brew install ripgrep (macOS) or apt install ripgrep (Linux)',
    })
  }

  // 4. Resources path (bundled runtime directory)
  const runtimeDir = getBundledRuntimeDir()
  if (!runtimeDir) {
    issues.push({
      component: 'resources-path',
      message: 'Bundled runtime directory not configured (GOLEMANCY_RESOURCES_PATH not set)',
      fix: 'Set GOLEMANCY_RESOURCES_PATH environment variable or run inside the Electron app',
    })
  }

  // 5. Workspace directory (only if projectId provided)
  if (projectId) {
    const workspaceDir = getProjectPath(projectId) + '/workspace'
    try {
      fs.accessSync(workspaceDir, fs.constants.R_OK | fs.constants.W_OK)
    } catch {
      // Directory may not exist yet — that's OK if parent is writable
      const projectDir = getProjectPath(projectId)
      try {
        fs.accessSync(projectDir, fs.constants.R_OK | fs.constants.W_OK)
      } catch {
        issues.push({
          component: 'workspace',
          message: `Project directory is not accessible: ${projectDir}`,
          fix: 'Ensure the project directory exists and has correct permissions',
        })
      }
    }
  }

  const result: SandboxReadinessResult = {
    available: issues.length === 0,
    issues,
  }

  log.debug(
    { projectId, available: result.available, issueCount: issues.length },
    'sandbox readiness check completed',
  )

  return result
}

// ── Internal Helpers ────────────────────────────────────────────

function checkSandboxRuntimePackage(): boolean {
  try {
    const require = createRequire(import.meta.url)
    require.resolve('@anthropic-ai/sandbox-runtime')
    return true
  } catch {
    return false
  }
}

/**
 * Check if ripgrep is available via bundled @vscode/ripgrep or system PATH.
 * Mirrors the logic in sandbox-pool.ts but only checks availability.
 */
function resolveRipgrepForCheck(): string | null {
  // 1. Bundled @vscode/ripgrep
  try {
    const require = createRequire(import.meta.url)
    const { rgPath } = require('@vscode/ripgrep') as { rgPath: string }
    if (rgPath) return rgPath
  } catch { /* not installed */ }

  // 2. System PATH
  const result = spawnSync('which', ['rg'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 1_000,
  })
  if (result.status === 0 && result.stdout?.trim()) {
    return result.stdout.trim()
  }

  return null
}
