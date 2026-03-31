import { queryOptions, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Team, TeamId, ProjectId } from '@golemancy/shared'
import { getServices } from '../services'
import { useAppStore } from '../stores'
import { queryKeys } from './keys'

export const teamListOptions = (projectId: ProjectId) =>
  queryOptions({
    queryKey: queryKeys.teams.all(projectId),
    queryFn: () => getServices().teams.list(projectId),
  })

export function useTeams(projectId: ProjectId | null) {
  return useQuery({
    ...teamListOptions(projectId!),
    enabled: !!projectId,
  })
}

export function useCreateTeam() {
  const qc = useQueryClient()
  const projectId = useAppStore(s => s.currentProjectId)

  return useMutation({
    mutationFn: (data: Pick<Team, 'name' | 'description' | 'instruction' | 'members'>) => {
      if (!projectId) throw new Error('No project selected')
      return getServices().teams.create(projectId, data)
    },
    onSuccess: () => {
      if (projectId) qc.invalidateQueries({ queryKey: queryKeys.teams.all(projectId) })
    },
  })
}

export function useUpdateTeam() {
  const qc = useQueryClient()
  const projectId = useAppStore(s => s.currentProjectId)

  return useMutation({
    mutationFn: ({ id, data }: { id: TeamId; data: Partial<Pick<Team, 'name' | 'description' | 'instruction' | 'members'>> }) => {
      if (!projectId) throw new Error('No project selected')
      return getServices().teams.update(projectId, id, data)
    },
    onSuccess: () => {
      if (projectId) qc.invalidateQueries({ queryKey: queryKeys.teams.all(projectId) })
    },
  })
}

export function useDeleteTeam() {
  const qc = useQueryClient()
  const projectId = useAppStore(s => s.currentProjectId)
  const projects = useAppStore(s => s.projects)
  const updateProject = useAppStore(s => s.updateProject)

  return useMutation({
    mutationFn: (id: TeamId) => {
      if (!projectId) throw new Error('No project selected')
      return getServices().teams.delete(projectId, id)
    },
    onSuccess: (_data, id) => {
      if (!projectId) return
      qc.invalidateQueries({ queryKey: queryKeys.teams.all(projectId) })
      const project = projects.find(p => p.id === projectId)
      if (project?.defaultTargetId === id) {
        updateProject(projectId, { defaultTargetType: undefined, defaultTargetId: undefined })
      }
    },
  })
}

export function useCloneTeam() {
  const qc = useQueryClient()
  const projectId = useAppStore(s => s.currentProjectId)

  return useMutation({
    mutationFn: ({ id, newName }: { id: TeamId; newName: string }) => {
      if (!projectId) throw new Error('No project selected')
      return getServices().teams.clone(projectId, id, newName)
    },
    onSuccess: () => {
      if (projectId) qc.invalidateQueries({ queryKey: queryKeys.teams.all(projectId) })
    },
  })
}
