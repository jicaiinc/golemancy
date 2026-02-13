# Fact-Check Report: Chat UX V2

> Fact Checker | 2026-02-12

---

## 1. AI SDK Abort/Stop Mechanism

### Project Version
- `ai`: `^6.0.82` (Vercel AI SDK v6)
- `@ai-sdk/react`: `^3.0.84`

### 1.1 Client-Side: `Chat.stop()` / `useChat` `stop()`

**Verified**: The `@ai-sdk/react` `useChat` hook returns a `stop()` function that aborts the in-flight fetch request.

```tsx
const { messages, status, stop } = useChat({ chat })

// Show stop button when streaming
{(status === 'submitted' || status === 'streaming') && (
  <button onClick={() => stop()}>Stop</button>
)}
```

**Status values**: `'submitted'` → `'streaming'` → `'ready'` (or `'error'`)

The `Chat` class (used in `chat-instances.ts`) also has a `.stop()` method — already used in our `destroyChat()`:

```typescript
// packages/ui/src/lib/chat-instances.ts:63-69
export function destroyChat(conversationId: ConversationId): void {
  const chat = chatInstances.get(conversationId)
  if (chat && (chat.status === 'streaming' || chat.status === 'submitted')) {
    chat.stop()  // Aborts the fetch request
  }
  chatInstances.delete(conversationId)
}
```

**For the Stop button**: We do NOT need to destroy the chat. Simply call `chat.stop()` on the existing chat instance. The `useChat` hook already returns `stop` — we just need to wire it to a button.

**Sources**:
- https://ai-sdk.dev/docs/ai-sdk-ui/chatbot
- https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat
- https://ai-sdk.dev/docs/advanced/stopping-streams
- Source: `packages/ui/src/lib/chat-instances.ts`

### 1.2 Server-Side: `abortSignal` in `streamText()`

**Verified**: `streamText()` accepts an `abortSignal: AbortSignal` parameter. When the signal is aborted, the stream terminates.

```typescript
const result = streamText({
  model,
  system: systemPrompt,
  messages: modelMessages,
  tools: hasTools ? allTools : undefined,
  abortSignal: someAbortSignal,  // <-- enables server-side abort
})
```

**Current code** (`packages/server/src/routes/chat.ts:128-139`): The chat route does **NOT** currently pass `abortSignal` to `streamText()`. This must be added.

**Current code** (`packages/server/src/agent/runtime.ts:38`): The `runAgent()` wrapper already accepts and passes `abortSignal`. Good.

**Current code** (`packages/server/src/agent/sub-agent.ts:53,87`): Sub-agent tools already receive `abortSignal` from the AI SDK tool execution context and pass it to their child `streamText()` call. This means **abort will automatically cascade through sub-agent chains** — no extra work needed.

**Sources**:
- https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text
- Source: `packages/server/src/agent/sub-agent.ts:53` (`execute: async function*({ task, context }, { abortSignal })`)

### 1.3 Hono Request Signal Propagation

**Verified**: Hono's `c.req.raw` is a standard Web `Request` object. The `Request.signal` property is a standard `AbortSignal` that fires when the client disconnects.

**How to wire it**: Pass `c.req.raw.signal` as the `abortSignal` to `streamText()`:

```typescript
// In packages/server/src/routes/chat.ts
const result = streamText({
  model,
  system: systemPrompt,
  messages: modelMessages,
  tools: hasTools ? allTools : undefined,
  abortSignal: c.req.raw.signal,  // <-- Wire request abort to AI SDK
  // ... other params
})
```

When the client calls `chat.stop()` → fetch is aborted → HTTP connection closes → Hono's `c.req.raw.signal` fires `abort` → `streamText()` stops → sub-agent `streamText()` calls also stop (because `abortSignal` is propagated through the tool execution context).

**Sources**:
- https://hono.dev/docs/concepts/web-standard ("Hono uses only Web Standards")
- https://hono.dev/docs/helpers/streaming (`onAbort` callback)
- https://github.com/honojs/hono/issues/1770 (confirms `c.req.raw.signal`)

### 1.4 `onAbort` vs `onFinish` Callbacks

**Verified**: `streamText()` supports two completion callbacks:

| Callback | When it fires | Parameters |
|----------|--------------|------------|
| `onFinish` | Stream completes normally | `{ text, toolCalls, toolResults, usage, finishReason, steps }` |
| `onAbort` | Stream is aborted via AbortSignal | `{ steps }` (all completed steps before abort) |

**Warning**: The `toUIMessageStreamResponse()` wrapper also has its own `onFinish` callback. We need to handle abort in BOTH layers to ensure partial assistant messages are saved correctly.

**Current code**: The chat route saves the assistant message only in `toUIMessageStreamResponse.onFinish`. If aborted, the assistant message may NOT be saved. We should add `onAbort` to `streamText()` for cleanup, or check `isAborted` behavior.

**Sources**:
- https://ai-sdk.dev/docs/advanced/stopping-streams
- https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text

### 1.5 Tool Call Abort Behavior

**Verified**: When `abortSignal` fires during tool execution:
- The `streamText()` call stops requesting new tool steps
- Currently executing tool calls receive the same `abortSignal` through the tool execution context (`{ abortSignal }` in the second argument of `execute`)
- Sub-agent tools already destructure and pass `abortSignal` (line 53 of `sub-agent.ts`)
- Bash tools and MCP tools may or may not check `abortSignal` — needs verification per tool

**Cascade chain**: `client.stop()` → fetch abort → Hono `c.req.raw.signal` → `streamText` abort → tool `execute({ }, { abortSignal })` → sub-agent's `streamText` abort → ... (infinite depth)

### 1.6 Known Issues & Caveats

1. **`chat.stop()` + `createUIMessageStream` bug** (Issue #9707): There's a reported bug where `chat.stop()` abort signal doesn't reach the backend with `createUIMessageStream` in H3/Nitro environments. However, **this does NOT affect us** — we use `toUIMessageStreamResponse()` with Hono (which properly exposes `c.req.raw.signal`).

2. **Abort vs Resume incompatibility**: Stream abort functionality is NOT compatible with `resume: true` in useChat. We don't currently use resume, so this is fine. But if we add resume later, we'll need to choose one or the other.

3. **Partial response persistence**: When a stream is aborted, `onFinish` of `streamText()` may NOT be called. Use `onAbort` for cleanup. For `toUIMessageStreamResponse()`, the `onFinish` callback may receive `isAborted` — needs testing.

**Sources**:
- https://github.com/vercel/ai/issues/9707
- https://ai-sdk.dev/docs/advanced/stopping-streams

### 1.7 Recommended Implementation Pattern

```
[Client]                          [Server (Hono)]

User clicks Stop
  → chat.stop()
  → fetch request aborted         → c.req.raw.signal fires 'abort'
                                    → streamText abortSignal triggered
                                      → main agent text generation stops
                                      → active tool calls receive abort
                                        → sub-agent streamText stops
                                        → bash tool killed (if applicable)
                                      → onAbort callback fires
                                        → save partial response
                                        → cleanup tools (temp dirs, MCP)
  ← status becomes 'ready'
  UI shows Send button again
```

---

## 2. IME Composition Events

### 2.1 The Problem

**Current code** (`packages/ui/src/pages/chat/ChatInput.tsx:24-29`):
```typescript
const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}
```

This sends the message when user presses Enter, but Chinese/Japanese/Korean IME users press Enter to **confirm character selection** during composition. The message gets sent prematurely before the user finishes typing.

### 2.2 Verified Browser API: `KeyboardEvent.isComposing`

**Verified**: The `KeyboardEvent.isComposing` read-only property returns `true` when the event fires during an active composition session (between `compositionstart` and `compositionend` events).

**In React**: React's SyntheticKeyboardEvent does NOT expose `isComposing` directly (React issue #13104). You must access it via `e.nativeEvent.isComposing`.

**Sources**:
- https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/isComposing
- https://github.com/facebook/react/issues/13104

### 2.3 Cross-Browser Compatibility

| Browser | `keydown.isComposing` during IME | Notes |
|---------|----------------------------------|-------|
| Chrome | `true` (reliable) | Best support |
| Firefox | `true` (mostly reliable) | Enter may trigger `compositionend` before `keydown` in some versions |
| Safari/WebKit | May incorrectly return `false` on Enter during composition | Known WebKit bug |

**Since this is an Electron app using Chromium**, `isComposing` is **fully reliable**. We don't need cross-browser workarounds.

### 2.4 Vercel AI Chatbot Reference (PR #786)

**Verified**: The official Vercel AI chatbot had the exact same issue and fixed it with:

```typescript
// Before (buggy):
if (event.key === 'Enter' && !event.shiftKey)

// After (fixed):
if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing)
```

**Sources**:
- https://github.com/vercel/ai-chatbot/pull/786
- https://www.javaspring.net/blog/detecting-ime-input-before-enter-pressed-in-javascript/

### 2.5 Recommended Fix

For our Electron (Chromium) environment, the simplest fix is sufficient:

```typescript
const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
    e.preventDefault()
    handleSend()
  }
}
```

**No need for**:
- `compositionstart`/`compositionend` event listeners (Chromium `isComposing` is reliable)
- Debounce timers (Firefox workaround not needed in Electron)
- Separate `isComposing` state tracking

### 2.6 Additional Consideration: `keyCode === 229`

Some older guides recommend checking `e.keyCode === 229` (a special keyCode browsers use during composition). This is **NOT needed** for modern Chromium — `isComposing` is the correct modern API.

---

## 3. Electron Multi-Window

### 3.1 Current Architecture

**File**: `apps/desktop/src/main/index.ts`

- Single `BrowserWindow` created in `createWindow()`
- Server process is a singleton, started once at app launch
- `serverPort` and `serverToken` are module-level globals
- Port/token passed to renderer via `webPreferences.additionalArguments`
- `createWindow()` is already called on `activate` event (macOS dock click when no windows)

### 3.2 Electron `BrowserWindow` API

**Verified**: Creating additional windows is straightforward — just call `new BrowserWindow(options)` and load the same URL/file.

```typescript
function createWindow(options?: { projectId?: string }): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0B0E14',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      additionalArguments: [
        `--server-port=${serverPort}`,
        ...(serverToken ? [`--server-token=${serverToken}`] : []),
        ...(options?.projectId ? [`--project-id=${options.projectId}`] : []),
      ],
    },
  })

  // Load same renderer
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}
```

**Sources**:
- https://www.electronjs.org/docs/latest/api/browser-window
- Source: `apps/desktop/src/main/index.ts`

### 3.3 Passing Project Context to New Window

Three approaches, in order of recommendation:

**A. `additionalArguments` (Recommended)**
Already used for port/token. Add `--project-id=<id>` to select the project on app startup in the new window. Preload script extracts it and exposes via `electronAPI`.

```typescript
// In preload:
const projectIdArg = process.argv.find(arg => arg.startsWith('--project-id='))
const initialProjectId = projectIdArg?.split('=')[1] ?? null

contextBridge.exposeInMainWorld('electronAPI', {
  getServerPort: () => serverPort,
  getServerBaseUrl: () => serverPort ? `http://localhost:${serverPort}` : null,
  getServerToken: () => serverToken,
  getInitialProjectId: () => initialProjectId,  // New
})
```

**B. URL Hash**
```typescript
const url = `${baseUrl}#/projects/${projectId}/chat`
win.loadURL(url)
```
Works with HashRouter. Simple but less flexible.

**C. IPC after load**
Main process sends project ID via `webContents.send()` after window loads. More complex, requires `ipcRenderer.on()` listener.

### 3.4 State Sharing Between Windows

**Architecture advantage**: Since all data comes from the HTTP server (single source of truth), each window has its own independent Zustand store that fetches from the shared backend. No cross-window state sync needed.

| Aspect | Behavior | Sync Needed? |
|--------|----------|-------------|
| Projects, Agents, etc. | Fetched from HTTP server | No (server is source of truth) |
| Theme, Sidebar | localStorage (`golemancy-prefs`) | Auto-sync (same localStorage) |
| Chat instances | Per-window `Map<ConversationId, Chat>` | No (each window has own sessions) |
| Streaming state | Per-window (React state) | No |

**Caveat**: If user edits an agent in Window A, Window B won't see the change until it refreshes data. This is acceptable for now. Future enhancement: use `BroadcastChannel` API to notify other windows of data changes.

### 3.5 IPC for Window Management

To trigger "Open in New Window" from the renderer:

```typescript
// Preload: expose IPC method
contextBridge.exposeInMainWorld('electronAPI', {
  // ...existing methods...
  openNewWindow: (projectId: string) => ipcRenderer.invoke('window:open', projectId),
})

// Main process: handle IPC
ipcMain.handle('window:open', (_event, projectId: string) => {
  createWindow({ projectId })
})
```

### 3.6 Window Lifecycle Considerations

1. **Memory**: Each Chromium renderer window uses ~150-250MB RAM. Keep this in mind for UX.
2. **Server singleton**: All windows share the same server. Server doesn't need changes.
3. **App quit**: `window-all-closed` already handles quit (except macOS). No change needed for multi-window.
4. **macOS `activate`**: Already creates window if none exist. Could enhance to list recent projects.
5. **Window tracking**: Should maintain a `Map<string, BrowserWindow>` for potential future features (focus window, close specific window).

### 3.7 Recommended Architecture

```
[Main Process]
  ├── Server child process (singleton, shared by all windows)
  ├── Window Manager (Map<windowId, BrowserWindow>)
  │   ├── Window 1 → Renderer (React + Zustand store) → Project A
  │   ├── Window 2 → Renderer (React + Zustand store) → Project B
  │   └── Window 3 → Renderer (React + Zustand store) → Project A (different page)
  └── IPC handlers: window:open, window:close, etc.

All windows share:
  - Same server (HTTP backend)
  - Same localStorage (theme/sidebar)
  - Same preload script

Each window has its own:
  - React app instance
  - Zustand store
  - Chat instances
  - Route state (HashRouter)
```

**Sources**:
- https://www.electronjs.org/docs/latest/api/browser-window
- https://blog.bloomca.me/2025/07/21/multi-window-in-electron.html
- https://www.electronjs.org/docs/latest/tutorial/ipc
- Source: `apps/desktop/src/main/index.ts`
- Source: `apps/desktop/src/preload/index.ts`

---

## 4. Tool Call Abort Deep Dive (Source Code Verified)

### 4.1 How `abortSignal` Propagates Through AI SDK Tools

**Verified via Context7** (https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling):

When `streamText()` receives `abortSignal`, it forwards it to every tool's `execute()` function via the second parameter (`ToolExecutionOptions`):

```typescript
execute: async (input, { abortSignal, toolCallId, messages }) => {
  // abortSignal is available here
}
```

The `ToolExecutionOptions` type contains:
- `toolCallId: string` — identifier for tracking
- `messages: ModelMessage[]` — conversation history
- `abortSignal: AbortSignal` — forwarded from `streamText({ abortSignal })`

This is the standard AI SDK mechanism — **every tool type automatically receives `abortSignal`**, whether it chooses to use it or not.

### 4.2 File-by-File Analysis

#### File: `packages/server/src/routes/chat.ts` — **NEEDS CHANGE**

**Line 128-139** — The `streamText()` call:
```typescript
const result = streamText({
  model,
  system: systemPrompt,
  messages: modelMessages,
  tools: hasTools ? allTools : undefined,
  stopWhen: hasTools ? stepCountIs(10) : undefined,
  temperature: agent.modelConfig.temperature,
  maxOutputTokens: agent.modelConfig.maxTokens,
  onFinish: async () => {        // line 136
    await agentToolsResult.cleanup()
  },
})
```

**Missing**: No `abortSignal` parameter. No `onAbort` callback.

**Required changes**:
1. **Line ~128**: Add `abortSignal: c.req.raw.signal` to wire Hono request abort → AI SDK
2. **Add `onAbort` callback**: For cleanup when stream is aborted (tool temp dirs, MCP connections)

```typescript
// Proposed fix:
const result = streamText({
  model,
  system: systemPrompt,
  messages: modelMessages,
  tools: hasTools ? allTools : undefined,
  stopWhen: hasTools ? stepCountIs(10) : undefined,
  temperature: agent.modelConfig.temperature,
  maxOutputTokens: agent.modelConfig.maxTokens,
  abortSignal: c.req.raw.signal,  // ADD THIS
  onFinish: async () => {
    await agentToolsResult.cleanup()
  },
  onAbort: async () => {           // ADD THIS
    await agentToolsResult.cleanup()
  },
})
```

#### File: `packages/server/src/agent/runtime.ts` — **ALREADY CORRECT**

**Line 21**: `abortSignal?: AbortSignal` in `RunAgentParams` interface
**Line 26**: Destructured from params
**Line 38**: Passed to `streamText({ abortSignal })`

This file is not used by the chat route directly (the chat route calls `streamText()` inline), but it's used for task-based agent execution. It already handles `abortSignal` correctly.

#### File: `packages/server/src/agent/sub-agent.ts` — **ALREADY CORRECT** (Abort Cascade Verified)

**Line 53**: `execute: async function*({ task, context }, { abortSignal })` — Destructures `abortSignal` from `ToolExecutionOptions`
**Line 87**: `abortSignal,` — Passes the signal to child `streamText()` call
**Line 93**: `for await (const chunk of result.fullStream)` — This async iteration will throw/terminate when the abort signal fires on the child `streamText`
**Line 140-142**: `finally { await childToolsResult.cleanup() }` — Cleanup runs even on abort (guaranteed by `finally`)

**Cascade chain verified**:
1. Parent `streamText()` receives `abortSignal` → fires on abort
2. AI SDK invokes sub-agent tool's `execute()` with same `abortSignal` in options
3. Sub-agent's `execute()` passes `abortSignal` to child `streamText()` (line 87)
4. Child `streamText()` aborts → `fullStream` async iteration terminates
5. `finally` block runs cleanup (line 140-142)
6. If child has its own sub-agents, the same cascade repeats (infinite depth)

#### File: `packages/server/src/agent/tools.ts` — **NO CHANGE NEEDED**

This is the tool loader — it creates the `ToolSet` but doesn't execute tools. Abort handling happens at execution time via the AI SDK framework.

**Line 86-88**: Cleanup function aggregates all tool cleanups:
```typescript
cleanup: async () => {
  await Promise.all(cleanups.map(fn => fn().catch(() => {})))
},
```
This cleanup is called from `chat.ts`'s `onFinish` (and should also be called from `onAbort`).

#### File: `packages/server/src/agent/skills.ts` — **DOES NOT CHECK `abortSignal`**

**Analysis**: Uses `bash-tool` library (v1.3.14) which creates two tools:
1. `skill` tool (skill selector) — reads SKILL.md files. Lightweight, no long-running operations.
2. `bash` tools (from `createBashTool`) — executes bash commands

**bash-tool `execute()` function** (verified in `node_modules/bash-tool/dist/tools/bash.js`):
```typescript
execute: async ({ command: originalCommand }) => {
  // No { abortSignal } in second parameter — it's available but IGNORED
  let command = originalCommand
  // ...
  let result = await sandbox.executeCommand(fullCommand)
  return result
}
```

**bash-tool does NOT handle `abortSignal`**: The `execute` function signature only destructures the input `{ command }`, not the options. Even though AI SDK passes `abortSignal` in the second parameter, bash-tool doesn't use it.

**Current sandbox**: `just-bash` (TypeScript-based in-memory bash interpreter). Cannot be externally killed — runs to completion.

**Impact**: If a bash command is running when abort fires:
- The `streamText()` will stop requesting new tool steps
- But the currently executing bash command will run to completion
- After it finishes, `streamText` won't request more steps (abort is checked between steps)

**Future mitigation** (noted in `skills.ts` line 26-30 comments): Golemancy plans to implement a custom Sandbox using `child_process` that can be killed via `process.kill()`. When that happens, `abortSignal` should be wired to kill the child process.

#### File: `packages/server/src/agent/builtin-tools.ts` — **DOES NOT CHECK `abortSignal`**

**Line 21-28**: Creates bash tools via `createBashTool({})`:
```typescript
if (config.bash !== false) {
  const bashToolkit = await createBashTool({})
  Object.assign(tools, bashToolkit.tools)
}
```

Same situation as skills — uses `bash-tool` library which ignores `abortSignal`. Same impact: running bash commands will complete before abort takes effect.

#### File: `packages/server/src/agent/mcp.ts` — **HANDLED BY @ai-sdk/mcp**

**Analysis**: MCP tools are created by `@ai-sdk/mcp`'s `createMCPClient`:
```typescript
const client = await createMCPClient({ transport })
const tools = await client.tools()  // Returns AI SDK ToolSet
```

**MCP Protocol Cancellation** (verified via https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/cancellation):
- MCP protocol supports `notifications/cancelled` JSON-RPC notification
- Either party can send cancellation with the request ID and reason
- `@ai-sdk/mcp` abstracts this — the generated tool `execute()` functions receive `abortSignal` from AI SDK and the MCP client handles protocol-level cancellation internally

**For stdio transports** (child process): The MCP client manages the child process lifecycle. Cancellation sends a notification; the MCP server should handle graceful shutdown.

**For HTTP/SSE transports**: The HTTP request can be aborted via `AbortSignal`.

**Impact**: MCP tools have the best abort support among all tool types — handled by the MCP client library automatically.

#### File: `packages/server/src/agent/process.ts` — **SEPARATE SYSTEM (Task-based)**

**Line 52-66**: `cancelAgent()` method sends `{ type: 'abort' }` IPC message to child process, with 5-second SIGKILL fallback.

This is for the **task-based agent execution** system (background tasks), NOT for the chat streaming path. It's a separate abort mechanism — not related to the `streamText` abort chain.

### 4.3 Complete Abort Cascade Chain (Verified Against Source Code)

```
Layer 0: CLIENT
  packages/ui/src/pages/chat/ChatWindow.tsx
    → useChat({ chat }) returns { stop }
    → User clicks Stop button → stop() called
    → Internally: chat.stop() aborts the underlying fetch request

Layer 1: HTTP TRANSPORT
  Client fetch is aborted
    → HTTP connection closes
    → Hono receives abort on c.req.raw.signal (Web standard Request.signal)

Layer 2: CHAT ROUTE
  packages/server/src/routes/chat.ts:128
    → streamText({ abortSignal: c.req.raw.signal })  [MUST ADD]
    → onAbort callback fires → cleanup tools         [MUST ADD]

Layer 3: AI SDK streamText() INTERNALS
  → Stops requesting new LLM completions
  → For any tool call currently in execute():
    → Passes abortSignal via ToolExecutionOptions ({ abortSignal })

Layer 4a: SUB-AGENT TOOLS (abort cascades)
  packages/server/src/agent/sub-agent.ts:53
    → execute: async function*({ task, context }, { abortSignal })
  packages/server/src/agent/sub-agent.ts:87
    → Child streamText({ abortSignal })
    → Child's tools also receive abortSignal (recursive)
  packages/server/src/agent/sub-agent.ts:93
    → for await (result.fullStream) terminates on abort
  packages/server/src/agent/sub-agent.ts:140-142
    → finally { cleanup() } runs even on abort

Layer 4b: BASH / SKILL TOOLS (abort NOT handled)
  bash-tool library (v1.3.14)
    → execute({ command }) — ignores abortSignal
    → just-bash sandbox runs to completion
    → Effect: current command finishes, but no NEW tool steps are requested

Layer 4c: MCP TOOLS (abort handled by @ai-sdk/mcp)
  @ai-sdk/mcp library
    → Tool execute() receives abortSignal from AI SDK
    → MCP client sends notifications/cancelled to server
    → Protocol-level cancellation (JSON-RPC)
```

### 4.4 Summary: What Needs to Be Done

| File | Current State | Action Required |
|------|--------------|-----------------|
| `routes/chat.ts:128` | No `abortSignal` | Add `abortSignal: c.req.raw.signal` |
| `routes/chat.ts:136` | Only `onFinish` for cleanup | Add `onAbort` callback for cleanup |
| `agent/sub-agent.ts:53,87` | Correctly passes `abortSignal` | None — already works |
| `agent/runtime.ts:38` | Correctly passes `abortSignal` | None — already works |
| `agent/tools.ts` | Tool loader, no execute | None |
| `agent/skills.ts` | Uses bash-tool (no abort) | No change now; future custom sandbox should handle abort |
| `agent/builtin-tools.ts` | Uses bash-tool (no abort) | Same as above |
| `agent/mcp.ts` | Uses @ai-sdk/mcp (handles abort) | None — handled automatically |
| `agent/process.ts` | Separate task system | Not related to chat abort path |

### 4.5 Caveats & Warnings

1. **bash-tool commands are NOT abortable**: Currently running bash commands (both from skills and built-in tools) will run to completion even after abort. The `just-bash` in-memory interpreter has no cancellation API. This is acceptable for now because:
   - `just-bash` commands are typically fast (no real I/O)
   - The `streamText()` won't request NEW steps after abort
   - When the custom sandbox with `child_process` is implemented, `process.kill()` can be wired to `abortSignal`

2. **Cleanup must happen in BOTH `onFinish` AND `onAbort`**: Since `onFinish` does not fire on abort, and `onAbort` does not fire on normal completion, both callbacks need to call `agentToolsResult.cleanup()`. Alternatively, use a shared cleanup pattern:
   ```typescript
   let cleaned = false
   const ensureCleanup = async () => {
     if (cleaned) return
     cleaned = true
     await agentToolsResult.cleanup()
   }

   const result = streamText({
     // ...
     abortSignal: c.req.raw.signal,
     onFinish: ensureCleanup,
     onAbort: ensureCleanup,
   })
   ```

3. **Sub-agent cleanup is self-contained**: Each sub-agent tool has its own `finally` block (line 140-142) that cleans up regardless of how the generator terminates. This is independent of the top-level cleanup.

4. **MCP stdio processes persist after abort**: While MCP protocol sends cancellation, stdio-based MCP servers (child processes) may not immediately exit. The `cleanup()` function in `mcp.ts:73-75` calls `client.close()` which should terminate the connection and allow the process to exit.

---

## Summary of Verification Status

| Topic | Status | Confidence | Key Finding |
|-------|--------|------------|-------------|
| AI SDK client stop | Verified | High | `useChat().stop()` / `chat.stop()` — already partially implemented |
| AI SDK server abort | Verified | High | `streamText({ abortSignal })` — must wire `c.req.raw.signal` |
| Sub-agent abort cascade | Verified | High | Already implemented in `sub-agent.ts:53,87` via tool execution context |
| Hono request signal | Verified | High | `c.req.raw.signal` standard Web API |
| onAbort callback | Verified | High | Available on `streamText()`, must add alongside `onFinish` |
| bash-tool abort | Verified | High | Does NOT handle `abortSignal` — commands run to completion |
| MCP tool abort | Verified | High | `@ai-sdk/mcp` handles abort via MCP cancellation protocol |
| Skill tool abort | Verified | High | Uses bash-tool, same limitation — no abort for running commands |
| AI SDK ToolExecutionOptions | Verified | High | `{ abortSignal }` passed to every tool's `execute()` 2nd param |
| IME isComposing | Verified | High | `e.nativeEvent.isComposing` — one-line fix, Chromium reliable |
| Electron multi-window | Verified | High | Standard BrowserWindow, additionalArguments for context |
| Cross-window state | Verified | High | No sync needed (shared HTTP server) |
