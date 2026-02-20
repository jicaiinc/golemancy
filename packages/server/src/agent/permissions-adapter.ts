import type { PermissionsConfig, SandboxConfig } from '@golemancy/shared'

/**
 * Bridge new flat PermissionsConfig to old nested SandboxConfig
 * used by AnthropicSandbox and SandboxPool.
 * This adapter will be removed when the runtime layer is migrated.
 */
export function permissionsToSandboxConfig(pc: PermissionsConfig): SandboxConfig {
  return {
    filesystem: {
      allowWrite: pc.allowWrite,
      denyRead: pc.denyRead,
      denyWrite: pc.denyWrite,
      allowGitConfig: false,
    },
    network: {
      allowedDomains: pc.networkRestrictionsEnabled ? pc.allowedDomains : undefined,
    },
    enablePython: true,
    deniedCommands: pc.deniedCommands,
  }
}
