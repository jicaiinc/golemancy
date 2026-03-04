import { useCallback, useEffect, useRef } from 'react'
import { useParams } from 'react-router'
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
import { TeamEdge, TeamEdgeArrowDefs } from './TeamEdge'
import { TeamTopologyToolbar } from './TeamTopologyToolbar'
import { TeamTopologySidebar } from './TeamTopologySidebar'
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
  const { fitView, screenToFlowPosition } = useReactFlow()
  const agents = useAppStore(s => s.agents)
  const themeMode = useAppStore(s => s.themeMode)

  const {
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
  } = useTeamTopologyData(team, agents, projectId as ProjectId)

  // Re-fitView when saved layout is applied after async load
  const prevLayoutRef = useRef(0)
  useEffect(() => {
    if (layoutApplied > prevLayoutRef.current) {
      prevLayoutRef.current = layoutApplied
      requestAnimationFrame(() => fitView(FIT_VIEW_OPTIONS))
    }
  }, [layoutApplied, fitView])

  // ── Sidebar toggle handlers ──

  const onToggleAgents = useCallback(() => {
    if (sidebarMode === 'agents' && isSidebarOpen) {
      setIsSidebarOpen(false)
    } else {
      setSidebarMode('agents')
      setIsSidebarOpen(true)
    }
  }, [sidebarMode, isSidebarOpen, setSidebarMode, setIsSidebarOpen])

  const onToggleSettings = useCallback(() => {
    if (sidebarMode === 'settings' && isSidebarOpen) {
      setIsSidebarOpen(false)
    } else {
      setSidebarMode('settings')
      setIsSidebarOpen(true)
    }
  }, [sidebarMode, isSidebarOpen, setSidebarMode, setIsSidebarOpen])

  // ── Node interaction ──

  const onNodeClick: NodeMouseHandler = useCallback((_e, node) => {
    setSelectedAgentId(node.id as AgentId)
    setSidebarMode('detail')
    setIsSidebarOpen(true)
  }, [setSelectedAgentId, setSidebarMode, setIsSidebarOpen])

  const onPaneClick = useCallback(() => {
    setSelectedAgentId(null)
    if (isSidebarOpen) setSidebarMode('agents')
  }, [setSelectedAgentId, isSidebarOpen, setSidebarMode])

  // ── Remove handler ──

  const handleRemove = useCallback(async (agentId: AgentId) => {
    const success = await removeMember(agentId)
    if (success) {
      setSelectedAgentId(null)
      setSidebarMode('agents')
    }
  }, [removeMember, setSelectedAgentId, setSidebarMode])

  // ── Drag-drop from sidebar ──

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/golemancy-agent')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
    }
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    const agentId = e.dataTransfer.getData('application/golemancy-agent')
    if (!agentId) return
    e.preventDefault()
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    addMember(agentId as AgentId, position)
  }, [screenToFlowPosition, addMember])

  const colorMode = themeMode === 'system' ? undefined : themeMode
  const isEmpty = team.members.length === 0

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <TeamTopologyToolbar
        team={team}
        onResetLayout={resetLayout}
        onToggleAgents={onToggleAgents}
        onToggleSettings={onToggleSettings}
      />

      {/* Canvas + Sidebar */}
      <div className="flex flex-1 min-h-0">
        {/* Canvas */}
        <div className="flex-1 relative" onDragOver={onDragOver} onDrop={onDrop}>
          <TeamEdgeArrowDefs />
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onEdgesDelete={onEdgeDelete}
            onNodesDelete={onNodesDelete}
            onNodeDragStop={onNodeDragStop}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            isValidConnection={isValidConnection}
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
                <div className="font-mono text-[12px] text-text-dim">
                  {isSidebarOpen && sidebarMode === 'agents'
                    ? t('topology.emptyDragHint')
                    : t('topology.emptyTeam')
                  }
                </div>
                {!(isSidebarOpen && sidebarMode === 'agents') && (
                  <button
                    className="px-3 py-1.5 bg-elevated text-text-secondary font-pixel text-[10px] border-2 border-border-dim hover:bg-surface hover:text-text-primary cursor-pointer transition-colors shadow-pixel-raised"
                    onClick={() => { setSidebarMode('agents'); setIsSidebarOpen(true) }}
                  >
                    {t('topology.addFirstAgent')}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <TeamTopologySidebar
          team={team}
          agents={agents}
          mode={sidebarMode}
          isOpen={isSidebarOpen}
          selectedAgentId={selectedAgentId}
          onClose={() => setIsSidebarOpen(false)}
          onRemove={handleRemove}
        />
      </div>
    </div>
  )
}
