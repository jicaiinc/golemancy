import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import {
  useNodesState, useEdgesState,
  type Node, type Edge, type OnConnect,
} from '@xyflow/react'
import type { AgentId, ProjectId } from '@golemancy/shared'
import { useAppStore } from '../../../stores'
import { useParams } from 'react-router'
import { computeDagreLayout } from './useTopologyLayout'
import type { AgentNodeData } from './AgentNode'
import type { AgentEdgeData } from './AgentEdge'

export function useTopologyData(highlightedNodeId?: AgentId | null) {
  const { projectId } = useParams<{ projectId: string }>()
  const agents = useAppStore(s => s.agents)
  const loadTopologyLayout = useAppStore(s => s.loadTopologyLayout)
  const saveTopologyLayout = useAppStore(s => s.saveTopologyLayout)

  const [selectedAgentId, setSelectedAgentId] = useState<AgentId | null>(null)

  // --- P0 fix: Load layout once into a ref, then let React Flow own positions ---
  // After initial load, topologyLayout from store is NOT used to derive nodes.
  // This prevents the feedback loop: drag → save → store update → re-derive → jitter.
  const initialLayoutRef = useRef<Record<string, { x: number; y: number }> | null>(null)
  const layoutLoaded = useRef<boolean>(false)

  // Load layout on mount, store into ref
  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    loadTopologyLayout(projectId as ProjectId).then(() => {
      if (cancelled) return
      // Read the layout from store once after load completes
      const layout = useAppStore.getState().topologyLayout
      initialLayoutRef.current = layout
      layoutLoaded.current = true
    })
    return () => { cancelled = true }
  }, [projectId, loadTopologyLayout])

  // Derive nodes from agents — positions come from ref (initial load only)
  const rawNodes: Node<AgentNodeData>[] = useMemo(() => {
    const savedLayout = initialLayoutRef.current ?? {}
    return agents.map(agent => ({
      id: agent.id,
      type: 'agentNode' as const,
      position: savedLayout[agent.id] ?? { x: 0, y: 0 },
      data: {
        agentId: agent.id,
        name: agent.name,
        status: agent.status,
        model: agent.modelConfig.model ?? '',
        skillCount: (agent.skillIds ?? []).length,
        toolCount: agent.tools.length,
        isHighlighted: highlightedNodeId === agent.id,
      },
    }))
  }, [agents, highlightedNodeId])

  // Edges will be driven by Teams in the future; for now, empty
  const rawEdges: Edge<AgentEdgeData>[] = useMemo(() => {
    return []
  }, [agents])

  // Apply dagre for nodes without persisted positions
  const initialNodes = useMemo(() => {
    const savedLayout = initialLayoutRef.current ?? {}
    const needsLayout = rawNodes.some(n => !savedLayout[n.id])
    if (needsLayout) {
      return computeDagreLayout(rawNodes, rawEdges, savedLayout)
    }
    return rawNodes
  }, [rawNodes, rawEdges])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(rawEdges)

  // Sync nodes when agents change externally (new agent added/removed, data updated)
  // This only depends on agents changes, NOT on layout changes
  const prevAgentIdsRef = useRef<string>('')
  useEffect(() => {
    const agentIds = agents.map(a => a.id).sort().join(',')
    const agentDataKey = agents.map(a => `${a.id}:${a.name}:${a.status}:${a.modelConfig.model}`).join('|')
    const key = `${agentIds}|${agentDataKey}`
    if (key !== prevAgentIdsRef.current) {
      prevAgentIdsRef.current = key
      // Merge new agent data into current node positions (preserve React Flow positions)
      setNodes(currentNodes => {
        const posMap: Record<string, { x: number; y: number }> = {}
        for (const n of currentNodes) {
          posMap[n.id] = n.position
        }
        const savedLayout = initialLayoutRef.current ?? {}
        const merged = rawNodes.map(n => ({
          ...n,
          position: posMap[n.id] ?? savedLayout[n.id] ?? n.position,
        }))
        // Dagre layout for any new nodes without positions
        const needsLayout = merged.some(n => !posMap[n.id] && !savedLayout[n.id])
        if (needsLayout) {
          return computeDagreLayout(merged, rawEdges, { ...savedLayout, ...posMap })
        }
        return merged
      })
    }
  }, [agents, rawNodes, rawEdges, setNodes])

  // Sync edges when agents change
  useEffect(() => { setEdges(rawEdges) }, [rawEdges, setEdges])

  // --- Node drag → save position (debounced) ---
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // P1 fix: cleanup timer on unmount
  useEffect(() => {
    return () => clearTimeout(saveTimer.current)
  }, [])

  const onNodeDragStop = useCallback((_: unknown, node: Node) => {
    if (!projectId) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      // Collect all current node positions from React Flow state
      setNodes(currentNodes => {
        const layout: Record<string, { x: number; y: number }> = {}
        for (const n of currentNodes) {
          layout[n.id] = n.position
        }
        // Save to backend and update ref
        saveTopologyLayout(projectId as ProjectId, layout)
        initialLayoutRef.current = layout
        return currentNodes // don't modify
      })
    }, 500)
  }, [projectId, setNodes, saveTopologyLayout])

  // --- Connect → no-op (sub-agents moved to Teams) ---
  const onConnect: OnConnect = useCallback((_connection) => {
    // Sub-agent connections will be managed via Teams in the future
  }, [])

  // --- Edge delete → no-op (sub-agents moved to Teams) ---
  const onEdgeDelete = useCallback((_deletedEdges: Edge[]) => {
    // Sub-agent connections will be managed via Teams in the future
  }, [])

  // --- Reset layout ---
  const resetLayout = useCallback(async () => {
    if (!projectId) return
    const freshLayout = computeDagreLayout(rawNodes, rawEdges, {})
    setNodes(freshLayout)
    // Update ref so future agent changes use reset positions
    const layout: Record<string, { x: number; y: number }> = {}
    for (const n of freshLayout) {
      layout[n.id] = n.position
    }
    initialLayoutRef.current = layout
    await saveTopologyLayout(projectId as ProjectId, layout)
  }, [projectId, rawNodes, rawEdges, setNodes, saveTopologyLayout])

  return {
    nodes, edges,
    onNodesChange, onEdgesChange,
    onConnect, onEdgeDelete,
    onNodeDragStop,
    resetLayout,
    selectedAgentId, setSelectedAgentId,
  }
}
