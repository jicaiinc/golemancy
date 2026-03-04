# Team Topology UI/UX Design Specification

> UI/UX Designer Output | 2026-03-04
> Complete redesign — does NOT reference current implementation

---

## 1. Design Philosophy

**Core Principle**: A Minecraft-themed agent orchestration canvas that feels like building with blocks — simple, spatial, and satisfying.

**Design Goals**:
- **Clarity**: Hierarchy is immediately legible through spatial layout and visual weight
- **Simplicity**: Nodes show only what matters; details live in the sidebar
- **Craft**: Pixel-perfect execution of the Minecraft aesthetic — every shadow, border, and font choice is intentional
- **Flow**: Common actions (add, connect, rearrange) happen with minimal clicks

**Anti-patterns to avoid** (learned from current implementation):
- Overloaded nodes with capabilities lists
- Floating panels that obscure the canvas
- Toggle-based config that feels temporary
- Locked/undeletable nodes that trap users

---

## 2. Overall Page Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│ HEADER (h-12, bg-surface, border-b-2 border-border-dim)            │
│                                                                      │
│  ← Back   │  ★ My Agent Team ✎        [⟲ Reset] [🗑 Delete Team]  │
│                                                                      │
├───────────────────────────────────────────┬─────────────────────────┤
│                                           │                          │
│          CANVAS AREA                      │   SIDEBAR (w-80/320px)   │
│       (ReactFlow viewport)               │                          │
│          flex-1, min-w-0                  │   bg-deep                │
│                                           │   border-l-2             │
│     ┌──────┐        ┌──────┐            │   border-border-dim      │
│     │Leader│────────│Agent │            │                          │
│     │ Node │        │ Node │            │   [ Team Settings ]      │
│     └──┬───┘        └──────┘            │        OR                │
│        │                                 │   [ Node Detail  ]      │
│     ┌──┴───┐                            │                          │
│     │Agent │                            │                          │
│     │ Node │                            │                          │
│     └──────┘                            │                          │
│                                           │                          │
│  ┌──────────────────────┐                │                          │
│  │ + Add  ⟲  ⊞ Fit     │  Canvas        │                          │
│  └──────────────────────┘  Controls      │                          │
│                           (bottom-left)   │                          │
│                                           │                          │
└───────────────────────────────────────────┴─────────────────────────┘
```

### Layout Rules
- **Full height**: Page fills the entire available viewport (`h-full`)
- **Flex row**: Canvas and Sidebar sit in a `flex` row — sidebar does NOT overlap canvas (AC-6.1)
- **Sidebar always visible**: No open/close toggle; content switches between modes (AC-3.1)
- **Header is slim**: Single row, `h-12`, no second row for description

---

## 3. Header Design

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  [← Back]  │  ★ Research Team ✎            [⟲ Reset]  [🗑 Delete] │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Anatomy

| Element | Font | Size | Color | Behavior |
|---------|------|------|-------|----------|
| Back button | font-mono | 11px | text-secondary | Ghost PixelButton, navigates to team list |
| Divider | — | 1px wide, 24px tall | border-dim | Visual separator |
| Team Name | font-pixel | 12px | text-primary | Click-to-edit inline; shows ✎ icon on hover |
| ★ (Leader indicator) | font-pixel | 12px | mc-gold | Only shown if team has root nodes; decorative |
| Reset Layout btn | font-mono | 11px | text-secondary | Ghost PixelButton |
| Delete Team btn | font-mono | 11px | accent-red | Danger PixelButton; click shows inline confirm |

### Header Interactions
- **Click team name** → inline input, border-accent-blue, auto-select text
- **Blur / Enter** → save, flash "Saved" indicator (accent-green, fades after 2s)
- **Delete Team** → inline confirm: `"Delete this team?" [Confirm] [Cancel]`
- **Reset Layout** → triggers full dagre re-layout with fitView animation

### Styling
```
bg-surface/95 backdrop-blur-sm
border-b-2 border-border-dim
px-4 py-0 h-12 flex items-center gap-3
```

---

## 4. Node Design

### 4.1 Standard Node (Non-Root)

```
╔══════════════════════════╗
║  ◯  Agent Name       ▸  ║   ← Handle (target) at top center
║  claude-sonnet-4-6       ║
║  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  ║
║  Researcher              ║   ← Role label
╚══════════════════════════╝
         │                      ← Handle (source) at bottom center
        [+]                     ← Add child button
```

### 4.2 Root Node (Leader)

```
   ╔═══ ★ LEADER ═════════════╗     ← gold border, LEADER badge
   ║                            ║
   ║  ◉  Main Orchestrator  ▸  ║     ← ◉ filled status dot
   ║  claude-opus-4-6           ║
   ║  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  ║
   ║  Team Lead                 ║
   ║                            ║
   ╚════════════════════════════╝
            │
           [+]
```

### 4.3 Node Specifications

**Dimensions**: `w-[220px]`, height auto (consistent ~72px for all nodes)

**Node Content** (top to bottom):
1. **Status dot + Name + Chevron** (row)
   - Status dot: `w-2 h-2`, color by agent status (idle/running/error/paused)
   - Name: `font-pixel text-[9px]`, truncate, `text-text-primary`
   - Chevron `▸`: `text-text-dim`, indicates "click for details"
2. **Model**: `font-mono text-[9px]`, `text-text-dim`, truncate
3. **Separator**: `border-t border-border-dim`, 1px, dashed style
4. **Role**: `font-mono text-[10px]`, `text-text-secondary`, truncate; fallback to `text-text-dim italic` "(no role)"

**Node Styling**:

| State | Border | Background | Shadow | Extra |
|-------|--------|------------|--------|-------|
| Default | `border-2 border-border-dim` | `bg-surface` | `shadow-pixel-raised` | — |
| Hover | `border-border-bright` | `bg-surface` | `shadow-pixel-raised` | subtle brightness-105 |
| Selected | `border-accent-blue` | `bg-surface` | `0 0 0 2px accent-blue/30` | glow ring |
| Root (Leader) | `border-2 border-mc-gold` | `bg-surface` | `0 0 0 1px mc-gold/20` | ★ LEADER badge |
| Root + Selected | `border-mc-gold` | `bg-surface` | `0 0 0 2px mc-gold/30` | gold glow |
| Highlighted (parent hover) | `border-accent-green` | `bg-surface` | `0 0 0 2px accent-green/25` | — |

**Leader Badge** (root nodes only):
```
Position: top-right corner, offset -8px up and -4px right
Style: bg-mc-gold/20 border border-mc-gold text-mc-gold
Font: font-pixel text-[7px]
Content: "★ LEADER"
```

**Status Dot Colors**:
| Status | Color | Animation |
|--------|-------|-----------|
| idle | `bg-text-dim` | none |
| running | `bg-accent-green` | `pixel-pulse` (steps(2)) |
| error | `bg-accent-red` | none |
| paused | `bg-accent-amber` | `pixel-pulse` slow |

**Handles**:
- Target (top): `!w-2.5 !h-2.5 !bg-border-bright !border-2 !border-border-dim` — all nodes have target handle (including root nodes, so they can receive connections)
- Source (bottom): same style
- On connection drag hover: `!bg-accent-blue !border-accent-blue`

**Add Child Button** (`[+]`):
```
Position: centered below source handle, 4px gap
Size: w-5 h-5
Style: bg-deep border-2 border-border-dim
       text-text-dim text-[10px] font-mono
Hover: border-accent-green text-accent-green
       shadow: 0 0 0 1px accent-green/20
Visibility: visible on node hover OR when node is selected
            (hidden by default to reduce visual noise)
```

### 4.4 Node States Diagram

```
  ┌─────────┐     mouseenter     ┌─────────┐
  │ Default │ ──────────────────▸│  Hover  │
  └────┬────┘     mouseleave     └────┬────┘
       │                              │
       │ click                        │ click
       ▼                              ▼
  ┌─────────┐                    ┌─────────┐
  │Selected │◂───────────────────│Sel+Hover│
  └────┬────┘                    └─────────┘
       │
       │ click canvas / Escape
       ▼
  ┌─────────┐
  │ Default │
  └─────────┘
```

---

## 5. Edge Design

```
  Parent Node
       │
       ○  ← source handle
       │
       │   Bezier curve, stroke-width: 2px
       │   color: border-bright (default)
       │         accent-blue (selected/animated)
       │
       ▼
       ○  ← target handle
       │
  Child Node
```

### Edge Specifications
- **Type**: `smoothstep` (clean right-angle routing fits pixel aesthetic better than bezier)
- **Stroke**: `2px`, color `var(--color-border-bright)`
- **Animated**: when parent or child is selected, edge uses `accent-blue` with subtle dash animation
- **Arrow**: small arrowhead marker at target end (`markerEnd`), same color as stroke
- **Deletable**: yes, via selecting edge + Delete key (removes parent-child relationship)

---

## 6. Sidebar Design

**Container**: `w-80 (320px) bg-deep border-l-2 border-border-dim flex flex-col h-full overflow-hidden`

### 6.1 Sidebar Mode Indicator

At the top of the sidebar, a subtle header indicates current mode:

```
┌────────────────────────────────┐
│  ⚙ Team Settings               │  ← when no node selected
│  ─────────────────────────────  │
└────────────────────────────────┘

┌────────────────────────────────┐
│  ◈ Node: Agent Name        ✕  │  ← when node selected (✕ to deselect)
│  ─────────────────────────────  │
└────────────────────────────────┘
```

**Mode Header Styling**:
```
h-10 px-4 flex items-center gap-2
border-b-2 border-border-dim
bg-surface
font-pixel text-[9px] text-text-secondary
```

### 6.2 Team Settings Mode (No Node Selected)

```
┌────────────────────────────────┐
│  ⚙ TEAM SETTINGS               │
│  ──────────────────────────────  │
│                                  │
│  DESCRIPTION                     │  ← font-pixel text-[8px] label
│  ┌──────────────────────────┐   │
│  │ A research team for...   │   │  ← PixelTextArea, auto-save on blur
│  │                          │   │
│  └──────────────────────────┘   │
│  ✓ Saved                        │  ← flash indicator
│                                  │
│  ──────────────────────────────  │  ← separator
│                                  │
│  INSTRUCTION                     │  ← font-pixel text-[8px] label
│  ┌──────────────────────────┐   │
│  │ You are the leader of    │   │  ← PixelTextArea, resizable
│  │ a research team. Your    │   │     min-h-[120px]
│  │ goal is to coordinate    │   │     auto-save on blur
│  │ the team members and...  │   │
│  │                          │   │
│  │                          │   │
│  └──────────────────────────┘   │
│  ✓ Saved                        │
│                                  │
│  ──────────────────────────────  │
│                                  │
│  MEMBERS (3)                     │  ← mini member list
│  ┌──────────────────────────┐   │
│  │ ★ Orchestrator  opus-4-6│   │
│  │   Researcher    sonnet   │   │
│  │   Writer        sonnet   │   │
│  └──────────────────────────┘   │
│                                  │
└────────────────────────────────┘
```

### Team Settings Fields

| Field | Component | Save Behavior | Validation |
|-------|-----------|---------------|------------|
| Description | PixelTextArea | Auto-save on blur; debounce 500ms | Optional, max 500 chars |
| Instruction | PixelTextArea | Auto-save on blur; debounce 500ms | Optional, resizable |

**Save Indicator**:
- On successful save: show "✓ Saved" in `text-accent-green font-mono text-[10px]`
- Fades out after 2 seconds
- Position: immediately below the textarea, right-aligned
- AC-3.2: Clear save state indication

**Members Overview**:
- Read-only mini-list showing all team members
- Each row: leader star (if root) + name (font-mono 11px) + model (text-dim 10px)
- Click a member → selects that node on canvas + switches sidebar to Node Detail

### 6.3 Node Detail Mode (Node Selected)

```
┌────────────────────────────────┐
│  ◈ Main Orchestrator       ✕   │  ← mode header with close
│  ──────────────────────────────  │
│                                  │
│  ┌──────────────────────────┐   │
│  │  ◉  Main Orchestrator    │   │  ← agent header card
│  │  claude-opus-4-6         │   │
│  │  ★ LEADER                │   │  ← badge if root
│  └──────────────────────────┘   │
│                                  │
│  ROLE                            │
│  ┌──────────────────────────┐   │
│  │ Team Lead                │   │  ← PixelInput, editable
│  └──────────────────────────┘   │
│  ✓ Saved                        │
│                                  │
│  ──────────────────────────────  │
│                                  │
│  CAPABILITIES                    │  ← read-only overview
│  ┌──────────────────────────┐   │
│  │ Skills    ✦ research     │   │
│  │           ✦ summarize    │   │
│  │ Tools     ⚒ bash         │   │
│  │           ⚒ browser      │   │
│  │ MCP       ⚡ 2 servers    │   │
│  │ Memory    ● 12 entries   │   │
│  └──────────────────────────┘   │
│                                  │
│  ──────────────────────────────  │
│                                  │
│  PARENT                          │
│  ┌──────────────────────────┐   │
│  │ (none — root node)    ▾ │   │  ← dropdown to change parent
│  └──────────────────────────┘   │
│                                  │
│  ──────────────────────────────  │
│                                  │
│  ┌──────────────────────────┐   │
│  │   Open Agent Detail  →   │   │  ← ghost PixelButton
│  └──────────────────────────┘   │
│  ┌──────────────────────────┐   │
│  │   Remove from Team       │   │  ← danger PixelButton (always enabled!)
│  └──────────────────────────┘   │
│                                  │
└────────────────────────────────┘
```

### Node Detail Fields

| Section | Content | Interactive |
|---------|---------|-------------|
| Agent Header | Name, model, leader badge, status dot | Read-only |
| Role | PixelInput, auto-save on blur | Yes — edits TeamMember.role |
| Capabilities | Skills (purple ✦), Tools (green ⚒), MCP (cyan ⚡), Memory (amber ●) | Read-only; click → navigate to agent detail |
| Parent | PixelDropdown showing all other members + "(none — root)" | Yes — changes parentAgentId |
| Open Agent Detail | PixelButton ghost | Navigates to `/projects/:id/agents/:agentId` |
| Remove from Team | PixelButton danger — **always enabled, including for root nodes** | Removes member; children become roots |

**Capability Colors** (consistent with current design system):
- Skills: `text-accent-purple` with `bg-accent-purple/10`
- Tools: `text-accent-green` with `bg-accent-green/10`
- MCP: `text-accent-cyan` with `bg-accent-cyan/10`
- Memory: `text-accent-amber` with `bg-accent-amber/10`

### 6.4 Sidebar Mode Transitions

```
┌─────────────────┐   click node    ┌─────────────────┐
│  Team Settings  │ ──────────────▸ │   Node Detail   │
│     Mode        │                  │     Mode        │
└────────┬────────┘   click canvas   └────────┬────────┘
         │            click ✕                  │
         │            press Escape             │
         ◂────────────────────────────────────┘
         │
         │ delete selected node
         ◂────────────────────────────────────┘
```

**Transition Animation**:
- Content crossfade using `motion/react` `AnimatePresence`
- Duration: 150ms
- Team Settings: fade in from left (x: -8 → 0, opacity: 0 → 1)
- Node Detail: fade in from right (x: 8 → 0, opacity: 0 → 1)

---

## 7. Canvas Controls (Bottom-Left Toolbar)

```
┌─────────────────────────────────────┐
│  [+ Add Agent]  [⟲ Re-layout]  [⊞] │
└─────────────────────────────────────┘
```

Using ReactFlow `<Panel position="bottom-left">`:

```
bg-surface/90 backdrop-blur-sm
border-2 border-border-dim
shadow-pixel-drop
p-1 flex items-center gap-1
```

### Controls

| Button | Icon | Style | Action |
|--------|------|-------|--------|
| Add Agent | `+` text | PixelButton primary, size sm | Opens AgentPickerPopover |
| Re-layout | `⟲` icon | PixelButton ghost, size sm | Runs dagre + fitView |
| Fit View | `⊞` icon | PixelButton ghost, size sm | Calls fitView({ duration: 300 }) |

**Add Agent logic**:
- If a node is selected → new agent becomes child of selected node
- If no node is selected → new agent becomes a root node
- Opens the AgentPickerPopover (see Section 8)

---

## 8. Agent Picker Popover

Triggered by: Canvas toolbar "Add Agent" button OR node's `[+]` add-child button.

```
┌──────────────────────────────┐
│  🔍 Search agents...         │  ← PixelInput with search icon
│  ────────────────────────────  │
│                                │
│  ┌──────────────────────────┐ │
│  │ ◎ Research Agent          │ │  ← hover: bg-elevated
│  │   claude-sonnet-4-6       │ │
│  ├──────────────────────────┤ │
│  │ ◎ Code Writer            │ │
│  │   claude-opus-4-6         │ │
│  ├──────────────────────────┤ │
│  │ ◎ Summarizer             │ │
│  │   claude-haiku-4-5        │ │
│  └──────────────────────────┘ │
│                                │
│  3 agents available            │  ← footer count
└──────────────────────────────┘
```

### Popover Specifications

**Container**:
```
w-[260px] max-h-[320px]
bg-surface border-2 border-border-dim
shadow-pixel-drop
z-50
```

**Positioning**:
- From Canvas toolbar button: anchored below the button, left-aligned
- From node `[+]` button: anchored below the `[+]`, centered

**Search Input**:
- PixelInput with placeholder "Search agents..."
- Filters by agent name (case-insensitive substring match)
- Auto-focus on open

**Agent List**:
- Scrollable (`overflow-y-auto max-h-[240px]`)
- Each item: `px-3 py-2 hover:bg-elevated cursor-pointer transition-colors border-b border-border-dim last:border-b-0`
- Agent name: `font-pixel text-[9px] text-text-primary`
- Model: `font-mono text-[9px] text-text-dim`
- Description (optional): `font-mono text-[8px] text-text-dim truncate mt-0.5`

**Filtering**:
- Already-in-team agents are excluded (AC-7.2)
- Empty search = show all available agents

**Empty State** (no available agents):
```
┌──────────────────────────────┐
│  No agents available.         │
│  Create an agent first.       │
└──────────────────────────────┘
```

**Dismiss**: click outside, press Escape, or select an agent.

---

## 9. Empty State Design

When `team.members.length === 0`:

```
┌───────────────────────────────────────────┐
│                                            │
│                                            │
│           ┌─ ─ ─ ─ ─ ─ ─ ─┐              │
│           ╎  ┌───┐  ┌───┐  ╎              │
│           ╎  │ ? │──│ ? │  ╎              │
│           ╎  └─┬─┘  └───┘  ╎              │
│           ╎    │            ╎              │
│           ╎  ┌─┴─┐         ╎              │
│           ╎  │ ? │         ╎              │
│           ╎  └───┘         ╎              │
│           └─ ─ ─ ─ ─ ─ ─ ─┘              │
│                                            │
│        Build Your Agent Team               │  ← font-pixel text-[11px]
│                                            │
│     Add agents to create a topology        │  ← font-mono text-[11px] text-dim
│     that defines how your agents           │
│     collaborate and delegate tasks.        │
│                                            │
│          [+ Add Your First Agent]          │  ← PixelButton primary
│                                            │
│                                            │
└───────────────────────────────────────────┘
```

### Empty State Specifications

**Visual**: Pixel-art style dashed box with placeholder node silhouettes
- Dashed border: `border-2 border-dashed border-border-dim`
- Placeholder nodes: small squares with `?` in `text-text-dim`
- Connecting lines between placeholders: `stroke-border-dim stroke-dasharray-4`

**Text**:
- Title: `font-pixel text-[11px] text-text-secondary` — "Build Your Agent Team"
- Subtitle: `font-mono text-[11px] text-text-dim leading-relaxed` — multi-line description
- Both centered

**CTA Button**: PixelButton `variant="primary"` — "Add Your First Agent"
- Opens AgentPickerPopover (same as canvas toolbar)

**Layout**: `absolute inset-0 flex items-center justify-center z-20` — centered over canvas area

**AC-9.1**: Pixel-art visual guidance (not just text)
**AC-9.2**: Clear first-step action entry

---

## 10. Color Scheme

All colors use existing project design tokens from `global.css`:

### Surface Hierarchy
| Token | Dark Value | Usage |
|-------|-----------|-------|
| `void` | `#0B0E14` | App background |
| `deep` | `#141820` | Sidebar background, input backgrounds |
| `surface` | `#1E2430` | Node background, header, popovers |
| `elevated` | `#2A3242` | Hover states, cards |

### Semantic Colors
| Token | Dark Value | Usage |
|-------|-----------|-------|
| `accent-green` | `#4ADE80` | Primary action, running status, tools |
| `accent-blue` | `#60A5FA` | Selected state, focus rings |
| `accent-amber` | `#FBBF24` | Memory capability |
| `accent-red` | `#F87171` | Danger buttons, error status |
| `accent-purple` | `#A78BFA` | Skills capability |
| `accent-cyan` | `#22D3EE` | MCP capability |
| `mc-gold` | `#FCDB05` | Leader/root node distinction |

### Text Hierarchy
| Token | Dark Value | Usage |
|-------|-----------|-------|
| `text-primary` | `#E8ECF1` | Node names, editable text |
| `text-secondary` | `#8B95A5` | Labels, descriptions |
| `text-dim` | `#505A6A` | Placeholders, hints |

### Border Hierarchy
| Token | Dark Value | Usage |
|-------|-----------|-------|
| `border-dim` | `#2E3A4E` | Default borders |
| `border-bright` | `#4A5568` | Hover borders, edge lines |

---

## 11. Typography

| Role | Font | Size | Usage |
|------|------|------|-------|
| `font-pixel` | Press Start 2P + Fusion Pixel CJK | 8-12px | Section labels, node names, badges, team name |
| `font-mono` | JetBrains Mono + Noto Sans Mono CJK | 9-13px | Body text, model names, descriptions, inputs |
| `font-arcade` | Press Start 2P | — | Logo only (not used on this page) |

### Size Scale for This Page
| Size | Usage |
|------|-------|
| `text-[7px]` font-pixel | LEADER badge text |
| `text-[8px]` font-pixel | Section labels (DESCRIPTION, INSTRUCTION, CAPABILITIES, etc.) |
| `text-[9px]` font-pixel | Node names, agent names in popover |
| `text-[9px]` font-mono | Model text, capability items |
| `text-[10px]` font-mono | Role text, save indicators |
| `text-[11px]` font-mono | Description text, back button, empty state subtitle |
| `text-[12px]` font-pixel | Team name in header, empty state title |
| `text-[13px]` font-mono | Textarea content (standard body) |

---

## 12. Animation & Transitions

### Layout Animation
- **Auto-layout after structure change**: dagre calculates, nodes animate to new positions via `fitView({ duration: 300, padding: 0.2 })`
- **AC-2.4**: Layout animation provides visual continuity

### Sidebar Transitions
- **Mode switch**: `AnimatePresence` with `motion.div`
  - Entering: `{ opacity: 0, x: direction === 'left' ? -8 : 8 }` → `{ opacity: 1, x: 0 }`
  - Exiting: reverse
  - Duration: `150ms`
  - AC-6.2: Panel has open/close transition animation

### Node Interactions
- **Hover**: `transition-colors duration-150` on border color change
- **Select**: CSS transition on border + box-shadow, `150ms ease`
- **Add child button**: `transition-all duration-150` on opacity + border color

### Popover
- Uses `dropdownTransition` from `motion.ts`:
  - Enter: `{ opacity: 0, y: -4 }` → `{ opacity: 1, y: 0 }`, 150ms
  - Exit: reverse

### Save Indicator
- Appear: instant
- Disappear: `transition-opacity duration-500` after 2s delay

### Status Dot
- Running: `animate-[pixel-pulse_1s_steps(2)_infinite]` (matches PixelBadge)
- Paused: `animate-[pixel-pulse_2s_steps(2)_infinite]`

---

## 13. Interaction Flows

### 13.1 Add Agent (Root)

```
1. User clicks [+ Add Agent] in canvas toolbar (no node selected)
2. AgentPickerPopover opens, anchored below button
3. User types to filter, selects an agent
4. addMember(agentId, parentAgentId=undefined)
5. dagre re-layout runs → fitView
6. New node appears with smooth layout animation
7. Popover closes
```

### 13.2 Add Child Agent

**Via node [+] button:**
```
1. User hovers over a node → [+] button appears below
2. User clicks [+]
3. AgentPickerPopover opens below the [+] button
4. User selects an agent
5. addMember(agentId, parentAgentId=clickedNode.agentId)
6. dagre re-layout → fitView
7. New child node appears connected to parent
```

**Via canvas toolbar (with node selected):**
```
1. User selects a node (click)
2. User clicks [+ Add Agent] in canvas toolbar
3. AgentPickerPopover opens
4. User selects an agent
5. addMember(agentId, parentAgentId=selectedNode.agentId)
6. dagre re-layout → fitView
```

### 13.3 Select & Inspect Node

```
1. User clicks a node on canvas
2. Node gets selected state (blue border + glow)
3. Sidebar transitions to Node Detail mode
4. User can view capabilities, edit role, change parent
5. User clicks canvas blank / presses Escape / clicks ✕
6. Sidebar transitions back to Team Settings mode
```

### 13.4 Remove Node

```
1. User selects a node → sidebar shows Node Detail
2. User clicks "Remove from Team" (always enabled, including leader)
3. Confirmation inline: "Remove this agent?" [Confirm] [Cancel]
4. On confirm:
   a. If node has children → children.parentAgentId = undefined (become roots)
   b. Node removed from team.members
   c. dagre re-layout → fitView
   d. Sidebar switches to Team Settings mode
5. If last member removed → empty state shown
```

### 13.5 Change Parent

```
1. User selects a node → sidebar shows Node Detail
2. User opens Parent dropdown
3. Options: "(none — root node)" + all other team members
4. User selects new parent
5. Member's parentAgentId updated
6. Edge re-drawn, dagre re-layout → fitView
```

### 13.6 Double-Click Node

```
1. User double-clicks a node
2. Navigate to /projects/:projectId/agents/:agentId
```

### 13.7 Connect Nodes (Drag Edge)

```
1. User drags from a source handle to a target handle
2. onConnect fires → updates child's parentAgentId to source's agentId
3. dagre re-layout → fitView
```

### 13.8 Delete Edge

```
1. User selects an edge (click)
2. Presses Delete/Backspace
3. Child's parentAgentId → undefined (becomes root)
4. dagre re-layout → fitView
```

---

## 14. Responsive Behavior

| Viewport Width | Sidebar | Canvas |
|---------------|---------|--------|
| >= 1024px | `w-80` (320px) visible | `flex-1 min-w-0` |
| < 1024px | `w-72` (288px) visible | `flex-1 min-w-0` |
| < 768px | Sidebar overlays canvas (absolute, z-40) | Full width |

Note: Electron app typically runs >= 1024px. The < 768px case is a fallback safety net, not a primary design target.

---

## 15. Acceptance Criteria Coverage

### P0-1: Leader Mechanism Flexibility
- **AC-1.1** ✅ Any node can be deleted (Remove button always enabled in sidebar)
- **AC-1.2** ✅ Delete leader → children become root nodes; sidebar shows transition
- **AC-1.3** ✅ Parent dropdown in Node Detail allows setting any node as root or changing parent
- **AC-1.4** ✅ Multiple root nodes supported; all roots get ★ LEADER badge and gold border
- **AC-1.5** ✅ Delete last member → empty state displayed

### P0-2: Smart Auto Layout
- **AC-2.1** ✅ dagre runs after every add/remove → no overlaps (nodesep: 80, ranksep: 120)
- **AC-2.2** ✅ Re-layout button in canvas toolbar AND header
- **AC-2.3** ✅ Manual drag positions saved (onNodeDragStop → saveLayout)
- **AC-2.4** ✅ dagre full recalc on structure change → siblings evenly distributed

### P0-3: Team Instruction Redesign
- **AC-3.1** ✅ Instruction has dedicated area in sidebar Team Settings (not a toggle popup)
- **AC-3.2** ✅ Auto-save on blur with "✓ Saved" indicator
- **AC-3.3** ✅ Description + Instruction are together in Team Settings panel
- **AC-3.4** ✅ Instruction textarea is multi-line, min-h-[120px], resizable

### P0-4: Overall Visual Redesign
- **AC-4.1** ✅ Pixel art style: no border-radius, font-pixel, shadow-pixel-* shadows
- **AC-4.2** ✅ Clear three-zone layout: header / canvas / sidebar
- **AC-4.3** ✅ Leader vs sub-agent: gold border + ★ LEADER badge vs. standard border
- **AC-4.4** ✅ Complete redesign from scratch, significantly improved from current

### P1-1: Simplified Nodes
- **AC-5.1** ✅ Node shows: name, status dot, model, role label only
- **AC-5.2** ✅ Skills/Tools/MCP/Memory only in sidebar Node Detail
- **AC-5.3** ✅ Fixed width `w-[220px]`, consistent height ~72px

### P1-2: Non-Overlapping Detail Panel
- **AC-6.1** ✅ Sidebar is flex layout, not absolute overlay
- **AC-6.2** ✅ Mode transition animation (AnimatePresence crossfade)
- **AC-6.3** ✅ Full agent info, role editor, capabilities, action buttons in panel

### P1-3: Enhanced Agent Selector
- **AC-7.1** ✅ Search input with name filtering
- **AC-7.2** ✅ Already-in-team agents excluded
- **AC-7.3** ✅ Agent model and description shown in picker

### P1-4: Hierarchy Visual Enhancement
- **AC-8.1** ✅ Leader: gold border + ★ LEADER badge + gold glow
- **AC-8.2** ✅ smoothstep edges with arrowhead markers
- **AC-8.3** ✅ Root nodes have distinct gold treatment vs. standard nodes

### P1-5: Empty State Guidance
- **AC-9.1** ✅ Pixel-art placeholder illustration (dashed box with ? nodes)
- **AC-9.2** ✅ "Add Your First Agent" primary button as clear entry point

### P1-6: Toolbar Layout
- **AC-10.1** ✅ Header: team name (left) separated from action buttons (right)
- **AC-10.2** ✅ Single-row header, no second row needed

---

## 16. Component File Mapping

| Component | File | Description |
|-----------|------|-------------|
| TeamTopologyPage | `TeamTopologyView.tsx` (rename/refactor) | Page shell: header + content |
| TeamTopologyHeader | new `TeamTopologyHeader.tsx` | Slim header bar |
| TeamTopologyContent | inline in page | Flex row: canvas + sidebar |
| TeamTopologyCanvas | inline or `TeamTopologyCanvas.tsx` | ReactFlow wrapper |
| TeamNode | `TeamNode.tsx` (rewrite) | Simplified node component |
| TeamEdge | `TeamEdge.tsx` (update) | smoothstep edge with arrow |
| TeamTopologySidebar | new `TeamTopologySidebar.tsx` | Mode-switching container |
| TeamSettingsPanel | new `TeamSettingsPanel.tsx` | Description + Instruction editing |
| NodeDetailPanel | `TeamNodeDetailPanel.tsx` (rewrite) | Agent detail + capabilities |
| AgentPickerPopover | new `AgentPickerPopover.tsx` | Search + select agent |
| TeamEmptyState | new `TeamEmptyState.tsx` | Pixel-art empty state |
| CanvasToolbar | inline in canvas or new file | Bottom-left panel with buttons |

---

## 17. Design Token Quick Reference

```css
/* Node */
--node-width: 220px;
--node-bg: var(--color-surface);
--node-border: var(--color-border-dim);
--node-border-hover: var(--color-border-bright);
--node-border-selected: var(--color-accent-blue);
--node-border-leader: var(--color-mc-gold);

/* Sidebar */
--sidebar-width: 320px;
--sidebar-bg: var(--color-deep);

/* Canvas */
--canvas-bg: var(--color-void);

/* Header */
--header-height: 48px;  /* h-12 */
--header-bg: var(--color-surface);
```

---

## 18. Key Design Decisions Summary

| Decision | Rationale |
|----------|-----------|
| Sidebar always visible, never collapsed | Removes open/close state complexity; 320px is reasonable on typical screens |
| Sidebar modes (Team Settings / Node Detail) | Single panel area for all config; no separate floating panels |
| Nodes show only name + model + role | Information hierarchy: quick scan on canvas, deep dive in sidebar |
| All nodes deletable including leader | Core user pain point; server doesn't depend on leader concept |
| Gold border + ★ badge for root nodes | Clear visual hierarchy without being a structural constraint |
| smoothstep edges | Better fit for pixel aesthetic than bezier curves |
| [+] button visibility on hover | Reduces visual clutter at rest; discoverable on interaction |
| Auto-layout on every structure change | Eliminates overlap issue permanently; trade-off: manual positions reset |
| Search-enabled agent picker | Essential for projects with many agents; prevents scrolling through long lists |
| Single-row header | Clean, not cramped; description moved to sidebar Team Settings |
