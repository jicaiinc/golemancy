import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import {
  useNodesState, useEdgesState,
  type Node, type Edge, type OnConnect, type Connection,
} from '@xyflow/react'
import type { Agent, AgentId, Team, ProjectId } from '@golemancy/shared'
import { getServices } from '../../../services'
import { useAppStore } from '../../../stores'
import { computeTeamLayout } from './useTeamTopologyLayout'
import type { TeamNodeData } from './TeamNode'

export function isDescendantOf(agentId: AgentId, ancestorId: AgentId, members: Team['members']): boolean {
  let current = agentId
  const visited = new Set<string>()
  while (current) {
    if (visited.has(current)) return false
    visited.add(current)
    const member = members.find(m => m.agentId === current)
    if (!member?.parentAgentId) return false
    if (member.parentAgentId === ancestorId) return true
    current = member.parentAgentId
  }
  return false
}

/** Read the latest team members from the Zustand store (avoids stale closures). */
function getLatestMembers(teamId: string): Team['members'] {
  const teams = useAppStore.getState().teams
  return teams.find(t => t.id === teamId)?.members ?? []
}

export function useTeamTopologyData(
  team: Team,
  agents: Agent[],
  projectId: ProjectId,
  highlightedNodeId?: AgentId | null,
) {
  const [selectedAgentId, setSelectedAgentId] = useState<AgentId | null>(null)
  const [sidebarMode, setSidebarMode] = useState<'agents' | 'detail' | 'settings'>('agents')
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [layoutApplied, setLayoutApplied] = useState(0)
  const updateTeam = useAppStore(s => s.updateTeam)

  // Guard: prevent onEdgesDelete from racing with onNodesDelete
  const deletingNodesRef = useRef(false)

  // Layout stored in ref to avoid drag jitter feedback loop
  const savedLayoutRef = useRef<Record<string, { x: number; y: number }>>({})

  // Load layout on mount — apply saved positions via setNodes once loaded
  useEffect(() => {
    let cancelled = false
    getServices().teams.getLayout(projectId, team.id).then(layout => {
      if (cancelled || Object.keys(layout).length === 0) return
      savedLayoutRef.current = layout
      setNodes(cur => cur.map(n => layout[n.id] ? { ...n, position: layout[n.id] } : n))
      setLayoutApplied(c => c + 1)
    }).catch(() => {})
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, team.id])

  const agentMap = useMemo(() => {
    const map = new Map<string, Agent>()
    for (const a of agents) map.set(a.id, a)
    return map
  }, [agents])

  // Derive raw nodes from team members
  const rawNodes: Node<TeamNodeData>[] = useMemo(() => {
    const saved = savedLayoutRef.current
    // Only designate leader when there's exactly one root node
    const rootCount = team.members.filter(m => !m.parentAgentId).length
    return team.members.map(member => {
      const agent = agentMap.get(member.agentId)
      const isLeader = rootCount === 1 && !member.parentAgentId

      return {
        id: member.agentId,
        type: 'teamNode' as const,
        position: saved[member.agentId] ?? { x: 0, y: 0 },
        data: {
          agentId: member.agentId as AgentId,
          name: agent?.name ?? member.agentId,
          status: agent?.status ?? 'idle',
          model: agent?.modelConfig.model ?? '',
          description: agent?.description ?? '',
          isLeader,
          isHighlighted: highlightedNodeId === member.agentId,
        } satisfies TeamNodeData,
      }
    })
  }, [team.members, agentMap, highlightedNodeId])

  // Derive edges from parentAgentId
  const rawEdges: Edge[] = useMemo(() => {
    return team.members
      .filter(m => m.parentAgentId)
      .map(m => ({
        id: `${m.parentAgentId}-${m.agentId}`,
        source: m.parentAgentId!,
        target: m.agentId,
        type: 'teamEdge' as const,
      }))
  }, [team.members])

  // Compute initial layout
  const initialNodes = useMemo(() => {
    const saved = savedLayoutRef.current
    const needsLayout = rawNodes.some(n => !saved[n.id])
    return needsLayout ? computeTeamLayout(rawNodes, rawEdges, saved) : rawNodes
  }, [rawNodes, rawEdges])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(rawEdges)

  // Sync when team.members or agents change
  const prevKeyRef = useRef('')
  useEffect(() => {
    const key = team.members.map(m => `${m.agentId}:${m.parentAgentId ?? ''}`).join('|')
      + '||' + agents.map(a => `${a.id}:${a.name}:${a.status}:${a.modelConfig.model}`).join('|')
    if (key !== prevKeyRef.current) {
      prevKeyRef.current = key
      setNodes(currentNodes => {
        const posMap: Record<string, { x: number; y: number }> = {}
        for (const n of currentNodes) posMap[n.id] = n.position
        const saved = savedLayoutRef.current
        const merged = rawNodes.map(n => ({
          ...n,
          position: posMap[n.id] ?? saved[n.id] ?? n.position,
        }))
        const needsLayout = merged.some(n => !posMap[n.id] && !saved[n.id])
        return needsLayout ? computeTeamLayout(merged, rawEdges, { ...saved, ...posMap }) : merged
      })
      setEdges(rawEdges)
    }
  }, [team.members, agents, rawNodes, rawEdges, setNodes, setEdges])

  // Debounced save on drag
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(saveTimer.current), [])

  const onNodeDragStop = useCallback(() => {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      setNodes(currentNodes => {
        const layout: Record<string, { x: number; y: number }> = {}
        for (const n of currentNodes) layout[n.id] = n.position
        savedLayoutRef.current = layout
        getServices().teams.saveLayout(projectId, team.id, layout).catch(() => {})
        return currentNodes
      })
    }, 500)
  }, [projectId, team.id, setNodes])

  // ── Mutation callbacks — all read latest members from store to avoid stale closures ──

  const onConnect: OnConnect = useCallback((connection) => {
    const { source, target } = connection
    if (!source || !target) return
    const members = getLatestMembers(team.id)
    if (isDescendantOf(source as AgentId, target as AgentId, members)) return
    const updatedMembers = members.map(m =>
      m.agentId === target ? { ...m, parentAgentId: source as AgentId } : m,
    )
    updateTeam(team.id, { members: updatedMembers })
  }, [team.id, updateTeam])

  const onEdgeDelete = useCallback((deletedEdges: Edge[]) => {
    // Skip if this was triggered by node deletion — onNodesDelete handles it
    if (deletingNodesRef.current) return
    const members = getLatestMembers(team.id)
    const targetIds = new Set(deletedEdges.map(e => e.target))
    const updatedMembers = members.map(m =>
      targetIds.has(m.agentId) ? { ...m, parentAgentId: undefined } : m,
    )
    updateTeam(team.id, { members: updatedMembers })
  }, [team.id, updateTeam])

  const resetLayout = useCallback(async () => {
    const fresh = computeTeamLayout(rawNodes, rawEdges, {})
    setNodes(fresh)
    const layout: Record<string, { x: number; y: number }> = {}
    for (const n of fresh) layout[n.id] = n.position
    savedLayoutRef.current = layout
    await getServices().teams.saveLayout(projectId, team.id, layout).catch(() => {})
  }, [projectId, team.id, rawNodes, rawEdges, setNodes])

  const addMember = useCallback(async (agentId: AgentId, position?: { x: number; y: number }, parentAgentId?: AgentId) => {
    if (position) {
      savedLayoutRef.current[agentId] = position
    }
    const members = getLatestMembers(team.id)
    const newMember = { agentId, role: '', parentAgentId }
    const updatedMembers = [...members, newMember]
    await updateTeam(team.id, { members: updatedMembers })
    if (position) {
      getServices().teams.saveLayout(projectId, team.id, savedLayoutRef.current).catch(() => {})
    }
  }, [team.id, updateTeam, projectId])

  const removeMember = useCallback(async (agentId: AgentId): Promise<boolean> => {
    const members = getLatestMembers(team.id)
    const member = members.find(m => m.agentId === agentId)
    if (!member) return false
    const updatedMembers = members
      .filter(m => m.agentId !== agentId)
      .map(m => m.parentAgentId === agentId ? { ...m, parentAgentId: undefined } : m)
    await updateTeam(team.id, { members: updatedMembers })
    return true
  }, [team.id, updateTeam])

  const onNodesDelete = useCallback((deletedNodes: Node[]) => {
    deletingNodesRef.current = true
    const members = getLatestMembers(team.id)
    const deletedIds = new Set(deletedNodes.map(n => n.id))
    const updatedMembers = members
      .filter(m => !deletedIds.has(m.agentId))
      .map(m => m.parentAgentId && deletedIds.has(m.parentAgentId) ? { ...m, parentAgentId: undefined } : m)
    updateTeam(team.id, { members: updatedMembers })
    // Reset flag after current event loop so onEdgesDelete (if queued) is skipped
    setTimeout(() => { deletingNodesRef.current = false }, 0)
  }, [team.id, updateTeam])

  // Validate connection: target can only have one parent, no cycles, no self-loop
  const isValidConnection = useCallback((connection: Edge | Connection) => {
    const { source, target } = connection
    if (!source || !target || source === target) return false
    const members = getLatestMembers(team.id)
    const targetMember = members.find(m => m.agentId === target)
    if (targetMember?.parentAgentId) return false
    if (isDescendantOf(source as AgentId, target as AgentId, members)) return false
    return true
  }, [team.id])

  return {
    nodes, edges,
    onNodesChange, onEdgesChange,
    onConnect, onEdgeDelete,
    onNodeDragStop,
    resetLayout,
    addMember, removeMember,
    selectedAgentId, setSelectedAgentId,
    sidebarMode, setSidebarMode,
    isSidebarOpen, setIsSidebarOpen,
    onNodesDelete,
    isValidConnection,
    layoutApplied,
  }
}
