import { queryOptions, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { ProjectId, Skill, SkillId, SkillCreateData, SkillUpdateData } from '@golemancy/shared'
import { AnalyticsEvents } from '@golemancy/shared'
import { getServices } from '../services'
import { useAppStore } from '../stores'
import { trackEvent } from '../lib/analytics'
import { queryKeys } from './keys'

export const skillListOptions = (projectId: ProjectId) =>
  queryOptions({
    queryKey: queryKeys.skills.all(projectId),
    queryFn: () => getServices().skills.list(projectId),
  })

export function useSkills(projectId: ProjectId | null) {
  return useQuery({
    ...skillListOptions(projectId!),
    enabled: !!projectId,
  })
}

export function useCreateSkill() {
  const qc = useQueryClient()
  const projectId = useAppStore(s => s.currentProjectId)

  return useMutation({
    mutationFn: (data: SkillCreateData) => {
      if (!projectId) throw new Error('No project selected')
      return getServices().skills.create(projectId, data)
    },
    onSuccess: () => {
      if (projectId) qc.invalidateQueries({ queryKey: queryKeys.skills.all(projectId) })
      trackEvent(AnalyticsEvents.SKILL_CREATED)
    },
  })
}

export function useUpdateSkill() {
  const qc = useQueryClient()
  const projectId = useAppStore(s => s.currentProjectId)

  return useMutation({
    mutationFn: ({ id, data }: { id: SkillId; data: SkillUpdateData }) => {
      if (!projectId) throw new Error('No project selected')
      return getServices().skills.update(projectId, id, data)
    },
    onSuccess: () => {
      if (projectId) qc.invalidateQueries({ queryKey: queryKeys.skills.all(projectId) })
    },
  })
}

export function useDeleteSkill() {
  const qc = useQueryClient()
  const projectId = useAppStore(s => s.currentProjectId)

  return useMutation({
    mutationFn: (id: SkillId) => {
      if (!projectId) throw new Error('No project selected')
      return getServices().skills.delete(projectId, id)
    },
    onSuccess: () => {
      if (projectId) qc.invalidateQueries({ queryKey: queryKeys.skills.all(projectId) })
    },
  })
}

export function useImportSkills() {
  const qc = useQueryClient()
  const projectId = useAppStore(s => s.currentProjectId)

  return useMutation({
    mutationFn: (file: File) => {
      if (!projectId) throw new Error('No project selected')
      return getServices().skills.importZip(projectId, file)
    },
    onSuccess: () => {
      if (projectId) qc.invalidateQueries({ queryKey: queryKeys.skills.all(projectId) })
    },
  })
}
