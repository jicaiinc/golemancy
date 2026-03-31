import { queryOptions, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { CronJob, CronJobId, ProjectId } from '@golemancy/shared'
import { getServices } from '../services'
import { useAppStore } from '../stores'
import { queryKeys } from './keys'

export const cronJobListOptions = (projectId: ProjectId) =>
  queryOptions({
    queryKey: queryKeys.cronJobs.all(projectId),
    queryFn: () => getServices().cronJobs.list(projectId),
  })

export function useCronJobs(projectId: ProjectId | null) {
  return useQuery({
    ...cronJobListOptions(projectId!),
    enabled: !!projectId,
  })
}

export function useCronJobRuns(projectId: ProjectId | null, cronJobId: CronJobId | null) {
  const svc = getServices().cronJobs
  return useQuery({
    queryKey: queryKeys.cronJobRuns.all(projectId!, cronJobId!),
    queryFn: () => svc.listRuns ? svc.listRuns(projectId!, cronJobId!) : Promise.resolve([]),
    enabled: !!projectId && !!cronJobId,
  })
}

export function useCreateCronJob() {
  const qc = useQueryClient()
  const projectId = useAppStore(s => s.currentProjectId)

  return useMutation({
    mutationFn: (data: Pick<CronJob, 'targetType' | 'targetId' | 'name' | 'cronExpression' | 'enabled' | 'instruction' | 'scheduleType' | 'scheduledAt'>) => {
      if (!projectId) throw new Error('No project selected')
      return getServices().cronJobs.create(projectId, data)
    },
    onSuccess: () => {
      if (projectId) qc.invalidateQueries({ queryKey: queryKeys.cronJobs.all(projectId) })
    },
  })
}

export function useUpdateCronJob() {
  const qc = useQueryClient()
  const projectId = useAppStore(s => s.currentProjectId)

  return useMutation({
    mutationFn: ({ id, data }: { id: CronJobId; data: Partial<Pick<CronJob, 'targetType' | 'targetId' | 'name' | 'cronExpression' | 'enabled' | 'instruction' | 'scheduleType' | 'scheduledAt'>> }) => {
      if (!projectId) throw new Error('No project selected')
      return getServices().cronJobs.update(projectId, id, data)
    },
    onSuccess: () => {
      if (projectId) qc.invalidateQueries({ queryKey: queryKeys.cronJobs.all(projectId) })
    },
  })
}

export function useDeleteCronJob() {
  const qc = useQueryClient()
  const projectId = useAppStore(s => s.currentProjectId)

  return useMutation({
    mutationFn: (id: CronJobId) => {
      if (!projectId) throw new Error('No project selected')
      return getServices().cronJobs.delete(projectId, id)
    },
    onSuccess: () => {
      if (projectId) qc.invalidateQueries({ queryKey: queryKeys.cronJobs.all(projectId) })
    },
  })
}

export function useTriggerCronJob() {
  const qc = useQueryClient()
  const projectId = useAppStore(s => s.currentProjectId)

  return useMutation({
    mutationFn: (id: CronJobId) => {
      if (!projectId) throw new Error('No project selected')
      const svc = getServices().cronJobs
      if (!svc.trigger) return Promise.resolve()
      return svc.trigger(projectId, id)
    },
    onMutate: (id) => {
      if (!projectId) return
      // Optimistic update: set status to 'running'
      qc.setQueryData<CronJob[]>(queryKeys.cronJobs.all(projectId), old =>
        old?.map(c => c.id === id ? { ...c, lastRunStatus: 'running' as const } : c),
      )
    },
    onSettled: (_data, _error, id) => {
      if (!projectId) return
      qc.invalidateQueries({ queryKey: queryKeys.cronJobs.all(projectId) })
      qc.invalidateQueries({ queryKey: queryKeys.cronJobRuns.all(projectId, id) })
    },
  })
}
