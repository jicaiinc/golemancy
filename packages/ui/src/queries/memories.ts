import { queryOptions, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { AgentId, MemoryCreateData, MemoryId, MemoryUpdateData, ProjectId } from '@golemancy/shared'
import { getServices } from '../services'
import { useAppStore } from '../stores'
import { queryKeys } from './keys'

export const memoryListOptions = (projectId: ProjectId, agentId: AgentId) =>
  queryOptions({
    queryKey: queryKeys.memories.all(projectId, agentId),
    queryFn: () => getServices().memories.list(projectId, agentId),
  })

export function useMemories(projectId: ProjectId | null, agentId: AgentId | null) {
  return useQuery({
    ...memoryListOptions(projectId!, agentId!),
    enabled: !!projectId && !!agentId,
  })
}

export function useCreateMemory() {
  const qc = useQueryClient()
  const projectId = useAppStore(s => s.currentProjectId)

  return useMutation({
    mutationFn: ({ agentId, data }: { agentId: AgentId; data: MemoryCreateData }) => {
      if (!projectId) throw new Error('No project selected')
      return getServices().memories.create(projectId, agentId, data)
    },
    onSuccess: (_data, { agentId }) => {
      if (projectId) qc.invalidateQueries({ queryKey: queryKeys.memories.all(projectId, agentId) })
    },
  })
}

export function useUpdateMemory() {
  const qc = useQueryClient()
  const projectId = useAppStore(s => s.currentProjectId)

  return useMutation({
    mutationFn: ({ agentId, id, data }: { agentId: AgentId; id: MemoryId; data: MemoryUpdateData }) => {
      if (!projectId) throw new Error('No project selected')
      return getServices().memories.update(projectId, agentId, id, data)
    },
    onSuccess: (_data, { agentId }) => {
      if (projectId) qc.invalidateQueries({ queryKey: queryKeys.memories.all(projectId, agentId) })
    },
  })
}

export function useDeleteMemory() {
  const qc = useQueryClient()
  const projectId = useAppStore(s => s.currentProjectId)

  return useMutation({
    mutationFn: ({ agentId, id }: { agentId: AgentId; id: MemoryId }) => {
      if (!projectId) throw new Error('No project selected')
      return getServices().memories.delete(projectId, agentId, id)
    },
    onSuccess: (_data, { agentId }) => {
      if (projectId) qc.invalidateQueries({ queryKey: queryKeys.memories.all(projectId, agentId) })
    },
  })
}
