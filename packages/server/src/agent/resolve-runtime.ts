/**
 * Resolve Agent Runtime — Three-tier cascading resolution.
 *
 * Priority: Project Config → Global Settings → 'standard' (default)
 */

import type { AgentRuntime, GlobalSettings, ProjectConfig } from '@golemancy/shared'

export function resolveAgentRuntime(
  settings: GlobalSettings,
  projectConfig?: ProjectConfig,
): AgentRuntime {
  return projectConfig?.agentRuntime ?? settings.agentRuntime ?? 'standard'
}
