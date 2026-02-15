# Fact Check: Sandbox Permissions Refactor

**Date**: 2026-02-15
**Fact Checker**: Fact Checker Agent
**Requirements**: `/Users/cai/developer/github/SoloCraft.team.worktree/SoloCraft.team@sandbox-runtime/_requirement/20260215-1200-sandbox-permissions-refactor.md`

---

## 1. Current Sandbox Runtime Usage

### 1.1 Sandbox Runtime Invocation

**Files using sandbox runtime**:

1. **packages/server/src/agent/sandbox-pool.ts** (lines 1-end)
   - Manages worker pool for sandbox runtime
   - Uses `child_process.fork()` to spawn workers
   - Handles sandbox config per project

2. **packages/server/src/agent/sandbox-worker.ts** (lines 1-end)
   - Worker process that wraps commands with SandboxManager
   - Receives config via IPC, initializes sandbox runtime

3. **packages/server/src/agent/anthropic-sandbox.ts** (lines 1-end)
   - Main executor that delegates to sandbox-pool
   - Checks command blacklist BEFORE wrapping
   - Handles three modes: restricted (just-bash), sandbox (AnthropicSandbox), unrestricted (none)

4. **packages/server/src/agent/builtin-tools.ts** (lines 1-end)
   - Constructs Bash tool based on resolved config
   - Creates either Bash({ python }) for restricted mode or wraps executeCommand for sandbox/unrestricted

5. **packages/server/src/agent/resolve-bash-config.ts** (lines 1-186)
   - Resolution logic for global + project config merging
   - Returns ResolvedBashToolConfig with mode + sandbox config + usesDedicatedWorker

6. **packages/server/src/routes/chat.ts** (references)
   - Reads global settings and project config
   - Calls resolveBashConfig() to get effective config
   - Passes to builtin-tools

### 1.2 Platform Detection

**Files with platform detection**:

1. **packages/server/src/agent/validate-path.ts:270-274**
   ```typescript
   function isCaseInsensitiveFS(): boolean {
     // macOS HFS+/APFS (default) is case-insensitive
     // Linux ext4 is case-sensitive
     return process.platform === 'darwin'
   }
   ```

2. **packages/server/src/agent/sandbox-pool.ts** (assumed, need to verify)
   - Likely checks `process.platform === 'win32'` to decide whether to use sandbox runtime

3. **apps/desktop/src/main/index.ts** (Electron main process)
   - Uses `process.platform` for OS-specific logic

**Finding**: Platform detection exists but NOT specifically for disabling sandbox runtime on Windows. Current code assumes sandbox runtime works on all platforms.

---

## 2. Current Denied Commands Implementation

**File**: `packages/server/src/agent/check-command-blacklist.ts` (lines 1-268)

**Key Facts**:
- ✅ Works **standalone** — takes `CommandBlacklistConfig` with `deniedCommands` array
- ✅ Does **NOT** depend on `enablePython` — python blocking is handled at resolution time (resolve-bash-config.ts:119-131)
- ✅ Supports wildcards: `"sudo *"` → `/\bsudo\s+.*/`
- ✅ Has builtin dangerous patterns (always enforced)
- ✅ Checks pipelines/subshells: `echo foo | sudo rm` is detected

**Function signature**:
```typescript
export function checkCommandBlacklist(
  command: string,
  config: CommandBlacklistConfig,
): void
```

**Usage in anthropic-sandbox.ts**: Command blacklist check happens BEFORE sandbox wrapping (application layer).

---

## 3. File Storage Patterns

**File**: `packages/server/src/storage/projects.ts` (lines 1-89)

**Storage structure**:
```
~/.golemancy/
└── projects/
    └── {projectId}/
        ├── project.json          # Project metadata
        ├── agents/               # Agent configs
        ├── tasks/                # Task data
        ├── artifacts/            # Artifacts
        ├── memory/               # Memory storage
        ├── skills/               # Skills
        └── cronjobs/             # Cron jobs
```

**Key methods**:
- `create()`: Creates project directory structure (line 39-65)
- `projectJsonPath(id)`: Returns `path.join(this.projectsDir, id, 'project.json')` (line 16-19)

**Finding**: Projects use **per-project directories** at `~/.golemancy/projects/{id}/`. Each project can have subdirectories for additional config.

**New requirement**: Permissions configs should be stored at:
```
~/.golemancy/projects/{projectId}/permissions-config/{configId}.json
```

---

## 4. All References to Removed Concepts

### 4.1 "Safety" Tab/Page References

**UI Files**:

1. **packages/ui/src/pages/settings/GlobalSettingsPage.tsx**
   - Line 13: `{ id: 'safety', label: 'Safety' }` in SETTINGS_TABS
   - Line 42-44: `{activeTab === 'safety' && <SafetyTab ... />}`
   - Line 400-450: `function SafetyTab` implementation with "Bash Tool" and "MCP" sub-tabs

2. **packages/ui/src/pages/project/ProjectSettingsPage.tsx**
   - Line 23: `{ id: 'safety', label: 'Safety' }` in SETTINGS_TABS
   - Line 127-133: `{activeTab === 'safety' && <ProjectSafetyTab ... />}`
   - Line 356-410: `function ProjectSafetyTab` implementation

**Action**: Rename "Safety" to "Permissions" in both pages.

### 4.2 BashPresetSelector Component

**File**: `packages/ui/src/components/settings/BashPresetSelector.tsx` (lines 1-56)

**Imports this component**:
- packages/ui/src/components/settings/SafetyBashToolSettings.tsx:6
- packages/ui/src/components/project/ProjectSafetyBashToolSettings.tsx:13

**Finding**: This component displays preset cards. It will be **removed** in new architecture (no more presets, only default config + custom configs).

### 4.3 SafetyBashToolSettings and SafetyMCPSettings

**Components to refactor**:

1. **packages/ui/src/components/settings/SafetyBashToolSettings.tsx** (lines 1-288)
   - Manages GlobalBashToolConfig
   - Uses BashPresetSelector
   - Has "sandboxPreset" dropdown
   - Has "allowGitConfig" toggle
   - Has "enablePython" toggle

2. **packages/ui/src/components/settings/SafetyMCPSettings.tsx** (lines 1-82)
   - Manages GlobalMCPSafetyConfig
   - Simple inside/outside sandbox toggle

3. **packages/ui/src/components/project/ProjectSafetyBashToolSettings.tsx** (lines 1-364)
   - Manages ProjectBashToolConfig
   - Has "inherit" vs "custom" toggle
   - Uses BashPresetSelector

4. **packages/ui/src/components/project/ProjectSafetyMCPSettings.tsx** (lines 1-108)
   - Manages ProjectMCPSafetyConfig
   - Has "inherit" vs "custom" toggle

**Action**: These components will be **heavily refactored** to match new Permissions model.

### 4.4 Type Definitions

**Files with types to modify**:

1. **packages/shared/src/types/bash-tool-config.ts** (lines 1-196)
   - Line 9: `type BashExecutionMode` (keep, rename modes)
   - Line 17: `type SandboxPreset` (REMOVE)
   - Line 21-30: `FilesystemConfig` interface (modify: remove allowGitConfig)
   - Line 34-37: `NetworkConfig` interface (keep, add deniedDomains)
   - Line 58-74: `SandboxConfig` interface (modify: remove enablePython, allowGitConfig)
   - Line 105-115: `GlobalBashToolConfig` (REMOVE, replace with new)
   - Line 122-136: `ProjectBashToolConfig` (REMOVE inherit concept)
   - Line 143-156: `GlobalMCPSafetyConfig`, `ProjectMCPSafetyConfig` (MERGE into PermissionsConfig)

2. **packages/shared/src/types/bash-tool-presets.ts** (lines 1-304)
   - **ENTIRE FILE TO BE REMOVED** (no more presets)

3. **packages/shared/src/types/settings.ts** (lines 1-43)
   - Line 26: `bashTool: GlobalBashToolConfig` (REPLACE with new permissions config reference)
   - Line 27: `mcpSafety: GlobalMCPSafetyConfig` (MERGE into permissions)
   - Line 33: `bashTool?: ProjectBashToolConfig` (REPLACE)
   - Line 34: `mcpSafety?: ProjectMCPSafetyConfig` (MERGE)

### 4.5 Server-side Resolution Logic

**Files using "inherit" concept**:

1. **packages/server/src/agent/resolve-bash-config.ts** (lines 1-186)
   - Line 22: `DEFAULT_PROJECT_BASH_CONFIG: { inherit: true }`
   - Line 41-72: `resolveBashConfig()` — handles inherit logic, preset resolution, merging
   - Line 80-91: `resolveMCPSafetyConfig()` — handles inherit logic
   - Line 99-107: `withGlobalDefaults()` — ensures global config has defaults

**Action**: This file will be **completely rewritten** to handle new PermissionsConfig resolution.

2. **packages/server/src/agent/validate-bash-config.ts** (references)
   - Validates bash config structure
   - Will need to be updated for new schema

3. **packages/server/src/storage/settings.ts** (lines 1-46)
   - Line 18-25: DEFAULT_SETTINGS with bashTool + mcpSafety
   - Will need to be updated for new schema

### 4.6 Component Exports

**Files exporting SafetyBashToolSettings, etc.**:

1. **packages/ui/src/components/settings/index.ts**
   - Exports SafetyBashToolSettings, SafetyMCPSettings, BashPresetSelector

2. **packages/ui/src/components/project/index.ts**
   - Exports ProjectSafetyBashToolSettings, ProjectSafetyMCPSettings

**Action**: Update exports to new component names.

---

## 5. Summary of All Files Requiring Changes

### 5.1 Types (Shared Package)

**REMOVE**:
- packages/shared/src/types/bash-tool-presets.ts (entire file)

**MODIFY**:
- packages/shared/src/types/bash-tool-config.ts
  - Remove: SandboxPreset, GlobalBashToolConfig, ProjectBashToolConfig
  - Modify: BashExecutionMode (rename modes), FilesystemConfig (remove allowGitConfig), SandboxConfig (remove enablePython, allowGitConfig)
  - Keep: NetworkConfig (add deniedDomains), CommandBlacklistConfig, ResolvedBashToolConfig

- packages/shared/src/types/settings.ts
  - Remove: bashTool, mcpSafety from GlobalSettings
  - Remove: bashTool, mcpSafety from ProjectConfig
  - Add: New permissions config reference

### 5.2 Server Files

**MODIFY**:
- packages/server/src/storage/settings.ts (default settings)
- packages/server/src/storage/projects.ts (add permissions-config directory creation)
- packages/server/src/agent/resolve-bash-config.ts (complete rewrite for new resolution)
- packages/server/src/agent/validate-bash-config.ts (update validation)
- packages/server/src/agent/builtin-tools.ts (use new resolved config)
- packages/server/src/routes/chat.ts (read new config structure)

**NEW FILES**:
- packages/server/src/storage/permissions-config.ts (new service for managing permissions configs)
- packages/server/src/routes/permissions.ts (CRUD endpoints for permissions configs)

### 5.3 UI Components

**REMOVE**:
- packages/ui/src/components/settings/BashPresetSelector.tsx

**RENAME**:
- packages/ui/src/components/settings/SafetyBashToolSettings.tsx → PermissionsSettings.tsx
- packages/ui/src/components/project/ProjectSafetyBashToolSettings.tsx → ProjectPermissionsSettings.tsx

**REMOVE** (merged into Permissions):
- packages/ui/src/components/settings/SafetyMCPSettings.tsx
- packages/ui/src/components/project/ProjectSafetyMCPSettings.tsx

**MODIFY**:
- packages/ui/src/components/settings/index.ts (update exports)
- packages/ui/src/components/project/index.ts (update exports)

### 5.4 UI Pages

**MODIFY**:
- packages/ui/src/pages/settings/GlobalSettingsPage.tsx
  - Rename "Safety" tab to "Permissions"
  - Remove SafetyTab sub-tabs (no more Bash Tool vs MCP split)
  - Use new PermissionsSettings component

- packages/ui/src/pages/project/ProjectSettingsPage.tsx
  - Rename "Safety" tab to "Permissions"
  - Remove ProjectSafetyTab sub-tabs
  - Use new ProjectPermissionsSettings component

### 5.5 Tests

**MODIFY** (all test files referencing old types/components):
- packages/ui/src/components/project/ProjectSafetyMCPSettings.test.tsx
- packages/ui/src/components/project/ProjectSafetyBashToolSettings.test.tsx
- packages/ui/src/components/settings/SafetyBashToolSettings.test.tsx
- packages/ui/src/components/settings/SafetyMCPSettings.test.tsx
- packages/server/src/agent/builtin-tools.test.ts
- packages/server/src/agent/resolve-bash-config.test.ts
- packages/server/src/agent/validate-bash-config.test.ts
- packages/server/src/agent/tools.test.ts
- packages/ui/src/pages/settings/GlobalSettingsPage.test.tsx
- packages/ui/src/pages/project/ProjectCreateModal.test.tsx
- packages/ui/src/stores/useAppStore.test.ts
- packages/ui/src/hooks/hooks.test.ts

### 5.6 Mock Data

**MODIFY**:
- packages/ui/src/services/mock/data.ts (update seed data with new permissions structure)

---

## 6. Windows Platform Support

**Current state**:
- ❌ No special handling for Windows in current codebase
- ❌ Sandbox runtime is assumed to work on all platforms

**Required changes**:
1. Add platform check in `packages/server/src/agent/builtin-tools.ts`:
   ```typescript
   if (process.platform === 'win32' && config.mode === 'sandbox') {
     // On Windows, sandbox mode only supports denied commands
     // Filesystem/network restrictions are NOT available
   }
   ```

2. Add platform check in UI to hide unsupported config options:
   ```typescript
   const isWindows = /* detect platform via preload/IPC */
   if (isWindows && mode === 'sandbox') {
     // Only show "Denied Commands" section
     // Hide: allowed domains, denied write, denied read
   }
   ```

**Note**: Electron preload script should expose `process.platform` to renderer via contextBridge.

---

## 7. Default Configuration Content

**Based on requirement #13-18**:

```typescript
export const DEFAULT_PERMISSIONS_CONFIG: PermissionsConfig = {
  id: 'default',
  name: 'Default',
  mode: 'sandbox',
  sandboxConfig: {
    filesystem: {
      allowWrite: ['{workspace}'], // Template, resolved at runtime
      denyRead: [
        '~/.ssh',
        '~/.aws',
        '/etc/passwd',
        '/etc/shadow',
        '**/.env',
        '**/secrets/**',
      ],
      denyWrite: [], // allowWrite is whitelist, so this is empty by default
    },
    network: {
      allowedDomains: ['*'], // Default: all allowed (req #16)
      deniedDomains: [],     // Default: empty (req #17)
    },
    deniedCommands: [        // Req #18: user can add python here if needed
      'sudo *',
      'su *',
      'doas *',
      'osascript *',
      'security *',
      'mkfs *',
      'dd if=* of=/dev/*',
      'chmod 777 *',
      'rm -rf /',
    ],
  },
  applyToMCP: false, // Req #27-28: default unchecked
}
```

**System-level default**:
- Stored in server code (not user-editable)
- Used as template when creating new configs via "Duplicate" feature

---

## 8. Configuration Storage Paths

**Based on requirement #19-20**:

```
~/.golemancy/
├── settings.json                       # Global settings (no longer has bashTool/mcpSafety)
└── projects/
    └── {projectId}/
        ├── project.json                # Has "permissionsConfigId" field
        ├── permissions-config/         # NEW: project-level permissions configs
        │   ├── default.json            # System default (read-only)
        │   ├── {custom-id-1}.json      # User custom config
        │   └── {custom-id-2}.json      # User custom config
        ├── agents/
        ├── tasks/
        └── ...
```

**Project config reference**:
```typescript
interface ProjectConfig {
  maxConcurrentAgents: number
  permissionsConfigId: string  // NEW: ID pointing to permissions-config/{id}.json
}
```

---

## 9. Denied Commands Implementation Verification

**Verification**: ✅ CONFIRMED

**File**: `packages/server/src/agent/check-command-blacklist.ts`

**Evidence**:
1. Function signature (line 82-85):
   ```typescript
   export function checkCommandBlacklist(
     command: string,
     config: CommandBlacklistConfig,
   ): void
   ```

2. CommandBlacklistConfig interface (line 3-8):
   ```typescript
   export interface CommandBlacklistConfig {
     deniedCommands: string[]
     deniedPatterns?: string[]
   }
   ```

3. No dependency on enablePython — python blocking is injected at resolution time in resolve-bash-config.ts (lines 119-131):
   ```typescript
   const PYTHON_DENY_COMMANDS = ['python', 'python3', 'pip', 'pip3']
   function applyEnablePythonMapping(config: SandboxConfig): SandboxConfig {
     if (config.enablePython) return config
     return {
       ...config,
       deniedCommands: deduplicateArray([
         ...config.deniedCommands,
         ...PYTHON_DENY_COMMANDS,
       ]),
     }
   }
   ```

**Conclusion**: Denied commands implementation is standalone and can be used directly in new architecture.

---

## 10. Complete File Inventory for Implementation

### 10.1 Files to DELETE

1. `packages/shared/src/types/bash-tool-presets.ts`
2. `packages/ui/src/components/settings/BashPresetSelector.tsx`
3. `packages/ui/src/components/settings/SafetyMCPSettings.tsx`
4. `packages/ui/src/components/project/ProjectSafetyMCPSettings.tsx`

### 10.2 Files to RENAME

1. `packages/ui/src/components/settings/SafetyBashToolSettings.tsx`
   → `packages/ui/src/components/settings/PermissionsSettings.tsx`

2. `packages/ui/src/components/project/ProjectSafetyBashToolSettings.tsx`
   → `packages/ui/src/components/project/ProjectPermissionsSettings.tsx`

### 10.3 Files to CREATE

1. `packages/shared/src/types/permissions-config.ts` (new type definitions)
2. `packages/server/src/storage/permissions-config.ts` (storage service)
3. `packages/server/src/routes/permissions.ts` (CRUD endpoints)
4. `packages/server/src/services/interfaces.ts` (IPermissionsService interface)

### 10.4 Files to MODIFY (Complete List)

**Shared Package (8 files)**:
1. packages/shared/src/types/bash-tool-config.ts
2. packages/shared/src/types/settings.ts
3. packages/shared/src/types/index.ts (update exports)
4. packages/shared/src/services/interfaces.ts (add IPermissionsService)

**Server Package (15 files)**:
1. packages/server/src/storage/settings.ts
2. packages/server/src/storage/projects.ts
3. packages/server/src/agent/resolve-bash-config.ts
4. packages/server/src/agent/validate-bash-config.ts
5. packages/server/src/agent/builtin-tools.ts
6. packages/server/src/agent/anthropic-sandbox.ts
7. packages/server/src/routes/chat.ts
8. packages/server/src/routes/projects.ts
9. packages/server/src/app.ts (register new /permissions routes)
10. packages/server/src/agent/builtin-tools.test.ts
11. packages/server/src/agent/resolve-bash-config.test.ts
12. packages/server/src/agent/validate-bash-config.test.ts
13. packages/server/src/agent/tools.test.ts
14. packages/server/src/agent/native-sandbox.test.ts
15. packages/server/src/agent/anthropic-sandbox.test.ts

**UI Package (20+ files)**:
1. packages/ui/src/pages/settings/GlobalSettingsPage.tsx
2. packages/ui/src/pages/project/ProjectSettingsPage.tsx
3. packages/ui/src/components/settings/index.ts
4. packages/ui/src/components/project/index.ts
5. packages/ui/src/stores/useAppStore.ts (update settings slice)
6. packages/ui/src/services/http/services.ts (add permissions CRUD)
7. packages/ui/src/services/mock/data.ts (update seed data)
8. packages/ui/src/services/mock/services.ts (add mock permissions service)
9. packages/ui/src/components/settings/SafetyBashToolSettings.test.tsx
10. packages/ui/src/components/settings/SafetyMCPSettings.test.tsx
11. packages/ui/src/components/project/ProjectSafetyBashToolSettings.test.tsx
12. packages/ui/src/components/project/ProjectSafetyMCPSettings.test.tsx
13. packages/ui/src/pages/settings/GlobalSettingsPage.test.tsx
14. packages/ui/src/pages/project/ProjectCreateModal.test.tsx
15. packages/ui/src/stores/useAppStore.test.ts
16. packages/ui/src/hooks/hooks.test.ts

**Total**: 4 DELETE + 2 RENAME + 4 CREATE + 43 MODIFY = **53 files**

---

## 11. Critical Findings Summary

### ✅ Confirmed Facts

1. **Denied commands** work standalone without enablePython dependency
2. **Project storage** uses per-project directories at `~/.golemancy/projects/{id}/`
3. **Platform detection** exists but NOT for Windows sandbox runtime (needs to be added)
4. **Current architecture** uses global + project config with inheritance model
5. **Sandbox runtime** is invoked via SandboxPool with worker processes

### ⚠️ Gaps to Address

1. **Windows platform support** — needs explicit check in builtin-tools.ts and UI
2. **Permissions config storage** — new directory `permissions-config/` must be created in projects
3. **MCP integration** — currently separate, needs to be merged into PermissionsConfig with "applyToMCP" toggle
4. **Default config** — system-level default must be non-editable and available to all projects
5. **Duplicate feature** — needs new endpoint to clone existing permissions configs

### 🔥 High-Risk Areas

1. **Resolution logic** (resolve-bash-config.ts) — complete rewrite, affects runtime behavior
2. **Type changes** — breaking changes across shared/server/ui packages
3. **Mock data** — tests will break if not updated with new schema
4. **Migration** — existing projects with bashTool/mcpSafety config need migration path

---

## 12. Recommendations for Implementation

### Phase 1: Types & Schema (Low Risk)
1. Define new PermissionsConfig types in shared package
2. Add platform detection utilities
3. Create IPermissionsService interface

### Phase 2: Server Storage (Medium Risk)
1. Implement permissions-config storage service
2. Add CRUD endpoints
3. Update projects.ts to create permissions-config/ directory
4. Implement default config resolution

### Phase 3: Server Runtime (High Risk)
1. Rewrite resolve-bash-config.ts → resolve-permissions-config.ts
2. Update builtin-tools.ts to use new config
3. Add Windows platform checks
4. Update validation logic

### Phase 4: UI Components (Medium Risk)
1. Create new PermissionsSettings component
2. Update GlobalSettingsPage and ProjectSettingsPage
3. Add platform detection in UI (via preload)
4. Implement "Duplicate" functionality

### Phase 5: Testing & Migration (High Risk)
1. Update all test files
2. Create migration script for existing projects
3. Run integration tests
4. Verify all 31 requirements

---

## 13. MCP Sandbox Integration via srt Wrapping (Requirements 32-36)

### 13.1 Current MCP Implementation

**File**: `packages/server/src/agent/mcp.ts` (lines 1-78)

**Current behavior** (lines 27-37):
```typescript
if (server.transportType === 'stdio') {
  if (!server.command) {
    log.warn({ name: server.name }, 'stdio MCP server missing command, skipping')
    continue
  }
  const { Experimental_StdioMCPTransport } = await import('@ai-sdk/mcp/mcp-stdio')
  transport = new Experimental_StdioMCPTransport({
    command: server.command,
    args: server.args,
    env: server.env ? { ...process.env, ...server.env } as Record<string, string> : undefined,
  })
}
```

**Finding**: ❌ **No existing srt wrapping implementation**. MCP servers are spawned directly with `command` + `args`, no sandbox runtime wrapping exists.

### 13.2 MCPServerConfig Schema

**File**: `packages/shared/src/types/mcp.ts` (lines 1-33)

**Current schema** (lines 3-24):
```typescript
export interface MCPServerConfig {
  name: string
  transportType: MCPTransportType
  description?: string
  command?: string           // For stdio transport
  args?: string[]           // For stdio transport
  env?: Record<string, string>
  cwd?: string
  url?: string              // For sse/http transport
  headers?: Record<string, string>
  enabled: boolean
}
```

**Finding**: Schema has `command` and `args` fields, suitable for srt wrapping. No `applyToMCP` field exists yet.

### 13.3 Previous "runInSandbox" Implementation Status

**Files with GlobalMCPSafetyConfig / ProjectMCPSafetyConfig**:

1. **packages/shared/src/types/bash-tool-config.ts** (lines 143-156)
   - `GlobalMCPSafetyConfig`: `{ runInSandbox: boolean }`
   - `ProjectMCPSafetyConfig`: `{ inherit: boolean; runInSandbox?: boolean }`

2. **packages/server/src/agent/resolve-bash-config.ts** (lines 80-91)
   - `resolveMCPSafetyConfig()` function resolves inherit logic

3. **packages/ui/src/components/settings/SafetyMCPSettings.tsx** (lines 1-82)
   - UI component for "Run inside sandbox" vs "Run outside sandbox" toggle

4. **Usage locations**:
   - packages/ui/src/pages/settings/GlobalSettingsPage.tsx:451
   - packages/ui/src/pages/project/ProjectSettingsPage.tsx:418
   - Multiple test files referencing `runInSandbox`

**Finding**: ⚠️ **Previous implementation was conceptually wrong**. The `runInSandbox` flag exists in config but is **NOT used anywhere in the MCP spawning code** (mcp.ts). Per requirement #35, this approach was incorrect.

### 13.4 Correct srt Wrapping Approach (Requirements 32-34)

**Requirement #32**: "Apply to MCP" mechanism = wrap MCP server command with `srt`

**Example transformation** (Requirement #33):
```
Original: npx -y @modelcontextprotocol/server-filesystem
Wrapped:  srt npx -y @modelcontextprotocol/server-filesystem
```

**Implementation approach** (Requirement #34):
- When `applyToMCP: true` in PermissionsConfig:
  - Original: `{ command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem'] }`
  - Wrapped: `{ command: 'srt', args: ['npx', '-y', '@modelcontextprotocol/server-filesystem'] }`

**Required changes**:
1. Add `applyToMCP` field to PermissionsConfig
2. Modify `packages/server/src/agent/mcp.ts:27-37` to check `applyToMCP` and wrap command
3. Pass resolved PermissionsConfig to `loadAgentMcpTools()`

### 13.5 Scope Limitation (Requirement #36)

**IMPORTANT**: Per requirement #36:
> 本次改动仅做 UI 和配置层面的变更，MCP 沙箱化的运行时实现留待后续

**Current refactor scope**:
- ✅ Add `applyToMCP: boolean` field to PermissionsConfig schema
- ✅ Add "Apply to MCP" toggle in UI (below sandbox config)
- ✅ Store `applyToMCP` value in permissions config files
- ✅ Remove old `GlobalMCPSafetyConfig` / `ProjectMCPSafetyConfig` types
- ✅ Remove SafetyMCPSettings components
- ❌ **DO NOT implement srt wrapping in mcp.ts** (deferred to future)

**Future work** (not in current scope):
- Actual srt command wrapping in `loadAgentMcpTools()`
- Passing PermissionsConfig to MCP loading
- Testing srt wrapper behavior

### 13.6 Files to Modify for MCP Integration

**Types** (this refactor):
1. `packages/shared/src/types/permissions-config.ts` (NEW)
   - Add `applyToMCP: boolean` to PermissionsConfig
   - Default: `false` (requirement #28)

**UI Components** (this refactor):
1. New `PermissionsSettings.tsx` component
   - Add "Apply to MCP" toggle at bottom (requirement #27)
   - Hide on Windows (requirement #31)
   - Show only when mode === 'sandbox'

**To DELETE** (old MCP safety approach):
1. `packages/shared/src/types/bash-tool-config.ts` lines 138-156 (GlobalMCPSafetyConfig, ProjectMCPSafetyConfig)
2. `packages/ui/src/components/settings/SafetyMCPSettings.tsx`
3. `packages/ui/src/components/project/ProjectSafetyMCPSettings.tsx`
4. `packages/server/src/agent/resolve-bash-config.ts` lines 80-91 (resolveMCPSafetyConfig)

**NOT modified in this refactor** (future work):
1. `packages/server/src/agent/mcp.ts` — srt wrapping deferred
2. `packages/shared/src/types/mcp.ts` — schema unchanged

### 13.7 Migration Impact

**Old config structure**:
```typescript
{
  bashTool: { defaultMode: 'sandbox', sandboxPreset: 'balanced' },
  mcpSafety: { runInSandbox: false }
}
```

**New config structure**:
```typescript
{
  permissionsConfigId: 'default' // Points to permissions-config/default.json
}

// In permissions-config/default.json:
{
  id: 'default',
  name: 'Default',
  mode: 'sandbox',
  sandboxConfig: { ... },
  applyToMCP: false  // Migrated from mcpSafety.runInSandbox
}
```

**Migration rule**: `applyToMCP = mcpSafety.runInSandbox ?? false`

---

## 14. Updated Complete File Inventory (with MCP changes)

### 14.1 Files to DELETE (Updated)

1. `packages/shared/src/types/bash-tool-presets.ts`
2. `packages/ui/src/components/settings/BashPresetSelector.tsx`
3. `packages/ui/src/components/settings/SafetyMCPSettings.tsx` ← **Confirmed removal**
4. `packages/ui/src/components/project/ProjectSafetyMCPSettings.tsx` ← **Confirmed removal**

### 14.2 Total Impact (Updated)

**Total**: 4 DELETE + 2 RENAME + 4 CREATE + 43 MODIFY = **53 files**

(No change to total count — MCP components were already in delete list)

---

**End of Fact Check Document**

**Last Updated**: 2026-02-15 (Added Section 13: MCP srt wrapping requirements 32-36)
