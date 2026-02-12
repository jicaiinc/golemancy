# Architecture Design: Chat UX v2 + Agent Config + Multi-Window

> Architect: AI Architect
> Date: 2026-02-12
> Requirement: `_requirement/20260212-1500-chat-ux-agent-config-multiwindow.md`

---

## Feature Dependency Graph

```
Independent (can run in parallel):
  [1] Chat Title Auto-generation
  [2] Chat Title Double-click Rename
  [6] IME Composition Fix
  [7] New Agent Default Provider

Depends on [1] + [2]:
  [3] Chat History Sidebar UI Redesign (needs rename to exist)

Sequential:
  [4] Running State Management Fix → [5] Abort Mechanism
  (Abort needs correct state tracking first)

Independent (heavy scope):
  [8] Skills & MCP Drag-and-Drop
  [9] Open in New Window
```

---

## 1. Chat Title Auto-generation

### Current State
- `ChatPage.tsx:47`: Title is hardcoded as `Chat with ${agent?.name ?? 'Agent'}`
- `createConversation()` in store calls `svc.conversations.create(projectId, agentId, title)` with this static title
- Server `conversations.ts:30` simply stores whatever title it receives

### Proposed Architecture

**Approach**: Create conversation with temporary title → auto-update after first user message is sent.

**Client-side changes:**
1. `ChatPage.tsx` → change `handleNewChat` to use empty string or placeholder title: `"New Chat"`
2. `ChatWindow.tsx` → in `handleSend`, after sending the first message (when `messages.length === 0` before send), auto-update the conversation title:
   - Truncate first user message to 50 chars (word-boundary aware)
   - Call a new `updateConversationTitle()` store action

**Server-side changes:**
3. `conversations.ts` → Add `PATCH /:id` endpoint to update conversation metadata (title)
4. `IConversationService` interface → Add `update(projectId, id, data: { title: string }): Promise<Conversation>` method

**Files to modify:**
- `packages/shared/src/services/interfaces.ts` — add `update` to `IConversationService`
- `packages/server/src/routes/conversations.ts` — add `PATCH /:id` route
- `packages/server/src/storage/conversations.ts` — implement update
- `packages/ui/src/services/mock/services.ts` — `MockConversationService.update()`
- `packages/ui/src/services/http/services.ts` — `HttpConversationService.update()`
- `packages/ui/src/stores/useAppStore.ts` — add `updateConversationTitle()` action
- `packages/ui/src/pages/chat/ChatPage.tsx` — change default title
- `packages/ui/src/pages/chat/ChatWindow.tsx` — auto-title on first message

### Title Truncation Logic
```typescript
function generateAutoTitle(text: string, maxLen = 50): string {
  if (text.length <= maxLen) return text
  const truncated = text.slice(0, maxLen)
  const lastSpace = truncated.lastIndexOf(' ')
  return (lastSpace > 20 ? truncated.slice(0, lastSpace) : truncated) + '...'
}
```

---

## 2. Chat Title Double-click Rename

### Current State
- `ChatSidebar.tsx:65-89`: Each conversation is a `<button>` with `onClick` → select. No edit capability.
- No title update API exists yet (will be created in Feature 1).

### Proposed Architecture

**Inline editing UX:**
1. Double-click on a conversation title → switch to `<input>` element (controlled)
2. Enter key or blur → save via `updateConversationTitle()` store action (same as Feature 1)
3. Escape → cancel edit, revert to original title

**Component changes:**
- `ChatSidebar.tsx` → Add `editingId` state + `editValue` state
- Each conversation item: `onDoubleClick` → enter edit mode
- Render `<input>` instead of `<span>` when `editingId === conv.id`
- Use `autoFocus` + `onBlur` + `onKeyDown` handlers

**Files to modify:**
- `packages/ui/src/pages/chat/ChatSidebar.tsx` — inline edit functionality

**Depends on:** Feature 1 (needs `updateConversationTitle` action and `PATCH` endpoint)

---

## 3. Chat History Sidebar UI Redesign

### Current State — Layout Problem
The current layout has THREE columns:
1. `ProjectSidebar` (w-60 expanded / w-14 collapsed) — navigation
2. `ChatSidebar` (w-[240px]) — conversation list
3. Chat main area — message display + input

When both sidebars are expanded: 240 + 240 = 480px consumed before chat content. On a 1280px window, chat gets only ~800px. With a collapsed sidebar (56px), chat gets ~984px. Still, the double-sidebar feels redundant.

### Proposed Architecture

**Design Direction:** Merge ChatSidebar INTO the ChatPage area, as an overlay/drawer panel instead of a fixed column.

**Option A: Collapsible Chat Panel (Recommended)**
- ChatSidebar becomes a collapsible panel within the chat area
- Toggle button in ChatWindow header
- When collapsed: only shows a thin strip or nothing
- When expanded: slides over the chat area (overlay or side panel)
- Default: collapsed (maximize chat space)

**Implementation:**
1. Add `chatSidebarOpen` state to UI slice in store (persisted to localStorage)
2. `ChatPage.tsx` → render ChatSidebar conditionally with slide animation
3. ChatWindow header → add toggle button for chat history panel
4. ChatSidebar width reduced to ~220px when shown
5. Use `motion` for slide-in/out animation

**Files to modify:**
- `packages/ui/src/stores/useAppStore.ts` — add `chatSidebarOpen` to UISlice
- `packages/ui/src/pages/chat/ChatPage.tsx` — conditional sidebar render
- `packages/ui/src/pages/chat/ChatSidebar.tsx` — overlay positioning
- `packages/ui/src/pages/chat/ChatWindow.tsx` — toggle button in header

**Note:** This needs UI Designer approval before implementation.

---

## 4. Running State Management Fix

### Current State — Root Cause Analysis

**Data flow for running states:**
1. User sends message → `ChatWindow.tsx` calls `chatSendMessage()` → AI SDK `useChat` starts streaming
2. `useChat` tracks `status` locally: `'idle'` → `'submitted'` → `'streaming'` → `'idle'`
3. Sub-agent states come through as `SubAgentStreamState` in tool call parts — tracked within the stream
4. When user navigates away from ChatPage, the component unmounts
5. **The Chat instance survives** (cached in `chat-instances.ts`) — streaming continues in background
6. When user returns, `ChatWindow` remounts with `useChat({ chat })` which reconnects to the cached Chat
7. **BUG**: The `status` from `useChat` is derived from the Chat instance's reactive state. But `useChat` only subscribes on mount — if the Chat finished while unmounted, useChat may not properly reflect the final state

**WebSocket analysis:**
- `ws/events.ts` defines `WsMessageEvent`, `WsTaskEvent`, `WsAgentEvent`
- `ws/handler.ts` has a `WebSocketManager` with pub/sub channels
- **BUT**: The WebSocket manager is never instantiated in `index.ts` or `app.ts`!
- The chat route (`routes/chat.ts`) uses `streamText().toUIMessageStreamResponse()` which is pure HTTP streaming (SSE via AI SDK), NOT WebSocket
- So running state is tracked purely through the HTTP stream response

**The real bug:**
The Chat instance correctly tracks streaming state via its internal reactive store. The issue is:
1. `useChat` binds to the Chat's store on mount and should get the current status
2. If the stream completed while the component was unmounted, the Chat's status is already `'idle'`
3. But any `SubAgentStreamState` objects within message parts may still show `status: 'running'` because those are **serialized snapshots** from the stream — they're tool output data, not live state

### Proposed Fix

**Problem A: SubAgent "running" ghosts in message parts**
- When the stream completes, the final `SubAgentStreamState` in the tool-result should have `status: 'done'`
- If the stream was interrupted (error, abort), some may be stuck at `'running'`
- Fix: In `ToolCallDisplay.tsx`, cross-reference the Chat instance's `status`:
  - If `chat.status === 'idle'` AND the tool's state shows `running`, display it as `done` or `interrupted`

**Problem B: Agent entity status stuck at 'running'**
- The `Agent.status` field (in store `agents` array) might not get updated when server work completes
- Server should update agent status on stream completion, but there's no mechanism for the client to receive this update
- Fix: On conversation select (re-entering a chat), re-fetch agent status

**Implementation:**
1. `ToolCallDisplay.tsx` / `SubAgentDisplay` → Accept a `chatStatus` prop; if chatStatus is `idle` but sub-agent shows `running`, display as `completed`/`interrupted`
2. `ChatWindow.tsx` → Pass `status` down to message rendering, or use a context
3. `useAppStore.ts` → In `selectConversation`, also refresh the agent's status from server
4. Consider: Add a `getStatus()` endpoint or re-fetch agent by ID on page re-entry

**Files to modify:**
- `packages/ui/src/pages/chat/ToolCallDisplay.tsx` — ghost state reconciliation
- `packages/ui/src/pages/chat/ChatWindow.tsx` — pass chat status context
- `packages/ui/src/pages/chat/MessageBubble.tsx` — thread chat status through
- `packages/ui/src/stores/useAppStore.ts` — refresh agent on conversation select

---

## 5. Abort Mechanism

### Current State
- `chat-instances.ts:65-68`: `destroyChat()` calls `chat.stop()` — this exists for cleanup
- AI SDK `Chat` class has a `stop()` method that signals the transport to abort
- Server `chat.ts`: The `streamText()` call has no `abortSignal` parameter
- Server `runtime.ts:38`: The `runAgent()` function accepts `abortSignal` parameter and passes it to `streamText()`
- Server `sub-agent.ts:53`: Sub-agent `execute` receives `abortSignal` from `{ abortSignal }` in the execute context, and passes it to child's `streamText()` at line 87

### Research Needed (Fact-Checker task)
Must verify with AI SDK source/docs:
1. How does `Chat.stop()` propagate to the server? (Does it close the HTTP connection? Does it send a specific signal?)
2. Does Hono detect closed connections and provide an abort signal?
3. What is the recommended pattern for aborting `streamText` from the server side?

### Proposed Architecture

**Client-side:**
1. `ChatInput.tsx` → When `isBusy` is true, replace "Send" button with "Stop" button (square icon, pixel style)
2. "Stop" button onClick → call `chat.stop()` on the current Chat instance
3. `ChatWindow.tsx` → expose `chat.stop()` to ChatInput via a callback prop

**Server-side:**
4. `routes/chat.ts` → Use Hono's request context to get an `AbortSignal` from the HTTP connection
   - When the client aborts (closes connection), the signal fires
   - Pass this signal to `streamText()` as `abortSignal`
5. `streamText` abort propagation:
   - When `abortSignal` fires, `streamText` stops generation
   - Active tool calls receive the same signal through `execute()`'s context
   - Sub-agents already pass `abortSignal` to their own `streamText` (line 87)
   - This gives us full cascade: main agent → tools → sub-agents → their tools

**Implementation pattern:**
```typescript
// routes/chat.ts - pass request abort signal
app.post('/', async (c) => {
  // c.req.raw is the underlying Request, which has .signal for AbortController
  const abortSignal = c.req.raw.signal

  const result = streamText({
    model,
    system: systemPrompt,
    messages: modelMessages,
    tools: hasTools ? allTools : undefined,
    abortSignal, // <-- propagates to all tools including sub-agents
    // ...
  })

  return result.toUIMessageStreamResponse(/* ... */)
})
```

**UI changes:**
- `ChatInput.tsx` → Add stop button variant
- `ChatWindow.tsx` → Pass stop handler

**Files to modify:**
- `packages/server/src/routes/chat.ts` — add abortSignal from request
- `packages/ui/src/pages/chat/ChatInput.tsx` — stop button
- `packages/ui/src/pages/chat/ChatWindow.tsx` — wire stop to Chat.stop()

---

## 6. IME Composition Fix

### Current State
- `ChatInput.tsx:24-28`:
  ```typescript
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }
  ```
- **Bug**: During IME composition (Chinese input), pressing Enter to select a character fires `keyDown` with `e.key === 'Enter'`, triggering send before composition is complete.

### Proposed Fix

Use the `isComposing` property from the keyboard event:

```typescript
const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
    e.preventDefault()
    handleSend()
  }
}
```

**Why `e.nativeEvent.isComposing`?** React's `KeyboardEvent` wraps the native event. The `isComposing` flag is on the native DOM `KeyboardEvent`. In React, access it via `e.nativeEvent.isComposing`.

**Alternative (more robust):** Also listen for `compositionstart`/`compositionend` events and track state:
```typescript
const [isComposing, setIsComposing] = useState(false)
// on textarea: onCompositionStart={() => setIsComposing(true)} onCompositionEnd={() => setIsComposing(false)}
```

**Recommended:** Use `e.nativeEvent.isComposing` — simpler, no extra state. The `isComposing` property is well-supported in all modern browsers.

**Files to modify:**
- `packages/ui/src/pages/chat/ChatInput.tsx` — add `isComposing` check

---

## 7. New Agent Default Provider

### Current State
- `AgentCreateModal.tsx:19-20`:
  ```typescript
  const [provider, setProvider] = useState<AIProvider>('openai')
  const [model, setModel] = useState('gpt-4o')
  ```
- Provider defaults to `'openai'` with model `'gpt-4o'` — should default to "inherit" (use project/global config)
- `AgentModelConfig` type allows `provider?: AIProvider` — undefined means inherit

### Proposed Fix

1. Change default state to `undefined` for provider and empty string for model
2. Add "Inherit" option to the provider dropdown
3. When provider is undefined/inherit, model field can be left empty (will use parent config)

**Implementation:**
```typescript
const [provider, setProvider] = useState<AIProvider | undefined>(undefined)
const [model, setModel] = useState('')

// In submit:
modelConfig: {
  provider: provider || undefined, // undefined = inherit
  model: model || undefined,
}

// In dropdown, add inherit option:
<option value="">Inherit (from project/global)</option>
```

**Files to modify:**
- `packages/ui/src/pages/agent/AgentCreateModal.tsx` — default provider to undefined, add "inherit" option

---

## 8. Skills & MCP Drag-and-Drop

### Current State
- Skills are created via form in the UI (name, description, instructions)
- MCP servers are configured with structured form fields
- No file upload mechanism exists anywhere

### Proposed Architecture

**8a. MCP Config Drag-and-Drop**

Expected input: JSON file matching the Claude MCP config format:
```json
{
  "mcpServers": {
    "server-name": {
      "transportType": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-name"]
    }
  }
}
```
This matches our existing `MCPProjectFile` type in `packages/shared/src/types/mcp.ts`.

**Client-side:**
1. Add a drop zone component on the MCP Servers page
2. On file drop → read JSON → validate against `MCPProjectFile` schema
3. For each server in the file → call `createMCPServer()` store action
4. Show success/error feedback

**8b. Skills Drag-and-Drop**

Expected input: A `.zip` file containing skill files (markdown files with skill instructions).

**Client-side:**
1. Add a drop zone component on the Skills page
2. On file drop → if `.zip`, need server-side processing; if `.md`, read directly
3. For `.md` files: read content, extract name from filename, create skill via `createSkill()`

**Server-side (for .zip):**
4. New endpoint: `POST /api/projects/:projectId/skills/upload` (multipart form)
5. Server receives zip → extracts markdown files → creates skills
6. Need to increase body size limit for this endpoint (currently 2MB global)

**Shared component:**
- Create a `PixelDropZone` base component in `packages/ui/src/components/base/`
- Supports drag events, file type filtering, visual feedback

**Files to modify/create:**
- `packages/ui/src/components/base/PixelDropZone.tsx` — new drop zone component
- `packages/ui/src/pages/skill/SkillListPage.tsx` — integrate drop zone (need to check if exists)
- `packages/ui/src/pages/mcp/` — integrate drop zone for MCP config (need to check page structure)
- `packages/server/src/routes/skills.ts` — add upload endpoint
- `packages/server/src/app.ts` — exempt upload route from 2MB limit

---

## 9. Open in New Window

### Current State
- Single `BrowserWindow` created in `apps/desktop/src/main/index.ts:80-102`
- Server process is shared (single child process)
- Port and token passed via `additionalArguments` in preload
- All state is in Zustand store (per-renderer process, not shared)

### Proposed Architecture

**Electron Multi-Window Pattern:**
1. Each window gets its own renderer process → its own React app → its own Zustand store
2. All windows share the SAME server process (already running on a port)
3. Each window independently connects to the server via HTTP/WebSocket

**Implementation:**

**Main process:**
1. Add IPC handler: `open-new-window` → creates a new `BrowserWindow` with same preload and server args
2. Accept optional `projectId` parameter to deep-link into a specific project
3. New window opens at route `#/projects/${projectId}` if projectId given

**Preload:**
4. Expose `openNewWindow(projectId?)` via `contextBridge`

**Renderer:**
5. Add "Open in New Window" button/menu item on project cards and project header
6. Calls `window.electronAPI.openNewWindow(projectId)`

**State isolation:**
- Each window has independent Zustand store — they don't share memory
- Both stores talk to the same server, so data is consistent at the server level
- WebSocket events (when implemented) would keep windows in sync

**Window management:**
- Track open windows in main process Map
- On `window-all-closed`, handle macOS dock behavior
- Each window has independent navigation state

**Files to modify:**
- `apps/desktop/src/main/index.ts` — `createWindow` accepts projectId, IPC handler
- `apps/desktop/src/preload/index.ts` — expose `openNewWindow()`
- `packages/ui/src/types/electron.d.ts` — type declaration update
- `packages/ui/src/pages/project/ProjectListPage.tsx` (or wherever project cards are) — add "Open in New Window" action
- `packages/ui/src/components/layout/ProjectSidebar.tsx` — add menu option

**Architecture diagram:**
```
┌─────────────────┐     ┌─────────────────┐
│   Window 1      │     │   Window 2      │
│ (BrowserWindow) │     │ (BrowserWindow) │
│                 │     │                 │
│ React App       │     │ React App       │
│ Zustand Store   │     │ Zustand Store   │
│ (independent)   │     │ (independent)   │
└────────┬────────┘     └────────┬────────┘
         │  HTTP/WS              │  HTTP/WS
         └──────────┬────────────┘
                    │
         ┌──────────▼──────────┐
         │   Server Process    │
         │   (shared, single)  │
         │   Port: dynamic     │
         │   Token: shared     │
         └─────────────────────┘
```

---

## Implementation Priority & Parallelism Plan

### Wave 1 (Fully parallel — no dependencies)
| Feature | Effort | Notes |
|---------|--------|-------|
| 6. IME Fix | XS | Single line change |
| 7. Default Provider | S | Small modal change |
| 1. Chat Title Auto-gen | M | Needs new API endpoint |

### Wave 2 (After Wave 1 API is ready)
| Feature | Effort | Notes |
|---------|--------|-------|
| 2. Title Rename | S | Uses API from Feature 1 |

### Wave 3 (After Wave 2, needs UI Designer input)
| Feature | Effort | Notes |
|---------|--------|-------|
| 3. Chat Sidebar Redesign | M | Needs user confirmation on design |

### Wave 4 (Can start after Wave 1 or in parallel if sufficient engineers)
| Feature | Effort | Notes |
|---------|--------|-------|
| 4. Running State Fix | M | Deep state analysis |
| 5. Abort Mechanism | M | Needs Fact Checker for AI SDK |

### Wave 5 (Independent, can run anytime)
| Feature | Effort | Notes |
|---------|--------|-------|
| 8. Drag-and-Drop | L | New component + upload endpoint |
| 9. Multi-Window | L | Electron layer changes |

---

## Cross-cutting Concerns

### New Service Method: `IConversationService.update()`
Required by Features 1 and 2. Must be added to:
1. `packages/shared/src/services/interfaces.ts`
2. All implementations (Mock, HTTP, Server storage)
3. Server route

### AI SDK Fact-Check Required (Feature 5)
Before implementing abort:
- Verify `Chat.stop()` behavior in AI SDK v6
- Verify Hono request abort signal availability (`c.req.raw.signal`)
- Verify `streamText` abort propagation through tool execute contexts

### UI Designer Input Required (Feature 3)
Chat sidebar redesign needs visual mockup and user approval before implementation.
