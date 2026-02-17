import path from 'node:path'
import type {
  IPermissionsConfigService,
  PermissionsConfig,
  PermissionsConfigId,
  ProjectId,
  ResolvedPermissionsConfig,
  SupportedPlatform,
} from '@golemancy/shared'
import { getDefaultPermissionsConfig, isSandboxRuntimeSupported } from '@golemancy/shared'
import { getProjectRuntimeDir, getGlobalRuntimeDir } from '../runtime/paths'
import { logger } from '../logger'

const log = logger.child({ component: 'agent:resolve-permissions' })

/**
 * Resolve the effective permissions config for a project.
 *
 * Resolution steps:
 * 1. Load config by ID from project's permissions-config/ directory
 * 2. If not found, fall back to system default config
 * 3. Replace {{workspaceDir}} template in allowWrite
 * 4. Unsupported platforms: strip sandbox config to only deniedCommands
 */
export async function resolvePermissionsConfig(
  storage: IPermissionsConfigService,
  projectId: ProjectId,
  configId: PermissionsConfigId | undefined,
  workspaceDir: string,
  platform: SupportedPlatform,
): Promise<ResolvedPermissionsConfig> {
  // Step 1: Load config by ID (or use default)
  const effectiveId = configId ?? ('default' as PermissionsConfigId)
  let configFile = await storage.getById(projectId, effectiveId)

  // Step 2: Fall back to default if not found
  if (!configFile) {
    log.warn({ projectId, configId: effectiveId }, 'permissions config not found, using default')
    configFile = getDefaultPermissionsConfig(platform)
  }

  // Step 3: Replace template variables and normalize paths
  const workspaceRealPath = path.resolve(workspaceDir)
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
        const isUnderWorkspace = resolved.startsWith(workspaceRealPath + path.sep) || resolved === workspaceRealPath
        const isUnderProjectRuntime = resolved.startsWith(path.resolve(projectRuntimeDir) + path.sep) || resolved === path.resolve(projectRuntimeDir)
        const isUnderGlobalRuntime = resolved.startsWith(path.resolve(globalRuntimeDir) + path.sep) || resolved === path.resolve(globalRuntimeDir)

        if (!isUnderWorkspace && !isUnderProjectRuntime && !isUnderGlobalRuntime) {
          log.warn({ pattern: p, resolved }, 'allowWrite template escapes allowed directories, rejecting')
          return workspaceRealPath
        }
        return resolved
      }
      return path.resolve(p)
    }),
  }

  // Step 4: Platform check — only deniedCommands on unsupported platforms
  if (!isSandboxRuntimeSupported(platform) && configFile.mode === 'sandbox') {
    log.debug({ projectId }, 'platform does not support sandbox runtime, using deniedCommands only')
    return {
      mode: 'sandbox',
      config: {
        allowWrite: [],
        denyRead: [],
        denyWrite: [],
        networkRestrictionsEnabled: false,
        allowedDomains: [],
        deniedDomains: [],
        deniedCommands: config.deniedCommands,
        applyToMCP: false,
      },
    }
  }

  return {
    mode: configFile.mode,
    config,
  }
}
