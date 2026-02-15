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

  // Step 3: Replace {{workspaceDir}} template and normalize paths
  const workspaceRealPath = path.resolve(workspaceDir)
  const config: PermissionsConfig = {
    ...configFile.config,
    allowWrite: configFile.config.allowWrite.map(p => {
      // Only apply path traversal check to template-expanded paths,
      // not to explicit absolute paths the user intentionally added.
      if (p.includes('{{workspaceDir}}')) {
        const resolved = path.resolve(p.replace('{{workspaceDir}}', workspaceDir))
        if (!resolved.startsWith(workspaceRealPath + path.sep) && resolved !== workspaceRealPath) {
          log.warn({ pattern: p, resolved, workspaceDir }, 'allowWrite template escapes workspace, rejecting')
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
