# Chat History Sidebar UI Redesign — Final Approved

> Designer: UI/UX Designer
> Date: 2026-02-12
> Status: **APPROVED** by user

---

## 1. Current Layout & Problem

### 1.1 Current Structure

```
+-------------+-------------+--------------------------------+
| TopBar (48px, full width)                                   |
+-------------+-------------+--------------------------------+
|             |             |                                |
|  Project    |  Chat       |                                |
|  Sidebar    |  Sidebar    |      Chat Window               |
|  (240px)    |  (240px)    |      (remaining)               |
|             |             |                                |
|  Dashboard  | [+New Chat] |  Header: title + agent + del   |
|  >Chats     |             |                                |
|  Agents     | conv1       |      Messages...               |
|  Tasks      | conv2       |                                |
|  Artifacts  | conv3       |                                |
|  Memory     |             |                                |
|  Settings   |             |      [Input............][Send] |
|             |             |                                |
|  <<Collapse |             |                                |
+-------------+-------------+--------------------------------+
| StatusBar (24px, full width)                                |
+-------------------------------------------------------------+
```

### 1.2 The Problem

ChatSidebar is **permanently visible at 240px** with no way to hide it. This wastes space for users who just want to chat without browsing history.

| Layout State | Sidebar Total | Chat Area (1280px window) |
|---|---|---|
| Both expanded | 240 + 240 = **480px** | **800px** (62.5%) |
| Nav collapsed | 56 + 240 = **296px** | **984px** (76.9%) |

### 1.3 Scope

- **ProjectSidebar**: Completely unchanged.
- **ChatSidebar**: Hidden by default (0px). Toggled via icon in ChatWindow header.
- **ChatWindow header**: Redesigned to include toggle icon + New Chat button + centered title.

---

## 2. Final Design: Hidden-by-Default Chat History

### 2.1 Concept

- ChatSidebar is **completely hidden (0px)** by default — not a thin toolbar, truly gone.
- The **ChatWindow header** gains a toggle icon on the left side to show/hide the sidebar.
- When hidden, a **[+ New]** button appears in the ChatWindow header (left side, next to toggle icon).
- When the sidebar is shown, the [+ New] button disappears from the header (since the sidebar already has its own New Chat button).
- The sidebar uses a **push layout** (not overlay) — it pushes the chat content to the right, same 240px as current.

### 2.2 Hidden State (Default)

```
+-------------+------------------------------------------------------+
| TopBar (48px, full width)                                           |
+-------------+------------------------------------------------------+
|             |                                                      |
|  Project    | [=|] [+New]     Chat Title          [Delete]         |
|  Sidebar    +------------------------------------------------------+
|  (240px     |                                                      |
|   or 56px)  |                                                      |
|             |              Chat Window                             |
|             |              (full remaining width)                  |
|             |                                                      |
|             |              Messages...                             |
|             |                                                      |
|             |                                                      |
|             |              [Input.........................][Send]   |
|             |                                                      |
+-------------+------------------------------------------------------+
| StatusBar (24px)                                                    |
+---------+----------------------------------------------------------+

[=|] = sidebar toggle icon (collapsed state: shows "open sidebar" icon)
[+New] = New Chat button (visible only when sidebar is hidden)
Chat Title = centered in header
```

**ChatWindow header layout (hidden state)**:
```
+----------------------------------------------------------------+
|  [=|]  [+ New]           Chat Title              [Delete]      |
+----------------------------------------------------------------+
  left group               center                  right group
```

- **Left group**: Toggle icon + [+ New] button, `flex items-center gap-2`
- **Center**: Chat title, `flex-1 text-center`, `font-pixel text-[10px]` (same as current)
- **Right group**: Action buttons (Delete, etc.), `flex items-center gap-2`

### 2.3 Expanded State

```
+-------------+-------------+----------------------------------------+
| TopBar (48px, full width)                                           |
+-------------+-------------+----------------------------------------+
|             |             |                                        |
|  Project    | [+ New Chat]| [= ]            Chat Title    [Delete] |
|  Sidebar    |             +----------------------------------------+
|  (240px     | conv1     * |                                        |
|   or 56px)  | conv2       |         Chat Window                    |
|             | conv3       |         (remaining width)              |
|             | conv4       |                                        |
|             |             |         Messages...                    |
|             |             |                                        |
|             |  240px      |         [Input...............][Send]   |
|             |             |                                        |
+-------------+-------------+----------------------------------------+
| StatusBar (24px)                                                    |
+--------------------------------------------------------------------+

[= ] = sidebar toggle icon (expanded state: shows "close sidebar" icon)
Note: [+ New] is NOT in the ChatWindow header — it's in the sidebar
```

**ChatWindow header layout (expanded state)**:
```
+------------------------------------------------+
|  [= ]              Chat Title        [Delete]  |
+------------------------------------------------+
  left group          center           right group
```

- **Left group**: Toggle icon only (no [+ New] button — it's in the sidebar)
- **Center**: Chat title, centered
- **Right group**: Action buttons

**ChatSidebar content (expanded, 240px)**:
```
+----------------------+
| [   + New Chat     ] |  <-- PixelButton primary, full width, p-3
+----------------------+      border-b-2 border-dim below
| * Blog Draft         |  <-- Active: bg-elevated, border-l-2 accent-green
|   @Writer  5m ago    |
+----------------------+
|   SEO Analysis       |  <-- Inactive: hover bg-elevated/50
|   @Researcher  1h    |
+----------------------+
|   API Discussion     |
|   @Bot  2d ago       |
+----------------------+
|                      |
|   (scrollable)       |
+----------------------+
  240px
```

No header row in the sidebar itself — just the New Chat button at top + conversation list. The toggle lives in the ChatWindow header, not in the sidebar.

### 2.4 Width Budget Comparison

| Layout State | Sidebar Total | Chat Area (1280px) | vs Current |
|---|---|---|---|
| Current (nav expanded) | 240 + 240 = 480px | 800px | baseline |
| Current (nav collapsed) | 56 + 240 = 296px | 984px | baseline |
| **New: nav expanded, chat hidden** | 240 + 0 = **240px** | **1040px** | **+240px** |
| **New: nav collapsed, chat hidden** | 56 + 0 = **56px** | **1224px** | **+240px** |
| New: nav expanded, chat expanded | 240 + 240 = 480px | 800px | same |
| New: nav collapsed, chat expanded | 56 + 240 = 296px | 984px | same |

**Default experience** (hidden sidebar): user gets **240px more** chat area than before.

---

## 3. Toggle Icon Design (Pixel SVG)

The toggle icon has two visual states to communicate what clicking it will do.

### 3.1 Collapsed State Icon (sidebar hidden → "click to show sidebar")

Visual: A rectangle with a vertical divider line on the left + horizontal lines on the left partition (resembling a sidebar with content). Similar to the Claude.ai sidebar toggle icon.

```
+-------+
| |=    |
| |=    |
| |=    |
+-------+
```

Concept: The vertical divider + lines suggest "there's a sidebar panel available, click to reveal it."

### 3.2 Expanded State Icon (sidebar visible → "click to hide sidebar")

Visual: A plain rectangle without the vertical divider — just a simple panel outline.

```
+-------+
|       |
|       |
|       |
+-------+
```

Concept: The absence of the sidebar partition suggests "click to go full width, remove the sidebar."

### 3.3 Icon Specs

- Size: 20x20px viewBox, rendered at 20x20px (fits within 36px button hit area)
- Style: Pixel-art SVG — all lines are 2px thick, sharp corners, no anti-aliasing
- Color: `text-text-secondary` default, `text-text-primary` on hover
- Button container: 36x36px, transparent background, hover `bg-elevated/50`, `cursor-pointer`
- Stroke: `currentColor`, strokeWidth 2, no fill

### 3.4 SVG Implementation

**Collapsed state icon** (sidebar-show):
```svg
<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
  <!-- Outer rectangle -->
  <rect x="1" y="1" width="18" height="18" stroke="currentColor" stroke-width="2"/>
  <!-- Vertical divider -->
  <line x1="7" y1="1" x2="7" y2="19" stroke="currentColor" stroke-width="2"/>
  <!-- Horizontal lines in left partition -->
  <line x1="2" y1="7" x2="6" y2="7" stroke="currentColor" stroke-width="2"/>
  <line x1="2" y1="11" x2="6" y2="11" stroke="currentColor" stroke-width="2"/>
</svg>
```

**Expanded state icon** (sidebar-hide):
```svg
<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
  <!-- Outer rectangle only -->
  <rect x="1" y="1" width="18" height="18" stroke="currentColor" stroke-width="2"/>
</svg>
```

---

## 4. ChatWindow Header Redesign

### 4.1 Current Header

```tsx
<div className="flex items-center justify-between px-4 py-3 border-b-2 border-border-dim bg-deep">
  <div className="flex items-center gap-2 min-w-0">
    <h2>conversation.title</h2>
    <span>@agent.name</span>
  </div>
  <PixelButton>Delete</PixelButton>
</div>
```

Layout: `[title + agent]  -------  [Delete]`

### 4.2 New Header

```tsx
<div className="flex items-center px-4 py-3 border-b-2 border-border-dim bg-deep">
  {/* Left group */}
  <div className="flex items-center gap-2 shrink-0">
    <button onClick={toggleSidebar}>{toggleIcon}</button>
    {!sidebarExpanded && (
      <PixelButton variant="primary" size="sm" onClick={onNewChat}>
        + New
      </PixelButton>
    )}
  </div>

  {/* Center — title */}
  <div className="flex-1 text-center min-w-0 px-4">
    <h2 className="font-pixel text-[10px] text-text-primary truncate">
      {conversation.title}
    </h2>
    {agent && (
      <span className="text-[11px] text-accent-blue font-mono">
        @{agent.name}
      </span>
    )}
  </div>

  {/* Right group */}
  <div className="flex items-center gap-2 shrink-0">
    <PixelButton size="sm" variant="ghost" onClick={handleDelete}>
      Delete
    </PixelButton>
  </div>
</div>
```

**Layout (sidebar hidden)**: `[=|] [+New]     Chat Title / @Agent     [Delete]`

**Layout (sidebar expanded)**: `[= ]           Chat Title / @Agent     [Delete]`

Key changes:
- Title is **centered** (using `flex-1 text-center`)
- Left group has toggle icon + conditional [+ New] button
- Agent name shown below title (or inline) in the center section
- Right group unchanged (Delete button, potentially more actions later)

---

## 5. Expand/Collapse Behavior

### 5.1 Animation

Push layout — the sidebar pushes the ChatWindow content area to the right.

```
Expand (0px -> 240px):
  ChatSidebar width animates from 0 to 240px
  Duration: 200ms
  Easing: pixelSpring (stiffness: 300, damping: 30)
  ChatWindow content smoothly shrinks as sidebar grows
  Sidebar content fades in (opacity 0->1) during last 100ms

Collapse (240px -> 0px):
  Sidebar content fades out (opacity 1->0) in first 100ms
  ChatSidebar width animates from 240px to 0
  Duration: 200ms
  Easing: same pixelSpring
  ChatWindow content smoothly expands
```

Use `motion/react`'s `AnimatePresence` + `motion.div` with `animate={{ width }}` on the ChatSidebar wrapper. The parent flexbox naturally handles content reflow.

### 5.2 State Persistence

- State: `chatHistoryExpanded: boolean` in Zustand `ui` slice
- Default: `false` (hidden)
- Persisted to `localStorage` (same mechanism as existing `sidebarCollapsed`)
- Restored on page load

### 5.3 No Keyboard Shortcuts

No keyboard shortcuts for toggling. Toggle is only via the icon button in the ChatWindow header.

---

## 6. Component Changes

### 6.1 Modified Files

| File | Change |
|------|--------|
| `ChatSidebar.tsx` | Remove the outer container's fixed `w-[240px]`. When hidden, render nothing (width 0). When expanded, render the New Chat button + conversation list at 240px. The sidebar no longer has its own header — toggle lives in ChatWindow. Wrap in `motion.div` for width animation. |
| `ChatWindow.tsx` | Redesign header: add toggle icon (left), make title centered, add conditional [+ New] button. Read `chatHistoryExpanded` from store. |
| `ChatPage.tsx` | Conditionally render `<ChatSidebar>` based on `chatHistoryExpanded`. Pass toggle callback. |
| `useAppStore.ts` (ui slice) | Add `chatHistoryExpanded: boolean` (default `false`) and `toggleChatHistory()` action. Persist to `localStorage`. |

### 6.2 No New Files

No new component files. The toggle icon SVGs can be inline in ChatWindow or extracted as a small helper if needed, but no new file is required.

### 6.3 No Deleted Files

`ProjectSidebar`, `AppShell`, `TopBar`, `StatusBar` — all completely unchanged.

### 6.4 No Routing Changes

Routes remain identical. This is purely a visual/layout change within the Chat page components.

---

## 7. Design System Compliance

| Rule | Status |
|------|--------|
| No border-radius (sharp corners) | OK — all elements use 0 radius |
| 2px borders | OK — sidebar border, SVG strokes all 2px |
| 4px spacing grid | OK — 240px sidebar, 36px icon button, 20px SVG icon |
| Pixel font for labels | OK — title uses `font-pixel text-[10px]` |
| Mono font for body | OK — conversation items, agent name use JetBrains Mono |
| Dark theme colors only | OK — `bg-deep`, `bg-surface`, `bg-elevated`, `border-dim` |
| Beveled shadows | OK — sidebar uses existing shadow patterns |
| `motion/react` for animation | OK — expand/collapse uses `pixelSpring` preset |
| Accent-green for primary action | OK — [+ New] button uses primary variant (accent-green) |
| Pixel SVG icons | OK — 2px strokes, sharp corners, no anti-aliasing |

---

## 8. Implementation Steps

1. Add `chatHistoryExpanded: boolean` (default `false`) + `toggleChatHistory()` to Zustand ui slice, with localStorage persistence
2. Create pixel SVG toggle icons (two states: sidebar-show / sidebar-hide) — inline in ChatWindow or as a small component
3. Redesign `ChatWindow.tsx` header: toggle icon (left) + conditional [+ New] button (left) + centered title + right actions
4. Modify `ChatSidebar.tsx`: remove fixed width, wrap in `motion.div` with width animation (0 <-> 240px), remove old header/New Chat button placement if needed
5. Modify `ChatPage.tsx`: conditionally render ChatSidebar based on store state, wire toggle
6. Verify: all existing functionality (select conversation, new chat, delete) still works
7. Verify: default state is hidden (0px), toggle works correctly in both directions
8. Verify: [+ New] appears in header when sidebar hidden, disappears when sidebar shown
