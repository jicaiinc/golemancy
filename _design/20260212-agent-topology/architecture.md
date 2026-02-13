# Architecture: Agent Topology View

> Design by: Architect
> Date: 2026-02-12
> Status: Draft

---

## 1. Overview

Add a Topology view to the Agents page, allowing users to visualize Agent → Sub-Agent relationships as a directed graph. The existing Grid view is preserved; users toggle between views via a view switcher in the page header. The topology uses React Flow with dagre auto-layout, pixel art custom nodes/edges, and server-persisted layout positions.

---

## 2. Component Architecture

### 2.1 File Organization

```
packages/ui/src/
├── pages/agent/
│   ├── AgentListPage.tsx              ← MODIFY: add view switcher + conditional render
│   ├── AgentCreateModal.tsx           ← existing, no change
│   ├── AgentDetailPage.tsx            ← existing, no change
│   └── topology/
│       ├── TopologyView.tsx           ← main React Flow canvas container
│       ├── AgentNode.tsx              ← custom node component
│       ├── AgentEdge.tsx              ← custom edge component (step edge + role label)
│       ├── NodeDetailPanel.tsx        ← slide-in side panel on node click
│       ├── TopologyToolbar.tsx        ← toolbar: reset layout, zoom controls
│       ├── useTopologyData.ts         ← hook: agents[] → nodes[] + edges[]
│       ├── useTopologyLayout.ts       ← hook: dagre layout + position merge
│       └── topology-types.ts          ← local types (NodeData, EdgeData)
```

**Rationale**: Topology components live in a `topology/` subfolder under `pages/agent/` — colocated with the agent page they augment, not under `components/` since they're page-specific and not reusable elsewhere.

### 2.2 AgentListPage Modification

```tsx
// AgentListPage.tsx — additions
import { useState } from 'react'
import { TopologyView } from './topology/TopologyView'

type ViewMode = 'grid' | 'topology'

export function AgentListPage() {
  // ...existing state...
  const [viewMode, setViewMode] = useState<ViewMode>('grid')

  return (
    <div className={viewMode === 'topology' ? 'h-full flex flex-col' : 'p-6'}>
      {/* Header — always visible */}
      <div className={`flex items-center justify-between ${viewMode === 'topology' ? 'px-6 pt-6 pb-3' : 'mb-6'}`}>
        <div>
          <h1 className="font-pixel text-[14px] text-text-primary">Agents</h1>
          <p className="mt-1 text-text-secondary text-[13px]">...</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View Switcher */}
          <ViewSwitcher mode={viewMode} onChange={setViewMode} />
          <PixelButton variant="primary" onClick={() => setShowCreate(true)}>
            + New Agent
          </PixelButton>
        </div>
      </div>

      {/* Conditional view */}
      {viewMode === 'grid' ? (
        /* ...existing grid code, extracted unchanged... */
      ) : (
        <TopologyView />
      )}
    </div>
  )
}
```

**ViewSwitcher** is a simple inline component (two `PixelButton` with `variant="ghost"` toggled to `variant="default"` based on active mode). It renders two icon/text buttons: "Grid" and "Topology". No need for a separate file — define inline in `AgentListPage.tsx`.

### 2.3 TopologyView (Main Canvas)

```
packages/ui/src/pages/agent/topology/TopologyView.tsx
```

```tsx
import { useCallback, useRef } from 'react'
import {
  ReactFlow,
  Background,
  MiniMap,
  Controls,
  useNodesState,
  useEdgesState,
  type OnConnect,
  type NodeMouseHandler,
  type Node,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { AgentNode } from './AgentNode'
import { AgentEdge } from './AgentEdge'
import { NodeDetailPanel } from './NodeDetailPanel'
import { TopologyToolbar } from './TopologyToolbar'
import { useTopologyData } from './useTopologyData'

const nodeTypes = { agentNode: AgentNode }
const edgeTypes = { agentEdge: AgentEdge }

export function TopologyView() {
  // useTopologyData derives nodes/edges from agents[] + persisted layout
  const {
    nodes, edges,
    onNodesChange, onEdgesChange,
    onConnect, onEdgeDelete,
    onNodeDragStop,
    resetLayout,
    selectedAgentId, setSelectedAgentId,
  } = useTopologyData()

  return (
    <div className="flex-1 relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onEdgeDelete={onEdgeDelete}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={(_, node) => setSelectedAgentId(node.id)}
        onNodeDoubleClick={(_, node) => {/* navigate to detail */}}
        onPaneClick={() => setSelectedAgentId(null)}
        onPaneDoubleClick={(e) => {/* trigger create agent modal */}}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background color="var(--color-border-dim)" gap={20} size={1} />
        <MiniMap
          nodeColor="var(--color-surface)"
          maskColor="rgba(0,0,0,0.7)"
          style={{ border: '2px solid var(--color-border-dim)' }}
        />
        <Controls
          showInteractive={false}
          style={{ border: '2px solid var(--color-border-dim)' }}
        />
      </ReactFlow>

      <TopologyToolbar onResetLayout={resetLayout} />

      {selectedAgentId && (
        <NodeDetailPanel
          agentId={selectedAgentId}
          onClose={() => setSelectedAgentId(null)}
        />
      )}
    </div>
  )
}
```

**Key decisions**:
- React Flow v12 (`@xyflow/react`) — the current package name (fact-checked: `reactflow` was renamed to `@xyflow/react` in v12).
- `fitView` on mount for initial zoom-to-fit.
- `proOptions={{ hideAttribution: true }}` — allowed for open-source usage.
- Canvas fills remaining height via `flex-1` (parent is `flex flex-col h-full`).

### 2.4 AgentNode (Custom Node)

```
packages/ui/src/pages/agent/topology/AgentNode.tsx
```

Renders a pixel-art styled card for each agent. Based on `PixelCard` design language.

```tsx
import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { AgentId, AgentStatus } from '@golemancy/shared'

export interface AgentNodeData {
  agentId: AgentId
  name: string
  status: AgentStatus
  model: string
  skillCount: number
  toolCount: number
  subAgentCount: number
  isMainAgent: boolean
}

export const AgentNode = memo(({ data, selected }: NodeProps<AgentNodeData>) => {
  const statusColors: Record<AgentStatus, string> = {
    idle: 'bg-text-secondary',
    running: 'bg-accent-green',
    error: 'bg-accent-red',
    paused: 'bg-accent-amber',
  }

  return (
    <div className={`
      bg-surface border-2 p-3 min-w-[180px] max-w-[220px]
      shadow-[inset_2px_2px_0_0_rgba(255,255,255,0.08),inset_-2px_-2px_0_0_rgba(0,0,0,0.3)]
      ${selected ? 'border-accent-blue' : 'border-border-dim'}
      ${data.isMainAgent ? 'border-l-4 border-l-accent-green' : ''}
    `}>
      {/* Status bar */}
      <div className={`absolute top-0 left-0 right-0 h-1 ${statusColors[data.status]}`} />

      {/* Agent name */}
      <div className="font-pixel text-[9px] text-text-primary truncate mb-1">
        {data.name}
      </div>

      {/* Model */}
      {data.model && (
        <div className="text-[10px] text-text-dim font-mono truncate mb-2">
          {data.model}
        </div>
      )}

      {/* Counts row */}
      <div className="flex items-center gap-2 text-[9px] text-text-dim">
        {data.skillCount > 0 && <span>{data.skillCount} sk</span>}
        {data.toolCount > 0 && <span>{data.toolCount} tl</span>}
        {data.subAgentCount > 0 && (
          <span className="text-accent-purple">{data.subAgentCount} sub</span>
        )}
      </div>

      {/* Handles */}
      <Handle type="source" position={Position.Bottom} className="!bg-accent-blue !w-2 !h-2 !border-0" />
      <Handle type="target" position={Position.Top} className="!bg-accent-purple !w-2 !h-2 !border-0" />
    </div>
  )
})

AgentNode.displayName = 'AgentNode'
```

**Design notes**:
- No border-radius (pixel art style per CLAUDE.md).
- Uses same color system from `global.css` (`--color-*` CSS vars via Tailwind).
- `Handle` components at Top (target) and Bottom (source) for vertical tree layout.
- Main Agent gets a green left border accent.

### 2.5 AgentEdge (Custom Edge)

```
packages/ui/src/pages/agent/topology/AgentEdge.tsx
```

Step (right-angle) edge with a role label overlay.

```tsx
import { memo } from 'react'
import {
  BaseEdge,
  getSmoothStepPath,
  EdgeLabelRenderer,
  type EdgeProps,
} from '@xyflow/react'

export interface AgentEdgeData {
  role: string
}

export const AgentEdge = memo(({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  data, selected,
}: EdgeProps<AgentEdgeData>) => {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX, sourceY, targetX, targetY,
    sourcePosition, targetPosition,
    borderRadius: 0, // pixel art: no rounded corners
  })

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: selected ? 'var(--color-accent-blue)' : 'var(--color-border-bright)',
          strokeWidth: 2,
        }}
      />
      {data?.role && (
        <EdgeLabelRenderer>
          <div
            className="absolute text-[8px] font-pixel text-accent-purple bg-deep px-1 py-0.5 border border-border-dim pointer-events-all"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            }}
          >
            {data.role}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
})

AgentEdge.displayName = 'AgentEdge'
```

**Key**: Uses `getSmoothStepPath` with `borderRadius: 0` for right-angle pixel look. The role label is rendered as absolute-positioned HTML via `EdgeLabelRenderer`.

### 2.6 NodeDetailPanel (Side Panel)

```
packages/ui/src/pages/agent/topology/NodeDetailPanel.tsx
```

A slide-in panel on the right side of the canvas, showing agent summary info. Appears on single-click of a node.

```tsx
import { motion } from 'motion/react'
import type { AgentId } from '@golemancy/shared'
import { useNavigate, useParams } from 'react-router'
import { useAppStore } from '../../../stores'
import { PixelButton, PixelBadge, PixelAvatar } from '../../../components'

interface Props {
  agentId: AgentId
  onClose: () => void
}

export function NodeDetailPanel({ agentId, onClose }: Props) {
  const agents = useAppStore(s => s.agents)
  const agent = agents.find(a => a.id === agentId)
  const navigate = useNavigate()
  const { projectId } = useParams<{ projectId: string }>()

  if (!agent) return null

  return (
    <motion.div
      initial={{ x: 320 }}
      animate={{ x: 0 }}
      exit={{ x: 320 }}
      className="absolute top-0 right-0 h-full w-[300px] bg-surface border-l-2 border-border-dim shadow-pixel-drop p-4 overflow-y-auto z-10"
    >
      {/* Close button */}
      <PixelButton variant="ghost" size="sm" onClick={onClose} className="mb-3">
        &times; Close
      </PixelButton>

      {/* Agent header */}
      <div className="flex items-center gap-3 mb-4">
        <PixelAvatar size="md" initials={agent.name} />
        <div>
          <h3 className="font-pixel text-[10px] text-text-primary">{agent.name}</h3>
          <PixelBadge variant={agent.status}>{agent.status}</PixelBadge>
        </div>
      </div>

      <p className="text-[12px] text-text-secondary mb-4">{agent.description}</p>

      {/* Stats */}
      <div className="flex flex-col gap-2 text-[11px] mb-4">
        <div><span className="text-text-dim">Model:</span> <span className="font-mono text-accent-green">{agent.modelConfig.model ?? 'Inherited'}</span></div>
        <div><span className="text-text-dim">Skills:</span> {agent.skillIds.length}</div>
        <div><span className="text-text-dim">Tools:</span> {agent.tools.length}</div>
        <div><span className="text-text-dim">Sub-Agents:</span> {agent.subAgents.length}</div>
      </div>

      {/* Actions */}
      <PixelButton
        variant="primary"
        className="w-full"
        onClick={() => navigate(`/projects/${projectId}/agents/${agentId}`)}
      >
        Open Agent Detail
      </PixelButton>
    </motion.div>
  )
}
```

### 2.7 TopologyToolbar

```
packages/ui/src/pages/agent/topology/TopologyToolbar.tsx
```

Floating toolbar at top-right of canvas with "Reset Layout" button.

```tsx
import { PixelButton } from '../../../components'

interface Props {
  onResetLayout: () => void
}

export function TopologyToolbar({ onResetLayout }: Props) {
  return (
    <div className="absolute top-3 right-3 z-10 flex gap-2">
      <PixelButton variant="ghost" size="sm" onClick={onResetLayout}>
        Reset Layout
      </PixelButton>
    </div>
  )
}
```

---

## 3. Data Flow

### 3.1 Deriving Nodes & Edges from Agents

```
packages/ui/src/pages/agent/topology/useTopologyData.ts
```

This is the central hook. It:
1. Reads `agents[]` from Zustand store
2. Reads `topologyLayout` (persisted positions) from Zustand store
3. Converts agents to React Flow nodes and edges
4. Applies dagre auto-layout for any nodes without persisted positions
5. Handles node drag → save position (debounced)
6. Handles connect → create SubAgentRef
7. Handles edge delete → remove SubAgentRef

```tsx
import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import {
  useNodesState, useEdgesState,
  type Node, type Edge, type OnConnect, type OnNodesChange, type OnEdgesChange,
} from '@xyflow/react'
import type { AgentId } from '@golemancy/shared'
import { useAppStore } from '../../../stores'
import { useParams } from 'react-router'
import { computeDagreLayout } from './useTopologyLayout'
import type { AgentNodeData } from './AgentNode'
import type { AgentEdgeData } from './AgentEdge'

export function useTopologyData() {
  const { projectId } = useParams<{ projectId: string }>()
  const agents = useAppStore(s => s.agents)
  const updateAgent = useAppStore(s => s.updateAgent)
  const topologyLayout = useAppStore(s => s.topologyLayout)
  const loadTopologyLayout = useAppStore(s => s.loadTopologyLayout)
  const saveTopologyLayout = useAppStore(s => s.saveTopologyLayout)
  const currentProject = useAppStore(s => s.projects.find(p => p.id === projectId))

  const [selectedAgentId, setSelectedAgentId] = useState<AgentId | null>(null)

  // Load layout on mount
  useEffect(() => {
    if (projectId) loadTopologyLayout(projectId)
  }, [projectId])

  // Derive initial nodes from agents
  const rawNodes: Node<AgentNodeData>[] = useMemo(() => {
    return agents.map(agent => ({
      id: agent.id,
      type: 'agentNode',
      position: topologyLayout[agent.id] ?? { x: 0, y: 0 },
      data: {
        agentId: agent.id,
        name: agent.name,
        status: agent.status,
        model: agent.modelConfig.model ?? '',
        skillCount: agent.skillIds.length,
        toolCount: agent.tools.length,
        subAgentCount: agent.subAgents.length,
        isMainAgent: currentProject?.mainAgentId === agent.id,
      },
    }))
  }, [agents, topologyLayout, currentProject?.mainAgentId])

  // Derive edges from subAgents refs
  const rawEdges: Edge<AgentEdgeData>[] = useMemo(() => {
    const edges: Edge<AgentEdgeData>[] = []
    for (const agent of agents) {
      for (const sub of agent.subAgents) {
        // Only create edge if target agent exists
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
  const layoutApplied = useRef(false)
  const initialNodes = useMemo(() => {
    const needsLayout = rawNodes.some(n => !topologyLayout[n.id])
    if (needsLayout || !layoutApplied.current) {
      layoutApplied.current = true
      return computeDagreLayout(rawNodes, rawEdges, topologyLayout)
    }
    return rawNodes
  }, [rawNodes, rawEdges, topologyLayout])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(rawEdges)

  // Sync when agents change externally
  useEffect(() => { setNodes(initialNodes) }, [initialNodes])
  useEffect(() => { setEdges(rawEdges) }, [rawEdges])

  // --- Node drag → save position (debounced) ---
  const saveTimer = useRef<ReturnType<typeof setTimeout>>()
  const onNodeDragStop = useCallback((_: unknown, node: Node) => {
    if (!projectId) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      // Collect all current node positions
      const layout: Record<string, { x: number; y: number }> = {}
      for (const n of nodes) {
        layout[n.id] = n.position
      }
      // Overwrite with latest dragged position
      layout[node.id] = node.position
      saveTopologyLayout(projectId, layout)
    }, 500) // 500ms debounce
  }, [projectId, nodes, saveTopologyLayout])

  // --- Connect → create SubAgentRef ---
  const onConnect: OnConnect = useCallback(async (connection) => {
    if (!connection.source || !connection.target) return
    const sourceAgent = agents.find(a => a.id === connection.source)
    if (!sourceAgent) return
    // Avoid duplicate
    if (sourceAgent.subAgents.some(s => s.agentId === connection.target)) return

    // Prompt for role (use browser prompt for now; can be replaced with modal)
    const role = window.prompt('Enter role for this sub-agent:')
    if (!role) return

    await updateAgent(sourceAgent.id, {
      subAgents: [...sourceAgent.subAgents, { agentId: connection.target as AgentId, role }],
    })
  }, [agents, updateAgent])

  // --- Edge delete → remove SubAgentRef ---
  const onEdgeDelete = useCallback(async (edges: Edge[]) => {
    for (const edge of edges) {
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
    // Recompute dagre layout from scratch (ignore persisted positions)
    const freshLayout = computeDagreLayout(rawNodes, rawEdges, {})
    setNodes(freshLayout)
    // Save reset layout
    const layout: Record<string, { x: number; y: number }> = {}
    for (const n of freshLayout) {
      layout[n.id] = n.position
    }
    await saveTopologyLayout(projectId, layout)
  }, [projectId, rawNodes, rawEdges, saveTopologyLayout])

  return {
    nodes, edges,
    onNodesChange, onEdgesChange,
    onConnect, onEdgeDelete,
    onNodeDragStop,
    resetLayout,
    selectedAgentId, setSelectedAgentId,
  }
}
```

### 3.2 Dagre Layout Computation

```
packages/ui/src/pages/agent/topology/useTopologyLayout.ts
```

```tsx
import dagre from '@dagrejs/dagre'
import type { Node, Edge } from '@xyflow/react'

const NODE_WIDTH = 200
const NODE_HEIGHT = 80

/**
 * Apply dagre auto-layout. Nodes with existing positions in `savedLayout`
 * retain those positions; nodes without get dagre-computed positions.
 */
export function computeDagreLayout<T, E>(
  nodes: Node<T>[],
  edges: Edge<E>[],
  savedLayout: Record<string, { x: number; y: number }>,
): Node<T>[] {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 80 })

  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target)
  }

  dagre.layout(g)

  return nodes.map(node => {
    // Use saved position if available, otherwise use dagre-computed
    if (savedLayout[node.id]) {
      return { ...node, position: savedLayout[node.id] }
    }
    const dagreNode = g.node(node.id)
    return {
      ...node,
      position: {
        x: dagreNode.x - NODE_WIDTH / 2,
        y: dagreNode.y - NODE_HEIGHT / 2,
      },
    }
  })
}
```

**Package note**: Use `@dagrejs/dagre` (the maintained fork under the dagre.js org). The original `dagre` package is unmaintained. Fact Checker should verify the correct package name.

### 3.3 Local Types

```
packages/ui/src/pages/agent/topology/topology-types.ts
```

```tsx
import type { AgentId } from '@golemancy/shared'

/** Layout position for a single node, persisted to server */
export interface TopologyNodePosition {
  x: number
  y: number
}

/** Full topology layout document persisted as JSON */
export type TopologyLayout = Record<AgentId, TopologyNodePosition>
```

---

## 4. Server-Side Changes

### 4.1 New Topology Route

```
packages/server/src/routes/topology.ts
```

Simple REST endpoint for reading/writing the topology layout JSON file.

```tsx
import { Hono } from 'hono'
import type { ProjectId } from '@golemancy/shared'
import { logger } from '../logger'
import { readJson, writeJson } from '../storage/base'
import { getProjectPath, validateId } from '../utils/paths'
import path from 'node:path'

const log = logger.child({ component: 'routes:topology' })

type TopologyLayout = Record<string, { x: number; y: number }>

export function createTopologyRoutes() {
  const app = new Hono()

  function layoutPath(projectId: string): string {
    validateId(projectId)
    return path.join(getProjectPath(projectId), 'topology-layout.json')
  }

  // GET /api/projects/:projectId/topology-layout
  app.get('/', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    log.debug({ projectId }, 'loading topology layout')
    const layout = await readJson<TopologyLayout>(layoutPath(projectId))
    return c.json(layout ?? {})
  })

  // PUT /api/projects/:projectId/topology-layout
  app.put('/', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const layout = await c.req.json<TopologyLayout>()
    log.debug({ projectId }, 'saving topology layout')
    await writeJson(layoutPath(projectId), layout)
    return c.json(layout)
  })

  // DELETE /api/projects/:projectId/topology-layout
  app.delete('/', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    log.debug({ projectId }, 'deleting topology layout')
    await writeJson(layoutPath(projectId), {})
    return c.json({ ok: true })
  })

  return app
}
```

**Design decisions**:
- No new service interface or storage class — topology layout is a simple single-file config (similar to how `settings.json` works). Using `readJson`/`writeJson` directly is sufficient.
- `PUT` replaces the entire layout (not `PATCH`), because the UI always sends the complete position map.
- Route path: `/api/projects/:projectId/topology-layout` — nested under projects, not under agents, because it's project-level config.
- No separate `ITopologyService` interface — this is intentionally lightweight. The layout file is a simple JSON blob, not a domain entity that needs full CRUD abstraction.

### 4.2 Register Route in app.ts

```tsx
// In packages/server/src/app.ts — add:
import { createTopologyRoutes } from './routes/topology'

// Inside createApp():
app.route('/api/projects/:projectId/topology-layout', createTopologyRoutes())
```

Note: `createTopologyRoutes()` takes no dependencies — it uses `readJson`/`writeJson` directly. This keeps it simple and avoids adding a new dep to `ServerDependencies`.

### 4.3 Storage Path

```
~/.golemancy/projects/{projectId}/topology-layout.json
```

Content example:
```json
{
  "agent-abc123": { "x": 100, "y": 50 },
  "agent-def456": { "x": 300, "y": 200 }
}
```

---

## 5. Store Changes

### 5.1 New Topology Slice in Zustand Store

Add to `packages/ui/src/stores/useAppStore.ts`:

```tsx
// --- New slice interface ---
interface TopologySlice {
  topologyLayout: Record<string, { x: number; y: number }>
  topologyLayoutLoading: boolean
}

interface TopologyActions {
  loadTopologyLayout(projectId: ProjectId): Promise<void>
  saveTopologyLayout(projectId: ProjectId, layout: Record<string, { x: number; y: number }>): Promise<void>
}
```

Add to `AppState` union:
```tsx
export type AppState =
  & ProjectSlice & AgentSlice & ... & TopologySlice
  & ProjectActions & AgentActions & ... & TopologyActions
```

### 5.2 Store Implementation

```tsx
// --- Topology state ---
topologyLayout: {},
topologyLayoutLoading: false,

async loadTopologyLayout(projectId: ProjectId) {
  set({ topologyLayoutLoading: true })
  try {
    const layout = await fetchJson<Record<string, { x: number; y: number }>>(
      `${getBaseUrl()}/api/projects/${projectId}/topology-layout`
    )
    set({ topologyLayout: layout ?? {}, topologyLayoutLoading: false })
  } catch {
    set({ topologyLayout: {}, topologyLayoutLoading: false })
  }
},

async saveTopologyLayout(projectId: ProjectId, layout: Record<string, { x: number; y: number }>) {
  set({ topologyLayout: layout })
  await fetchJson(`${getBaseUrl()}/api/projects/${projectId}/topology-layout`, {
    method: 'PUT',
    body: JSON.stringify(layout),
  })
},
```

**Alternative approach**: Instead of going through the service container, topology layout uses `fetchJson` directly in the store action. This is because:
1. Topology layout is not a domain entity that needs `IService` abstraction.
2. No mock implementation is needed (topology is visual-only, not business logic).
3. Keeps `ServiceContainer` clean — avoids adding `ITopologyService` interface to shared package.

However, **if the team prefers consistency**, we can add a minimal `ITopologyLayoutService` to `packages/shared/src/services/interfaces.ts`:

```tsx
export interface ITopologyLayoutService {
  get(projectId: ProjectId): Promise<Record<string, { x: number; y: number }>>
  save(projectId: ProjectId, layout: Record<string, { x: number; y: number }>): Promise<void>
}
```

And wire it through `ServiceContainer` → `HttpTopologyLayoutService`. **Decision for Team Lead**: choose one approach.

### 5.3 Clear on Project Switch

In `selectProject()`, add to the clear block:
```tsx
topologyLayout: {},
topologyLayoutLoading: false,
```

In `clearProject()`, add:
```tsx
topologyLayout: {},
```

---

## 6. New Dependencies

| Package | Purpose | Install to |
|---------|---------|------------|
| `@xyflow/react` | React Flow v12 (topology canvas) | `packages/ui` |
| `@dagrejs/dagre` | Dagre auto-layout for directed graphs | `packages/ui` |
| `@types/dagre` | TypeScript types for dagre (if needed) | `packages/ui` (devDependency) |

**Install commands**:
```bash
pnpm --filter @golemancy/ui add @xyflow/react @dagrejs/dagre
pnpm --filter @golemancy/ui add -D @types/dagre
```

**No server-side dependencies** — topology route uses existing `readJson`/`writeJson`.

---

## 7. React Flow CSS Override Strategy

React Flow ships its own CSS. To match our pixel art theme, add CSS overrides in a dedicated file:

```
packages/ui/src/pages/agent/topology/topology.css
```

```css
/* Override React Flow defaults for pixel art style */
.react-flow__node {
  /* Remove default border-radius */
  border-radius: 0 !important;
}

.react-flow__edge-path {
  stroke-width: 2;
}

.react-flow__controls button {
  border-radius: 0 !important;
  background: var(--color-surface);
  border: 2px solid var(--color-border-dim);
  color: var(--color-text-primary);
}

.react-flow__controls button:hover {
  background: var(--color-elevated);
}

.react-flow__minimap {
  border-radius: 0 !important;
  background: var(--color-deep);
}

.react-flow__background {
  background: var(--color-void);
}
```

Import in `TopologyView.tsx`:
```tsx
import './topology.css'
```

---

## 8. Context Menu (Right-Click Node)

For the right-click context menu requirement, use a simple custom implementation (no extra library needed):

```tsx
// Inside TopologyView.tsx, add onNodeContextMenu handler
const [contextMenu, setContextMenu] = useState<{
  x: number; y: number; agentId: AgentId
} | null>(null)

const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
  event.preventDefault()
  setContextMenu({ x: event.clientX, y: event.clientY, agentId: node.id as AgentId })
}, [])

// Render context menu
{contextMenu && (
  <div
    className="fixed bg-surface border-2 border-border-dim shadow-pixel-drop z-50 py-1"
    style={{ left: contextMenu.x, top: contextMenu.y }}
  >
    <button className="block w-full text-left px-4 py-1.5 text-[11px] text-text-primary hover:bg-elevated">
      Edit Agent
    </button>
    <button className="block w-full text-left px-4 py-1.5 text-[11px] text-text-primary hover:bg-elevated">
      Set as Main Agent
    </button>
    <div className="border-t border-border-dim my-1" />
    <button className="block w-full text-left px-4 py-1.5 text-[11px] text-accent-red hover:bg-elevated">
      Delete Agent
    </button>
  </div>
)}
```

---

## 9. Interaction Summary

| Interaction | Handler | Action |
|-------------|---------|--------|
| Click node | `onNodeClick` | Set `selectedAgentId` → show NodeDetailPanel |
| Double-click node | `onNodeDoubleClick` | `navigate(`/projects/${projectId}/agents/${agentId}`)` |
| Drag node | `onNodeDragStop` | Save positions debounced (500ms) |
| Connect (drag handle) | `onConnect` | Prompt role → `updateAgent()` to add SubAgentRef |
| Delete edge (Backspace/Del) | `onEdgesDelete` | `updateAgent()` to remove SubAgentRef |
| Right-click node | `onNodeContextMenu` | Show context menu (Edit, Delete, Set Main Agent) |
| Double-click pane | `onPaneDoubleClick` | Open AgentCreateModal |
| Click pane | `onPaneClick` | Close NodeDetailPanel + context menu |
| Reset Layout button | `resetLayout()` | Recompute dagre, save, update nodes |
| View switcher | `setViewMode()` | Toggle between Grid and Topology |

---

## 10. Non-Changes (Preserved)

- **Grid view** — zero modifications to existing grid rendering code
- **Agent types** — no changes to `Agent`, `SubAgentRef` in `packages/shared/`
- **Service interfaces** — no changes to existing `IAgentService` etc.
- **Routing** — no new routes needed (topology is rendered within `AgentListPage`, same route `/projects/:projectId/agents`)
- **AgentDetailPage** — no changes

---

## 11. Implementation Task Breakdown

| # | Task | Files | Depends On |
|---|------|-------|------------|
| 1 | Install `@xyflow/react` + `@dagrejs/dagre` | `packages/ui/package.json` | — |
| 2 | Add topology route to server | `packages/server/src/routes/topology.ts`, `packages/server/src/app.ts` | — |
| 3 | Add topology slice to Zustand store | `packages/ui/src/stores/useAppStore.ts` | — |
| 4 | Create topology types file | `packages/ui/src/pages/agent/topology/topology-types.ts` | — |
| 5 | Create dagre layout utility | `packages/ui/src/pages/agent/topology/useTopologyLayout.ts` | 1 |
| 6 | Create AgentNode component | `packages/ui/src/pages/agent/topology/AgentNode.tsx` | 1 |
| 7 | Create AgentEdge component | `packages/ui/src/pages/agent/topology/AgentEdge.tsx` | 1 |
| 8 | Create useTopologyData hook | `packages/ui/src/pages/agent/topology/useTopologyData.ts` | 3, 5, 6, 7 |
| 9 | Create NodeDetailPanel | `packages/ui/src/pages/agent/topology/NodeDetailPanel.tsx` | 6 |
| 10 | Create TopologyToolbar | `packages/ui/src/pages/agent/topology/TopologyToolbar.tsx` | — |
| 11 | Create TopologyView | `packages/ui/src/pages/agent/topology/TopologyView.tsx` | 6, 7, 8, 9, 10 |
| 12 | Create topology.css overrides | `packages/ui/src/pages/agent/topology/topology.css` | 1 |
| 13 | Modify AgentListPage with view switcher | `packages/ui/src/pages/agent/AgentListPage.tsx` | 11 |
| 14 | Write tests | `*.test.ts(x)` files | 2, 8 |

**Parallelizable**: Tasks 1-4 are independent. Tasks 6, 7, 9, 10, 12 are independent after task 1. Tasks 5 needs task 1. Task 8 needs 3+5+6+7. Task 11 needs 6-10. Task 13 needs 11.
