# MCPPool Architecture Design

Date: 2026-02-15
Module: `packages/server/src/agent/mcp-pool.ts`

---

## 1. MCPPoolFingerprint

The fingerprint captures every factor that would require a different MCP connection. If any field changes, the cached connection must be invalidated and recreated.

```typescript
/**
 * Immutable snapshot of all factors that determine how an MCP server
 * connection is configured. Used for cache invalidation — any change
 * in fingerprint means the existing connection is stale.
 */
interface MCPPoolFingerprint {
  /** Permission mode: 'restricted' | 'sandbox' | 'unrestricted' */
  mode: PermissionMode
  /** Whether sandbox wrapping is applied to this MCP server */
  sandboxWrapped: boolean
  /**
   * SHA-256 hash of the sandbox config (PermissionsConfig) when sandboxWrapped=true.
   * Empty string when sandboxWrapped=false.
   * Changes when allowWrite, denyRead, allowedDomains, etc. change.
   */
  sandboxConfigHash: string
  /** Transport type: 'stdio' | 'http' | 'sse' */
  transportType: MCPTransportType
  // --- stdio-specific fields ---
  command: string | undefined
  args: string[] | undefined
  env: Record<string, string> | undefined
  cwd: string | undefined
  // --- http/sse-specific fields ---
  url: string | undefined
  headers: Record<string, string> | undefined
}
```

### Fingerprint Computation

```typescript
function computeFingerprint(
  server: MCPServerConfig,
  options: MCPLoadOptions | undefined,
  effectiveCwd: string | undefined,
): MCPPoolFingerprint {
  const platform = process.platform as SupportedPlatform
  const mode = options?.resolvedPermissions.mode ?? 'unrestricted'

  // Determine if this server would be sandbox-wrapped
  const sandboxWrapped = !!(
    server.transportType === 'stdio'
    && options
    && options.resolvedPermissions.config.applyToMCP
    && options.resolvedPermissions.mode === 'sandbox'
    && isSandboxRuntimeSupported(platform)
  )

  // Hash the sandbox config only when wrapping is active
  const sandboxConfigHash = sandboxWrapped
    ? sha256(JSON.stringify(options!.resolvedPermissions.config))
    : ''

  return {
    mode,
    sandboxWrapped,
    sandboxConfigHash,
    transportType: server.transportType,
    command: server.command,
    args: server.args,
    env: server.env,
    cwd: effectiveCwd,
    url: server.url,
    headers: server.headers,
  }
}
```

### Fingerprint Comparison

```typescript
function fingerprintEquals(a: MCPPoolFingerprint, b: MCPPoolFingerprint): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
```

Using `JSON.stringify` comparison is consistent with the existing `sandboxConfigEquals` pattern in `sandbox-pool.ts`. This is acceptable because fingerprints are small, serializable objects with no circular references.

---

## 2. MCPPoolEntry

```typescript
type MCPPoolStatus = 'connecting' | 'active' | 'error'

interface MCPPoolEntry {
  /** Current connection status */
  status: MCPPoolStatus
  /** Fingerprint at time of connection creation */
  fingerprint: MCPPoolFingerprint
  /** Cached tool set from this MCP server */
  tools: ToolSet
  /** Client handle for cleanup (close connection) */
  client: { close: () => Promise<void> }
  /** Timestamp of last getTools() access — for idle timeout */
  lastUsedAt: number
  /** Connection creation promise — used to deduplicate concurrent connect attempts */
  connectPromise: Promise<void> | null
}
```

### Why `connectPromise`?

Multiple concurrent chat requests for the same agent may call `getTools()` simultaneously. Without deduplication, this would create multiple connections to the same MCP server. The `connectPromise` field allows the second caller to await the first connection rather than starting a new one.

---

## 3. MCPPool Class API Surface

```typescript
/**
 * Module-level singleton that manages persistent MCP server connections.
 *
 * Data structure: Map<ProjectId, Map<serverName, MCPPoolEntry>>
 *
 * Design principles:
 * - Lazy loading: connections created on first use, not at startup
 * - Fingerprint invalidation: config changes detected passively on each access
 * - Idle timeout: periodic scan removes unused connections
 * - Crash recovery: stdio process exit triggers removal, lazy rebuild on next use
 */
export class MCPPool {
  private readonly pool: Map<ProjectId, Map<string, MCPPoolEntry>>
  private idleTimer: ReturnType<typeof setInterval> | null

  // ── Public API ──────────────────────────────────────────

  /**
   * Get tools for a single MCP server, creating/reusing a pooled connection.
   *
   * Logic:
   * 1. Compute current fingerprint from server config + options
   * 2. Look up existing entry by (projectId, serverName)
   * 3. If entry exists AND fingerprint matches → return cached tools, update lastUsedAt
   * 4. If entry exists AND fingerprint mismatches → close old, create new
   * 5. If no entry → create new connection
   *
   * @returns ToolSet from this server, or empty object on connection failure
   */
  async getTools(
    server: MCPServerConfig,
    options: MCPLoadOptions | undefined,
  ): Promise<ToolSet>

  /**
   * Invalidate (close + remove) a specific server's connection.
   * The connection will be lazily recreated on next getTools() call.
   */
  async invalidateServer(projectId: ProjectId, serverName: string): Promise<void>

  /**
   * Invalidate all connections for a project.
   * Used when project is deleted, permission mode changes, etc.
   */
  async invalidateProject(projectId: ProjectId): Promise<void>

  /**
   * Graceful shutdown: close all connections, stop idle timer.
   * Called on server SIGTERM.
   */
  async shutdown(): Promise<void>

  /**
   * Start the idle timeout scanner.
   * Called once at server startup.
   */
  startIdleScanner(intervalMs?: number, maxIdleMs?: number): void

  /**
   * Stop the idle timeout scanner.
   */
  stopIdleScanner(): void

  /** Total number of active connections across all projects. */
  getConnectionCount(): number

  // ── Internal ────────────────────────────────────────────

  private async createEntry(
    projectId: ProjectId,
    server: MCPServerConfig,
    options: MCPLoadOptions | undefined,
    fingerprint: MCPPoolFingerprint,
  ): Promise<MCPPoolEntry>

  private async closeEntry(entry: MCPPoolEntry): Promise<void>

  private scanIdleConnections(maxIdleMs: number): void
}

/** Module-level singleton */
export const mcpPool = new MCPPool()
```

---

## 4. State Transition Diagram

```
                          getTools() called
                          (no cached entry)
                                │
                                ▼
                    ┌───────────────────────┐
                    │      connecting        │
                    │  (connectPromise set)  │
                    └───────────┬───────────┘
                                │
                 ┌──────────────┼──────────────┐
                 │ success      │              │ failure
                 ▼              │              ▼
    ┌────────────────┐         │    ┌──────────────────┐
    │     active     │         │    │      error        │
    │ (tools cached) │         │    │ (entry removed)   │
    └───────┬────────┘         │    └──────────────────┘
            │                  │
            │ getTools() with  │
            │ same fingerprint │
            │     ▼            │
            │ (return cached,  │
            │  update          │
            │  lastUsedAt)     │
            │                  │
    ┌───────┴──────────────────┤
    │                          │
    │ fingerprint mismatch     │ idle timeout
    │ (config changed)         │ (scanner)
    │        │                 │     │
    │        ▼                 │     ▼
    │   close old entry        │  close entry
    │   → connecting           │  → (removed)
    │                          │
    │ invalidateServer()       │ stdio crash
    │ invalidateProject()      │ (child exit)
    │        │                 │     │
    │        ▼                 │     ▼
    │   close entry            │  entry removed
    │   → (removed)            │  → lazy rebuild
    │                          │     on next use
    │                          │
    │       shutdown()         │
    │        │                 │
    │        ▼                 │
    │   close ALL entries      │
    │   stop idle timer        │
    └──────────────────────────┘
```

Key transitions:
- **none → connecting**: First `getTools()` call for this (projectId, serverName)
- **connecting → active**: MCP client creation + tool listing succeeds
- **connecting → error (removed)**: Connection failure → entry removed, error logged, empty tools returned
- **active → active**: Repeated `getTools()` with matching fingerprint → cache hit
- **active → connecting**: `getTools()` with mismatched fingerprint → close old, create new
- **active → removed**: `invalidateServer()`, `invalidateProject()`, idle timeout, or stdio crash
- **any → removed**: `shutdown()`

---

## 5. Integration Plan

### 5.1. Refactor `mcp.ts`

**Current**: `loadAgentMcpTools()` creates MCP clients, returns tools + cleanup function.
**New**: `loadAgentMcpTools()` delegates to `mcpPool.getTools()` for each server.

```typescript
// BEFORE (mcp.ts)
export async function loadAgentMcpTools(
  mcpServers: MCPServerConfig[],
  options?: MCPLoadOptions,
): Promise<MCPClientHandle | null>
// Returns: { tools, cleanup: () => close all clients }

// AFTER (mcp.ts)
export async function loadAgentMcpTools(
  mcpServers: MCPServerConfig[],
  options?: MCPLoadOptions,
): Promise<ToolSet>
// Returns: merged ToolSet directly (no cleanup needed — pool manages lifecycle)
```

**Changes in `loadAgentMcpTools()`**:

1. **Remove** `MCPClientHandle` interface (no more per-request cleanup)
2. **Add** permission-mode filtering for `restricted` mode at the top:
   ```typescript
   // Filter out stdio in restricted mode
   const filtered = options?.resolvedPermissions.mode === 'restricted'
     ? enabled.filter(s => s.transportType !== 'stdio')
     : enabled
   ```
3. **Replace** per-server client creation with `mcpPool.getTools(server, options)`
4. **Remove** cleanup accumulation — pool manages connection lifecycle
5. **Add** debug log for `shouldSandbox` decision (requirement #22)
6. **Return** `ToolSet` directly instead of `MCPClientHandle`

### 5.2. Refactor `tools.ts`

**Changes in `loadAgentTools()`**:

```typescript
// BEFORE
const mcpResult = await loadAgentMcpTools(mcpConfigs, mcpOptions)
if (mcpResult) {
  Object.assign(tools, mcpResult.tools)
  cleanups.push(mcpResult.cleanup)  // ← remove this
}

// AFTER
const mcpTools = await loadAgentMcpTools(mcpConfigs, mcpOptions)
if (mcpTools && Object.keys(mcpTools).length > 0) {
  Object.assign(tools, mcpTools)
  // No cleanup pushed — pool manages MCP connections
}
```

### 5.3. Refactor `chat.ts`

**Changes in chat route**:

The `ensureCleanup()` pattern remains for non-MCP cleanups (skills, built-in tools), but MCP connections are no longer cleaned up per-request. The `agentToolsResult.cleanup()` call stays but will simply not close MCP clients anymore (they're pooled).

No structural changes needed in `chat.ts` — the cleanup refactoring is encapsulated in `tools.ts` and `mcp.ts`.

### 5.4. Server startup/shutdown (`index.ts`)

```typescript
// Add to SIGTERM handler:
import { mcpPool } from './agent/mcp-pool'

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down')
  await Promise.allSettled([
    sandboxPool.shutdown(),
    mcpPool.shutdown(),
  ])
})

// After server starts, begin idle scanning:
mcpPool.startIdleScanner()
```

---

## 6. Permission Mode Filtering Logic

Filtering happens at **two levels**:

### Level 1: In `loadAgentMcpTools()` (mcp.ts) — Runtime filtering

This is where the security matrix is enforced. The filtering logic sits at the top of the function, before any pool access:

```typescript
export async function loadAgentMcpTools(
  mcpServers: MCPServerConfig[],
  options?: MCPLoadOptions,
): Promise<ToolSet> {
  const enabled = mcpServers.filter(s => s.enabled)
  if (enabled.length === 0) return {}

  const mode = options?.resolvedPermissions.mode
  const platform = process.platform as SupportedPlatform

  // ── Permission Mode Filtering ──────────────────────────
  // Requirement #11: restricted mode → block ALL stdio
  // This is runtime-only filtering — mcp.json is NOT modified.
  let filtered: MCPServerConfig[]
  if (mode === 'restricted') {
    filtered = enabled.filter(s => s.transportType !== 'stdio')
    const blocked = enabled.length - filtered.length
    if (blocked > 0) {
      log.info({ blocked }, 'restricted mode: filtered out stdio MCP servers')
    }
  } else {
    filtered = enabled
  }

  if (filtered.length === 0) return {}

  // ── shouldSandbox Decision Log (Requirement #22) ────────
  const shouldSandbox = !!(
    options
    && options.resolvedPermissions.config.applyToMCP
    && mode === 'sandbox'
    && isSandboxRuntimeSupported(platform)
  )
  log.debug(
    { shouldSandbox, mode, applyToMCP: options?.resolvedPermissions.config.applyToMCP, platform },
    'MCP sandbox decision',
  )

  // ── Pool-based tool loading ─────────────────────────────
  // ...mcpPool.getTools() for each server...
}
```

### Level 2: In `MCPPool.getTools()` — Fingerprint encodes mode

The fingerprint includes `mode`, `sandboxWrapped`, and `sandboxConfigHash`. When the user switches permission mode:
1. Next `getTools()` computes a new fingerprint
2. Fingerprint mismatch → close old connection → create new one with correct wrapping
3. This is the "mode switch auto-takes-effect" behavior (requirement #16)

### Why NOT filter in MCPPool?

MCPPool is a generic connection pool — it should not know about permission policies. The pool's job is: "given a server config, maintain a reusable connection." The policy layer (`mcp.ts`) decides **which** servers to load and **how** to configure them.

This separation of concerns matches the existing pattern: `sandbox-pool.ts` doesn't know about permission modes either; `builtin-tools.ts` decides when to use the sandbox pool.

---

## 7. Idle Timeout Mechanism

### Design

```typescript
const DEFAULT_IDLE_SCAN_INTERVAL_MS = 5 * 60 * 1000  // 5 minutes
const DEFAULT_MAX_IDLE_MS = 30 * 60 * 1000           // 30 minutes

class MCPPool {
  private idleTimer: ReturnType<typeof setInterval> | null = null

  startIdleScanner(
    intervalMs = DEFAULT_IDLE_SCAN_INTERVAL_MS,
    maxIdleMs = DEFAULT_MAX_IDLE_MS,
  ): void {
    this.stopIdleScanner()
    this.idleTimer = setInterval(() => {
      this.scanIdleConnections(maxIdleMs)
    }, intervalMs)
    // Don't keep process alive just for idle scanning
    this.idleTimer.unref()
  }

  stopIdleScanner(): void {
    if (this.idleTimer) {
      clearInterval(this.idleTimer)
      this.idleTimer = null
    }
  }

  private scanIdleConnections(maxIdleMs: number): void {
    const now = Date.now()
    for (const [projectId, serverMap] of this.pool) {
      for (const [serverName, entry] of serverMap) {
        if (entry.status === 'active' && now - entry.lastUsedAt > maxIdleMs) {
          log.debug({ projectId, serverName, idleMs: now - entry.lastUsedAt }, 'closing idle MCP connection')
          this.closeEntry(entry).catch(() => {})
          serverMap.delete(serverName)
        }
      }
      // Clean up empty project maps
      if (serverMap.size === 0) {
        this.pool.delete(projectId)
      }
    }
  }
}
```

### Rationale for 30-minute idle timeout

- MCP servers (especially stdio) hold system resources (child processes, file handles)
- 30 minutes is generous enough that active development sessions won't see reconnection overhead
- The lazy rebuild on next use ensures no functionality is lost
- `timer.unref()` ensures the idle scanner doesn't prevent Node.js graceful shutdown

---

## 8. Crash Recovery Mechanism

### For stdio transport (child processes)

When `Experimental_StdioMCPTransport` spawns a child process and that process crashes, the MCP client's internal transport will emit errors or the connection will fail on next tool call. However, we can't directly listen to the child process `exit` event because the transport layer owns the process.

**Strategy**: Detect failure at `getTools()` or tool execution time.

```
1. Pool stores entry with status='active'
2. Tool call fails with transport error (EPIPE, connection closed, etc.)
3. AI SDK catches error, surfaces it as tool result error
4. Next getTools() call → pool tries to use cached entry
   → client.tools() throws → catch → remove entry → create new connection
```

To make this more proactive, the pool should also wrap tool definitions to detect connection loss:

```typescript
// In MCPPool.createEntry():
// After getting tools from client, verify connection is still alive
// before returning cached tools on subsequent calls.
async getTools(server, options): Promise<ToolSet> {
  // ...lookup existing entry...
  if (existingEntry && fingerprintMatch) {
    existingEntry.lastUsedAt = Date.now()
    // Verify connection health: try listing tools again
    // If it fails → close + recreate
    try {
      // Use cached tools directly (tools are static per connection)
      return existingEntry.tools
    } catch {
      // Connection dead → remove and recreate
      await this.closeEntry(existingEntry)
      serverMap.delete(serverName)
      // Fall through to create new entry
    }
  }
  // ...create new entry...
}
```

**Simplified approach** (recommended for v1): Since MCP tools are stateless wrappers that make RPC calls, a dead connection will surface as a tool execution error to the AI. The AI can retry, and the next chat request will trigger `getTools()` which can detect the dead connection and rebuild. This is consistent with the SandboxPool pattern ("will re-create on next use").

### For http/sse transport

HTTP/SSE connections are inherently more resilient — the MCP client handles reconnection internally. The pool treats these the same way: if `client.tools()` fails, remove the entry and let lazy rebuild handle it.

### Implementation in getTools()

```typescript
async getTools(server, options): Promise<ToolSet> {
  const existing = this.getEntry(projectId, serverName)

  if (existing && existing.status === 'active') {
    if (fingerprintEquals(existing.fingerprint, newFingerprint)) {
      existing.lastUsedAt = Date.now()
      return existing.tools  // Cache hit — tools are immutable per connection
    }
    // Fingerprint mismatch → close old
    await this.closeEntry(existing)
    serverMap.delete(serverName)
  }

  // Create new entry (handles both fresh and recovery cases)
  return this.createEntry(projectId, server, options, newFingerprint)
}
```

If `createEntry()` fails (e.g., stdio process won't start), it logs the error and returns `{}` (empty tools). The agent simply won't have access to that MCP server's tools — consistent with current behavior.

---

## 9. Fingerprint Computation and Comparison Logic

### Hash Function

```typescript
import { createHash } from 'node:crypto'

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}
```

### Full Computation Flow

```
getTools(server, options) called
  │
  ├── Compute effectiveCwd = server.cwd || options?.workspaceDir || undefined
  │
  ├── Determine sandboxWrapped:
  │     mode === 'sandbox'
  │     AND applyToMCP === true
  │     AND platform supports sandbox
  │     AND transportType === 'stdio'
  │
  ├── If sandboxWrapped: hash the PermissionsConfig → sandboxConfigHash
  │   Else: sandboxConfigHash = ''
  │
  ├── Build MCPPoolFingerprint {
  │     mode, sandboxWrapped, sandboxConfigHash,
  │     transportType, command, args, env, cwd,
  │     url, headers
  │   }
  │
  ├── Lookup existing entry by (projectId, serverName)
  │
  ├── Compare fingerprints via JSON.stringify equality
  │     Match → return cached tools
  │     Mismatch → close old, create new
  │
  └── No existing entry → create new
```

### Why include `mode` in fingerprint?

Even though `restricted` mode filters out stdio servers before reaching the pool, the mode is still relevant because:
1. Switching from `restricted` → `sandbox` should create sandbox-wrapped connections
2. Switching from `sandbox` → `unrestricted` should create unwrapped connections
3. Including mode makes the fingerprint self-documenting and future-proof

### Why include `env` in fingerprint?

Environment variables affect MCP server behavior (API keys, config paths). If the user changes an env var in the MCP server config, the connection must be recreated.

---

## 10. Connection Creation Flow (createEntry)

```typescript
private async createEntry(
  projectId: ProjectId,
  server: MCPServerConfig,
  options: MCPLoadOptions | undefined,
  fingerprint: MCPPoolFingerprint,
): Promise<ToolSet> {
  const entry: MCPPoolEntry = {
    status: 'connecting',
    fingerprint,
    tools: {},
    client: { close: async () => {} },
    lastUsedAt: Date.now(),
    connectPromise: null,
  }

  // Store entry immediately (connecting state) to deduplicate concurrent calls
  const serverMap = this.getOrCreateProjectMap(projectId)
  serverMap.set(server.name, entry)

  try {
    // Build transport (stdio with optional sandbox wrapping, or http/sse)
    const transport = await this.buildTransport(server, options, fingerprint)

    // Create MCP client
    const client = await createMCPClient({ transport })

    // Fetch tool list
    const rawTools = await client.tools()

    // Store results
    entry.client = client
    entry.tools = rawTools  // Note: tool name prefixing happens in loadAgentMcpTools
    entry.status = 'active'
    entry.lastUsedAt = Date.now()

    log.debug(
      { projectId, serverName: server.name, toolCount: Object.keys(rawTools).length },
      'MCP pool: connection established',
    )

    return rawTools
  } catch (err) {
    log.error({ err, projectId, serverName: server.name }, 'MCP pool: connection failed')
    // Remove failed entry
    serverMap.delete(server.name)
    if (serverMap.size === 0) this.pool.delete(projectId)
    return {}
  }
}
```

---

## 11. Tool Name Prefixing

Tool name prefixing (server name prefix when multiple servers) remains in `loadAgentMcpTools()`, NOT in the pool. The pool returns raw tools per server; `loadAgentMcpTools()` merges and prefixes them.

```typescript
// In loadAgentMcpTools() — after pool returns tools per server
for (const server of filtered) {
  const tools = await mcpPool.getTools(server, options)
  for (const [toolName, toolDef] of Object.entries(tools)) {
    const rawName = filtered.length > 1 ? `${server.name}_${toolName}` : toolName
    allTools[sanitizeToolName(rawName)] = toolDef
  }
}
```

---

## 12. Summary of Files to Change

| File | Action | Description |
|------|--------|-------------|
| `packages/server/src/agent/mcp-pool.ts` | **NEW** | MCPPool class, singleton export |
| `packages/server/src/agent/mcp.ts` | **MODIFY** | Remove per-request lifecycle, delegate to pool, add filtering + logging |
| `packages/server/src/agent/tools.ts` | **MODIFY** | Remove MCP cleanup from cleanups array |
| `packages/server/src/index.ts` | **MODIFY** | Add mcpPool.shutdown() to SIGTERM, start idle scanner |
| `packages/shared/src/types/permissions.ts` | **MODIFY** | Change `applyToMCP` default from `false` to `true` |
| `packages/server/src/agent/mcp.test.ts` | **MODIFY** | Update tests for new return type, add filtering tests |
| `packages/server/src/agent/mcp-pool.test.ts` | **NEW** | Unit tests for MCPPool |

---

## 13. Design Decisions Log

1. **Pool stores raw tools, not prefixed** — Prefixing depends on how many servers are loaded for a given agent, which varies per request. Pool is project/server scoped, not agent-scoped.

2. **`getTools()` accepts single server, not array** — Each pool entry is per-server. `loadAgentMcpTools()` iterates and calls `getTools()` per server. This keeps the pool simple and each entry independent.

3. **No config change event listeners** — Fingerprint comparison is passive and lazy. This avoids complex event wiring between storage layers and the pool. Consistent with the requirements doc: "Fingerprint-based invalidation — passive, lazy, self-healing."

4. **`connectPromise` for deduplication** — Prevents thundering herd when multiple concurrent chat requests hit the same uncached MCP server.

5. **Error handling returns empty ToolSet** — Consistent with current `mcp.ts` behavior: connection failures are logged and skipped, not thrown. The agent simply doesn't get those tools.

6. **`timer.unref()` on idle scanner** — Prevents the interval from keeping the Node.js process alive during shutdown.

7. **Permission filtering in `mcp.ts`, not `mcp-pool.ts`** — Separation of concerns: pool manages connections, policy layer decides which connections to request. Matches existing SandboxPool pattern.
