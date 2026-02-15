# Code Runtime Integration Requirements

Date: 2026-02-16

## Overview

Integrate bundled Python and Node.js runtimes into the Golemancy Electron desktop app, enabling AI Agents to execute code without requiring users to install Python/Node.js on their system. Per-project environment isolation via Python venv and Node.js node_modules.

## Core Requirements

### 1. Bundle Runtime Binaries into Electron

- **Python 3.13** (latest stable: 3.13.12) via python-build-standalone
- **Node.js 22 LTS** (latest LTS) official binary
- Packaged via electron-builder `extraResources` under `resources/runtime/`
- Platform-specific: each Electron build includes only that platform's binaries
- Download script (`scripts/download-runtime.sh`) fetches correct platform binaries before build

```
resources/runtime/
├── python/cpython-3.13/
│   ├── bin/python3.13
│   ├── bin/pip3
│   └── lib/python3.13/...
└── node/
    ├── bin/node
    ├── bin/npm
    └── bin/npx
```

### 2. Server-Side Runtime Module

New `packages/server/src/runtime/` directory:

- **paths.ts** — Runtime path resolution
  - `getBundledPythonPath()`: Locate bundled Python (packaged vs dev mode)
  - `getBundledNodePath()`: Locate bundled Node.js (packaged vs dev mode)
  - `getProjectPythonEnvPath(projectId)`: `~/.golemancy/projects/{projectId}/runtime/python-env`
  - `getProjectNodeModulesPath(projectId)`: `~/.golemancy/projects/{projectId}/runtime/node_modules`
  - `getGlobalRuntimeDir()`: `~/.golemancy/runtime/`
  - `getPipCachePath()`: `~/.golemancy/runtime/cache/pip`
  - `getNpmCachePath()`: `~/.golemancy/runtime/cache/npm`
  - `getNpmGlobalPath()`: `~/.golemancy/runtime/npm-global`

- **python-manager.ts** — Python venv lifecycle
  - `initProjectPythonEnv(projectId)`: Create venv using bundled Python
  - `removeProjectPythonEnv(projectId)`: Delete venv
  - `resetProjectPythonEnv(projectId)`: Delete + recreate
  - `installPackages(projectId, packages[])`: pip install to project venv
  - `uninstallPackage(projectId, packageName)`: pip uninstall
  - `listPackages(projectId)`: pip list → structured data
  - `getPythonEnvStatus(projectId)`: Check if venv exists, Python version, package count

- **node-manager.ts** — Node.js path resolution and npm config
  - `getNodeEnv()`: Returns env vars (PATH, NPM_CONFIG_CACHE, NPM_CONFIG_PREFIX) for bundled Node.js
  - `getNodeRuntimeStatus()`: Node.js version, npm version

- **command-rewriter.ts** — Command interception and rewriting
  - `rewriteCommand(command, projectId)`: Rewrites python/pip/node/npm/npx to use bundled paths
  - Handles: `python`, `python3`, `pip`, `pip3`, `node`, `npm`, `npx`
  - Appends cache flags: `--cache-dir` for pip, `--cache` for npm

### 3. Sandbox Integration

- Command rewriting happens **before** sandbox wrapping:
  ```
  Agent command → command-rewriter → checkCommandBlacklist → wrapWithSandbox → spawn
  ```
- Integration point: `AnthropicSandbox.executeCommand()` calls rewriter before blacklist check
- Integration point: `NativeSandbox.executeCommand()` calls rewriter

### 4. MCP Integration (Bundled Node.js)

- Modify `mcp-pool.ts`: inject bundled Node.js PATH and npm cache env vars
- When launching stdio MCP servers (`npx -y @some/tool`), bundled Node.js takes priority
- Implementation: prepend bundled node bin dir to PATH env var

### 5. Updated PermissionsConfig Defaults

#### allowWrite (add runtime paths):
```
{{workspaceDir}}           (existing)
/tmp                       (existing)
{{projectRuntimeDir}}/**   (NEW: python-env + node_modules)
{{globalRuntimeDir}}/**    (NEW: pip/npm cache + npm-global)
```

Template variables:
- `{{projectRuntimeDir}}` → `~/.golemancy/projects/{projectId}/runtime`
- `{{globalRuntimeDir}}` → `~/.golemancy/runtime`

#### Default allowed domains (when network restriction is enabled):
```
# Python/pip
pypi.org
files.pythonhosted.org

# Node.js/npm
registry.npmjs.org

# GitHub (packages & tools hosted here)
github.com
*.githubusercontent.com

# AI Provider APIs
api.openai.com
api.anthropic.com
generativelanguage.googleapis.com
api.deepseek.com

# Common CDNs
*.cloudflare.com
*.fastly.net
*.amazonaws.com
```

### 6. Project Lifecycle

- **Create project** → auto-create Python venv (`python -m venv`)
- **Delete project** → delete entire `{project}/runtime/` directory (already handled by rmdir)
- Node.js does not need initialization step

### 7. REST API Routes

New route group under `/projects/:projectId/runtime/`:

```
GET    /status                     → runtime status (python version, venv exists, node version)
GET    /python/packages            → list installed packages
POST   /python/packages            → install packages (body: { packages: string[] })
DELETE /python/packages/:name      → uninstall package
POST   /python/reset               → delete and recreate venv
```

### 8. Download Script

`scripts/download-runtime.sh`:
- Detect current platform (macOS arm64/x86_64, Linux x86_64, Windows x86_64)
- Download python-build-standalone 3.13 for current platform
- Download Node.js 22 LTS for current platform
- Extract to `apps/desktop/resources/runtime/`
- Idempotent (skip if already downloaded)

## Permission Mode Behavior

| Mode | Python | Node.js |
|---|---|---|
| restricted | Pyodide (just-bash built-in, keep as-is) | stdio MCP blocked (existing) |
| sandbox | Bundled real Python in OS sandbox | Bundled real Node.js in OS sandbox |
| unrestricted | Bundled real Python, no sandbox | Bundled real Node.js, no sandbox |

## Technical Constraints

- **just-bash cannot run external binaries** — restricted mode keeps Pyodide, no change
- Dev mode: use `GOLEMANCY_PYTHON_PATH` and `GOLEMANCY_NODE_PATH` env vars (fallback to system `python3`/`node`)
- electron-vite compiles main process: use `process.resourcesPath` for packaged, env vars for dev
- Python venv uses symlinks to bundled Python (not copies) — saves disk space
- Shared pip/npm caches across projects reduce download times and disk usage

## Directory Structure

```
Electron App (read-only):
└── resources/runtime/
    ├── python/cpython-3.13/
    └── node/bin/{node,npm,npx}

~/.golemancy/ (read-write):
├── runtime/                          ← Global shared
│   ├── cache/pip/                    ← pip download cache
│   ├── cache/npm/                    ← npm download cache
│   └── npm-global/                   ← npx global installs
│
└── projects/{projectId}/
    ├── runtime/                      ← Per-project isolated
    │   ├── python-env/               ← Python venv + site-packages
    │   └── node_modules/             ← Project npm packages
    └── workspace/                    ← Agent working directory
```

## Out of Scope

- UI for runtime management (future work)
- Multiple Python/Node.js version support (single version each)
- uv package manager (not needed with bundled Python)
- Windows sandbox support (existing limitation)
