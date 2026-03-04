import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import {
  useNodesState, useEdgesState,
  type Node, type Edge, type OnConnect,
} from '@xyflow/react'
import type { Agent, AgentId, Team, Skill, ProjectId } from '@golemancy/shared'
import { getServices } from '../../../services'
import { useAppStore } from '../../../stores'
import { computeTeamLayout } from './useTeamTopologyLayout'
import type { TeamNodeData } from './TeamNode'
import type { TeamEdgeData } from './TeamEdge'

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

export function useTeamTopologyData(
  team: Team,
  agents: Agent[],
  skills: Skill[],
  projectId: ProjectId,
  highlightedNodeId?: AgentId | null,
) {
  const [selectedAgentId, setSelectedAgentId] = useState<AgentId | null>(null)
  const [layoutApplied, setLayoutApplied] = useState(0)
  const updateTeam = useAppStore(s => s.updateTeam)

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

  const skillMap = useMemo(() => {
    const map = new Map<string, Skill>()
    for (const s of skills) map.set(s.id, s)
    return map
  }, [skills])

  // Derive raw nodes from team members
  const rawNodes: Node<TeamNodeData>[] = useMemo(() => {
    const saved = savedLayoutRef.current
    return team.members.map(member => {
      const agent = agentMap.get(member.agentId)
      const isLeader = !member.parentAgentId

      const skillNames = (agent?.skillIds ?? [])
        .map(sid => skillMap.get(sid)?.name)
        .filter(Boolean) as string[]
      const enabledTools = agent
        ? Object.entries(agent.builtinTools).filter(([, v]) => !!v).map(([k]) => k)
        : []
      const mcpServerNames = agent?.mcpServers ?? []
      const memoryEnabled = !!agent?.builtinTools.memory

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
          role: member.role,
          skillNames,
          enabledTools,
          mcpServerNames,
          memoryEnabled,
          isHighlighted: highlightedNodeId === member.agentId,
        } satisfies TeamNodeData,
      }
    })
  }, [team.members, agentMap, skillMap, highlightedNodeId])

  // Derive edges from parentAgentId
  const rawEdges: Edge<TeamEdgeData>[] = useMemo(() => {
    return team.members
      .filter(m => m.parentAgentId)
      .map(m => ({
        id: `${m.parentAgentId}-${m.agentId}`,
        source: m.parentAgentId!,
        target: m.agentId,
        type: 'teamEdge' as const,
        data: { role: m.role } satisfies TeamEdgeData,
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
    const key = team.members.map(m => `${m.agentId}:${m.role}:${m.parentAgentId ?? ''}`).join('|')
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

  // Connect: set target's parentAgentId = source (via store)
  const onConnect: OnConnect = useCallback((connection) => {
    const { source, target } = connection
    if (!source || !target) return
    if (isDescendantOf(source as AgentId, target as AgentId, team.members)) return

    const updatedMembers = team.members.map(m =>
      m.agentId === target ? { ...m, parentAgentId: source as AgentId } : m,
    )
    updateTeam(team.id, { members: updatedMembers })
  }, [team.id, team.members, updateTeam])

  // Edge delete: clear target's parentAgentId (via store)
  const onEdgeDelete = useCallback((deletedEdges: Edge[]) => {
    const targetIds = new Set(deletedEdges.map(e => e.target))
    const updatedMembers = team.members.map(m =>
      targetIds.has(m.agentId) ? { ...m, parentAgentId: undefined } : m,
    )
    updateTeam(team.id, { members: updatedMembers })
  }, [team.id, team.members, updateTeam])

  // Reset layout
  const resetLayout = useCallback(async () => {
    const fresh = computeTeamLayout(rawNodes, rawEdges, {})
    setNodes(fresh)
    const layout: Record<string, { x: number; y: number }> = {}
    for (const n of fresh) layout[n.id] = n.position
    savedLayoutRef.current = layout
    await getServices().teams.saveLayout(projectId, team.id, layout).catch(() => {})
  }, [projectId, team.id, rawNodes, rawEdges, setNodes])

  // Add member (with optional drop position and parent)
  const addMember = useCallback(async (agentId: AgentId, position?: { x: number; y: number }, parentAgentId?: AgentId) => {
    // Pre-save position so sync effect picks it up on re-render
    if (position) {
      savedLayoutRef.current[agentId] = position
    }

    const newMember = { agentId, role: '', parentAgentId }
    const updatedMembers = [...team.members, newMember]
    await updateTeam(team.id, { members: updatedMembers })

    // Persist layout to server
    if (position) {
      getServices().teams.saveLayout(projectId, team.id, savedLayoutRef.current).catch(() => {})
    }
  }, [team.id, team.members, updateTeam, projectId])

  // Remove member
  const removeMember = useCallback(async (agentId: AgentId): Promise<boolean> => {
    const member = team.members.find(m => m.agentId === agentId)
    if (!member) return false
    if (!member.parentAgentId) return false // can't remove leader

    const updatedMembers = team.members
      .filter(m => m.agentId !== agentId)
      .map(m => m.parentAgentId === agentId ? { ...m, parentAgentId: undefined } : m)

    await updateTeam(team.id, { members: updatedMembers })
    return true
  }, [team.id, team.members, updateTeam])

  // Set leader
  const setLeader = useCallback(async (agentId: AgentId) => {
    const updatedMembers = team.members.map(m => {
      if (m.agentId === agentId) return { ...m, parentAgentId: undefined }
      if (!m.parentAgentId) return { ...m, parentAgentId: agentId }
      return m
    })
    await updateTeam(team.id, { members: updatedMembers })
  }, [team.id, team.members, updateTeam])

  // Update member role
  const updateMemberRole = useCallback(async (agentId: AgentId, role: string) => {
    const updatedMembers = team.members.map(m =>
      m.agentId === agentId ? { ...m, role } : m,
    )
    await updateTeam(team.id, { members: updatedMembers })
  }, [team.id, team.members, updateTeam])

  return {
    nodes, edges,
    onNodesChange, onEdgesChange,
    onConnect, onEdgeDelete,
    onNodeDragStop,
    resetLayout,
    addMember, removeMember, setLeader, updateMemberRole,
    selectedAgentId, setSelectedAgentId,
    layoutApplied,
  }
}
