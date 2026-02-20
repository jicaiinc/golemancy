import { useCallback, useState, useEffect, useRef, useMemo } from 'react'
import { AnimatePresence } from 'motion/react'
import {
  ReactFlow,
  Background,
  MiniMap,
  Controls,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './topology.css'

import type { AgentId, ProjectId } from '@golemancy/shared'
import { useNavigate, useParams } from 'react-router'
import { useAppStore } from '../../../stores'
import { AgentNode } from './AgentNode'
import { AgentEdge } from './AgentEdge'
import { NodeDetailPanel } from './NodeDetailPanel'
import { TopologyToolbar } from './TopologyToolbar'
import { useTopologyData } from './useTopologyData'

const nodeTypes = { agentNode: AgentNode }
const edgeTypes = { agentEdge: AgentEdge }

interface TopologyViewProps {
  onCreateAgent: () => void
}

export function TopologyView({ onCreateAgent }: TopologyViewProps) {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const deleteAgent = useAppStore(s => s.deleteAgent)
  const updateProject = useAppStore(s => s.updateProject)
  const agents = useAppStore(s => s.agents)
  const themeMode = useAppStore(s => s.themeMode)

  const [highlightedNodeId, setHighlightedNodeId] = useState<AgentId | null>(null)
  const prevAgentCountRef = useRef(agents.length)

  // Compute effective color mode for ReactFlow
  const colorMode = useMemo<'light' | 'dark'>(() => {
    if (themeMode === 'light') return 'light'
    if (themeMode === 'dark') return 'dark'
    // For 'system', check media query
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }
    return 'dark' // fallback
  }, [themeMode])

  const {
    nodes, edges,
    onNodesChange, onEdgesChange,
    onConnect, onEdgeDelete,
    onNodeDragStop,
    resetLayout,
    selectedAgentId, setSelectedAgentId,
  } = useTopologyData(highlightedNodeId)

  // Detect new agent creation and highlight it
  useEffect(() => {
    const prevCount = prevAgentCountRef.current
    prevAgentCountRef.current = agents.length
    if (agents.length > prevCount) {
      // New agent was added - find and highlight it
      const newAgent = agents[agents.length - 1]
      setHighlightedNodeId(newAgent.id)
      // Clear highlight after animation
      const timer = setTimeout(() => setHighlightedNodeId(null), 2000)
      return () => clearTimeout(timer)
    }
  }, [agents])

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; agentId: AgentId
  } | null>(null)

  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault()
    setContextMenu({ x: event.clientX, y: event.clientY, agentId: node.id as AgentId })
  }, [])

  const closeContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  const handlePaneClick = useCallback(() => {
    setSelectedAgentId(null)
    closeContextMenu()
  }, [setSelectedAgentId, closeContextMenu])

  return (
    <div className="flex-1 relative w-full h-full" data-testid="topology-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onEdgesDelete={onEdgeDelete}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={(_, node) => { setSelectedAgentId(node.id as AgentId); closeContextMenu() }}
        onNodeDoubleClick={(_, node) => navigate(`/projects/${projectId}/agents/${node.id}`, { state: { fromView: 'topology' } })}
        onNodeContextMenu={onNodeContextMenu}
        onPaneClick={handlePaneClick}
        onDoubleClick={(e) => {
          // Only trigger on pane double-click, not on nodes
          // (onPaneDoubleClick doesn't exist in v12)
          if ((e.target as HTMLElement).classList.contains('react-flow__pane')) {
            onCreateAgent()
          }
        }}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        colorMode={colorMode}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="var(--color-border-dim)" gap={24} size={1} />
        <MiniMap
          nodeColor="var(--color-border-bright)"
          nodeBorderRadius={0}
          maskColor="rgba(0,0,0,0.7)"
          position="bottom-right"
        />
        <Controls
          showInteractive={false}
          position="bottom-left"
        />
      </ReactFlow>

      <TopologyToolbar onResetLayout={resetLayout} />

      <AnimatePresence>
        {selectedAgentId && (
          <NodeDetailPanel
            key={selectedAgentId}
            agentId={selectedAgentId}
            onClose={() => setSelectedAgentId(null)}
          />
        )}
      </AnimatePresence>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed bg-surface border-2 border-border-bright min-w-[180px] z-50 py-1 shadow-[inset_2px_2px_0_0_rgba(255,255,255,0.08),inset_-2px_-2px_0_0_rgba(0,0,0,0.3),4px_4px_0_0_rgba(0,0,0,0.5)]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="block w-full text-left px-3 py-2 text-[12px] font-mono text-text-primary hover:bg-elevated transition-colors cursor-pointer"
            onClick={() => {
              navigate(`/projects/${projectId}/agents/${contextMenu.agentId}`, { state: { fromView: 'topology' } })
              closeContextMenu()
            }}
          >
            Edit Agent
          </button>
          <button
            className="block w-full text-left px-3 py-2 text-[12px] font-mono text-mc-gold hover:bg-elevated transition-colors cursor-pointer"
            onClick={async () => {
              if (projectId) {
                await updateProject(projectId as ProjectId, { mainAgentId: contextMenu.agentId })
              }
              closeContextMenu()
            }}
          >
            Set as Main Agent
          </button>
          <div className="border-t-2 border-border-dim my-1" />
          <button
            className="block w-full text-left px-3 py-2 text-[12px] font-mono text-accent-red hover:bg-elevated transition-colors cursor-pointer"
            onClick={async () => {
              await deleteAgent(contextMenu.agentId)
              closeContextMenu()
              setSelectedAgentId(null)
            }}
          >
            Delete Agent
          </button>
        </div>
      )}
    </div>
  )
}
