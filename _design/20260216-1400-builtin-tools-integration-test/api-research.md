# API Research: just-bash & bash-tool for Integration Tests

## 1. bash-tool Package (v1.3.14)

### `Sandbox` Interface (bash-tool's own, in `types.ts`)

This is the interface that NativeSandbox and AnthropicSandbox implement:

```typescript
interface CommandResult {
  stdout: string
  stderr: string
  exitCode: number
}

interface Sandbox {
  executeCommand(command: string): Promise<CommandResult>
  readFile(path: string): Promise<string>
  writeFiles(files: Array<{ path: string; content: string | Buffer }>): Promise<void>
}
```

### `createBashTool(options?)` → `Promise<BashToolkit>`

```typescript
interface BashToolkit {
  bash: Tool<{ command: string }, CommandResult>
  tools: {
    bash: Tool<{ command: string }, CommandResult>
    readFile: Tool<{ path: string }, { content: string }>
    writeFile: Tool<{ path: string; content: string }, { success: boolean }>
  }
  sandbox: Sandbox  // the bash-tool Sandbox interface
}

interface CreateBashToolOptions {
  destination?: string        // default "/workspace" (or "/vercel/sandbox/workspace")
  files?: Record<string, string>
  uploadDirectory?: { source: string; include?: string }
  sandbox?: Sandbox | VercelSandbox | JustBashLike  // external sandbox override
  extraInstructions?: string
  promptOptions?: { toolPrompt?: string }
  onBeforeBashCall?: (input) => output | undefined
  onAfterBashCall?: (input) => output | undefined
  maxOutputLength?: number    // default 30000
  maxFiles?: number           // default 1000
}
```

**Sandbox resolution logic** (in `tool.js`):
1. If `options.sandbox` provided:
   - `isVercelSandbox(obj)` → `wrapVercelSandbox(obj)`
   - `isJustBash(obj)` → `wrapJustBash(obj)` (duck-types: has `.exec` method)
   - Otherwise → use as-is (already implements `Sandbox`)
2. If no sandbox:
   - If `uploadDirectory` without `files` → `createJustBashSandbox({ overlayRoot })` → OverlayFs
   - Otherwise → `createJustBashSandbox({ files, cwd })` → InMemoryFs

### `JustBashLike` Interface

```typescript
interface JustBashLike {
  exec: (command: string) => Promise<{ stdout: string; stderr: string; exitCode: number }>
  fs: {
    readFile: (path: string) => Promise<string>
    writeFile: (path: string, content: string) => Promise<void>
  }
}
```

### `wrapJustBash(bashInstance: JustBashLike) → Sandbox`

Wraps a just-bash `Bash` instance into bash-tool's `Sandbox` interface:
- `executeCommand(cmd)` → `bashInstance.exec(cmd)` → extracts `{ stdout, stderr, exitCode }`
- `readFile(path)` → `bashInstance.fs.readFile(path)`
- `writeFiles(files)` → iterates, calls `bashInstance.fs.writeFile(path, content)` for each

### `createJustBashSandbox(options?) → Promise<Sandbox & { mountPoint?: string }>`

Creates a virtual sandbox:
- With `overlayRoot` → `new OverlayFs({ root })` + `new Bash({ fs: overlay, cwd: mountPoint })`
- Without → `new Bash({ files, cwd })`
- Returns object implementing bash-tool `Sandbox` interface

---

## 2. just-bash Package (v2.9.8)

### `Bash` Class

```typescript
class Bash {
  readonly fs: IFileSystem
  constructor(options?: BashOptions)
  exec(commandLine: string, options?: ExecOptions): Promise<BashExecResult>
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  getCwd(): string
  getEnv(): Record<string, string>
}

interface BashOptions {
  files?: InitialFiles           // Record<string, string | FileInit>
  env?: Record<string, string>
  cwd?: string
  fs?: IFileSystem               // custom filesystem
  executionLimits?: ExecutionLimits
  network?: NetworkConfig
  python?: boolean
  commands?: CommandName[]
  customCommands?: CustomCommand[]
  logger?: BashLogger
  defenseInDepth?: DefenseInDepthConfig | boolean
  // ...deprecated fields
}

interface BashExecResult {
  stdout: string
  stderr: string
  exitCode: number
  env: Record<string, string>
}
```

### `InMemoryFs` Class

```typescript
class InMemoryFs implements IFileSystem {
  constructor(initialFiles?: InitialFiles)  // Record<string, string | Uint8Array | FileInit>
}
```
- Pure in-memory filesystem, all operations in memory
- Used as the base filesystem for MountableFs

### `MountableFs` Class

```typescript
interface MountConfig {
  mountPoint: string
  filesystem: IFileSystem
}

interface MountableFsOptions {
  base?: IFileSystem      // defaults to InMemoryFs if not provided
  mounts?: MountConfig[]
}

class MountableFs implements IFileSystem {
  constructor(options?: MountableFsOptions)
  mount(mountPoint: string, filesystem: IFileSystem): void
  unmount(mountPoint: string): void
  getMounts(): ReadonlyArray<{ mountPoint: string; filesystem: IFileSystem }>
  isMountPoint(path: string): boolean
}
```

**Routing logic**: Paths are matched against mount points. Longest-prefix match wins. Paths not matching any mount go to the base filesystem.

**Error for paths outside mounts**: When accessing a path not under any mount point, it goes to the base InMemoryFs. If the path doesn't exist in InMemoryFs, you get `ENOENT: no such file or directory`. There's no special "outside mounts" error — it's simply ENOENT from InMemoryFs.

### `OverlayFs` Class

```typescript
interface OverlayFsOptions {
  root: string                // real directory path on disk
  mountPoint?: string         // virtual mount point, default "/home/user/project"
  readOnly?: boolean          // default false
  maxFileReadSize?: number    // default 10MB (10485760)
}

class OverlayFs implements IFileSystem {
  constructor(options: OverlayFsOptions)  // root must exist and be a directory
  getMountPoint(): string
}
```

**Key behaviors**:
- Reads come from real filesystem under `root`
- Writes go to in-memory overlay layer (copy-on-write)
- When `readOnly: true`, all write operations throw: `EROFS: read-only file system, <operation> '<path>'`
- Paths outside the mount point return `null` from `toRealPath()`, resulting in `ENOENT`
- Constructor throws if root doesn't exist: `OverlayFs root does not exist: <path>`
- Constructor throws if root isn't a directory: `OverlayFs root is not a directory: <path>`

**Write error when readOnly**: `assertWritable()` throws `Error("EROFS: read-only file system, <op>")` where op is like `write '/path'`, `mkdir '/path'`, `rm '/path'`, etc.

### `ReadWriteFs` Class

```typescript
interface ReadWriteFsOptions {
  root: string                // real directory path on disk (must exist)
  maxFileReadSize?: number    // default 10MB (10485760)
}

class ReadWriteFs implements IFileSystem {
  constructor(options: ReadWriteFsOptions)
}
```

**Key behaviors**:
- All operations go directly to real filesystem under `root`
- `toRealPath(virtualPath)`: joins `root` + normalized virtual path
- Constructor throws if root doesn't exist or isn't a directory

### just-bash `Sandbox` Class (in `sandbox/Sandbox.ts`) — DIFFERENT from bash-tool's `Sandbox`

```typescript
interface SandboxOptions {
  cwd?: string
  env?: Record<string, string>
  timeoutMs?: number
  fs?: IFileSystem
  overlayRoot?: string        // mutually exclusive with fs
  maxCallDepth?: number
  maxCommandCount?: number
  maxLoopIterations?: number
  network?: NetworkConfig
}

class Sandbox {
  private constructor()
  static create(opts?: SandboxOptions): Promise<Sandbox>
  runCommand(cmd: string, opts?): Promise<Command>
  writeFiles(files: WriteFilesInput): Promise<void>
  readFile(path: string, encoding?): Promise<string>
  mkDir(path: string, opts?): Promise<void>
  stop(): Promise<void>
  extendTimeout(ms: number): Promise<void>
  get domain(): string | undefined
  get bashEnvInstance(): Bash
}
```

**NOTE**: The project does NOT use just-bash's `Sandbox` class. It directly instantiates `Bash` + filesystem classes and passes them to `createBashTool({ sandbox: bashInstance })`.

---

## 3. NativeSandbox (project code)

**Location**: `packages/server/src/agent/native-sandbox.ts`

```typescript
interface NativeSandboxOptions {
  workspaceRoot: string
  timeoutMs?: number          // default 120_000
}

class NativeSandbox implements Sandbox {  // bash-tool's Sandbox
  constructor(options: NativeSandboxOptions)
  executeCommand(command: string): Promise<CommandResult>
  readFile(filePath: string): Promise<string>
  writeFiles(files: Array<{ path: string; content: string | Buffer }>): Promise<void>
}
```

**Key behaviors**:
- `executeCommand`: spawns `bash -c <command>` with `cwd = workspaceRoot`, `env = process.env`
- `readFile`: resolves relative paths against workspaceRoot, uses `fs.readFile()`
- `writeFiles`: resolves paths, creates parent dirs with `mkdir -p`, uses `fs.writeFile()`
- **No validation**: No path validation, no command blacklist, no sandbox isolation
- **No security layers**: Full system access
- Output truncated at 1MB, timeout at 120s

---

## 4. AnthropicSandbox (project code)

**Location**: `packages/server/src/agent/anthropic-sandbox.ts`

```typescript
interface SandboxManagerHandle {
  wrapWithSandbox(command: string, abortSignal?: AbortSignal): Promise<string>
  cleanupAfterCommand(): Promise<void>
}

interface AnthropicSandboxOptions {
  config: SandboxConfig
  workspaceRoot: string
  sandboxManager: SandboxManagerHandle
  timeoutMs?: number          // default 120_000
}

class AnthropicSandbox implements Sandbox {  // bash-tool's Sandbox
  constructor(options: AnthropicSandboxOptions)
  executeCommand(command: string): Promise<CommandResult>
  readFile(filePath: string): Promise<string>
  writeFiles(files: Array<{ path: string; content: string | Buffer }>): Promise<void>
}
```

**Key behaviors**:
- `executeCommand`:
  1. `checkBlacklist(command)` — via `checkCommandBlacklist()` from `check-command-blacklist.ts`
  2. `wrapWithSandbox(command)` → wraps with sandbox-exec profile
  3. `spawnCommand(wrappedCommand)` → spawns `bash -c`
  4. `cleanupAfterCommand()` → cleanup
- `readFile`:
  1. `validatePathAsync(path, 'read')` — defense-in-depth fast-fail
  2. `executeWrapped('cat <path>')` — through sandbox-exec
- `writeFiles`:
  1. `validatePathAsync(path, 'write')` — defense-in-depth fast-fail
  2. Stage content to temp file
  3. `executeWrapped('mkdir -p <dir> && cp <tmp> <dest>')` — through sandbox-exec
  4. Cleanup temp file
- **Safe env**: Only whitelisted env vars (HOME, USER, PATH, etc.)
- **Command blacklist**: Builtin dangerous patterns (mkfs, sudo, fork bomb, etc.) + user-configured deniedCommands
- **Path validation**: Via `validatePathAsync()` from `validate-path.ts`

### Path Validation (`validate-path.ts`)

```typescript
type PathOperation = 'read' | 'write'

class PathAccessError extends Error {
  path: string
  reason: string
}
```

**Validation steps** (in order):
1. Reject null bytes + excessive length (>1024)
2. Expand tilde (`~` → homedir)
3. Resolve to absolute path (relative to workspaceRoot)
4. Normalize (collapse `.`, `..`, redundant separators)
5. Post-normalization traversal check (`..` → must still be within workspace)
6. **Mandatory Deny Paths** (write only):
   - `.bashrc`, `.bash_profile`, `.zshrc`, `.zprofile`, `.profile`
   - `.git/hooks/**`, `.git/config` (unless allowGitConfig)
   - `.gitmodules`, `.ripgreprc`, `.mcp.json`
   - `.vscode/**`, `.idea/**`, `.claude/**`
7. Check user-configured `denyRead` / `denyWrite` (glob patterns)
8. Check `allowWrite` whitelist (write only)
9. Return validated path

**Async variant** additionally resolves symlinks and re-validates the real path.

### Command Blacklist (`check-command-blacklist.ts`)

```typescript
class CommandBlockedError extends Error {
  command: string
  reason: string
}
```

**Tiers**:
1. Simple command name match (first token)
2. Pipeline/subshell segment analysis
3. Builtin dangerous patterns (always active):
   - `rm` on root, `rm --no-preserve-root`
   - `mkfs`, `dd` to device, fork bombs
   - `sudo`, `su`, `doas`
   - `osascript`, macOS keychain modification
   - `chmod 777`, `curl | bash`, `wget | sh`
   - `crontab -r`, `shutdown`, `reboot`
   - Python with dangerous imports
4. User-defined wildcard patterns

---

## 5. How `builtin-tools.ts` Creates Sandboxes

### Restricted Mode (no project ID)
```typescript
createBashTool({ sandbox: undefined, destination: undefined })
// → createBashTool uses createJustBashSandbox() internally → InMemoryFs
```

### Restricted Mode (with project ID)
```typescript
const mountableFs = new MountableFs({
  base: new InMemoryFs(),
  mounts: [
    { mountPoint: '/project', filesystem: new OverlayFs({ root: projectDir, mountPoint: '/' }) },
    { mountPoint: '/workspace', filesystem: new ReadWriteFs({ root: workspaceDir }) },
  ],
})
const bash = new Bash({
  fs: mountableFs,
  python: true,
  network: { dangerouslyAllowFullInternetAccess: true },
  cwd: '/workspace',
})
createBashTool({ sandbox: bash, destination: '/workspace' })
// → bash has .exec method → isJustBash(bash) → wrapJustBash(bash) → Sandbox
```

### Sandbox Mode
```typescript
const sandbox = new AnthropicSandbox({
  config: sandboxConfig,
  workspaceRoot: workspaceDir,
  sandboxManager: handle,  // from sandboxPool.getHandle()
})
createBashTool({ sandbox, destination: workspaceDir })
// → sandbox directly implements Sandbox interface → used as-is
```

### Unrestricted Mode
```typescript
const sandbox = new NativeSandbox({ workspaceRoot: workspaceDir })
createBashTool({ sandbox, destination: workspaceDir })
// → sandbox directly implements Sandbox interface → used as-is
```

---

## 6. Key Findings for Integration Tests

### Restricted Mode Testing
- Create a temp directory as project root + workspace
- Instantiate `MountableFs` with `OverlayFs` (project, readOnly or mountPoint='/') and `ReadWriteFs` (workspace)
- Create `Bash` instance with the MountableFs
- Wrap with `wrapJustBash()` or pass directly to `createBashTool({ sandbox: bash })`
- **Test boundaries**:
  - Write to `/workspace/` → goes to ReadWriteFs → success (persists to disk)
  - Read from `/workspace/` → success
  - Read from `/project/` → goes to OverlayFs → reads from real project dir
  - Write to `/project/` → OverlayFs with `mountPoint: '/'` is NOT readOnly by default → writes go to memory overlay
  - **IMPORTANT**: In `builtin-tools.ts`, OverlayFs is created with `mountPoint: '/'` but WITHOUT `readOnly: true`. This means writes to `/project/` will succeed in memory (copy-on-write behavior), but won't persist to disk. To get `EROFS`, you'd need `readOnly: true`.
  - Access paths outside mounts (e.g., `/etc/passwd`) → routes to base InMemoryFs → ENOENT

### Unrestricted Mode Testing
- Create temp dir, instantiate `NativeSandbox({ workspaceRoot: tempDir })`
- All operations use real bash and real filesystem
- No restrictions

### Sandbox Mode Testing
- Need to mock `SandboxManagerHandle`:
  - `wrapWithSandbox(command)` → just return the command (or prepend a mock wrapper)
  - `cleanupAfterCommand()` → no-op
- Create `AnthropicSandbox` with mock handle
- Path validation is real (validate-path.ts) → test against real SandboxConfig
- Command blacklist is real → test dangerous commands

### Error Types to Expect
| Scenario | Error |
|----------|-------|
| OverlayFs readOnly write | `Error: EROFS: read-only file system, write '/path'` |
| Path outside mount → InMemoryFs | `Error: ENOENT: no such file or directory, open '/path'` |
| PathAccessError (denied path) | `PathAccessError: Access denied: <path> — <reason>` |
| CommandBlockedError | `CommandBlockedError: Command blocked: <reason>` |
| Read non-existent file | `Error: ENOENT: no such file or directory, open '/path'` |
