# Fact Check Report: Agent Topology View Technologies

**Date**: 2026-02-12
**Verified by**: Fact Checker
**Sources**: npm registry, reactflow.dev official docs, GitHub xyflow/xyflow, WebSearch cross-references

---

## 1. React Flow (@xyflow/react)

### Package Info

| Item | Value |
|------|-------|
| **Package name** | `@xyflow/react` (NOT `reactflow` — that's the old v11 name) |
| **Latest version** | `12.10.0` |
| **Peer dependencies** | `react: >=17`, `react-dom: >=17` |
| **License** | MIT |
| **Style import** | `import '@xyflow/react/dist/style.css'` (REQUIRED) |

### Installation

```bash
pnpm add @xyflow/react
```

### Import Pattern (v12 — BREAKING from v11)

```typescript
// v12: Named imports only (NO default import)
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  Handle,
  Position,
  Panel,
  BaseEdge,
  useNodesState,
  useEdgesState,
  addEdge,
  getSmoothStepPath,
  applyNodeChanges,
  applyEdgeChanges,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

// OLD v11 (DO NOT USE):
// import ReactFlow from 'reactflow';
```

**Source**: [Installation docs](https://reactflow.dev/learn/getting-started/installation-and-requirements), [Migration guide](https://reactflow.dev/learn/troubleshooting/migrate-to-v12)

### Custom Nodes

Custom nodes are standard React components. Register via `nodeTypes` prop on `<ReactFlow>`.

```typescript
import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

// NodeProps<T> is generic — T extends Node
const AgentNode = memo(({ data, selected, isConnectable, dragging }: NodeProps) => {
  return (
    <div className={`my-custom-node ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Top} isConnectable={isConnectable} />
      <div>{data.label}</div>
      <Handle type="source" position={Position.Bottom} isConnectable={isConnectable} />
    </div>
  );
});

// Register — MUST be defined outside component (stable reference)
const nodeTypes = { agentNode: AgentNode };

// Usage
<ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} />
```

**NodeProps properties** (verified from [API docs](https://reactflow.dev/api-reference/types/node-props)):

| Prop | Type | Description |
|------|------|-------------|
| `id` | `string` | Node unique ID |
| `data` | `T["data"]` | Custom data payload |
| `type` | `string` | Node type key |
| `selected` | `boolean` | Selection state |
| `dragging` | `boolean` | Drag state |
| `isConnectable` | `boolean` | Can connect |
| `width` | `number` | Set width (fixed) |
| `height` | `number` | Set height (fixed) |
| `sourcePosition` | `Position` | Default source handle position |
| `targetPosition` | `Position` | Default target handle position |
| `positionAbsoluteX` | `number` | Absolute X (v12 rename from `xPos`) |
| `positionAbsoluteY` | `number` | Absolute Y (v12 rename from `yPos`) |
| `parentId` | `string` | Parent node (v12 rename from `parentNode`) |
| `draggable` | `boolean` | Can drag |
| `selectable` | `boolean` | Can select |
| `deletable` | `boolean` | Can delete |
| `zIndex` | `number` | Stacking order |
| `dragHandle` | `string` | CSS selector for drag handle |

**Key point**: Custom nodes can contain ANY React component — so PixelCard, icons, etc. are all valid. The node is just a wrapper div.

**Source**: [Custom Nodes example](https://reactflow.dev/examples/nodes/custom-node), [NodeProps API](https://reactflow.dev/api-reference/types/node-props)

### Custom Edges (Step / SmoothStep)

Built-in edge types: `default` (bezier), `straight`, `step`, `smoothstep`.

For custom edges, use `BaseEdge` + path utility:

```typescript
import {
  BaseEdge,
  getSmoothStepPath,
  type EdgeProps,
  Position,
} from '@xyflow/react';

function PixelEdge({
  sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  markerEnd, style,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
    borderRadius: 0,  // 0 = sharp step (pixel style!), default = 5
  });

  return <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />;
}

// Register
const edgeTypes = { pixelEdge: PixelEdge };
<ReactFlow edgeTypes={edgeTypes} />
```

**`getSmoothStepPath` signature** (verified from [API docs](https://reactflow.dev/api-reference/utils/get-smooth-step-path)):

```typescript
getSmoothStepPath(options: {
  sourceX: number;
  sourceY: number;
  sourcePosition?: Position;    // default: Position.Bottom
  targetX: number;
  targetY: number;
  targetPosition?: Position;    // default: Position.Top
  borderRadius?: number;        // default: 5 (set 0 for sharp corners)
  centerX?: number;
  centerY?: number;
  offset?: number;              // default: 20
  stepPosition?: number;        // default: 0.5 (0=source, 1=target)
}): [path: string, labelX: number, labelY: number, offsetX: number, offsetY: number]
```

**Source**: [Custom Edges example](https://reactflow.dev/examples/edges/custom-edges), [getSmoothStepPath API](https://reactflow.dev/api-reference/utils/get-smooth-step-path)

### Event Handlers

All verified from [ReactFlow component API](https://reactflow.dev/api-reference/react-flow):

```typescript
<ReactFlow
  // Node events
  onNodeClick={(event: React.MouseEvent, node: Node) => { /* select/navigate */ }}
  onNodeDoubleClick={(event: React.MouseEvent, node: Node) => { /* open editor */ }}
  onNodeDragStop={(event: React.MouseEvent, node: Node, nodes: Node[]) => { /* save position */ }}

  // Connection event
  onConnect={(connection: Connection) => {
    // connection = { source, target, sourceHandle, targetHandle }
    setEdges((eds) => addEdge(connection, eds));
  }}

  // Controlled flow (required for interactivity)
  onNodesChange={onNodesChange}  // type: OnNodesChange<Node>
  onEdgesChange={onEdgesChange}  // type: OnEdgesChange<Edge>
/>
```

**Type signatures**:
- `onNodeClick: NodeMouseHandler<Node>` → `(event: React.MouseEvent, node: Node) => void`
- `onNodeDoubleClick: NodeMouseHandler<Node>` → same
- `onNodeDragStop: OnNodeDrag<Node>` → `(event: React.MouseEvent, node: Node, nodes: Node[]) => void`
- `onConnect: OnConnect` → `(connection: Connection) => void`

### MiniMap & Controls

Both imported from `@xyflow/react` (same package, no extra install):

```typescript
import { ReactFlow, MiniMap, Controls } from '@xyflow/react';

<ReactFlow nodes={nodes} edges={edges}>
  <MiniMap
    nodeColor={(node) => node.type === 'mainAgent' ? '#4ade80' : '#94a3b8'}
    nodeStrokeWidth={2}
    nodeBorderRadius={0}   // pixel style: no rounding
    pannable={true}
    zoomable={true}
    position="bottom-right"
  />
  <Controls
    position="bottom-left"
    orientation="vertical"
    showInteractive={false}
  />
</ReactFlow>
```

**MiniMap key props** ([API docs](https://reactflow.dev/api-reference/components/minimap)):
- `nodeColor`: `string | ((node: Node) => string)` — default `"#e2e2e2"`
- `nodeBorderRadius`: `number` — default `5` (set to `0` for pixel style)
- `pannable` / `zoomable`: `boolean` — default `false`
- `bgColor`: `string` — minimap background

**Controls key props** ([API docs](https://reactflow.dev/api-reference/components/controls)):
- `showZoom` / `showFitView` / `showInteractive`: `boolean` — all default `true`
- `orientation`: `"horizontal" | "vertical"` — default `"vertical"`
- `position`: `PanelPosition`

### Dark Theme / Custom Theming

React Flow v12 has built-in dark mode via `colorMode` prop:

```typescript
<ReactFlow colorMode="dark" nodes={nodes} edges={edges}>
```

**How it works**: Adds `.dark` or `.light` class to `.react-flow` root element. All styling is CSS-variable based.

**Key CSS variables available for override**:
- `--xy-edge-stroke-default` (default: `#b1b1b7`)
- `--xy-edge-stroke-width-default` (default: `1`)
- `--xy-node-background-color-default` (default: `#fff`)
- `--xy-node-border-default` (default: `1px solid #1a192b`)
- `--xy-handle-background-color-default` (default: `#1a192b`)
- `--xy-selection-background-color-default`
- `--xy-controls-button-background-color-default`
- 30+ more variables

**Custom override example**:
```css
.react-flow.dark {
  --xy-node-background-color-default: var(--color-surface);
  --xy-node-border-default: 2px solid var(--color-border);
  --xy-edge-stroke-default: var(--color-text-muted);
  --xy-handle-background-color-default: var(--color-primary);
}
```

**Alternative**: Import only base styles `import '@xyflow/react/dist/base.css'` for full CSS control.

**Source**: [Theming docs](https://reactflow.dev/learn/customization/theming), [Dark Mode example](https://reactflow.dev/examples/styling/dark-mode)

### Handle Component

```typescript
import { Handle, Position } from '@xyflow/react';

<Handle
  type="source"          // 'source' | 'target'
  position={Position.Bottom}  // Top, Bottom, Left, Right
  id="output-1"          // unique ID when multiple handles
  isConnectable={true}
  isConnectableStart={true}
  isConnectableEnd={true}
  style={{ background: '#4ade80', width: 8, height: 8, borderRadius: 0 }}
  className="pixel-handle"
/>
```

**Source**: [Handle API](https://reactflow.dev/api-reference/components/handle)

### v12 Breaking Changes (Gotchas)

| Change | Old (v11) | New (v12) |
|--------|-----------|-----------|
| Package name | `reactflow` | `@xyflow/react` |
| Import style | Default import | Named imports |
| CSS import | `reactflow/dist/style.css` | `@xyflow/react/dist/style.css` |
| Node dimensions | `node.width` / `node.height` | `node.measured.width` / `node.measured.height` (for reading measured values) |
| Parent reference | `parentNode` | `parentId` |
| Position props | `xPos` / `yPos` | `positionAbsoluteX` / `positionAbsoluteY` |
| Edge update | `onEdgeUpdate` | `onReconnect` |
| No mutation | Could mutate node/edge | Must spread: `{ ...node, data: newData }` |

**Critical for dagre integration**: When reading measured dimensions for layout calculation, use `node.measured.width` / `node.measured.height` in v12 (not `node.width`).

**Source**: [Migration guide](https://reactflow.dev/learn/troubleshooting/migrate-to-v12)

---

## 2. Dagre (@dagrejs/dagre)

### Package Info

| Item | Value |
|------|-------|
| **Package name** | `@dagrejs/dagre` (NOT `dagre` — old unmaintained) |
| **Latest version** | `2.0.4` |
| **TypeScript types** | `@types/dagre` (v0.7.53, compatible) |
| **GitHub** | [dagrejs/dagre](https://github.com/dagrejs/dagre) |

### Installation

```bash
pnpm add @dagrejs/dagre
pnpm add -D @types/dagre
```

**WARNING**: The old `dagre` package (v0.8.5) is unmaintained for 6+ years. ONLY use `@dagrejs/dagre`.

### Integration with React Flow (Complete Pattern)

```typescript
import dagre from '@dagrejs/dagre';
import { Position, type Node, type Edge } from '@xyflow/react';

const dagreGraph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));

const NODE_WIDTH = 200;
const NODE_HEIGHT = 80;

function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  direction: 'TB' | 'LR' = 'TB'
): { nodes: Node[]; edges: Edge[] } {
  const isHorizontal = direction === 'LR';

  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: 50,     // horizontal spacing between nodes
    ranksep: 80,     // vertical spacing between ranks
    edgesep: 10,
  });

  // Register nodes with dimensions
  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  // Register edges
  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  // Compute layout
  dagre.layout(dagreGraph);

  // Apply positions (dagre uses center-anchor, React Flow uses top-left)
  const layoutedNodes = nodes.map((node) => {
    const pos = dagreGraph.node(node.id);
    return {
      ...node,
      targetPosition: isHorizontal ? Position.Left : Position.Top,
      sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}
```

**Key API**:
- `new dagre.graphlib.Graph()` — create graph
- `.setDefaultEdgeLabel(() => ({}))` — required for edge data
- `.setGraph({ rankdir, nodesep, ranksep })` — configure layout direction & spacing
- `.setNode(id, { width, height })` — register node dimensions
- `.setEdge(sourceId, targetId)` — register edge
- `dagre.layout(graph)` — compute positions (mutates graph in-place)
- `.node(id)` — read computed `{ x, y }` (center-anchored)

**Layout options** (`setGraph`):
- `rankdir`: `'TB'` (top-bottom) | `'BT'` | `'LR'` (left-right) | `'RL'`
- `nodesep`: Horizontal spacing (default 50)
- `ranksep`: Vertical spacing between ranks (default 50)
- `edgesep`: Edge spacing (default 10)
- `marginx` / `marginy`: Graph margins

**Limitation**: Dagre provides **static** layout only — positions are calculated once. For a tree topology, this is perfectly fine (we recalculate when agents change).

**Source**: [React Flow Dagre example](https://reactflow.dev/examples/layout/dagre), [dagre GitHub](https://github.com/dagrejs/dagre)

---

## 3. React Flow + Pixel Art Styling

### Custom Nodes with Arbitrary React Components

**VERIFIED: YES.** Custom nodes are standard React components that render inside a div. Any React component tree works:

```typescript
import { PixelCard } from '@/components/base/PixelCard';
import { Handle, Position, type NodeProps } from '@xyflow/react';

const AgentNode = memo(({ data, selected }: NodeProps) => (
  <div>
    <Handle type="target" position={Position.Top} />
    <PixelCard className={selected ? 'ring-2 ring-primary' : ''}>
      <div className="flex items-center gap-2">
        <img src={data.avatar} className="w-8 h-8 pixelated" />
        <span className="font-pixel text-xs">{data.name}</span>
      </div>
    </PixelCard>
    <Handle type="source" position={Position.Bottom} />
  </div>
));
```

The only constraint: The node component MUST include `<Handle>` components for connections.

### Edge CSS Styling

**VERIFIED: YES.** Edges can be styled via:

1. **`style` prop on edge data**: `{ style: { stroke: '#4ade80', strokeWidth: 2 } }`
2. **CSS classes**: `.react-flow__edge-path { stroke-dasharray: 5 5; }`
3. **Custom edge components**: Full SVG control via `BaseEdge`

For pixel style, set `borderRadius: 0` in `getSmoothStepPath` for sharp 90° corners.

### Handle Styling

**VERIFIED: YES.** Handles are `<div>` elements that accept `style` and `className`:

```css
/* Pixel-style handles */
.react-flow .react-flow__handle {
  width: 8px;
  height: 8px;
  border-radius: 0;       /* square, pixel style */
  background: var(--color-primary);
  border: 2px solid var(--color-border);
}
```

Or inline:
```tsx
<Handle
  type="source"
  position={Position.Bottom}
  style={{ width: 8, height: 8, borderRadius: 0, background: '#4ade80' }}
/>
```

### Container Requirement

**IMPORTANT GOTCHA**: `<ReactFlow>` requires a parent with explicit `width` and `height`. Typically:

```tsx
<div style={{ width: '100%', height: '100%' }}>
  <ReactFlow ... />
</div>
```

Or with Tailwind: `<div className="w-full h-full">`

---

## 4. Summary & Recommendations

### Install Commands

```bash
pnpm add @xyflow/react @dagrejs/dagre
pnpm add -D @types/dagre
```

### Gotchas Checklist

1. **Import `@xyflow/react` not `reactflow`** — v12 renamed package
2. **Import CSS** — `import '@xyflow/react/dist/style.css'` is REQUIRED
3. **Named imports only** — no default import
4. **`nodeTypes` must be stable** — define outside component or `useMemo`
5. **Node dimensions for dagre** — use `node.measured.width/height` for reading, fixed constants for layout
6. **Dagre center-anchor** — subtract half width/height when converting to React Flow positions
7. **No mutation** — always spread `{ ...node }` in v12
8. **Container size** — parent div MUST have explicit width/height
9. **`parentNode` → `parentId`** in v12
10. **`@dagrejs/dagre` not `dagre`** — the old package is abandoned

### Compatibility with Golemancy

- React `>=17` required → Golemancy uses React 18+ ✅
- Dark mode via `colorMode="dark"` + CSS variables → integrates with our dark theme ✅
- Custom nodes support any React components → PixelCard, icons, etc. ✅
- `borderRadius: 0` everywhere → pixel art style ✅
- `nodeBorderRadius: 0` on MiniMap → pixel style minimap ✅
- Step edges with `borderRadius: 0` → sharp 90° pixel corners ✅
