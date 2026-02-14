# Bash Tool Sandbox Runtime - Architecture Design

**Author**: Architect
**Date**: 2026-02-14
**Status**: Design Phase (Rev 2 — updated with Fact Check corrections)

---

## 1. System Overview

The Bash Tool Sandbox Runtime introduces three execution modes for the AI agent's bash tool: **Restricted** (virtual sandbox via `just-bash`), **Sandbox** (OS-level isolation via `@anthropic-ai/sandbox-runtime`), and **Unrestricted** (no isolation). The architecture must support per-project configuration inheritance, resource-efficient worker management, and defense-in-depth security.

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Hono Server (Main Process)                │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                    SandboxPool                        │   │
│  │  ┌─────────────┐  ┌───────────────────────────────┐  │   │
│  │  │ Global       │  │ Project Workers               │  │   │
│  │  │ Sandbox      │  │ Map<ProjectId, WorkerHandle>  │  │   │
│  │  │ Manager      │  │                               │  │   │
│  │  │ (shared)     │  │  ┌─────────┐  ┌─────────┐   │  │   │
│  │  │              │  │  │Worker P1│  │Worker P2│   │  │   │
│  │  └─────────────┘  │  └─────────┘  └─────────┘   │  │   │
│  │                    └───────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────┐  ┌───────────────┐  ┌────────────────┐   │
│  │ Config        │  │ Path          │  │ Command        │   │
│  │ Resolver      │  │ Validator     │  │ Blacklist      │   │
│  └──────────────┘  └───────────────┘  └────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         AnthropicSandbox (implements Sandbox)         │   │
│  │  executeCommand() │ readFile() │ writeFiles()         │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         builtin-tools.ts (Strategy Pattern)           │   │
│  │  mode=restricted → just-bash (existing)               │   │
│  │  mode=sandbox    → AnthropicSandbox (new)             │   │
│  │  mode=unrestricted → NativeSandbox (new, no sandbox)  │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Execution Mode Strategy

The three modes are implemented via a **Strategy Pattern** in `builtin-tools.ts`. The `createBashToolWithSandbox()` function is replaced by a mode-aware factory.

### 2.1 Mode Selection Flow

```
resolveBashConfig(globalSettings, projectConfig?)
    │
    ├─ mode = 'restricted' → createRestrictedSandbox()   [just-bash, existing]
    ├─ mode = 'sandbox'    → createAnthropicSandbox()    [new, via SandboxPool]
    └─ mode = 'unrestricted' → createNativeSandbox()     [new, no isolation]
```

### 2.2 Sandbox Interface Implementations

All three modes implement the same `Sandbox` interface from `bash-tool`:

```typescript
interface Sandbox {
  executeCommand(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }>
  readFile(path: string): Promise<string>
  writeFiles(files: Array<{ path: string; content: string }>): Promise<void>
}
```

| Mode | `executeCommand` | `readFile` | `writeFiles` |
|------|------------------|------------|--------------|
| **Restricted** | `just-bash` virtual execution (existing) | Virtual FS via MountableFs | Virtual FS via MountableFs |
| **Sandbox** | `SandboxManager.wrapWithSandbox()` + `spawn()` | Node.js `fs` + path validation | Node.js `fs` + path validation |
| **Unrestricted** | Direct `spawn()`, no wrapping | Node.js `fs`, no validation | Node.js `fs`, no validation |

---

## 3. AnthropicSandbox Class

The core new class that bridges `bash-tool`'s `Sandbox` interface with `@anthropic-ai/sandbox-runtime`.

### 3.1 Class Structure

```typescript
// packages/server/src/agent/anthropic-sandbox.ts

class AnthropicSandbox implements Sandbox {
  private config: ResolvedSandboxConfig
  private workspaceRoot: string
  private sandboxManager: SandboxManagerHandle  // either local or IPC proxy

  constructor(params: {
    config: ResolvedSandboxConfig
    workspaceRoot: string
    sandboxManager: SandboxManagerHandle
  })

  // --- Sandbox interface ---
  async executeCommand(command: string): Promise<CommandResult>
  async readFile(path: string): Promise<string>
  async writeFiles(files: Array<{ path: string; content: string }>): Promise<void>

  // --- Internal ---
  private validatePath(path: string, operation: 'read' | 'write'): string
  private checkCommandBlacklist(command: string): void
}
```

### 3.2 SandboxManagerHandle (Abstraction)

A key design decision: `AnthropicSandbox` does NOT directly depend on `SandboxManager`. Instead, it depends on a `SandboxManagerHandle` interface that abstracts whether the `SandboxManager` is local (in-process) or remote (in a worker).

```typescript
interface SandboxManagerHandle {
  wrapWithSandbox(command: string, abortSignal?: AbortSignal): Promise<string>
  cleanupAfterCommand(): Promise<void>
}
```

> **Fact Check Correction**: The actual `SandboxManager.wrapWithSandbox()` signature is:
> ```typescript
> wrapWithSandbox(command: string, binShell?: string, customConfig?: Partial<SandboxRuntimeConfig>, abortSignal?: AbortSignal): Promise<string>
> ```
> We expose only `command` and `abortSignal` through the handle; `binShell` and `customConfig` are set during initialization.
>
> **Fact Check Correction**: `SandboxManager.cleanupAfterCommand()` MUST be called after each command execution to clean up temporary resources. This is incorporated into the handle interface.

Two implementations:
- **LocalSandboxManagerHandle**: Calls `SandboxManager.wrapWithSandbox()` and `cleanupAfterCommand()` directly (for inherit-mode projects using the global manager)
- **WorkerSandboxManagerHandle**: Sends IPC messages to worker, awaits results (for custom-config projects)

This abstraction keeps `AnthropicSandbox` testable and mode-agnostic.

### 3.3 executeCommand Flow

```
executeCommand(command)
    │
    ├── 1. checkCommandBlacklist(command) → throw if blocked
    │       ⚠️ App-layer check: deniedCommands is NOT a Sandbox Runtime feature
    │       (Fact Check verified: must implement before wrapWithSandbox)
    │
    ├── 2. wrappedCommand = await sandboxManager.wrapWithSandbox(command)
    │
    ├── 3. child = spawn(wrappedCommand, { shell: true, cwd: workspaceRoot })
    │
    ├── 4. Collect stdout/stderr with size limits (max 1MB each)
    │
    ├── 5. Apply timeout (default 120s, configurable)
    │
    ├── 6. await sandboxManager.cleanupAfterCommand()
    │       ⚠️ Mandatory: cleans up temp resources after each command
    │
    └── 7. Return { stdout, stderr, exitCode }
```

> **Note**: Step 6 (`cleanupAfterCommand`) runs in a `finally` block to ensure cleanup even if the command fails or times out.

### 3.4 readFile / writeFiles Flow

These do NOT go through `SandboxManager.wrapWithSandbox()` — the Anthropic sandbox only wraps shell commands. Instead, we implement path validation directly:

```
readFile(path)
    │
    ├── 1. normalized = validatePath(path, 'read')   → throws on denyRead match
    │
    └── 2. return fs.readFile(normalized, 'utf-8')

writeFiles(files)
    │
    ├── 1. for each file:
    │       normalized = validatePath(file.path, 'write')  → throws on denyWrite or !allowWrite
    │
    ├── 2. fs.mkdir(dirname(normalized), { recursive: true })
    │
    └── 3. fs.writeFile(normalized, content)
```

---

## 4. Worker Pool Architecture

### 4.1 Design Principles

1. **Workers are created only when needed**: Only projects with Sandbox mode + Custom config get a dedicated worker
2. **Global manager is shared**: All projects with Sandbox mode + Inherit share a single `SandboxManager` in the main process
3. **Workers are lazily created**: Worker is spawned on first command execution, not on project load
4. **Workers are reused across conversations**: A project's worker persists until project is unloaded or config changes

### 4.2 SandboxPool Class

```typescript
// packages/server/src/agent/sandbox-pool.ts

class SandboxPool {
  // Shared global SandboxManager (in main process)
  private globalManager: SandboxManager | null = null
  private globalConfig: SandboxRuntimeConfig | null = null

  // Per-project workers (only for Custom config projects)
  private projectWorkers = new Map<ProjectId, WorkerHandle>()

  // ── Public API ──

  /**
   * Get a SandboxManagerHandle for a project.
   * Returns either the global manager or a per-project worker handle.
   */
  async getHandle(projectId: ProjectId): Promise<SandboxManagerHandle>

  /**
   * Called when global settings change.
   * Reinitializes the global SandboxManager with new config.
   */
  async updateGlobalConfig(config: SandboxRuntimeConfig): Promise<void>

  /**
   * Called when a project's sandbox config changes.
   * If switching from inherit→custom: creates worker.
   * If switching from custom→inherit: destroys worker.
   */
  async updateProjectConfig(projectId: ProjectId, config: ProjectBashToolConfig): Promise<void>

  /**
   * Remove a project's worker (project deleted or mode changed).
   */
  async removeProject(projectId: ProjectId): Promise<void>

  /**
   * Graceful shutdown of all workers and global manager.
   */
  async shutdown(): Promise<void>

  // ── Internal ──

  private async initGlobalManager(): Promise<void>
  private async createWorker(projectId: ProjectId, config: SandboxRuntimeConfig): Promise<WorkerHandle>
  private async destroyWorker(projectId: ProjectId): Promise<void>
}
```

### 4.3 Worker Lifecycle

```
                    Project with Custom Sandbox Config
                                │
                    First bash command executed
                                │
        ┌───────────────────────▼───────────────────────────┐
        │              SandboxPool.getHandle()               │
        │                                                    │
        │   config.inherit === false?                        │
        │       YES → check projectWorkers map               │
        │              │                                     │
        │              ├─ exists → return existing handle    │
        │              │                                     │
        │              └─ not found → createWorker()         │
        │                    │                               │
        │                    ├─ fork('sandbox-worker.js')    │
        │                    ├─ send config via IPC          │
        │                    ├─ wait for { type: 'ready' }   │
        │                    ├─ store in projectWorkers map  │
        │                    └─ return WorkerHandle          │
        │                                                    │
        │       NO → return globalManager handle             │
        └────────────────────────────────────────────────────┘
```

### 4.4 Worker Process (sandbox-worker.ts)

Each worker is a lightweight Node.js child process that:
1. Receives `SandboxRuntimeConfig` on startup via IPC
2. Runs `SandboxManager.checkDependencies()` on Linux (verifies bwrap, socat, ripgrep)
3. Initializes its own `SandboxManager.initialize(config)`
4. Listens for IPC messages: `wrapCommand`, `cleanupAfterCommand`, `shutdown`
5. Handles cleanup on `SIGTERM` / `disconnect` via `SandboxManager.reset()`

```typescript
// packages/server/src/agent/sandbox-worker.ts

process.on('message', async (msg) => {
  switch (msg.type) {
    case 'init':
      // Linux: verify bwrap, socat, ripgrep are installed
      if (process.platform === 'linux') {
        await SandboxManager.checkDependencies()
      }
      await SandboxManager.initialize(msg.config)
      process.send!({ type: 'ready' })
      break

    case 'wrapCommand':
      const result = await SandboxManager.wrapWithSandbox(msg.command)
      process.send!({ type: 'wrappedCommand', id: msg.id, result })
      break

    case 'cleanupAfterCommand':
      await SandboxManager.cleanupAfterCommand()
      process.send!({ type: 'cleanupDone', id: msg.id })
      break

    case 'shutdown':
      await SandboxManager.reset()
      process.exit(0)
      break
  }
})

// Graceful shutdown on disconnect
process.on('disconnect', async () => {
  await SandboxManager.reset()
  process.exit(0)
})
```

### 4.5 WorkerHandle (IPC Proxy)

```typescript
class WorkerHandle implements SandboxManagerHandle {
  private child: ChildProcess
  private pendingRequests = new Map<string, { resolve, reject }>()

  async wrapWithSandbox(command: string): Promise<string> {
    const id = randomUUID()
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject })
      this.child.send({ type: 'wrapCommand', id, command })
    })
  }
}
```

### 4.6 Worker Error Recovery

```
Worker crashes (unexpected exit)
    │
    ├─ SandboxPool detects via 'exit' event
    │
    ├─ Removes from projectWorkers map
    │
    ├─ Rejects all pending IPC requests
    │
    └─ Next getHandle() call for this project
        → lazily creates a new worker (auto-recovery)
```

No proactive restart — lazy re-creation on next request is simpler and avoids thundering herd.

---

## 5. Configuration Inheritance Flow

### 5.1 Resolution Chain

```
Global Settings (settings.json)
    │
    ├─ bashTool.defaultMode: 'sandbox'
    ├─ bashTool.sandboxPreset: 'balanced'
    └─ bashTool.customConfig: { filesystem, network, enablePython, deniedCommands }
                │
                ▼
Project Config (projects/{projectId}/config.json)
    │
    ├─ bashTool.mode: 'sandbox' | 'restricted' | 'unrestricted' | undefined
    ├─ bashTool.inherit: true | false
    └─ bashTool.customConfig: { filesystem?, network?, enablePython?, deniedCommands? }
                │
                ▼
        resolveBashConfig(global, project?)
                │
                ▼
        ResolvedBashToolConfig
```

### 5.2 Resolution Rules

```typescript
function resolveBashConfig(
  globalConfig: GlobalBashToolConfig,
  projectConfig?: ProjectBashToolConfig
): ResolvedBashToolConfig {
  // Case 1: No project config or inherit=true → use global as-is
  if (!projectConfig || projectConfig.inherit !== false) {
    return resolveFromPreset(globalConfig)
  }

  // Case 2: Project has custom config → deep merge
  const base = resolveFromPreset(globalConfig)
  const enablePython = projectConfig.customConfig?.enablePython ?? base.enablePython

  return {
    mode: projectConfig.mode ?? base.mode,
    filesystem: {
      allowWrite: projectConfig.customConfig?.filesystem?.allowWrite ?? base.filesystem.allowWrite,
      denyRead: [
        ...base.filesystem.denyRead,
        ...(projectConfig.customConfig?.filesystem?.denyRead ?? []),
      ],
      denyWrite: [
        ...base.filesystem.denyWrite,
        ...(projectConfig.customConfig?.filesystem?.denyWrite ?? []),
      ],
    },
    network: {
      allowedDomains: projectConfig.customConfig?.network?.allowedDomains
        ?? base.network.allowedDomains,
    },
    enablePython,
    // deniedCommands: MERGE (union of both lists, never override)
    deniedCommands: [
      ...new Set([
        ...base.deniedCommands,
        ...(projectConfig.customConfig?.deniedCommands ?? []),
        // ⚠️ Fact Check: enablePython maps to deniedCommands in Sandbox mode
        ...(!enablePython ? ['python', 'python3'] : []),
      ]),
    ],
  }
}
```

> **Fact Check Correction — `enablePython` semantics differ by mode**:
> - **Restricted mode (just-bash)**: `enablePython` maps to just-bash's native `python: boolean` option (enables Pyodide-based Python interpreter)
> - **Sandbox mode**: `enablePython` is NOT a Sandbox Runtime feature. When `enablePython: false`, we add `python` and `python3` to `deniedCommands` at the application layer
> - **Unrestricted mode**: `enablePython` has no effect (Python availability depends on system installation)

**Critical Rule**: `deniedCommands` and `denyRead`/`denyWrite` are always **merged (union)**, never overridden. A project can add restrictions but cannot remove global ones. `allowWrite` and `allowedDomains` can be overridden (project may need different allowed paths).

### 5.3 Preset Resolution

```typescript
function resolveFromPreset(globalConfig: GlobalBashToolConfig): ResolvedSandboxConfig {
  const preset = PRESETS[globalConfig.sandboxPreset ?? 'balanced']

  // Custom config overrides preset
  return deepMerge(preset, globalConfig.customConfig ?? {})
}
```

Presets are defined in `packages/shared/src/types/bash-tool-presets.ts`:

| Preset | Filesystem | Network | Python | Notes |
|--------|-----------|---------|--------|-------|
| **Balanced** (default) | Write: /workspace, /tmp, ~/.cache | GitHub, npm, PyPI, Docker, CDNs | Yes | Good for most dev |
| **Strict** | Write: /workspace only | GitHub, npm only | No | Maximum safety |
| **Permissive** | Write: /workspace, /tmp, ~/* | All allowed domains + more | Yes | Open source contributions |

---

## 6. Process Communication (IPC)

### 6.1 Message Protocol

All IPC between main process and workers uses structured JSON messages over Node.js `child_process` IPC channel.

#### Main → Worker Messages

| Type | Payload | Description |
|------|---------|-------------|
| `init` | `{ config: SandboxRuntimeConfig }` | Initialize SandboxManager (includes checkDependencies on Linux) |
| `wrapCommand` | `{ id: string, command: string }` | Wrap a command with sandbox |
| `cleanupAfterCommand` | `{ id: string }` | Clean up temp resources after command execution |
| `shutdown` | `{}` | Graceful shutdown (calls `SandboxManager.reset()`) |

#### Worker → Main Messages

| Type | Payload | Description |
|------|---------|-------------|
| `ready` | `{}` | Worker initialized successfully |
| `wrappedCommand` | `{ id: string, result: string }` | Wrapped command result |
| `cleanupDone` | `{ id: string }` | Cleanup completed |
| `error` | `{ id: string, message: string }` | Error wrapping command |
| `initError` | `{ message: string }` | Failed to initialize (includes missing deps on Linux) |

### 6.2 Request-Response Correlation

Each `wrapCommand` request includes a unique `id` (UUID). The worker echoes the `id` in its response, enabling the `WorkerHandle` to correlate responses with pending Promises.

```
Main Process                    Worker Process
    │                               │
    ├── { type: 'wrapCommand',      │
    │     id: 'abc-123',            │
    │     command: 'ls -la' }  ────►│
    │                               ├── SandboxManager.wrapWithSandbox('ls -la')
    │                               │
    │◄──── { type: 'wrappedCommand',│
    │        id: 'abc-123',         │
    │        result: 'sandbox-exec...' }
    │                               │
```

### 6.3 Timeout Handling

- Each IPC request has a 30s timeout
- If worker doesn't respond within timeout, the pending Promise is rejected
- Three consecutive timeouts trigger worker destruction + lazy re-creation

---

## 7. Integration Points

### 7.1 builtin-tools.ts Modification

The existing `createBashToolWithSandbox()` is refactored into a mode-aware factory:

```typescript
// Updated builtin-tools.ts

async function createSandboxForMode(
  config: ResolvedBashToolConfig,
  options: BuiltinToolOptions,
): Promise<Sandbox | undefined> {
  switch (config.mode) {
    case 'restricted':
      return createRestrictedSandbox(options)  // existing just-bash logic

    case 'sandbox':
      const handle = await sandboxPool.getHandle(options.projectId)
      return new AnthropicSandbox({
        config,
        workspaceRoot: getWorkspaceDir(options.projectId),
        sandboxManager: handle,
      })

    case 'unrestricted':
      return new NativeSandbox({
        workspaceRoot: getWorkspaceDir(options.projectId),
      })
  }
}
```

### 7.2 app.ts Initialization

```typescript
// In createApp() or server startup

const sandboxPool = new SandboxPool()

// Linux: verify sandbox dependencies (bwrap, socat, ripgrep)
// ⚠️ Fact Check: checkDependencies() is required on Linux before initialize()
if (process.platform === 'linux') {
  try {
    await SandboxManager.checkDependencies()
  } catch (err) {
    log.warn({ err }, 'Sandbox dependencies missing — Sandbox mode unavailable')
    // Flag that sandbox mode is unavailable; UI will show warning
  }
}

// Initialize global sandbox manager with current settings
const settings = await settingsService.get()
if (settings.bashTool?.defaultMode === 'sandbox') {
  await sandboxPool.updateGlobalConfig(
    resolveToSandboxRuntimeConfig(settings.bashTool)
  )
}

// Cleanup on server shutdown — calls SandboxManager.reset() for all managers
process.on('SIGTERM', () => sandboxPool.shutdown())
```

> **Fact Check Note**: `SandboxManager` is a **module-level const** (not a class with `new`). Each Node.js process has exactly one instance. This is why per-project custom configs require separate worker processes — you cannot have multiple `SandboxManager` instances in the same process. The Worker Pool design naturally satisfies this constraint.

### 7.3 Settings Change Handler

When global or project settings change via the API, the SandboxPool must be notified:

```typescript
// In settings route handler
router.put('/api/settings', async (c) => {
  const settings = await c.req.json()
  await settingsService.update(settings)

  // Notify SandboxPool of config change
  if (settings.bashTool) {
    await sandboxPool.updateGlobalConfig(
      resolveToSandboxRuntimeConfig(settings.bashTool)
    )
  }

  return c.json({ ok: true })
})
```

---

## 8. Security Architecture

### 8.1 Defense-in-Depth Layers

```
Layer 1: Command Blacklist (deniedCommands)
    ↓ command passes
Layer 2: SandboxManager.wrapWithSandbox() — OS-level isolation
    ↓ wrapped command
Layer 3: OS Kernel enforcement (sandbox-exec / bubblewrap)
    ↓ execution completes
Layer 4: Path validation for readFile/writeFiles (denyRead, denyWrite, allowWrite)
```

### 8.2 Path Validation Module

Located at `packages/server/src/agent/validate-path.ts`, this module:

1. **Normalizes** the path (resolve `.`, `..`, `~`)
2. **Checks path traversal** — rejects paths containing `..` after normalization that escape workspace
3. **Applies deny rules** — glob matching against `denyRead` or `denyWrite`
4. **Applies allow rules** — for write operations, checks against `allowWrite`
5. **Returns absolute path** — safe for `fs` operations

Uses `minimatch` for glob pattern matching (already a common dependency).

### 8.3 Command Blacklist Module

Located at `packages/server/src/agent/check-command-blacklist.ts`:

1. Converts each pattern to regex: `sudo *` → `/\bsudo\s+.*/`
2. Tests command against each pattern
3. Throws descriptive error on match

### 8.4 Security Invariants

- `denyRead` and `denyWrite` from global config can **never** be removed by project config (merge-only)
- `deniedCommands` are always **merged** (union), never overridden
- Path validation runs **before** file I/O — no TOCTOU race (validate + operate atomically within single async call)
- `cleanupAfterCommand()` always runs after command execution (in `finally` block)

### 8.5 SandboxManager Mandatory Deny Paths (Fact Check Verified)

The following paths are **always blocked from writes** by `@anthropic-ai/sandbox-runtime` regardless of any configuration. Our path validation module does NOT need to duplicate these — they are enforced at OS kernel level. However, UI should display them as "always protected":

| Category | Paths |
|----------|-------|
| Shell config | `.bashrc`, `.bash_profile`, `.zshrc`, `.zprofile`, `.profile` |
| Git | `.git/hooks/**`, `.git/config` (unless `allowGitConfig: true`), `.gitmodules` |
| IDE/Editor | `.vscode/`, `.idea/` |
| Tooling | `.ripgreprc`, `.mcp.json`, `.claude/commands/`, `.claude/agents/` |

> These mandatory deny paths cannot be overridden by any config — they provide a security floor that even Permissive presets cannot bypass.

---

## 9. NativeSandbox (Unrestricted Mode)

A minimal implementation with no security restrictions:

```typescript
class NativeSandbox implements Sandbox {
  private workspaceRoot: string

  async executeCommand(command: string): Promise<CommandResult> {
    // Direct spawn, no wrapping
    const child = spawn('bash', ['-c', command], {
      cwd: this.workspaceRoot,
      env: process.env,
    })
    return collectOutput(child)
  }

  async readFile(path: string): Promise<string> {
    return fs.readFile(resolve(this.workspaceRoot, path), 'utf-8')
  }

  async writeFiles(files: Array<{ path: string; content: string }>): Promise<void> {
    for (const file of files) {
      const abs = resolve(this.workspaceRoot, file.path)
      await fs.mkdir(dirname(abs), { recursive: true })
      await fs.writeFile(abs, file.content)
    }
  }
}
```

---

## 10. Scalability and Performance Considerations

### 10.1 Resource Usage

| Component | Memory | CPU | When Created |
|-----------|--------|-----|--------------|
| Global SandboxManager | ~20-30 MB (proxy servers) | Low (idle) | Server startup (if mode=sandbox) |
| Per-project Worker | ~30-50 MB (Node.js + SandboxManager) | Low (idle) | First command for that project |
| Command execution | Variable | Variable | Per command |

### 10.2 Performance Optimizations

- **Lazy worker creation**: Workers only spawn on first bash command, not on project load
- **Worker reuse**: Same worker handles all commands for a project across conversations
- **Global manager sharing**: Projects with `inherit=true` share one SandboxManager
- **No eager prewarming**: Avoids wasting memory for projects that may never execute bash commands

### 10.3 Bottlenecks and Mitigations

| Bottleneck | Impact | Mitigation |
|-----------|--------|------------|
| Worker spawn latency (~1-2s) | First command in custom project is slow | Accept as tradeoff; show "initializing sandbox" indicator in UI |
| SandboxManager.initialize() (~500ms) | Startup time for proxy servers | Called once per worker, amortized across commands |
| IPC serialization overhead | Microseconds per command | Negligible compared to command execution time |
| Max concurrent workers | Memory pressure with many custom projects | Monitor with `getWorkerCount()`, warn at threshold (e.g., 10 workers) |

### 10.4 Failure Modes

| Failure | Detection | Recovery |
|---------|-----------|----------|
| Worker crash | `child.on('exit')` | Lazy re-create on next `getHandle()` |
| Worker unresponsive | IPC timeout (30s) | Destroy + re-create after 3 consecutive timeouts |
| SandboxManager.initialize() fails | `initError` IPC message | Surface error to user; fall back to Restricted mode |
| OS sandbox unavailable (Windows) | Platform detection at startup | Fall back to Restricted mode with user warning |
| Linux dependencies missing | `checkDependencies()` throws | Fall back to Restricted; show install instructions in UI |
| cleanupAfterCommand() fails | try/catch in finally block | Log warning, continue (non-fatal) |

---

## 11. File Structure

### 11.1 New Files

```
packages/shared/src/types/
  bash-tool-config.ts       — BashToolMode, GlobalBashToolConfig, ProjectBashToolConfig,
                              ResolvedBashToolConfig, ResolvedSandboxConfig,
                              FilesystemConfig, NetworkConfig
  bash-tool-presets.ts      — BALANCED_PRESET, STRICT_PRESET, PERMISSIVE_PRESET

packages/server/src/agent/
  anthropic-sandbox.ts      — AnthropicSandbox class (Sandbox impl for sandbox mode)
  native-sandbox.ts         — NativeSandbox class (Sandbox impl for unrestricted mode)
  sandbox-pool.ts           — SandboxPool, WorkerHandle, LocalSandboxManagerHandle
  sandbox-worker.ts         — Worker process entry point
  resolve-bash-config.ts    — resolveBashConfig(), resolveFromPreset()
  validate-path.ts          — validatePath(), matchesGlob()
  check-command-blacklist.ts — checkCommandBlacklist(), patternToRegex()

packages/ui/src/components/settings/
  SafetySettings.tsx         — Safety settings page container
  BashToolSettings.tsx       — Bash tool config (mode selector, preset, advanced)
  MCPSettings.tsx            — MCP sandbox config
  BashPresetSelector.tsx     — Preset dropdown with description

packages/ui/src/components/project/
  ProjectSafetySettings.tsx  — Project-level safety settings (inherit/custom)
```

### 11.2 Modified Files

```
packages/server/src/agent/builtin-tools.ts  — Mode-aware sandbox factory
packages/server/src/app.ts                  — SandboxPool initialization
packages/shared/src/types/settings.ts       — Add bashTool to GlobalSettings
packages/shared/src/types/project.ts        — Add bashTool to ProjectConfig
packages/ui/src/pages/SettingsPage.tsx       — Add Safety tab
packages/ui/src/pages/ProjectSettingsPage.tsx — Add Safety tab
```

---

## 12. Dependency Graph

```
bash-tool-config.ts  ◄── bash-tool-presets.ts
        ▲
        │
resolve-bash-config.ts
        ▲
        │
┌───────┴───────────────────────┐
│                               │
anthropic-sandbox.ts      sandbox-pool.ts
│                               │
├── validate-path.ts           ├── sandbox-worker.ts
├── check-command-blacklist.ts │
│                               │
└───────┬───────────────────────┘
        │
        ▼
builtin-tools.ts (consumes both)
        │
        ▼
    tools.ts → runtime.ts
```

No circular dependencies. All arrows point downward in the dependency graph.

---

## 13. Platform Compatibility

| Platform | Sandbox Mode | Restricted Mode | Unrestricted Mode |
|----------|-------------|-----------------|-------------------|
| macOS | `sandbox-exec` (Seatbelt profiles) | `just-bash` | Direct spawn |
| Linux | `bubblewrap` + seccomp BPF | `just-bash` | Direct spawn |
| Windows | **Not supported** → auto-fallback to Restricted | `just-bash` | Direct spawn |

Platform detection at startup determines available modes. If Sandbox mode is selected but unavailable (Windows), the system:
1. Falls back to Restricted mode
2. Displays a warning in Settings UI
3. Logs warning at server startup

---

## 14. Open Questions / Decisions for Team

### Resolved by Fact Check

1. **~~SandboxManager as static vs instance~~** → **Resolved**: `SandboxManager` is a module-level const singleton. One per process. Worker Pool design satisfies this constraint.

2. **~~enablePython in Sandbox mode~~** → **Resolved**: Map `enablePython: false` to `deniedCommands: ['python', 'python3']` in Sandbox mode. Native `python: boolean` only works in Restricted (just-bash) mode.

3. **~~deniedCommands implementation layer~~** → **Resolved**: Application-layer feature, not Sandbox Runtime native. Implemented in `AnthropicSandbox.checkCommandBlacklist()` before `wrapWithSandbox()`.

### Still Open

4. **Timeout for executeCommand**: Requirements don't specify. Recommend 120s default (matching Claude Code's behavior), configurable per-project.

5. **Output size limits**: Recommend truncating stdout/stderr at 1MB to prevent memory issues with large outputs (e.g., `cat large-file.bin`).

6. **Windows fallback UX**: When sandbox mode is unavailable on Windows, should we silently fall back or require user acknowledgment? Recommend: show a one-time warning banner.

7. **Violation Store integration**: `SandboxManager.getSandboxViolationStore()` provides security audit logging. Should we integrate this into the UI (e.g., show blocked attempts in a log panel)? Recommend: Phase 2 enhancement, not MVP.

8. **Linux dependency installation UX**: When `checkDependencies()` fails on Linux (missing bwrap/socat/ripgrep), how to guide users? Recommend: show installation instructions in Settings UI with copy-pasteable commands.

9. **macOS vs Linux glob behavior**: macOS supports real-time glob matching for filesystem rules; Linux pre-expands via ripgrep (limited by `mandatoryDenySearchDepth`, default 3). Files created after sandbox init that match glob patterns may NOT be protected on Linux. Accept as known limitation and document.

---

## 15. Fact Check Corrections Summary

| # | Original Claim | Correction | Impact |
|---|----------------|-----------|--------|
| 1 | `enablePython` is a sandbox config | Only works in just-bash; in Sandbox mode, map to deniedCommands | Config resolver logic |
| 2 | `deniedCommands` is Sandbox Runtime feature | Application-layer; implement before wrapWithSandbox | AnthropicSandbox.executeCommand |
| 3 | (Implicit) No cleanup needed | `cleanupAfterCommand()` required after every command | executeCommand flow, IPC protocol |
| 4 | (Implicit) No dependency check | Linux requires `checkDependencies()` (bwrap, socat, ripgrep) | Server startup, worker init |
| 5 | (Implicit) Single SandboxManager | Module-level const — one per process, validates Worker Pool design | No change (design already correct) |
| 6 | (Not covered) Mandatory deny paths | SandboxManager always blocks shell configs, git hooks, IDE files | UI should display these as "always protected" |

---

**End of Architecture Design**
