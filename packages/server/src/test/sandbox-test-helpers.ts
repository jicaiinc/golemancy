/**
 * Shared test helpers for sandbox integration tests.
 *
 * Provides:
 * - PassthroughSandboxManagerHandle: passes commands through unchanged
 *   (lets AnthropicSandbox run real checkBlacklist + validatePath without @anthropic-ai/sandbox-runtime)
 * - createTestSandboxConfig: builds SandboxConfig with sensible defaults
 * - createTestWorkspace / cleanupTestWorkspace: temp dir management
 */
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { SandboxConfig } from '@golemancy/shared'
import type { SandboxManagerHandle } from '../agent/anthropic-sandbox'
import { DEFAULT_PERMISSIONS_CONFIG } from '@golemancy/shared'

// ── PassthroughSandboxManagerHandle ─────────────────────────

/**
 * Implements SandboxManagerHandle by passing commands through unchanged.
 * No OS-level sandbox wrapping — the command runs as-is in bash.
 *
 * This lets AnthropicSandbox exercise its full application-layer enforcement
 * (command blacklist + path validation) with real command execution,
 * without requiring @anthropic-ai/sandbox-runtime to be installed.
 */
export class PassthroughSandboxManagerHandle implements SandboxManagerHandle {
  async wrapWithSandbox(command: string): Promise<string> {
    return command
  }

  async cleanupAfterCommand(): Promise<void> {
    // no-op
  }
}

// ── Config Factory ──────────────────────────────────────────

/**
 * Build a SandboxConfig for testing with sensible defaults.
 *
 * @param workspaceDir - Absolute path to workspace (used for allowWrite)
 * @param overrides - Partial overrides for any config field
 */
export function createTestSandboxConfig(
  workspaceDir: string,
  overrides?: Partial<SandboxConfig>,
): SandboxConfig {
  const filesystem = {
    allowWrite: [workspaceDir],
    denyRead: [...DEFAULT_PERMISSIONS_CONFIG.config.denyRead],
    denyWrite: [] as string[],
    allowGitConfig: false,
    ...overrides?.filesystem,
  }

  const network = {
    allowedDomains: undefined as string[] | undefined,
    ...overrides?.network,
  }

  return {
    filesystem,
    network,
    enablePython: overrides?.enablePython ?? false,
    deniedCommands: overrides?.deniedCommands ?? [...DEFAULT_PERMISSIONS_CONFIG.config.deniedCommands],
  }
}

// ── Workspace Management ────────────────────────────────────

const TEST_WORKSPACE_PREFIX = 'golemancy-sandbox-test-'

/**
 * Create a temporary workspace directory for sandbox tests.
 * Returns the absolute path to the created directory.
 */
export async function createTestWorkspace(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), TEST_WORKSPACE_PREFIX))
  return dir
}

/**
 * Clean up a test workspace directory.
 */
export async function cleanupTestWorkspace(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true })
}
