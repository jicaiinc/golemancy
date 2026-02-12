# Chat History Sidebar UI Redesign (v2)

> Designer: UI/UX Designer
> Date: 2026-02-12
> Status: Awaiting user approval (revised after v1 rejection)

---

## 1. Current Layout Analysis

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
|  Dashboard  | [+New Chat] |                                |
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

ChatSidebar is **permanently expanded at 240px** with no way to hide it. Combined with ProjectSidebar (240px expanded / 56px collapsed), this means:

| Layout State | Sidebar Total | Chat Window (1280px) |
|---|---|---|
| Both expanded | 240 + 240 = **480px** | **800px** (62.5%) |
| Nav collapsed | 56 + 240 = **296px** | **984px** (76.9%) |

The ChatSidebar cannot be collapsed. Even when the user only wants to chat and doesn't care about history, 240px is permanently occupied.

### 1.3 Scope

- **ProjectSidebar**: Unchanged. It already has expand/collapse and works fine.
- **ChatSidebar**: Redesign to be **collapsed by default** with expand/collapse toggle.
- **No new layout components**: Just modify the existing ChatSidebar behavior.

---

## 2. Proposed Design: Collapsible Chat History

### 2.1 Concept

ChatSidebar gains two states:

- **Collapsed (default)**: A thin vertical toolbar (~48px wide) showing only two buttons stacked vertically — "New Chat" and "Show History".
- **Expanded**: The full 240px conversation list (same as current), with a "Collapse" button to return to collapsed state.

The user lands on the Chat page and sees a nearly-full-width chat area. If they want to browse history, they click "Show History" to expand. Otherwise, they click "New Chat" and start immediately.

### 2.2 Collapsed State (Default)

```
+-------------+------+----------------------------------------+
| TopBar (48px, full width)                                    |
+-------------+------+----------------------------------------+
|             |      |                                        |
|  Project    | [+]  |                                        |
|  Sidebar    |      |       Chat Window                      |
|  (240px     | [<<] |       (remaining width)                |
|   or 56px)  |      |                                        |
|             |      |       Messages...                      |
|             | 48px |                                        |
|             |      |                                        |
|             |      |                                        |
|             |      |       [Input...................][Send]  |
|             |      |                                        |
+-------------+------+----------------------------------------+
| StatusBar (24px)                                             |
+--------------------------------------------------------------+
```

**Collapsed toolbar (48px wide)**:
- Background: `bg-deep`
- Right border: 2px `border-dim` (consistent with current ChatSidebar)
- Two icon buttons stacked vertically at the top:
  1. **[+]** — "New Chat" button. `accent-green` text, `bg-surface` background, pixel beveled raised style. Tooltip: "New Chat". Clicking creates a new conversation immediately (same as current "New Chat" button).
  2. **[<<]** — "Show History" button. `text-secondary` text, transparent background. Tooltip: "Show History". Clicking expands the sidebar to show conversation list.
- Both buttons: 40x40px, centered in the 48px column, with 4px vertical gap between them.

### 2.3 Expanded State

```
+-------------+-------------+--------------------------------+
| TopBar (48px, full width)                                   |
+-------------+-------------+--------------------------------+
|             |             |                                |
|  Project    | HISTORY [>>]|                                |
|  Sidebar    |             |    Chat Window                 |
|  (240px     | [+ New Chat]|    (remaining width)           |
|   or 56px)  |             |                                |
|             | conv1     * |    Messages...                 |
|             | conv2       |                                |
|             | conv3       |                                |
|             |             |                                |
|             |  240px      |    [Input..............][Send] |
|             |             |                                |
+-------------+-------------+--------------------------------+
| StatusBar (24px)                                             |
+--------------------------------------------------------------+
```

**Expanded panel (240px wide)**:
- Same content as current ChatSidebar
- **Header row**: "HISTORY" label (`font-pixel text-[8px] text-text-dim`) on the left + **[>>]** collapse button on the right (`text-text-dim`, hover `text-text-secondary`). Clicking [>>] collapses back to thin toolbar.
- **New Chat button**: Full-width `PixelButton variant="primary"` (same as current)
- **Conversation list**: Identical to current ChatSidebar list items — title, agent name, relative time, active state highlighting
- Scrollable overflow for long lists

### 2.4 Width Budget Comparison

| Layout State | Sidebar Total | Chat Window (1280px) | vs Current |
|---|---|---|---|
| Current (nav expanded) | 240 + 240 = 480px | 800px | baseline |
| Current (nav collapsed) | 56 + 240 = 296px | 984px | baseline |
| **New: nav expanded, chat collapsed** | 240 + 48 = **288px** | **992px** | **+192px** |
| **New: nav collapsed, chat collapsed** | 56 + 48 = **104px** | **1176px** | **+192px** |
| New: nav expanded, chat expanded | 240 + 240 = 480px | 800px | same |
| New: nav collapsed, chat expanded | 56 + 240 = 296px | 984px | same |

**Default experience** (collapsed chat): user gets **192px more** chat area than before, regardless of ProjectSidebar state.

---

## 3. Detailed Component Spec

### 3.1 ChatSidebar — Collapsed State

```
+------+
|      |
| [+]  |  <-- 40x40px, bg-surface, border-2 border-dim,
|      |      shadow-pixel-raised, text accent-green
| [<<] |  <-- 40x40px, transparent bg, text-text-dim,
|      |      hover: text-text-secondary, hover: bg-elevated/50
|      |
|      |
|      |  <-- Rest is empty, bg-deep
|      |
+------+
  48px
```

**[+] New Chat button details**:
- Size: 40x40px (centered in 48px column with 4px padding on each side)
- Background: `bg-surface`
- Border: 2px `border-dim`
- Shadow: `shadow-pixel-raised` (beveled)
- Icon: "+" in `font-mono text-[16px] text-accent-green`
- Hover: `bg-elevated`
- Active (pressed): `shadow-pixel-sunken`, `translateY(2px)`
- Disabled (no main agent configured): `opacity-40`, `cursor-not-allowed`

**[<<] Show History button details**:
- Size: 40x40px
- Background: transparent
- Border: none
- Icon: "<<" in `font-mono text-[12px] text-text-dim`
- Hover: `text-text-secondary`, `bg-elevated/50`

### 3.2 ChatSidebar — Expanded State

```
+----------------------+
| HISTORY         [>>] |  <-- Header: 40px tall, border-b-2 border-dim
+----------------------+
| [   + New Chat     ] |  <-- PixelButton primary, full width, p-3
+----------------------+
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

**Header**:
- Height: 40px
- Padding: `px-3`
- Left: "HISTORY" in `font-pixel text-[8px] text-text-dim`
- Right: [>>] collapse button — `font-mono text-[12px] text-text-dim`, hover `text-text-secondary`, `cursor-pointer`
- Bottom border: 2px `border-dim`

**Conversation list**: Identical to current `ChatSidebar` implementation. No changes to list item styling, click behavior, or active state.

### 3.3 Expand/Collapse Animation

Use `motion/react` for the transition:

```
Expand (collapsed -> expanded):
  width: 48px -> 240px
  Duration: 200ms
  Easing: pixelSpring (stiffness: 300, damping: 30)
  Content fades in after width reaches ~200px (opacity 0->1, 100ms)

Collapse (expanded -> collapsed):
  Content fades out first (opacity 1->0, 100ms)
  Then width: 240px -> 48px
  Duration: 200ms
  Easing: same pixelSpring
```

The ChatWindow area smoothly expands/shrinks as the sidebar animates. Use `motion.div` with `layout` or `animate={{ width }}` on the ChatSidebar container.

### 3.4 State Persistence

- New state: `chatHistoryExpanded: boolean` in Zustand `ui` slice
- Default value: `false` (collapsed)
- Persisted to `localStorage` alongside existing `sidebarCollapsed`
- Restored on page load

---

## 4. Component Changes

### 4.1 Modified Files

| File | Change |
|------|--------|
| `ChatSidebar.tsx` | Add collapsed/expanded state rendering. When collapsed, render the thin 48px toolbar. When expanded, render the current full sidebar with a header + collapse button. Accept `expanded` and `onToggle` props. |
| `ChatPage.tsx` | Read `chatHistoryExpanded` from store, pass to ChatSidebar. Wire up toggle. |
| `useAppStore.ts` (ui slice) | Add `chatHistoryExpanded: boolean` (default `false`) and `toggleChatHistory()` action. Persist to localStorage. |

### 4.2 No New Files

No new components needed. This is a modification of the existing `ChatSidebar` only.

### 4.3 No Deleted Files

`ProjectSidebar`, `AppShell`, `TopBar`, `StatusBar` — all unchanged.

### 4.4 No Routing Changes

Routes remain identical. This is purely a visual/layout change within `ChatPage`.

---

## 5. Design System Compliance

| Rule | Status |
|------|--------|
| No border-radius (sharp corners) | OK — all buttons and panels use 0 radius |
| 2px borders | OK — sidebar border, button borders all 2px |
| 4px spacing grid | OK — 48px = 12x4, 40px buttons = 10x4, 4px gaps |
| Pixel font for labels | OK — "HISTORY" header uses `font-pixel text-[8px]` |
| Mono font for body | OK — button icons and conversation items use JetBrains Mono |
| Dark theme colors only | OK — `bg-deep`, `bg-surface`, `bg-elevated`, `border-dim` |
| Beveled shadows | OK — [+] button uses `shadow-pixel-raised` / `shadow-pixel-sunken` |
| `motion/react` for animation | OK — expand/collapse uses `pixelSpring` preset |
| Accent-green for primary action | OK — [+] New Chat icon is `text-accent-green` |

---

## 6. Implementation Steps

1. Add `chatHistoryExpanded` + `toggleChatHistory()` to Zustand ui slice (with localStorage persistence)
2. Modify `ChatSidebar.tsx`: add collapsed view (48px toolbar with [+] and [<<] buttons), add header with [>>] collapse button to expanded view, animate width transition
3. Modify `ChatPage.tsx`: read `chatHistoryExpanded` from store, pass to ChatSidebar, wire toggle callback
4. Verify: all existing ChatSidebar functionality (select conversation, new chat, list rendering) still works in expanded mode
5. Verify: default state is collapsed, page loads with 48px sidebar
