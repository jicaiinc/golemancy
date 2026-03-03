import nodeFs from 'node:fs/promises'
import { createBashTool } from 'bash-tool'
import { Bash, MountableFs, InMemoryFs, OverlayFs, ReadWriteFs } from 'just-bash'
import type {
  PermissionMode,
  PermissionsConfigId,
  ProjectId,
  ResolvedPermissionsConfig,
  ResolvedBashToolConfig,
  SupportedPlatform,
  IPermissionsConfigService,
} from '@golemancy/shared'
import { AnthropicSandbox } from '../anthropic-sandbox'
import { NativeSandbox } from '../native-sandbox'
import { SandboxUnavailableError } from '../errors'
import { sandboxPool } from '../sandbox-pool'
import { resolvePermissionsConfig } from '../resolve-permissions'
import { permissionsToSandboxConfig } from '../permissions-adapter'
import { buildRuntimeEnv } from '../../runtime/env-builder'
import { getProjectPath } from '../../utils/paths'
import { logger } from '../../logger'

const log = logger.child({ component: 'agent:builtin-tools:bash' })

export interface BuiltinToolOptions {
  /** Project ID — used to resolve workspace directory and permissions config */
  projectId?: string
  /** Permissions config ID from project config */
  permissionsConfigId?: PermissionsConfigId
  /** Permissions config storage service */
  permissionsConfigStorage?: IPermissionsConfigService
}

// ── Mode-Aware Sandbox Factory (Strategy Pattern) ──────────

/**
 * Create bash tools using the appropriate sandbox based on the resolved permission mode.
 *
 * Strategy:
 *   restricted   → just-bash virtual sandbox (existing)
 *   sandbox      → AnthropicSandbox via SandboxPool (OS-level isolation)
 *   unrestricted → NativeSandbox (no isolation)
 */
async function createBashToolForMode(options?: BuiltinToolOptions) {
  const resolved = await resolveEffectivePermissions(options)
  const mode = resolved?.mode ?? 'restricted'

  log.info({ mode, projectId: options?.projectId }, 'creating bash tools with permission mode')

  switch (mode) {
    case 'restricted':
      return createRestrictedBashTool(options)

    case 'sandbox': {
      if (!options?.projectId) {
        throw new SandboxUnavailableError('projectId required for sandbox mode')
      }
      try {
        const workspaceDir = await ensureWorkspaceDir(options.projectId)
        const sandboxConfig = permissionsToSandboxConfig(resolved!.config)
        const runtimeEnv = buildRuntimeEnv(options.projectId)

        // Bridge to existing SandboxPool API
        const bridgedConfig: ResolvedBashToolConfig = {
          mode: 'sandbox',
          sandbox: sandboxConfig,
          usesDedicatedWorker: true,
        }

        log.debug({ workspaceDir, runtimeEnv, projectId: options.projectId }, 'sandbox mode: built runtime env')

        const handle = await sandboxPool.getHandle(
          options.projectId as ProjectId,
          bridgedConfig,
        )
        const sandbox = new AnthropicSandbox({
          config: sandboxConfig,
          workspaceRoot: workspaceDir,
          sandboxManager: handle,
          runtimeEnv: { ...runtimeEnv },
        })
        return createBashTool({ sandbox, destination: workspaceDir })
      } catch (err) {
        // Wrap any sandbox setup failure as SandboxUnavailableError
        if (err instanceof SandboxUnavailableError) throw err
        const message = err instanceof Error ? err.message : String(err)
        throw new SandboxUnavailableError(`Sandbox setup failed: ${message}`)
      }
    }

    case 'unrestricted': {
      const workspaceDir = options?.projectId
        ? await ensureWorkspaceDir(options.projectId)
        : process.cwd()
      const runtimeEnv = options?.projectId
        ? { ...buildRuntimeEnv(options.projectId) }
        : {}
      log.debug({ workspaceDir, runtimeEnv, projectId: options?.projectId }, 'unrestricted mode: built runtime env')
      const sandbox = new NativeSandbox({ workspaceRoot: workspaceDir, runtimeEnv })
      return createBashTool({ sandbox, destination: workspaceDir })
    }
  }
}

// ── Permissions Resolution ─────────────────────────────────

async function resolveEffectivePermissions(
  options?: BuiltinToolOptions,
): Promise<ResolvedPermissionsConfig | null> {
  if (!options?.projectId || !options.permissionsConfigStorage) return null

  const workspaceDir = getProjectPath(options.projectId) + '/workspace'
  const platform = process.platform as SupportedPlatform

  return resolvePermissionsConfig(
    options.permissionsConfigStorage,
    options.projectId as ProjectId,
    options.permissionsConfigId,
    workspaceDir,
    platform,
  )
}

// ── Restricted Mode (just-bash) ────────────────────────────

/**
 * Create a just-bash Bash instance with MountableFs:
 *   /project  → OverlayFs (read-only, project root with skills/agents/config)
 *   /workspace → ReadWriteFs (read-write, persistent working directory)
 */
export async function createRestrictedBashTool(options?: BuiltinToolOptions) {
  let sandbox: Bash | undefined
  let destination: string | undefined

  if (options?.projectId) {
    const projectDir = getProjectPath(options.projectId)
    const workspaceDir = projectDir + '/workspace'
    await nodeFs.mkdir(workspaceDir, { recursive: true })

    const mountableFs = new MountableFs({
      base: new InMemoryFs(),
      mounts: [
        { mountPoint: '/project', filesystem: new OverlayFs({ root: projectDir, mountPoint: '/' }) },
        { mountPoint: '/workspace', filesystem: new ReadWriteFs({ root: workspaceDir }) },
      ],
    })

    sandbox = new Bash({
      fs: mountableFs,
      python: true,
      network: { dangerouslyAllowFullInternetAccess: true },
      cwd: '/workspace',
    })
    destination = '/workspace'
  }

  return createBashTool({
    sandbox,
    destination,
  })
}

// ── Helpers ────────────────────────────────────────────────

async function ensureWorkspaceDir(projectId: string): Promise<string> {
  const workspaceDir = getProjectPath(projectId) + '/workspace'
  await nodeFs.mkdir(workspaceDir, { recursive: true })

  // Anchor package.json for Node.js runtime — DO NOT REMOVE.
  // Without this file, `npm install` walks up the directory tree and
  // installs packages into the user's home directory instead of workspace.
  const pkgJsonPath = workspaceDir + '/package.json'
  try {
    await nodeFs.access(pkgJsonPath)
  } catch {
    await nodeFs.writeFile(pkgJsonPath, JSON.stringify({
      private: true,
      description: 'Anchor file for Node.js runtime — DO NOT DELETE. Ensures npm install stays in this workspace.',
    }, null, 2) + '\n')
  }

  return workspaceDir
}

// ── Instructions ─────────────────────────────────────────

/**
 * Build the bash instructions block for injection into the agent's system prompt.
 * Content varies based on the actual permission mode and project context.
 */
export function buildBashInstructions(mode: PermissionMode, hasProject: boolean): string {
  const lines: string[] = []
  lines.push('## Bash Environment')
  lines.push('')

  switch (mode) {
    case 'restricted':
      if (hasProject) {
        lines.push('You are running in **restricted** mode with a virtual filesystem:')
        lines.push('- `/workspace` — your working directory (read-write, persistent)')
        lines.push('- `/project` — project configuration and skills (read-only)')
        lines.push('')
        lines.push('All file operations and command execution happen within this sandbox.')
        lines.push('Write files and install packages in `/workspace`.')
        lines.push('Python is available in the sandbox. Use `pip install` to add packages as needed.')
      } else {
        lines.push('You are running in **restricted** mode with a virtual sandbox.')
        lines.push('File operations are confined to the sandbox environment.')
        lines.push('Python is available in the sandbox. Use `pip install` to add packages as needed.')
      }
      break

    case 'sandbox':
      lines.push('You are running in **sandbox** mode with OS-level isolation.')
      if (hasProject) {
        lines.push('Your working directory is the project workspace.')
        lines.push('Filesystem and network access are governed by the project\'s permissions config.')
      }
      lines.push('Python may be available if installed on the host system.')
      break

    case 'unrestricted':
      lines.push('You are running in **unrestricted** mode with full system access.')
      if (hasProject) {
        lines.push('Your working directory is the project workspace.')
      }
      lines.push('Exercise caution — avoid destructive operations on system files or directories outside the workspace.')
      lines.push('Python may be available if installed on the host system.')
      break
  }

  return lines.join('\n')
}

// ── Public API ─────────────────────────────────────────────

export { createBashToolForMode, resolveEffectivePermissions }
