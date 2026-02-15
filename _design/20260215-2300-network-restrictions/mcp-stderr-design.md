# MCP Stderr Capture Design

## Goal

When an MCP stdio child process fails to connect, the error message currently only contains the exception message (e.g., "spawn ENOENT" or timeout). The child process often writes diagnostic information to stderr (e.g., "module not found", "permission denied", proxy errors). We want to capture that stderr and include it in error messages surfaced to the user.

## Current Behavior

### `@ai-sdk/mcp` StdioMCPTransport API

Source: `@ai-sdk/mcp/src/tool/mcp-stdio/mcp-stdio-transport.ts`

```ts
interface StdioConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  stderr?: IOType | Stream | number;  // <-- key option
  cwd?: string;
}
```

In `create-child-process.ts`, the `stderr` option maps directly to the `stdio[2]` slot of `child_process.spawn()`:

```ts
stdio: ['pipe', 'pipe', config.stderr ?? 'inherit']
```

- Default (`'inherit'`): stderr goes directly to the parent process's stderr (visible in terminal, but not captured programmatically).
- We can pass a `Stream` (specifically a `Writable` or `PassThrough`) to capture it.

### Current `mcp-pool.ts` flow

1. `buildTransport()` creates `Experimental_StdioMCPTransport` with `command`, `args`, `env`, `cwd` — **no `stderr` option**.
2. `doConnect()` calls `buildTransport()` → `createMCPClient({ transport })` → `client.tools()`. On failure, it catches the error and returns `{ tools: {}, error: message }`.
3. `testConnection()` has the same pattern but closes the client immediately after success.

Currently, stderr defaults to `'inherit'` so it shows up in the server console (where pino logs go) but is not captured for inclusion in error messages.

## Design

### 1. `StderrCapture` Helper Class

A small utility that wraps a `PassThrough` stream and accumulates stderr bytes into a bounded buffer.

```ts
import { PassThrough } from 'node:stream'

const DEFAULT_MAX_STDERR_BYTES = 8 * 1024  // 8 KB

class StderrCapture {
  readonly stream: PassThrough
  private chunks: Buffer[] = []
  private totalBytes = 0
  private readonly maxBytes: number

  constructor(maxBytes = DEFAULT_MAX_STDERR_BYTES) {
    this.maxBytes = maxBytes
    this.stream = new PassThrough()

    this.stream.on('data', (chunk: Buffer) => {
      // 1. Always forward to pino logger (preserves existing behavior)
      log.debug({ stderr: chunk.toString('utf-8').trimEnd() }, 'MCP server stderr')

      // 2. Accumulate in buffer (bounded)
      if (this.totalBytes < this.maxBytes) {
        const remaining = this.maxBytes - this.totalBytes
        const slice = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk
        this.chunks.push(slice)
        this.totalBytes += slice.length
      }
    })
  }

  /** Return captured stderr as a trimmed UTF-8 string. */
  getText(): string {
    if (this.chunks.length === 0) return ''
    const text = Buffer.concat(this.chunks).toString('utf-8').trim()
    const wasTruncated = this.totalBytes >= this.maxBytes
    return wasTruncated ? text + '\n... (truncated)' : text
  }
}
```

**Key decisions:**
- **8 KB max** — enough for typical error output, small enough to not bloat memory for long-running processes.
- **PassThrough stream** — it's both Readable and Writable, satisfying the `Stream` type expected by `StdioConfig.stderr`.
- **Tee to pino** — the `data` event handler logs every stderr chunk at `debug` level, replacing the lost `'inherit'` behavior. This means stderr is still visible in server logs.
- **Bounded accumulation** — once `maxBytes` is reached, new data is still logged but not buffered.

### 2. Changes to `buildTransport()`

`buildTransport()` currently returns `transport | null`. We need it to also return the `StderrCapture` instance so callers (`doConnect`, `testConnection`) can read captured stderr on failure.

**New return type:**

```ts
interface BuildTransportResult {
  transport: Parameters<typeof createMCPClient>[0]['transport']
  stderrCapture: StderrCapture | null  // null for http/sse transports (no child process)
}
```

**Modified signature:**

```ts
private async buildTransport(
  server: MCPServerConfig,
  options: MCPLoadOptions | undefined,
  fingerprint: MCPPoolFingerprint,
  effectiveCwd: string | undefined,
): Promise<BuildTransportResult | null>
```

**Inside the `stdio` branch:**

```ts
// Before creating transport:
const stderrCapture = new StderrCapture()

return {
  transport: new Experimental_StdioMCPTransport({
    command: effectiveCommand,
    args: effectiveArgs,
    env: server.env ? { ...process.env, ...server.env } : undefined,
    cwd: effectiveCwd,
    stderr: stderrCapture.stream,    // <-- new
  }),
  stderrCapture,
}
```

**Inside the `http/sse` branch:**

```ts
return {
  transport: { type: server.transportType, url: server.url, headers: server.headers },
  stderrCapture: null,  // no child process for remote transports
}
```

### 3. Changes to `doConnect()`

In the `catch` block, read `stderrCapture.getText()` and append it to the error message:

```ts
private async doConnect(
  projectId: ProjectId,
  server: MCPServerConfig,
  options: MCPLoadOptions | undefined,
  fingerprint: MCPPoolFingerprint,
  effectiveCwd: string | undefined,
  entry: MCPPoolEntry,
): Promise<MCPGetToolsResult> {
  let stderrCapture: StderrCapture | null = null

  try {
    const result = await this.buildTransport(server, options, fingerprint, effectiveCwd)
    if (!result) {
      // ... existing missing-config handling (unchanged)
      return { tools: {}, error: 'Missing required configuration (command or url)' }
    }

    stderrCapture = result.stderrCapture
    const client = await createMCPClient({ transport: result.transport })
    const rawTools = await client.tools()

    // ... existing success handling (unchanged)
    return { tools: rawTools }
  } catch (err) {
    log.error({ err, projectId, serverName: server.name }, 'MCP pool: connection failed')
    const message = err instanceof Error ? err.message : 'Unknown connection error'

    // Enhance error message with captured stderr
    const stderrText = stderrCapture?.getText() ?? ''
    const enhancedMessage = stderrText
      ? `${message}\n\nMCP server stderr:\n${stderrText}`
      : message

    // ... existing cleanup (unchanged)
    return { tools: {}, error: enhancedMessage }
  }
}
```

### 4. Changes to `testConnection()`

Same pattern — capture stderr and include in error on failure:

```ts
async testConnection(
  server: MCPServerConfig,
  options?: MCPLoadOptions,
): Promise<{ ok: boolean; toolCount: number; error?: string }> {
  const effectiveCwd = server.cwd || options?.workspaceDir || undefined
  const fingerprint = computeFingerprint(server, options, effectiveCwd)
  let stderrCapture: StderrCapture | null = null

  try {
    const result = await this.buildTransport(server, options, fingerprint, effectiveCwd)
    if (!result) {
      return { ok: false, toolCount: 0, error: 'Missing required configuration (command or url)' }
    }

    stderrCapture = result.stderrCapture
    const client = await createMCPClient({ transport: result.transport })
    const tools = await client.tools()
    const toolCount = Object.keys(tools).length
    await client.close()

    return { ok: true, toolCount }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown connection error'
    const stderrText = stderrCapture?.getText() ?? ''
    const enhancedMessage = stderrText
      ? `${message}\n\nMCP server stderr:\n${stderrText}`
      : message

    log.warn({ err, serverName: server.name }, 'MCP connectivity test failed')
    return { ok: false, toolCount: 0, error: enhancedMessage }
  }
}
```

### 5. Logging Behavior (Tee)

**Before this change:**
- `stderr: 'inherit'` (default) → stderr goes to the parent process's stderr (terminal), which is where pino also writes in dev mode.

**After this change:**
- `stderr: stderrCapture.stream` → stderr is piped to our `PassThrough`.
- The `data` handler on `PassThrough` does two things:
  1. Logs to pino at `debug` level (replaces `inherit` behavior — stderr is now visible in structured logs).
  2. Buffers the data for later retrieval (bounded at 8 KB).

This means stderr is **no longer directly visible in terminal** in raw form, but is instead logged through pino (which in dev mode with `pino-pretty` will display it with proper formatting). This is actually an improvement over `inherit` since stderr is now structured and filterable.

### 6. Error Message Format

When stderr is captured and a connection fails, the error message format will be:

```
<original error message>

MCP server stderr:
<captured stderr content>
```

Example:

```
connect ECONNREFUSED 127.0.0.1:8080

MCP server stderr:
Error: Cannot find module '@modelcontextprotocol/server-filesystem'
    at Module._resolveFilename (node:internal/modules/cjs/loader:1145:15)
    at Module._load (node:internal/modules/cjs/loader:986:27)
```

If stderr exceeds 8 KB:

```
<original error message>

MCP server stderr:
<first 8 KB of stderr content>
... (truncated)
```

### 7. Lifecycle & Cleanup

- **On success:** The `StderrCapture` stream stays alive as long as the child process runs. Stderr continues to be logged via pino but the buffer is no longer needed. The `PassThrough` stream is lightweight (no memory issue since we cap the buffer). Stderr data after connection success is still logged to pino but silently dropped from the buffer once full.
- **On failure:** The captured text is read once via `getText()`, then the `StderrCapture` instance is garbage collected along with the failed entry.
- **On `close()`:** When `client.close()` is called (pool entry cleanup), the transport's `AbortController` kills the child process, which closes the stderr pipe, ending the `PassThrough` stream naturally.

### 8. Summary of File Changes

**`packages/server/src/agent/mcp-pool.ts`** — all changes in this single file:

| What | Change |
|------|--------|
| New `StderrCapture` class | Add ~25 lines at top of file (after imports) |
| New `BuildTransportResult` interface | Add ~4 lines |
| `buildTransport()` return type | `Promise<transport \| null>` → `Promise<BuildTransportResult \| null>` |
| `buildTransport()` stdio branch | Create `StderrCapture`, pass `stderr: stderrCapture.stream`, return `{ transport, stderrCapture }` |
| `buildTransport()` http/sse branch | Return `{ transport, stderrCapture: null }` |
| `doConnect()` | Destructure `buildTransport()` result, capture `stderrCapture`, enhance error in catch |
| `testConnection()` | Same pattern as `doConnect()` |

No new files. No new dependencies. No changes outside `mcp-pool.ts`.
