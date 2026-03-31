import { queryOptions, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { ProjectId, MCPServerConfig, MCPServerCreateData, MCPServerUpdateData } from '@golemancy/shared'
import { getServices } from '../services'
import { useAppStore } from '../stores'
import { queryKeys } from './keys'

export const mcpServerListOptions = (projectId: ProjectId) =>
  queryOptions({
    queryKey: queryKeys.mcpServers.all(projectId),
    queryFn: () => getServices().mcp.list(projectId),
  })

export function useMCPServers(projectId: ProjectId | null) {
  return useQuery({
    ...mcpServerListOptions(projectId!),
    enabled: !!projectId,
  })
}

export function useCreateMCPServer() {
  const qc = useQueryClient()
  const projectId = useAppStore(s => s.currentProjectId)

  return useMutation({
    mutationFn: (data: MCPServerCreateData) => {
      if (!projectId) throw new Error('No project selected')
      return getServices().mcp.create(projectId, data)
    },
    onSuccess: () => {
      if (projectId) qc.invalidateQueries({ queryKey: queryKeys.mcpServers.all(projectId) })
    },
  })
}

export function useUpdateMCPServer() {
  const qc = useQueryClient()
  const projectId = useAppStore(s => s.currentProjectId)

  return useMutation({
    mutationFn: ({ name, data }: { name: string; data: MCPServerUpdateData }) => {
      if (!projectId) throw new Error('No project selected')
      return getServices().mcp.update(projectId, name, data)
    },
    onSuccess: () => {
      if (projectId) qc.invalidateQueries({ queryKey: queryKeys.mcpServers.all(projectId) })
    },
  })
}

export function useDeleteMCPServer() {
  const qc = useQueryClient()
  const projectId = useAppStore(s => s.currentProjectId)

  return useMutation({
    mutationFn: (name: string) => {
      if (!projectId) throw new Error('No project selected')
      return getServices().mcp.delete(projectId, name)
    },
    onSuccess: () => {
      if (projectId) qc.invalidateQueries({ queryKey: queryKeys.mcpServers.all(projectId) })
    },
  })
}
