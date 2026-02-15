# Builtin Tools Integration Test

## Goal

Write integration tests for builtin-tools that directly instantiate real Sandbox implementations and verify file operation behavior differences across permission modes.

## Test Scope

Three permission modes:
1. **restricted** — `just-bash` virtual FS (Bash + MountableFs + OverlayFs + ReadWriteFs + InMemoryFs)
2. **unrestricted** — `NativeSandbox`, real bash spawn, temp dir isolation
3. **sandbox** — `AnthropicSandbox`, mock `SandboxManagerHandle` (needs sandbox-exec), real path validation + command blacklist

## Operations to Test

- `writeFiles(files)` — write file(s)
- `readFile(filePath)` — read file
- `executeCommand(command)` — bash command execution (including file editing via sed/echo)

## Test Strategy

| Mode | Sandbox instance | FS | Mock? |
|------|-----------------|-----|-------|
| restricted | `just-bash` Bash with MountableFs | Virtual | No mock — real just-bash |
| unrestricted | NativeSandbox | Real (temp dir) | No mock — real spawn |
| sandbox | AnthropicSandbox | Real validation layers | Mock SandboxManagerHandle only |

## Key Assertions

### restricted mode
- Can write to `/workspace/` — success
- Can read from `/workspace/` — success
- Can read from `/project/` (read-only) — success
- Cannot write to `/project/` — rejected/error
- Cannot access paths outside mounts — rejected/error
- bash commands execute in virtual FS context

### unrestricted mode
- Can write anywhere in temp dir — success
- Can read any file — success
- No command blacklist — any command runs
- No path validation — all paths allowed

### sandbox mode
- Path validation blocks denied read paths (~/.ssh, .env, etc.)
- Path validation blocks writes outside allowWrite list
- Mandatory deny paths blocked (.bashrc, .git/hooks, .vscode)
- Command blacklist blocks dangerous commands (mkfs, sudo, etc.)
- Allowed commands pass through to wrapWithSandbox

## Output

- File: `packages/server/src/agent/builtin-tools.integration.test.ts`
- Framework: Vitest (consistent with existing tests)
