import { useEffect, useMemo, useState } from 'react'
import type { AgentRuntime, PermissionMode, PermissionsConfigId } from '@golemancy/shared'
import { isSandboxRuntimeSupported, type SupportedPlatform } from '@golemancy/shared'
import { useAppStore } from '../stores'
import { useServiceContext } from '../services'
import { getServices } from '../services/container'

/** Detect platform from browser user agent */
export function detectPlatform(): SupportedPlatform {
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('win')) return 'win32'
  if (ua.includes('linux')) return 'linux'
  return 'darwin'
}

/** Get the currently selected project */
export function useCurrentProject() {
  const projects = useAppStore(s => s.projects)
  const currentProjectId = useAppStore(s => s.currentProjectId)
  return useMemo(
    () => projects.find(p => p.id === currentProjectId) ?? null,
    [projects, currentProjectId],
  )
}

/** Access the service container from React */
export function useServices() {
  return useServiceContext()
}

/**
 * Resolve the effective permission mode for the current project.
 * Fetches the PermissionsConfigFile to read its mode.
 * Falls back to 'sandbox' (system default).
 */
export function usePermissionMode(): PermissionMode | undefined {
  const project = useCurrentProject()
  const [mode, setMode] = useState<PermissionMode | undefined>(undefined)

  const configId = project?.config.permissionsConfigId
  const projectId = project?.id

  useEffect(() => {
    if (!projectId) {
      setMode(undefined)
      return
    }

    const effectiveId = configId ?? ('default' as PermissionsConfigId)
    const service = getServices().permissionsConfig

    service.getById(projectId, effectiveId).then(config => {
      setMode(config?.mode ?? 'sandbox')
    }).catch(() => {
      setMode('sandbox')
    })
  }, [projectId, configId])

  return mode
}

/**
 * Resolve the effective permission config for the current project.
 * Returns mode, applyToMCP, and whether sandbox runtime is supported on this platform.
 */
export function usePermissionConfig() {
  const project = useCurrentProject()
  const [mode, setMode] = useState<PermissionMode | undefined>(undefined)
  const [applyToMCP, setApplyToMCP] = useState(true)

  const platform = detectPlatform()
  const sandboxSupported = isSandboxRuntimeSupported(platform)

  const configId = project?.config?.permissionsConfigId
  const projectId = project?.id

  useEffect(() => {
    if (!projectId) {
      setMode(undefined)
      return
    }

    const effectiveId = configId ?? ('default' as PermissionsConfigId)
    const service = getServices().permissionsConfig

    service.getById(projectId, effectiveId).then(config => {
      setMode(config?.mode ?? 'sandbox')
      setApplyToMCP(config?.config?.applyToMCP ?? true)
    }).catch(() => {
      setMode('sandbox')
      setApplyToMCP(true)
    })
  }, [projectId, configId])

  return { mode, applyToMCP, sandboxSupported }
}

/**
 * Resolve the effective agent runtime for the current project.
 * Project-level config overrides global. Falls back to 'standard'.
 */
export function useAgentRuntime(): AgentRuntime {
  const settings = useAppStore(s => s.settings)
  const project = useCurrentProject()
  const projectRuntime = project?.config?.agentRuntime
  if (projectRuntime) return projectRuntime
  return settings?.agentRuntime ?? 'standard'
}
