# MCP Pool & Security Requirements

Date: 2026-02-15 18:30
Status: Confirmed

## Overview

Implement project-level MCP connection pooling (MCPPool) and permission-mode-aware MCP security rules. Replace the current per-message MCP lifecycle with persistent, lazily-loaded connections managed by a pool. Add UI indicators for MCP security status across different permission modes.

---

## 1. MCP Pool (Core)

1. **New module `agent/mcp-pool.ts`** — module-level singleton (like `sandboxPool`)
2. **Data structure**: `Map<ProjectId, Map<serverName, MCPPoolEntry>>`, each entry contains client, tools, fingerprint, lastUsedAt, status
3. **Lazy loading**: Create connections on first chat request, not at app/project startup
4. **Fingerprint comparison**: On each `getTools()` call, compute current fingerprint (mode, sandboxWrapped, sandboxConfigHash, command, args, env, cwd, url, headers) and compare with cached fingerprint. Mismatch → close + recreate
5. **Idle timeout**: Periodic scan (e.g. every 5 minutes), clean up entries unused for N minutes
6. **Crash recovery**: Detect stdio child process unexpected exit, remove from pool, lazy rebuild on next use
7. **Invalidate API**: `invalidateServer(projectId, serverName)` and `invalidateProject(projectId)`
8. **shutdown()**: Close all connections on server shutdown
9. **Refactor `mcp.ts`**: `loadAgentMcpTools()` retrieves from pool instead of creating each time
10. **Refactor `chat.ts`**: cleanup no longer closes MCP connections (pool manages lifecycle)

## 2. Permission Mode x MCP Security Rules

11. **restricted mode**: Filter out all `transportType === 'stdio'` MCP servers, only load http/sse
12. **sandbox mode + applyToMCP=true + platform supports sandbox**: Wrap stdio with sandbox runtime
13. **sandbox mode + Windows**: stdio loads without wrapping + risk warning displayed. UI hides `applyToMCP` toggle (no sandbox runtime on Windows)
14. **sandbox mode + applyToMCP=false (macOS/Linux)**: stdio loads without wrapping + risk warning displayed
15. **unrestricted mode**: All load without wrapping + risk warning displayed
16. **Runtime filtering only** — do NOT modify mcp.json file config. Mode switch auto-takes-effect/restores

### Security Matrix

| Scenario | stdio | Risk Warning | applyToMCP Visible |
|---|---|---|---|
| restricted (all platforms) | Blocked | Disabled notice | N/A |
| sandbox, macOS/Linux, applyToMCP=true | Wrapped | None | Shown |
| sandbox, macOS/Linux, applyToMCP=false | Unwrapped | Yes | Shown |
| sandbox, Windows | Unwrapped | Yes | Hidden |
| unrestricted (all platforms) | Unwrapped | Yes | N/A |

## 3. Default Value Change

17. **`applyToMCP` default value changes from `false` to `true`** in `DEFAULT_PERMISSIONS_CONFIG`

## 4. UI Indicators

18. **MCP Servers page**: In restricted mode, stdio servers show disabled notice ("Restricted mode: stdio MCP disabled")
19. **MCP Servers page**: In sandbox(applyToMCP=false) / unrestricted mode, show risk warning ("Third-party MCP servers may access or modify files on your computer")
20. **Agent detail page MCP section**: In restricted mode, assigned stdio MCP servers show "Restricted" status (unavailable)
21. **Agent detail page MCP section**: In sandbox(applyToMCP=false) / unrestricted mode, show risk warning

## 5. Logging

22. **`mcp.ts` add debug log**: Print `shouldSandbox` decision result and basis (mode, applyToMCP, platform)

## 6. Already Completed (Do Not Redo)

- CWD placeholder changed to `{{workspaceDir}}`
- MCP sandbox wrapping logic implemented in `mcp.ts`
- CWD defaults to workspace path
- `MCPLoadOptions` with `workspaceDir` field

---

## Key Design Decisions

- **MCPPool is pure in-memory cache** — no config storage needed. Config source of truth is existing files (permissions-config/*.json, mcp.json, project.json)
- **Fingerprint-based invalidation** — passive, lazy, self-healing. No need to listen to config change events
- **Pool entry lifecycle**: none → connecting → active → (idle_timeout/invalidate/crash) → none
- **Agent cannot call filtered MCP tools** — tools not loaded into AI model's tool list = invisible to agent
