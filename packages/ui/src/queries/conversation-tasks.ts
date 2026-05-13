import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ProjectId } from '@golemancy/shared'
import { getServices } from '../services'
import { useAppStore } from '../stores'
import { queryKeys } from './keys'

export const conversationTaskListOptions = (projectId: ProjectId) =>
  queryOptions({
    queryKey: queryKeys.tasks.all(projectId),
    queryFn: () => getServices().tasks.list(projectId),
  })

export function useConversationTasks(projectId: ProjectId | null) {
  return useQuery({
    ...conversationTaskListOptions(projectId!),
    enabled: !!projectId,
  })
}

export function useRefreshConversationTasks() {
  const qc = useQueryClient()
  const projectId = useAppStore(s => s.currentProjectId)

  return () => {
    if (projectId) qc.invalidateQueries({ queryKey: queryKeys.tasks.all(projectId) })
  }
}
