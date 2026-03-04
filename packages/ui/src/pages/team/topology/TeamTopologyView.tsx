import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import {
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  Background,
  MiniMap,
  Controls,
  type NodeMouseHandler,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { Team, AgentId, ProjectId } from '@golemancy/shared'
import { useAppStore } from '../../../stores'
import { TeamNode } from './TeamNode'
import { TeamEdge } from './TeamEdge'
import { TeamTopologyToolbar } from './TeamTopologyToolbar'
import { TeamNodeDetailPanel } from './TeamNodeDetailPanel'
import { useTeamTopologyData } from './useTeamTopologyData'
import './team-topology.css'

const nodeTypes = { teamNode: TeamNode }
const edgeTypes = { teamEdge: TeamEdge }

interface TeamTopologyViewProps {
  team: Team
}

export function TeamTopologyView({ team }: TeamTopologyViewProps) {
  return (
    <ReactFlowProvider>
      <TeamTopologyCanvas team={team} />
    </ReactFlowProvider>
  )
}

const FIT_VIEW_OPTIONS = { maxZoom: 1, padding: 0.15 }

function TeamTopologyCanvas({ team }: TeamTopologyViewProps) {
  const { t } = useTranslation('team')
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { getNodes, fitView } = useReactFlow()
  const agents = useAppStore(s => s.agents)
  const skills = useAppStore(s => s.skills)
  const themeMode = useAppStore(s => s.themeMode)

  const {
    nodes, edges,
    onNodesChange, onEdgesChange,
    onConnect, onEdgeDelete,
    onNodeDragStop,
    resetLayout,
    addMember, removeMember,
    selectedAgentId, setSelectedAgentId,
    layoutApplied,
  } = useTeamTopologyData(team, agents, skills, projectId as ProjectId)

  // Re-fitView when saved layout is applied after async load
  const prevLayoutRef = useRef(0)
  useEffect(() => {
    if (layoutApplied > prevLayoutRef.current) {
      prevLayoutRef.current = layoutApplied
      requestAnimationFrame(() => fitView(FIT_VIEW_OPTIONS))
    }
  }, [layoutApplied, fitView])

  // Add-child popover state
  const [addChildState, setAddChildState] = useState<{
    parentAgentId: AgentId
    screenPos: { x: number; y: number }
  } | null>(null)

  // Empty state: add-first-agent popover
  const [showEmptyPicker, setShowEmptyPicker] = useState(false)

  const selectedAgent = useMemo(() => {
    if (!selectedAgentId) return null
    return agents.find(a => a.id === selectedAgentId) ?? null
  }, [selectedAgentId, agents])

  const selectedMember = useMemo(() => {
    if (!selectedAgentId) return null
    return team.members.find(m => m.agentId === selectedAgentId) ?? null
  }, [selectedAgentId, team.members])

  // Available agents (not already in team)
  const memberIds = useMemo(() => new Set(team.members.map(m => m.agentId)), [team.members])
  const availableAgents = useMemo(() => agents.filter(a => !memberIds.has(a.id)), [agents, memberIds])

  // Node handlers — intercept "+" button click
  const onNodeClick: NodeMouseHandler = useCallback((e, node) => {
    const target = e.target as HTMLElement
    if (target.closest('[data-action="add-child"]')) {
      e.stopPropagation()
      const rect = target.closest('[data-action="add-child"]')!.getBoundingClientRect()
      setAddChildState({
        parentAgentId: node.id as AgentId,
        screenPos: { x: rect.left, y: rect.bottom + 4 },
      })
      return
    }
    setAddChildState(null)
    setSelectedAgentId(node.id as AgentId)
  }, [setSelectedAgentId])

  const onNodeDoubleClick: NodeMouseHandler = useCallback((_e, node) => {
    navigate(`/projects/${projectId}/agents/${node.id}`)
  }, [navigate, projectId])

  const handleAddChild = useCallback(async (agentId: AgentId) => {
    if (!addChildState) return
    const parentNode = getNodes().find(n => n.id === addChildState.parentAgentId)
    const position = parentNode
      ? { x: parentNode.position.x, y: parentNode.position.y + (parentNode.measured?.height ?? 120) + 60 }
      : { x: 0, y: 0 }
    await addMember(agentId, position, addChildState.parentAgentId)
    setAddChildState(null)
  }, [addChildState, getNodes, addMember])

  const handleAddFirstAgent = useCallback(async (agentId: AgentId) => {
    await addMember(agentId, { x: 0, y: 0 })
    setShowEmptyPicker(false)
  }, [addMember])

  const handleRemove = useCallback(async (agentId: AgentId) => {
    const success = await removeMember(agentId)
    if (success) setSelectedAgentId(null)
  }, [removeMember, setSelectedAgentId])

  const colorMode = themeMode === 'system' ? undefined : themeMode
  const isEmpty = team.members.length === 0

  return (
    <div className="relative flex-1 h-full flex">
      {/* Canvas area */}
      <div className="flex-1 relative">
        <TeamTopologyToolbar team={team} onResetLayout={resetLayout} />

        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onEdgesDelete={onEdgeDelete}
          onNodeDragStop={onNodeDragStop}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDoubleClick}
          onPaneClick={() => { setSelectedAgentId(null); setAddChildState(null); setShowEmptyPicker(false) }}
          colorMode={colorMode}
          fitView
          fitViewOptions={FIT_VIEW_OPTIONS}
          minZoom={0.1}
          proOptions={{ hideAttribution: true }}
          deleteKeyCode={['Backspace', 'Delete']}
        >
          <Background />
          <MiniMap />
          <Controls />
        </ReactFlow>

        {/* Empty state overlay */}
        {isEmpty && (
          <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
            <div className="flex flex-col items-center gap-3 pointer-events-auto">
              <div className="font-mono text-[12px] text-text-dim">{t('topology.emptyTeam')}</div>
              <div className="relative">
                <button
                  className="px-4 py-2 bg-accent-blue text-white font-pixel text-[10px] border-2 border-accent-blue hover:brightness-110 cursor-pointer transition-all"
                  onClick={() => setShowEmptyPicker(!showEmptyPicker)}
                >
                  {t('topology.addFirstAgent')}
                </button>
                {showEmptyPicker && availableAgents.length > 0 && (
                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-surface border-2 border-border-dim shadow-pixel-drop max-h-[200px] overflow-y-auto w-[200px] z-[100]">
                    {availableAgents.map(agent => (
                      <button
                        key={agent.id}
                        className="w-full px-2.5 py-1.5 text-left hover:bg-elevated cursor-pointer transition-colors border-b border-border-dim last:border-b-0"
                        onClick={() => handleAddFirstAgent(agent.id)}
                      >
                        <div className="font-pixel text-[9px] text-text-primary truncate">{agent.name}</div>
                        <div className="font-mono text-[8px] text-text-dim truncate">{agent.modelConfig.model}</div>
                      </button>
                    ))}
                  </div>
                )}
                {showEmptyPicker && availableAgents.length === 0 && (
                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-surface border-2 border-border-dim shadow-pixel-drop px-3 py-2 w-[200px] z-[100]">
                    <span className="font-mono text-[9px] text-text-dim">{t('topology.noAgentsAvailable')}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Add-child agent picker popover */}
        {addChildState && availableAgents.length > 0 && (
          <div
            className="fixed z-[100] bg-surface border-2 border-border-dim shadow-pixel-drop max-h-[200px] overflow-y-auto w-[180px]"
            style={{ left: addChildState.screenPos.x, top: addChildState.screenPos.y }}
          >
            {availableAgents.map(agent => (
              <button
                key={agent.id}
                className="w-full px-2.5 py-1.5 text-left hover:bg-elevated cursor-pointer transition-colors border-b border-border-dim last:border-b-0"
                onClick={() => handleAddChild(agent.id)}
              >
                <div className="font-pixel text-[9px] text-text-primary truncate">{agent.name}</div>
                <div className="font-mono text-[8px] text-text-dim truncate">{agent.modelConfig.model}</div>
              </button>
            ))}
          </div>
        )}
        {addChildState && availableAgents.length === 0 && (
          <div
            className="fixed z-[100] bg-surface border-2 border-border-dim shadow-pixel-drop px-3 py-2 w-[180px]"
            style={{ left: addChildState.screenPos.x, top: addChildState.screenPos.y }}
          >
            <span className="font-mono text-[9px] text-text-dim">{t('topology.noAgentsAvailable')}</span>
          </div>
        )}

        <TeamNodeDetailPanel
          agent={selectedAgent}
          isLeader={selectedMember ? !selectedMember.parentAgentId : false}
          onClose={() => setSelectedAgentId(null)}
          onRemove={handleRemove}
        />
      </div>
    </div>
  )
}
