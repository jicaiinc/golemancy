import { useMemo } from 'react'
import type { AgentModelConfig, GlobalSettings, ProjectConfig } from '@golemancy/shared'
import { useAppStore } from '../stores'
import { useServiceContext } from '../services'

/** Get the currently selected project */
export function useCurrentProject() {
  const projects = useAppStore(s => s.projects)
  const currentProjectId = useAppStore(s => s.currentProjectId)
  return useMemo(
    () => projects.find(p => p.id === currentProjectId) ?? null,
    [projects, currentProjectId],
  )
}

/** Get agents for the current project */
export function useProjectAgents() {
  return useAppStore(s => s.agents)
}

/**
 * Resolve effective config by merging Global → Project → Agent layers.
 * Returns the final provider + model to use for an agent.
 */
export function useResolvedConfig(
  projectConfig?: ProjectConfig,
  agentConfig?: AgentModelConfig,
) {
  const settings = useAppStore(s => s.settings)

  return useMemo(() => {
    if (!settings) return null

    // Start with global default
    const globalProvider = settings.providers.find(
      p => p.provider === settings.defaultProvider
    )

    // Layer project overrides
    const effectiveProvider = projectConfig?.providerOverride?.provider
      ?? globalProvider?.provider
      ?? settings.defaultProvider

    const effectiveModel = agentConfig?.model
      ?? projectConfig?.providerOverride?.defaultModel
      ?? globalProvider?.defaultModel
      ?? 'gpt-4o'

    return {
      provider: effectiveProvider,
      model: effectiveModel,
      temperature: agentConfig?.temperature ?? 0.7,
      maxTokens: agentConfig?.maxTokens,
    }
  }, [settings, projectConfig, agentConfig])
}

/** Access the service container from React */
export function useServices() {
  return useServiceContext()
}
