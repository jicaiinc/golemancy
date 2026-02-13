# Agent Topology View — UI Design Spec

> Designer: UI/UX Designer
> Date: 2026-02-12
> Status: Draft
> References: `_requirement/20260212-agent-topology-view.md`, `_docs/ui-design-system.md`

---

## 1. Agent Node (Custom React Flow Node)

### 1.1 Layout

```
┌─────────────────────────────────────────┐
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│ ← 4px status bar (full width)
│                                         │
│  [Avatar]  Agent Name        [Badge]    │
│            model-name                   │
│                                         │
│  ─────────────────────────────────────  │ ← 2px border-dim divider
│  3 skills · 2 tools · 1 sub-agent      │
│                                         │
■                                         ■ ← Source/target handles (square)
└─────────────────────────────────────────┘
```

### 1.2 Sizing

| Property | Value | Tailwind |
|----------|-------|----------|
| Width | 240px | `w-[240px]` |
| Min-height | auto (content-driven) | — |
| Padding | 0 (status bar flush) + 12px inner | `p-0` outer, `p-3` inner content |
| Status bar height | 4px | `h-1` |
| Avatar size | 32px (sm) | PixelAvatar `size="sm"` |
| Gap between avatar and text | 8px | `gap-2` |
| Divider margin | 8px top/bottom | `my-2` |

### 1.3 Colors & Backgrounds

| Element | Default | Hover | Selected |
|---------|---------|-------|----------|
| Background | `bg-surface` (#1E2430) | `bg-elevated` (#2A3242) | `bg-elevated` |
| Border | 2px `border-border-dim` (#2E3A4E) | 2px `border-border-bright` (#4A5568) | 2px `border-accent-blue` (#60A5FA) |
| Shadow | `shadow-pixel-raised` | `shadow-pixel-raised` | `shadow-pixel-raised` + `0 0 0 2px rgba(96,165,250,0.3)` glow |
| Drop shadow | none (flat on canvas) | `shadow-pixel-drop` (4px 4px 0 rgba(0,0,0,0.5)) | `shadow-pixel-drop` |

**Tailwind classes (default state)**:
```
bg-surface border-2 border-border-dim
shadow-[inset_2px_2px_0_0_rgba(255,255,255,0.08),inset_-2px_-2px_0_0_rgba(0,0,0,0.3)]
cursor-pointer transition-colors
```

**Tailwind classes (hover — applied via React Flow node interaction)**:
```
bg-elevated border-border-bright
shadow-[inset_2px_2px_0_0_rgba(255,255,255,0.08),inset_-2px_-2px_0_0_rgba(0,0,0,0.3),4px_4px_0_0_rgba(0,0,0,0.5)]
```

**Tailwind classes (selected)**:
```
bg-elevated border-accent-blue
shadow-[inset_2px_2px_0_0_rgba(255,255,255,0.08),inset_-2px_-2px_0_0_rgba(0,0,0,0.3),4px_4px_0_0_rgba(0,0,0,0.5),0_0_0_2px_rgba(96,165,250,0.3)]
```

### 1.4 Status Bar

4px tall strip at the very top of the node, spanning the full width. Color and animation match the existing agent card pattern from `AgentListPage.tsx`:

| Status | Color | Animation | Tailwind |
|--------|-------|-----------|----------|
| idle | `bg-text-secondary` (#8B95A5) | none | `bg-text-secondary` |
| running | `bg-accent-green` (#4ADE80) | pixel-pulse 1s steps(2) | `bg-accent-green animate-[pixel-pulse_1s_steps(2)_infinite]` |
| error | `bg-accent-red` (#F87171) | pixel-shake 0.3s steps(3) | `bg-accent-red animate-[pixel-shake_0.3s_steps(3)_infinite]` |
| paused | `bg-accent-amber` (#FBBF24) | pixel-blink 2s steps(2) | `bg-accent-amber animate-[pixel-blink_2s_steps(2)_infinite]` |

### 1.5 Typography

| Element | Font | Size | Color | Tailwind |
|---------|------|------|-------|----------|
| Agent name | Press Start 2P | 10px/16px | `text-primary` | `font-pixel text-[10px] leading-[16px] text-text-primary` |
| Status badge | Press Start 2P | 8px/12px | (per variant) | PixelBadge component |
| Model name | JetBrains Mono | 11px/16px | `text-dim` | `font-mono text-[11px] text-text-dim` |
| Meta counts | JetBrains Mono | 11px/16px | `text-secondary` | `font-mono text-[11px] text-text-secondary` |
| Sub-agent count | JetBrains Mono | 11px/16px | `accent-purple` | `font-mono text-[11px] text-accent-purple` |

### 1.6 Main Agent Indicator

The project's Main Agent is visually distinguished with:

1. **Crown icon** — A small pixel-art crown (16x16) rendered above the node, centered horizontally
   - Color: `mc-gold` (#FCDB05)
   - Implementation: CSS pseudo-element or absolute-positioned SVG
   - Position: `absolute -top-5 left-1/2 -translate-x-1/2`

2. **Gold border** — Instead of the default `border-dim`, the main agent gets:
   - Border color: `mc-gold` (#FCDB05) at 60% opacity
   - Tailwind: `border-mc-gold/60`

3. **Label** — Small "MAIN" text above the name:
   - Font: Press Start 2P, 8px
   - Color: `mc-gold`
   - Tailwind: `font-pixel text-[8px] text-mc-gold`

### 1.7 Connection Handles

Square pixel-art handles (not circular — pixel art has no circles):

| Property | Value |
|----------|-------|
| Shape | Square (0 border-radius, enforced globally) |
| Size | 8px x 8px |
| Background | `border-bright` (#4A5568) |
| Border | 2px solid `border-dim` (#2E3A4E) |
| Hover background | `accent-cyan` (#22D3EE) |
| Active/connecting | `accent-green` (#4ADE80) |
| Position | Left (target) and Right (source), vertically centered |

**CSS override for React Flow handles**:
```css
.react-flow__handle {
  width: 8px !important;
  height: 8px !important;
  border-radius: 0 !important;
  background: #4A5568 !important;
  border: 2px solid #2E3A4E !important;
}
.react-flow__handle:hover {
  background: #22D3EE !important;
}
.react-flow__handle-connecting {
  background: #4ADE80 !important;
}
```

### 1.8 Dragging State

When a node is being dragged:
- Slight scale: `transform: scale(1.02)`
- Enhanced drop shadow: `8px 8px 0 rgba(0,0,0,0.5)` (doubled offset)
- Opacity: 0.9
- Cursor: `grabbing`

---

## 2. Edge (Custom React Flow Edge)

### 2.1 Edge Type

**Step Edge** (`smoothstep` with `borderRadius: 0` or custom step path):
- Right-angle turns only — no curves
- Path connects from source handle (right side) to target handle (left side)
- React Flow's `SmoothStepEdge` with `borderRadius={0}` achieves the step look

### 2.2 Edge Styling

| Property | Default | Hover | Selected |
|----------|---------|-------|----------|
| Stroke color | `border-bright` (#4A5568) | `accent-cyan` (#22D3EE) | `accent-cyan` (#22D3EE) |
| Stroke width | 2px | 2px | 3px |
| Stroke dasharray | none (solid) | none | none |
| Animation | none | none | none |

### 2.3 Arrowhead (Pixel-Art Marker)

Custom SVG marker — a pixel-style arrowhead made of stacked rectangles:

```
    ██
  ████
████████  →  direction of flow
  ████
    ██
```

SVG implementation (8x8 pixel arrowhead):
```svg
<marker id="pixel-arrow" viewBox="0 0 8 8" refX="8" refY="4"
        markerWidth="8" markerHeight="8" orient="auto-start-reverse">
  <path d="M0,3 L0,5 L2,5 L2,6 L4,6 L4,7 L6,7 L6,8 L8,8 L8,0 L6,0 L6,1 L4,1 L4,2 L2,2 L2,3 Z"
        fill="#4A5568" />
</marker>
```

- Default fill: `border-bright` (#4A5568)
- Hover/selected fill: `accent-cyan` (#22D3EE)
- Size: 8x8px

### 2.4 Role Label

Displayed at the midpoint of the edge:

| Property | Value | Tailwind |
|----------|-------|----------|
| Font | JetBrains Mono | `font-mono` |
| Size | 10px/14px | `text-[10px] leading-[14px]` |
| Color | `accent-purple` (#A78BFA) | `text-accent-purple` |
| Background | `deep` (#141820) | `bg-deep` |
| Padding | 2px 6px | `px-1.5 py-0.5` |
| Border | 2px solid `border-dim` | `border-2 border-border-dim` |

The label is rendered as a React Flow `EdgeLabelRenderer` component, positioned using `getBezierPath` or `getSmoothStepPath` midpoint.

Interaction: Click the label to edit the role text inline. On hover, background brightens to `bg-surface`.

### 2.5 Connection Line (during drag-to-connect)

When a user drags from a handle to create a new connection:
- Stroke: `accent-cyan` (#22D3EE)
- Width: 2px
- Stroke dasharray: `4 4` (dashed to indicate "potential connection")
- No arrowhead during drag

---

## 3. View Switcher

### 3.1 Placement

In the page header area (same row as "Agents" title and "+ New Agent" button), between the title text and the create button:

```
┌─────────────────────────────────────────────────────────────┐
│  Agents                   [Grid | Topology]    [+ New Agent] │
│  3 agents in this project                                    │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Button Group Style

Two PixelButton components in a joined group (no gap, shared border):

```
┌──────────┬───────────┐
│  ≡ Grid  │  ◇ Topo   │
└──────────┴───────────┘
```

| Property | Active Tab | Inactive Tab |
|----------|------------|--------------|
| Background | `bg-elevated` (#2A3242) | transparent |
| Text color | `text-primary` (#E8ECF1) | `text-secondary` (#8B95A5) |
| Border | 2px `border-bright` (#4A5568) | 2px `border-dim` (#2E3A4E) |
| Shadow | `pixel-raised` | none |
| Font | JetBrains Mono, 12px | JetBrains Mono, 12px |

**Implementation**: Two `PixelButton variant="ghost"` with conditional active styling. Wrapped in a `div` with `flex` and the shared outer border:

```tsx
<div className="flex border-2 border-border-dim">
  <button className={active === 'grid' ? 'bg-elevated text-text-primary ...' : 'text-text-secondary ...'}>
    Grid
  </button>
  <button className={active === 'topology' ? 'bg-elevated text-text-primary ...' : 'text-text-secondary ...'}>
    Topology
  </button>
</div>
```

**Size**: Each button is `h-7 px-3 text-[12px]` (PixelButton `sm` size).

### 3.3 Icons

- Grid view: `≡` (three horizontal lines, can use a simple grid icon as text or inline SVG, 12x12)
- Topology view: Simple node-and-line icon (two squares connected by a line, 12x12)

Icons are placed before the label text with `gap-1.5`.

---

## 4. Side Panel (Node Detail)

### 4.1 Trigger

Single-click on a node opens the side panel. Clicking another node switches content. Clicking the canvas or pressing Escape closes it.

### 4.2 Layout

Slides in from the right edge of the canvas area:

```
┌─────────────────────────────────┬──────────────────────────┐
│                                 │  AGENT DETAIL            │
│                                 │                          │
│         Canvas (shrinks)        │  [Avatar]  Agent Name    │
│                                 │           ● Running      │
│                                 │                          │
│                                 │  Description text here   │
│                                 │  that wraps to multiple  │
│                                 │  lines...                │
│                                 │                          │
│                                 │  ──────────────────────  │
│                                 │  MODEL                   │
│                                 │  gpt-4o                  │
│                                 │                          │
│                                 │  ──────────────────────  │
│                                 │  CAPABILITIES            │
│                                 │  3 skills                │
│                                 │  2 tools                 │
│                                 │  1 MCP server            │
│                                 │                          │
│                                 │  ──────────────────────  │
│                                 │  SUB-AGENTS              │
│                                 │  → Writer (Content)      │
│                                 │  → Researcher (Research) │
│                                 │                          │
│                                 │  ──────────────────────  │
│                                 │  [Open Detail] [Chat]    │
│                                 │                          │
└─────────────────────────────────┴──────────────────────────┘
```

### 4.3 Sizing

| Property | Value | Tailwind |
|----------|-------|----------|
| Width | 320px | `w-[320px]` |
| Height | 100% of canvas | `h-full` |
| Padding | 16px | `p-4` |
| Background | `bg-deep` (#141820) | `bg-deep` |
| Border-left | 2px solid `border-dim` | `border-l-2 border-border-dim` |

### 4.4 Content Sections

| Section | Typography | Details |
|---------|-----------|---------|
| **Header** | — | PixelAvatar `md` (40px) + name (font-pixel 10px) + PixelBadge status |
| **Description** | JetBrains Mono 12px, text-secondary | `line-clamp-4` |
| **Model** | Label: font-pixel 8px text-dim "MODEL" / Value: font-mono 12px text-accent-blue | — |
| **Capabilities** | Label: font-pixel 8px text-dim / Items: font-mono 11px text-secondary | Counts for skills, tools, MCP servers |
| **Sub-Agents** | Label: font-pixel 8px text-dim / Items: font-mono 11px text-accent-purple | Each with role in parentheses |
| **Actions** | Two PixelButton sm | "Open Detail" (primary), "Chat" (secondary) |

Section dividers: `border-t-2 border-border-dim my-3`

### 4.5 Animation

Slide-in from right using `motion/react`:

```typescript
// Panel animation
const panelTransition = {
  initial: { x: 320, opacity: 0 },
  animate: { x: 0, opacity: 1 },
  exit: { x: 320, opacity: 0 },
  transition: { duration: 0.25 },
}
```

Wrap in `AnimatePresence` for enter/exit.

### 4.6 Close Button

Top-right corner of the panel:
- `PixelButton variant="ghost" size="sm"` with `×` text
- Position: `absolute top-4 right-4`

---

## 5. Context Menu (Right-click)

### 5.1 Style

Follows the PixelDropdown pattern exactly:

| Property | Value | Tailwind |
|----------|-------|----------|
| Background | `bg-surface` (#1E2430) | `bg-surface` |
| Border | 2px `border-bright` (#4A5568) | `border-2 border-border-bright` |
| Shadow | pixel-elevated | `shadow-[inset_2px_2px_0_0_rgba(255,255,255,0.08),inset_-2px_-2px_0_0_rgba(0,0,0,0.3),4px_4px_0_0_rgba(0,0,0,0.5)]` |
| Min-width | 180px | `min-w-[180px]` |
| Z-index | 50 | `z-50` |

### 5.2 Menu Items

| Item | Icon | Text Color | Note |
|------|------|------------|------|
| Edit Agent | — | `text-primary` | Navigates to AgentDetailPage |
| Set as Main Agent | crown-pixel | `text-mc-gold` | Only shown if not already main |
| ─ divider ─ | — | — | `border-t-2 border-border-dim` |
| Delete Agent | — | `text-accent-red` | Danger action |

Each item:
- Padding: `px-3 py-2`
- Font: JetBrains Mono, 12px
- Hover: `bg-elevated`
- Cursor: pointer
- Transition: `transition-colors`

### 5.3 Animation

Same as PixelDropdown — `dropdownTransition` from `lib/motion.ts`:

```typescript
{
  initial: { opacity: 0, y: -4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: { duration: 0.15 },
}
```

### 5.4 Canvas Context Menu (right-click on blank area)

| Item | Text Color | Action |
|------|------------|--------|
| Create Agent | `text-accent-green` | Opens AgentCreateModal |
| Reset Layout | `text-text-primary` | Clears saved positions, re-runs dagre |

---

## 6. Canvas

### 6.1 Background

Pixel-art dot grid pattern on `bg-void` (#0B0E14):

```css
.topology-canvas {
  background-color: #0B0E14;
  background-image: radial-gradient(circle, #2E3A4E 1px, transparent 1px);
  background-size: 24px 24px;
}
```

- Dot color: `border-dim` (#2E3A4E) — subtle, doesn't compete with nodes
- Dot size: 1px radius (2px diameter)
- Grid spacing: 24px (multiple of 4px base grid)

**React Flow CSS override**:
```css
.react-flow__background {
  /* Override default React Flow background */
}
```

Alternatively, use React Flow's `<Background>` component with variant `dots`, color `#2E3A4E`, gap `24`, size `1`.

### 6.2 Minimap

Position: Bottom-right corner.

| Property | Value |
|----------|-------|
| Position | `bottom-4 right-4` (16px from edges) |
| Width | 160px |
| Height | 120px |
| Background | `bg-deep` (#141820) at 90% opacity |
| Border | 2px solid `border-dim` |
| Node color | `border-bright` (#4A5568) |
| Viewport indicator | `accent-blue` (#60A5FA) at 30% opacity |
| Shadow | `pixel-drop` |

**React Flow Minimap override CSS**:
```css
.react-flow__minimap {
  background: rgba(20, 24, 32, 0.9) !important;
  border: 2px solid #2E3A4E !important;
  border-radius: 0 !important;
  box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.5) !important;
}
```

### 6.3 Controls (Zoom)

Position: Bottom-left corner, vertical stack.

Buttons use pixel-art style matching PixelButton `ghost` variant:

```
┌─────┐
│  +  │  ← Zoom in
├─────┤
│  −  │  ← Zoom out
├─────┤
│  ⟲  │  ← Fit view
├─────┤
│  ⊞  │  ← Reset layout (dagre)
└─────┘
```

| Property | Value |
|----------|-------|
| Position | `bottom-4 left-4` |
| Button size | 32px x 32px each |
| Background | `bg-surface` (#1E2430) |
| Border | 2px solid `border-dim` |
| Hover | `bg-elevated` |
| Text | 16px, `text-secondary`, hover `text-primary` |
| Shadow | `pixel-raised` |
| Gap between buttons | 0 (stacked with shared borders) |

**React Flow Controls override CSS**:
```css
.react-flow__controls {
  box-shadow: none !important;
  border: 2px solid #2E3A4E !important;
  border-radius: 0 !important;
}
.react-flow__controls-button {
  width: 32px !important;
  height: 32px !important;
  background: #1E2430 !important;
  border: none !important;
  border-bottom: 2px solid #2E3A4E !important;
  border-radius: 0 !important;
  color: #8B95A5 !important;
  box-shadow: inset 2px 2px 0 0 rgba(255,255,255,0.08),
              inset -2px -2px 0 0 rgba(0,0,0,0.3) !important;
}
.react-flow__controls-button:hover {
  background: #2A3242 !important;
  color: #E8ECF1 !important;
}
.react-flow__controls-button:last-child {
  border-bottom: none !important;
}
```

### 6.4 Reset Layout Button

Added as an extra control button below the standard zoom controls (or as a separate PixelButton):
- Icon: Grid/auto-layout icon
- Tooltip: "Reset Layout"
- Action: Clear saved positions, re-run dagre auto layout

---

## 7. Animations

### 7.1 Node Appear (Initial Load / New Agent)

Nodes stagger in using the existing `staggerContainer` + `staggerItem` pattern:

```typescript
// For initial load, animate each node with stagger
const nodeAppear = {
  initial: { opacity: 0, scale: 0.8, y: 12 },
  animate: { opacity: 1, scale: 1, y: 0 },
  transition: { duration: 0.25, delay: index * 0.06 },
}
```

This means React Flow nodes get their positions immediately (from dagre), but the visual appearance is staggered with a subtle scale + fade + rise effect.

### 7.2 Node Disappear (Agent Deleted)

```typescript
const nodeDisappear = {
  exit: { opacity: 0, scale: 0.8 },
  transition: { duration: 0.2 },
}
```

### 7.3 Edge Appear

Edges fade in after their source and target nodes have appeared:

```typescript
const edgeAppear = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: 0.3, delay: 0.2 },  // slight delay after nodes
}
```

For SVG path animation, use `stroke-dashoffset` + `stroke-dasharray` to create a "drawing" effect:
```css
.edge-appear {
  stroke-dasharray: 1000;
  stroke-dashoffset: 1000;
  animation: draw-edge 0.5s steps(8) forwards;
  animation-delay: 0.3s;
}
@keyframes draw-edge {
  to { stroke-dashoffset: 0; }
}
```

### 7.4 View Switch (Grid <-> Topology)

Cross-fade between views using `AnimatePresence` with `mode="wait"`:

```typescript
// Grid view exit
const gridExit = {
  exit: { opacity: 0, scale: 0.98 },
  transition: { duration: 0.2 },
}

// Topology view enter
const topologyEnter = {
  initial: { opacity: 0, scale: 0.98 },
  animate: { opacity: 1, scale: 1 },
  transition: { duration: 0.3 },
}
```

Both views occupy the same container. The transition is a simple opacity crossfade with a subtle scale.

### 7.5 Side Panel

See Section 4.5 — slide from right, 250ms duration.

### 7.6 Context Menu

See Section 5.3 — dropdown transition, 150ms.

---

## 8. Complete Node Component Structure

```tsx
// Pseudo-code for AgentNode custom component

function AgentNode({ data, selected }: NodeProps<AgentNodeData>) {
  const { agent, isMainAgent } = data

  return (
    <div className={cn(
      // Base
      'w-[240px] bg-surface border-2 border-border-dim',
      'shadow-[inset_2px_2px_0_0_rgba(255,255,255,0.08),inset_-2px_-2px_0_0_rgba(0,0,0,0.3)]',
      'cursor-pointer transition-colors relative overflow-hidden',
      // Main agent gold border
      isMainAgent && 'border-mc-gold/60',
      // Selected state
      selected && 'bg-elevated border-accent-blue shadow-[inset_2px_2px_0_0_rgba(255,255,255,0.08),inset_-2px_-2px_0_0_rgba(0,0,0,0.3),4px_4px_0_0_rgba(0,0,0,0.5),0_0_0_2px_rgba(96,165,250,0.3)]',
    )}>
      {/* Status bar */}
      <div className={cn(
        'h-1 w-full',
        statusBarColor[agent.status],
        statusAnimation[agent.status],
      )} />

      {/* Main agent label */}
      {isMainAgent && (
        <div className="px-3 pt-1.5">
          <span className="font-pixel text-[8px] text-mc-gold">MAIN</span>
        </div>
      )}

      {/* Content */}
      <div className="p-3 pt-2">
        <div className="flex items-center gap-2">
          <PixelAvatar
            size="sm"
            initials={agent.name}
            status={mapStatus(agent.status)}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-pixel text-[10px] text-text-primary truncate">
                {agent.name}
              </span>
              <PixelBadge variant={agent.status}>
                {agent.status}
              </PixelBadge>
            </div>
            {agent.modelConfig.model && (
              <div className="font-mono text-[11px] text-text-dim mt-0.5 truncate">
                {agent.modelConfig.model}
              </div>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="border-t-2 border-border-dim my-2" />

        {/* Meta */}
        <div className="flex items-center gap-2 flex-wrap text-[11px]">
          {skillCount > 0 && (
            <span className="text-text-secondary">{skillCount} skill{s}</span>
          )}
          {toolCount > 0 && (
            <span className="text-text-secondary">{toolCount} tool{s}</span>
          )}
          {subAgentCount > 0 && (
            <span className="text-accent-purple">{subAgentCount} sub-agent{s}</span>
          )}
        </div>
      </div>

      {/* Handles */}
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  )
}
```

---

## 9. Edge Label Component Structure

```tsx
function RoleLabelEdge({ id, sourceX, sourceY, targetX, targetY, data, selected }: EdgeProps) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX, sourceY, targetX, targetY,
    borderRadius: 0,  // pixel-art: no curves
  })

  return (
    <>
      <path
        d={edgePath}
        stroke={selected ? '#22D3EE' : '#4A5568'}
        strokeWidth={selected ? 3 : 2}
        fill="none"
        markerEnd="url(#pixel-arrow)"
      />
      {data?.role && (
        <EdgeLabelRenderer>
          <div
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            className="absolute bg-deep border-2 border-border-dim px-1.5 py-0.5 font-mono text-[10px] text-accent-purple pointer-events-auto cursor-pointer hover:bg-surface nodrag nopan"
          >
            {data.role}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
```

---

## 10. Color Token Reference (Quick Look)

All colors used in this design, mapped to existing design tokens:

| Usage | Token | Dark Hex |
|-------|-------|----------|
| Canvas background | `void` | #0B0E14 |
| Panel background | `deep` | #141820 |
| Node background | `surface` | #1E2430 |
| Hover/selected bg | `elevated` | #2A3242 |
| Default border | `border-dim` | #2E3A4E |
| Active border | `border-bright` | #4A5568 |
| Primary text | `text-primary` | #E8ECF1 |
| Secondary text | `text-secondary` | #8B95A5 |
| Dim text | `text-dim` | #505A6A |
| Running/success | `accent-green` | #4ADE80 |
| Selected/info | `accent-blue` | #60A5FA |
| Warning/paused | `accent-amber` | #FBBF24 |
| Error | `accent-red` | #F87171 |
| Sub-agent/AI | `accent-purple` | #A78BFA |
| Edges/connections | `accent-cyan` | #22D3EE |
| Main agent | `mc-gold` | #FCDB05 |

---

## 11. Wireframe: Full Topology View

```
┌──────────┬──────────────────────────────────────────────────────────────────────────┐
│ SIDEBAR  │  Agents                      [≡ Grid | ◇ Topo]         [+ New Agent]    │
│          │  3 agents in this project                                                │
│          ├──────────────────────────────────────────────────────┬───────────────────┤
│          │                                                      │  AGENT DETAIL    │
│          │     ┌── MAIN ──────────────┐                         │                  │
│          │     │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │                         │ [■] Team Lead   │
│          │     │ MAIN                 │                         │     ● Running    │
│          │     │ [■] Team Lead  [●RUN]│─── "Content" ──→┐      │                  │
│          │     │     gpt-4o           │                  │      │ "Orchestrates    │
│          │     │ ─────────────────────│                  │      │  all agents"     │
│          │     │ 2 skills · 1 tool    │                  │      │                  │
│          │     │          · 2 sub-agt ■│                  │      │ ────────────────│
│          │     └──────────────────────┘                  │      │ MODEL            │
│          │                │                              │      │ gpt-4o           │
│          │                │                              │      │                  │
│          │                │ "Research"                    │      │ ────────────────│
│          │                │                              │      │ CAPABILITIES     │
│          │                ▼                              ▼      │ 2 skills         │
│          │     ┌──────────────────────┐   ┌─────────────────┐   │ 1 tool           │
│          │     │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │   │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │   │ 0 MCP            │
│          │     │ [■] Researcher [○IDL]│   │ [■] Writer [○IDL]│   │                  │
│          │     │     claude-3.5       │   │     gpt-4o      │   │ ────────────────│
│          │     │ ─────────────────────│   │ ────────────────│   │ SUB-AGENTS       │
│          │     │ 4 skills · 2 tools   │   │ 3 skills · 5 tl │   │ → Writer         │
│          │     └──────────────────────┘   └─────────────────┘   │   (Content)      │
│          │                                                      │ → Researcher     │
│          │  ┌─────┐                                    ┌─────┐  │   (Research)     │
│          │  │  +  │                                    │▓▓▓▓▓│  │                  │
│          │  │  −  │                                    │▓mini│  │ ────────────────│
│          │  │  ⟲  │                                    │▓map▓│  │ [Open Detail]    │
│          │  │  ⊞  │                                    │▓▓▓▓▓│  │ [Chat]           │
│          │  └─────┘                                    └─────┘  │                  │
└──────────┴──────────────────────────────────────────────────────┴───────────────────┘
```

---

## 12. Responsive Behavior

The topology view is designed for desktop (Electron) and does not need mobile responsiveness. However:

| Canvas min-width | 600px (after sidebar and optional panel) |
|-----------------|------------------------------------------|
| With side panel | Canvas width = available - 320px |
| Without panel | Canvas fills full available width |
| Minimum window | 960 x 640 (app minimum) |

The canvas auto-resizes via React Flow's built-in resize handling. The side panel pushes the canvas width rather than overlaying it, preventing content obstruction.

---

## 13. Accessibility

| Feature | Implementation |
|---------|---------------|
| Keyboard navigation | Tab through nodes, Enter to select, Escape to deselect/close panel |
| ARIA labels | Nodes: `role="button" aria-label="{agent.name} - {agent.status}"` |
| Focus visible | 2px `accent-blue` outline (pixel-focus shadow) |
| High contrast | All text meets WCAG AA contrast ratios against dark backgrounds |
| Screen reader | Edge labels read as "{source} delegates to {target} as {role}" |
