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
  const projects = useAppStore(s => s.projects)
  const updateAgent = useAppStore(s => s.updateAgent)
  const loadTopologyLayout = useAppStore(s => s.loadTopologyLayout)
  const saveTopologyLayout = useAppStore(s => s.saveTopologyLayout)
  const currentProject = projects.find(p => p.id === projectId)

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
        subAgentCount: agent.subAgents.length,
        isMainAgent: currentProject?.mainAgentId === agent.id,
        isHighlighted: highlightedNodeId === agent.id,
      },
    }))
  }, [agents, currentProject?.mainAgentId, highlightedNodeId])

  // Derive edges from subAgents refs
  const rawEdges: Edge<AgentEdgeData>[] = useMemo(() => {
    const edges: Edge<AgentEdgeData>[] = []
    for (const agent of agents) {
      for (const sub of agent.subAgents) {
        if (agents.some(a => a.id === sub.agentId)) {
          edges.push({
            id: `${agent.id}->${sub.agentId}`,
            source: agent.id,
            target: sub.agentId,
            type: 'agentEdge',
            data: { role: sub.role },
          })
        }
      }
    }
    return edges
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
      const layout: Record<string, { x: number; y: number }> = {}
      // Use getState to get latest nodes without stale closure
      const currentNodes = useAppStore.getState().topologyLayout
      // Actually we need React Flow's current nodes — use the nodes from the closure
      // but we read from the setter to get latest
      setNodes(currentNodes => {
        for (const n of currentNodes) {
          layout[n.id] = n.position
        }
        layout[node.id] = node.position
        saveTopologyLayout(projectId as ProjectId, layout)
        return currentNodes // don't modify
      })
    }, 500)
  }, [projectId, setNodes, saveTopologyLayout])

  // --- Connect → create SubAgentRef ---
  const onConnect: OnConnect = useCallback(async (connection) => {
    if (!connection.source || !connection.target) return
    const sourceAgent = agents.find(a => a.id === connection.source)
    if (!sourceAgent) return
    if (sourceAgent.subAgents.some(s => s.agentId === connection.target)) return

    const role = window.prompt('Enter role for this sub-agent:')
    if (!role) return

    await updateAgent(sourceAgent.id, {
      subAgents: [...sourceAgent.subAgents, { agentId: connection.target as AgentId, role }],
    })
  }, [agents, updateAgent])

  // --- Edge delete → remove SubAgentRef ---
  const onEdgeDelete = useCallback(async (deletedEdges: Edge[]) => {
    for (const edge of deletedEdges) {
      const sourceAgent = agents.find(a => a.id === edge.source)
      if (!sourceAgent) continue
      await updateAgent(sourceAgent.id, {
        subAgents: sourceAgent.subAgents.filter(s => s.agentId !== edge.target),
      })
    }
  }, [agents, updateAgent])

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
