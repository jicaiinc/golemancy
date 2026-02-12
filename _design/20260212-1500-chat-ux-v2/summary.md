# Design Phase Summary — Chat UX v2

> Team Lead | 2026-02-12
> Requirement: `_requirement/20260212-1500-chat-ux-agent-config-multiwindow.md`

---

## Design Artifacts

| File | Author | Status |
|------|--------|--------|
| `architecture.md` | Architect | Complete |
| `fact-check.md` | Fact Checker | Complete (including tool abort deep dive) |
| `ui-design.md` | UI/UX Designer | v2 complete, awaiting user approval |
| `summary.md` | Team Lead | This file |

---

## Feature Implementation Plan

### Wave 1 — No dependencies, parallel
| # | Feature | Effort | Key Approach |
|---|---------|--------|-------------|
| 6 | IME Fix | XS | `!e.nativeEvent.isComposing` in `ChatInput.tsx` handleKeyDown |
| 7 | Default Provider | S | `AgentCreateModal.tsx` — change default state to undefined (inherit) |
| 1 | Chat Title Auto-gen | M | New `IConversationService.update()` + truncate first user message as title |

### Wave 2 — Depends on Wave 1 API
| # | Feature | Effort | Key Approach |
|---|---------|--------|-------------|
| 2 | Title Rename | S | Double-click inline edit in ChatSidebar, uses same update API |

### Wave 3 — Needs user UI approval
| # | Feature | Effort | Key Approach |
|---|---------|--------|-------------|
| 3 | Chat Sidebar Redesign | M | Collapsible ChatSidebar: default 48px collapsed, expand to 240px |

### Wave 4 — Can parallel with Wave 2-3
| # | Feature | Effort | Key Approach |
|---|---------|--------|-------------|
| 4 | Running State Fix | M | Cross-reference chat.status in ToolCallDisplay; if idle but tool shows running → display as done |
| 5 | Abort Mechanism | M | Client: `chat.stop()` → Server: `c.req.raw.signal` → `streamText({ abortSignal })` → cascade to sub-agents |

### Wave 5 — Independent, heavy
| # | Feature | Effort | Key Approach |
|---|---------|--------|-------------|
| 8 | Drag-and-Drop | L | PixelDropZone component + server upload endpoint for zip |
| 9 | Multi-Window | L | `new BrowserWindow()` + `additionalArguments` for projectId |

---

## Key Technical Decisions

### 1. Conversation Update API (Features 1 & 2)
- Add `update(projectId, id, data)` to `IConversationService` interface
- Add `PATCH /api/projects/:projectId/conversations/:id` server route
- Implement in MockConversationService + HttpConversationService + server storage
- Title truncation: 50 chars, word-boundary aware

### 2. Abort Chain (Feature 5) — Fully Verified with Line Numbers

**Complete abort cascade (source-verified)**:
```
Layer 0: Client — chat.stop() / useChat().stop() aborts fetch
Layer 1: HTTP — connection closes → Hono c.req.raw.signal fires
Layer 2: chat.ts:128 — streamText({ abortSignal: c.req.raw.signal }) [MUST ADD]
Layer 3: AI SDK — stops LLM generation, passes abortSignal to tool execute()
Layer 4a: sub-agent.ts:53 — receives { abortSignal }, line 87 passes to child streamText
         → child tools also receive abortSignal (infinite depth)
         → finally block (line 140-142) guarantees cleanup
Layer 4b: bash-tool — IGNORES abortSignal, commands run to completion (acceptable)
Layer 4c: MCP tools — @ai-sdk/mcp handles abort via protocol cancellation automatically
```

**Required changes** (only 2 lines in 1 file):
1. `routes/chat.ts:128` — Add `abortSignal: c.req.raw.signal` to `streamText()`
2. `routes/chat.ts:136` — Add `onAbort` callback alongside `onFinish` for cleanup (use idempotent `ensureCleanup` pattern)

**What already works (no changes needed)**:
- `sub-agent.ts:53,87` — abort cascade through infinite sub-agent nesting
- `runtime.ts:38` — passes abortSignal (task-based execution path)
- `@ai-sdk/mcp` — protocol-level cancellation
- `sub-agent.ts:140-142` — finally block cleanup on abort

**What does NOT abort (acceptable for now)**:
- `bash-tool` (v1.3.14) — `just-bash` in-memory interpreter ignores abortSignal; commands complete but no NEW steps are requested after abort. Future custom sandbox with `child_process` should wire `abortSignal` to `process.kill()`

### 3. Running State Fix (Feature 4)
Root cause: No WebSocket — chat uses pure HTTP SSE. SubAgentStreamState objects in message parts are serialized snapshots. If stream completed while component unmounted, snapshots still show `status: 'running'`.
- Fix: In ToolCallDisplay, if chat.status === 'idle' but tool shows 'running', render as 'done'/'interrupted'

### 4. Chat Sidebar UI (Feature 3)
**v2 Design (after v1 rejection)**:
- Keep ProjectSidebar unchanged
- ChatSidebar collapsed by default (48px): [+] New Chat + [<<] Show History buttons
- Expanded (240px): full history list with [>>] collapse button
- State in Zustand ui slice: `chatHistoryExpanded: boolean` (default false, localStorage persisted)
- Animation: motion/react pixelSpring, 200ms width transition
- Files: ChatSidebar.tsx, ChatPage.tsx, useAppStore.ts (ui slice)
- **Status: Awaiting user approval**

### 5. IME Fix (Feature 6)
One-line fix: `!e.nativeEvent.isComposing` — verified reliable in Electron/Chromium.

### 6. Default Provider (Feature 7)
Change `AgentCreateModal.tsx` default from `'openai'`/`'gpt-4o'` to `undefined` (inherit).

### 7. Multi-Window (Feature 9)
- Each window = new BrowserWindow with independent Zustand store
- All windows share single server process (HTTP backend is source of truth)
- Pass projectId via `additionalArguments` → preload extracts → React auto-selects
- No cross-window state sync needed
- ~150-250MB RAM per window

### 8. Drag-and-Drop (Feature 8)
- MCP: Accept JSON config files matching `MCPProjectFile` type
- Skills: Accept .md files directly or .zip containing markdown
- New PixelDropZone base component
- Server upload endpoint for zip (needs body limit exemption)

---

## Shared Dependencies (Must implement first)
1. `IConversationService.update()` — needed by Features 1, 2
2. `abortSignal` wiring in `routes/chat.ts` — needed by Features 4, 5

## Pending Items
- [ ] User approval on UI design v2 (Feature 3) — user is reviewing competitor products for reference
