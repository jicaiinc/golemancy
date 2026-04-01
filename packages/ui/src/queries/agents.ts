import { queryOptions, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Agent, AgentId, ProjectId } from '@golemancy/shared'
import { AnalyticsEvents } from '@golemancy/shared'
import { getServices } from '../services'
import { useAppStore } from '../stores'
import { trackEvent } from '../lib/analytics'
import { queryKeys } from './keys'

export const agentListOptions = (projectId: ProjectId) =>
  queryOptions({
    queryKey: queryKeys.agents.all(projectId),
    queryFn: () => getServices().agents.list(projectId),
  })

export function useAgents(projectId: ProjectId | null) {
  return useQuery({
    ...agentListOptions(projectId!),
    enabled: !!projectId,
  })
}

export function useCreateAgent() {
  const qc = useQueryClient()
  const projectId = useAppStore(s => s.currentProjectId)

  return useMutation({
    mutationFn: (data: Pick<Agent, 'name' | 'description' | 'systemPrompt' | 'modelConfig'>) => {
      if (!projectId) throw new Error('No project selected')
      return getServices().agents.create(projectId, data)
    },
    onSuccess: () => {
      if (projectId) qc.invalidateQueries({ queryKey: queryKeys.agents.all(projectId) })
      trackEvent(AnalyticsEvents.AGENT_CREATED)
    },
  })
}

export function useUpdateAgent() {
  const qc = useQueryClient()
  const projectId = useAppStore(s => s.currentProjectId)

  return useMutation({
    mutationFn: ({ id, data }: { id: AgentId; data: Partial<Agent> }) => {
      if (!projectId) throw new Error('No project selected')
      return getServices().agents.update(projectId, id, data)
    },
    onSuccess: () => {
      if (projectId) qc.invalidateQueries({ queryKey: queryKeys.agents.all(projectId) })
    },
  })
}

export function useDeleteAgent() {
  const qc = useQueryClient()
  const projectId = useAppStore(s => s.currentProjectId)
  const projects = useAppStore(s => s.projects)
  const updateProject = useAppStore(s => s.updateProject)

  return useMutation({
    mutationFn: (id: AgentId) => {
      if (!projectId) throw new Error('No project selected')
      return getServices().agents.delete(projectId, id)
    },
    onSuccess: async (_data, id) => {
      if (!projectId) return
      qc.invalidateQueries({ queryKey: queryKeys.agents.all(projectId) })
      const project = projects.find(p => p.id === projectId)
      if (project?.defaultTargetId === id) {
        await updateProject(projectId, { defaultTargetType: undefined, defaultTargetId: undefined })
      }
    },
  })
}

export function useCloneAgent() {
  const qc = useQueryClient()
  const projectId = useAppStore(s => s.currentProjectId)

  return useMutation({
    mutationFn: ({ id, newName }: { id: AgentId; newName: string }) => {
      if (!projectId) throw new Error('No project selected')
      return getServices().agents.clone(projectId, id, newName)
    },
    onSuccess: () => {
      if (projectId) qc.invalidateQueries({ queryKey: queryKeys.agents.all(projectId) })
    },
  })
}
