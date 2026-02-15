# Permissions Refactor Architecture

## Overview

This document defines the complete architecture for refactoring the Bash Tool sandbox system into a unified Permissions system. The refactor simplifies the three-layer config hierarchy (Global → Project → Agent) into a direct project-level permissions model with reusable configurations.

## 1. New Type Definitions

### 1.1 Core Types (`packages/shared/src/types/permissions.ts`)

```typescript
import type { Timestamped } from './common'

// ── Branded ID Type ────────────────────────────────────────────

/**
 * Branded ID for permissions config files.
 * Follows the same pattern as ProjectId, AgentId, etc.
 */
type Brand<T, B extends string> = T & { readonly __brand: B }
export type PermissionsConfigId = Brand<string, 'PermissionsConfigId'>

// ── Permission Mode ────────────────────────────────────────────

/**
 * Three execution modes for agent commands:
 * - restricted: Virtual sandbox (just-bash), no real system commands
 * - sandbox: OS-level isolation via Anthropic Sandbox Runtime (default)
 * - unrestricted: No sandbox, full system access (dangerous)
 */
export type PermissionMode = 'restricted' | 'sandbox' | 'unrestricted'

// ── Permissions Config ─────────────────────────────────────────

/**
 * Unified permissions configuration for both Bash Tool and MCP.
 * Replaces the old SandboxConfig, FilesystemConfig, NetworkConfig split.
 */
export interface PermissionsConfig {
  /**
   * Directories where write operations are allowed (glob patterns).
   * Supports template variable: {{workspaceDir}} (replaced at resolution time).
   * Default: ['{{workspaceDir}}']
   */
  allowWrite: string[]

  /**
   * Paths/patterns where read operations are denied (glob patterns).
   * Default: sensitive paths (SSH keys, credentials, etc.)
   */
  denyRead: string[]

  /**
   * Paths/patterns where write operations are denied (glob patterns).
   * Takes precedence over allowWrite.
   * Default: [] (allowWrite already restrictive)
   */
  denyWrite: string[]

  /**
   * Allowed domain patterns (supports wildcards like "*.github.com").
   * Default: ['*'] (all domains allowed)
   */
  allowedDomains: string[]

  /**
   * Denied domain patterns (takes precedence over allowedDomains).
   * Default: []
   */
  deniedDomains: string[]

  /**
   * Command patterns that are blocked from execution.
   * Supports simple wildcards: "sudo *" matches "sudo apt install".
   * NOTE: This is application-layer enforcement, not sandbox runtime native.
   * Default: [] (user manually adds python/python3 if needed)
   */
  deniedCommands: string[]

  /**
   * Whether these permissions also apply to MCP servers.
   *
   * IMPORTANT (Requirements 32-36):
   * - This field is for UI/config storage only in this refactor phase
   * - Technical implementation: wraps MCP server command with `srt` (sandbox runtime)
   * - Example: `npx -y @modelcontextprotocol/server-filesystem`
   *   becomes `srt npx -y @modelcontextprotocol/server-filesystem`
   * - Actual MCP command wrapping implementation is DEFERRED to future work
   * - This refactor only adds the UI toggle and config persistence
   *
   * When true: MCP servers will be sandboxed (future implementation)
   * When false: MCP servers run unrestricted
   * Default: false
   * NOTE: Windows doesn't show this option (no sandbox runtime support)
   */
  applyToMCP: boolean
}

// ── Permissions Config File ────────────────────────────────────

/**
 * A named, reusable permissions configuration stored in
 * ~/.golemancy/projects/{projectId}/permissions-config/{id}.json
 */
export interface PermissionsConfigFile extends Timestamped {
  /** Unique identifier (branded type) */
  id: PermissionsConfigId

  /** Human-readable title (e.g., "Default", "Strict Dev", "Python Disabled") */
  title: string

  /** Execution mode for this config */
  mode: PermissionMode

  /** Detailed permissions settings (only used when mode = 'sandbox') */
  config: PermissionsConfig
}

// ── Resolved Config ────────────────────────────────────────────

/**
 * Fully-resolved permissions config after template substitution and platform checks.
 * This is what the runtime (SandboxPool, AnthropicSandbox) consumes.
 */
export interface ResolvedPermissionsConfig {
  mode: PermissionMode
  /** Only meaningful when mode is "sandbox" */
  config: PermissionsConfig
}

// ── Platform Support ───────────────────────────────────────────

/**
 * Platforms that support full sandbox runtime features.
 * Windows only supports deniedCommands (no filesystem/network isolation).
 */
export type SupportedPlatform = 'darwin' | 'linux' | 'win32'

export function isSandboxRuntimeSupported(platform: SupportedPlatform): boolean {
  return platform === 'darwin' || platform === 'linux'
}

// ── Mandatory Deny Paths (preserved from bash-tool-config.ts) ──

/**
 * Paths that SandboxManager ALWAYS denies write access to.
 * These are enforced by the Sandbox Runtime itself and CANNOT be overridden.
 */
export const SANDBOX_MANDATORY_DENY_WRITE: readonly string[] = [
  '**/.bashrc',
  '**/.bash_profile',
  '**/.zshrc',
  '**/.zprofile',
  '**/.profile',
  '**/.git/hooks/**',
  '**/.git/config',
  '**/.gitmodules',
  '**/.ripgreprc',
  '**/.mcp.json',
  '**/.vscode/**',
  '**/.idea/**',
  '**/.claude/**',
] as const
```

### 1.2 Updated Common Types (`packages/shared/src/types/common.ts`)

Add the new branded ID type:

```typescript
// ... existing types ...

export type PermissionsConfigId = Brand<string, 'PermissionsConfigId'>

// ... existing createId helper works for PermissionsConfigId too ...
```

### 1.3 Updated Settings Types (`packages/shared/src/types/settings.ts`)

Remove global bash tool and MCP safety config:

```typescript
// REMOVE:
// - GlobalBashToolConfig import
// - GlobalMCPSafetyConfig import
// - bashTool field from GlobalSettings
// - mcpSafety field from GlobalSettings

export interface GlobalSettings {
  providers: ProviderConfig[]
  defaultProvider: AIProvider
  theme: ThemeMode
  userProfile: UserProfile
  defaultWorkingDirectoryBase: string
  // REMOVED: bashTool
  // REMOVED: mcpSafety
}

// REMOVE:
// - ProjectBashToolConfig import
// - ProjectMCPSafetyConfig import
// - bashTool field from ProjectConfig
// - mcpSafety field from ProjectConfig

export interface ProjectConfig {
  providerOverride?: Partial<ProviderConfig>
  maxConcurrentAgents: number
  // REMOVED: bashTool
  // REMOVED: mcpSafety
  // ADD: permissions config reference
  permissionsConfigId?: PermissionsConfigId
}
```

### 1.4 Updated Project Types (`packages/shared/src/types/project.ts`)

No changes needed - ProjectConfig is imported from settings.ts.

## 2. Default Configuration

### 2.1 System Default Config

The system provides an immutable default configuration with ID = 'default':

```typescript
// packages/shared/src/types/permissions.ts

import { PermissionsConfigFile, PermissionsConfigId } from './permissions'

/**
 * System default permissions config.
 * - Immutable (cannot be modified or deleted)
 * - Always available (fallback when project config not found)
 * - Uses {{workspaceDir}} template for project-agnostic definition
 */
export const DEFAULT_PERMISSIONS_CONFIG: PermissionsConfigFile = {
  id: 'default' as PermissionsConfigId,
  title: 'Default',
  mode: 'sandbox',
  config: {
    // Allow write only to project workspace
    allowWrite: ['{{workspaceDir}}'],

    // Deny read to sensitive paths
    denyRead: [
      '~/.ssh',
      '~/.aws',
      '~/.gnupg',
      '/etc/passwd',
      '/etc/shadow',
      '**/.env',
      '**/.env.*',
      '**/secrets/**',
      '**/*.pem',
      '**/*.key',
      '**/*.p12',
      '**/credentials*',
    ],

    // Empty (allowWrite already restrictive)
    denyWrite: [],

    // Allow all domains by default
    allowedDomains: ['*'],

    // No denied domains by default
    deniedDomains: [],

    // User manually adds python/python3 if needed
    deniedCommands: [],

    // MCP not sandboxed by default
    applyToMCP: false,
  },
  createdAt: '2026-01-01T00:00:00.000Z', // Fixed timestamp
  updatedAt: '2026-01-01T00:00:00.000Z',
}
```

### 2.2 Template Variables

The `{{workspaceDir}}` template is replaced at resolution time with the project's actual working directory:

```typescript
// Before resolution:
allowWrite: ['{{workspaceDir}}']

// After resolution (example):
allowWrite: ['/Users/cai/projects/my-app']
```

## 3. Storage Architecture

### 3.1 Directory Structure

```
~/.golemancy/
├── settings.json                    # Global settings (NO bashTool/mcpSafety)
└── projects/
    └── {projectId}/
        ├── project.json              # Project metadata with permissionsConfigId
        ├── permissions-config/       # NEW: Per-project permissions configs
        │   ├── default.json          # System default (symlink or copy)
        │   ├── {uuid-1}.json         # User-created config 1
        │   └── {uuid-2}.json         # User-created config 2
        ├── agents/
        ├── tasks/
        └── ...
```

### 3.2 Config File Format

Each `{id}.json` file in `permissions-config/` follows the `PermissionsConfigFile` schema:

```json
{
  "id": "abc-123-def",
  "title": "Strict Development",
  "mode": "sandbox",
  "config": {
    "allowWrite": ["{{workspaceDir}}"],
    "denyRead": ["~/.ssh", "~/.aws"],
    "denyWrite": [],
    "allowedDomains": ["github.com", "*.npmjs.org"],
    "deniedDomains": [],
    "deniedCommands": ["python", "python3", "sudo *"],
    "applyToMCP": true
  },
  "createdAt": "2026-02-15T12:00:00.000Z",
  "updatedAt": "2026-02-15T12:00:00.000Z"
}
```

### 3.3 Project Config Reference

The project's `project.json` references a permissions config by ID:

```json
{
  "id": "proj-xyz",
  "name": "My Project",
  "config": {
    "maxConcurrentAgents": 3,
    "permissionsConfigId": "default"
  }
}
```

### 3.4 Service Interface

```typescript
// packages/shared/src/services/interfaces/permissions-config.service.ts

import type { PermissionsConfigFile, PermissionsConfigId, ProjectId } from '../types'

export interface IPermissionsConfigService {
  /**
   * List all permissions configs for a project.
   * Always includes the system default config.
   */
  list(projectId: ProjectId): Promise<PermissionsConfigFile[]>

  /**
   * Get a permissions config by ID.
   * Returns null if not found.
   * System default (id='default') is always available.
   */
  getById(projectId: ProjectId, id: PermissionsConfigId): Promise<PermissionsConfigFile | null>

  /**
   * Create a new permissions config.
   * Generates a new UUID for the ID.
   */
  create(
    projectId: ProjectId,
    data: Pick<PermissionsConfigFile, 'title' | 'mode' | 'config'>
  ): Promise<PermissionsConfigFile>

  /**
   * Update an existing permissions config.
   * Cannot update system default (id='default').
   */
  update(
    projectId: ProjectId,
    id: PermissionsConfigId,
    data: Partial<Pick<PermissionsConfigFile, 'title' | 'mode' | 'config'>>
  ): Promise<PermissionsConfigFile>

  /**
   * Delete a permissions config.
   * Cannot delete system default (id='default').
   * Fails if any project is currently using this config.
   */
  delete(projectId: ProjectId, id: PermissionsConfigId): Promise<void>

  /**
   * Duplicate a permissions config.
   * Creates a new config with the same mode/config but new ID and title.
   */
  duplicate(
    projectId: ProjectId,
    sourceId: PermissionsConfigId,
    newTitle: string
  ): Promise<PermissionsConfigFile>
}
```

### 3.5 Storage Implementation

```typescript
// packages/server/src/storage/permissions-config.ts

import fs from 'node:fs/promises'
import path from 'node:path'
import type {
  PermissionsConfigFile,
  PermissionsConfigId,
  ProjectId,
  IPermissionsConfigService
} from '@golemancy/shared'
import { DEFAULT_PERMISSIONS_CONFIG } from '@golemancy/shared'
import { readJson, writeJson, isNodeError } from './base'
import { getDataDir, validateId } from '../utils/paths'
import { generateId } from '../utils/ids'
import { logger } from '../logger'

const log = logger.child({ component: 'storage:permissions-config' })

export class FilePermissionsConfigStorage implements IPermissionsConfigService {
  private permissionsConfigDir(projectId: string) {
    validateId(projectId)
    return path.join(getDataDir(), 'projects', projectId, 'permissions-config')
  }

  private configFilePath(projectId: string, id: string) {
    validateId(id)
    return path.join(this.permissionsConfigDir(projectId), `${id}.json`)
  }

  async list(projectId: ProjectId): Promise<PermissionsConfigFile[]> {
    const dir = this.permissionsConfigDir(projectId)

    try {
      const files = await fs.readdir(dir)
      const configs = await Promise.all(
        files
          .filter(f => f.endsWith('.json'))
          .map(f => readJson<PermissionsConfigFile>(path.join(dir, f)))
      )

      // Always include system default
      const hasDefault = configs.some(c => c?.id === 'default')
      if (!hasDefault) {
        configs.push(DEFAULT_PERMISSIONS_CONFIG)
      }

      return configs.filter((c): c is PermissionsConfigFile => c !== null)
    } catch (e) {
      if (isNodeError(e) && e.code === 'ENOENT') {
        // Directory doesn't exist yet → return only default
        return [DEFAULT_PERMISSIONS_CONFIG]
      }
      throw e
    }
  }

  async getById(projectId: ProjectId, id: PermissionsConfigId): Promise<PermissionsConfigFile | null> {
    // System default is always available
    if (id === 'default') {
      return DEFAULT_PERMISSIONS_CONFIG
    }

    return readJson<PermissionsConfigFile>(this.configFilePath(projectId, id))
  }

  async create(
    projectId: ProjectId,
    data: Pick<PermissionsConfigFile, 'title' | 'mode' | 'config'>
  ): Promise<PermissionsConfigFile> {
    const id = generateId('perm') as PermissionsConfigId
    const now = new Date().toISOString()

    const config: PermissionsConfigFile = {
      id,
      ...data,
      createdAt: now,
      updatedAt: now,
    }

    const dir = this.permissionsConfigDir(projectId)
    await fs.mkdir(dir, { recursive: true })
    await writeJson(this.configFilePath(projectId, id), config)

    log.debug({ projectId, configId: id }, 'created permissions config')
    return config
  }

  async update(
    projectId: ProjectId,
    id: PermissionsConfigId,
    data: Partial<Pick<PermissionsConfigFile, 'title' | 'mode' | 'config'>>
  ): Promise<PermissionsConfigFile> {
    if (id === 'default') {
      throw new Error('Cannot update system default config')
    }

    const existing = await this.getById(projectId, id)
    if (!existing) {
      throw new Error(`Permissions config ${id} not found`)
    }

    const updated: PermissionsConfigFile = {
      ...existing,
      ...data,
      updatedAt: new Date().toISOString(),
    }

    await writeJson(this.configFilePath(projectId, id), updated)
    log.debug({ projectId, configId: id }, 'updated permissions config')
    return updated
  }

  async delete(projectId: ProjectId, id: PermissionsConfigId): Promise<void> {
    if (id === 'default') {
      throw new Error('Cannot delete system default config')
    }

    const filePath = this.configFilePath(projectId, id)
    await fs.unlink(filePath)
    log.debug({ projectId, configId: id }, 'deleted permissions config')
  }

  async duplicate(
    projectId: ProjectId,
    sourceId: PermissionsConfigId,
    newTitle: string
  ): Promise<PermissionsConfigFile> {
    const source = await this.getById(projectId, sourceId)
    if (!source) {
      throw new Error(`Permissions config ${sourceId} not found`)
    }

    return this.create(projectId, {
      title: newTitle,
      mode: source.mode,
      config: { ...source.config },
    })
  }
}
```

## 4. Resolution Logic

### 4.1 Resolution Function

```typescript
// packages/server/src/agent/resolve-permissions.ts

import type {
  PermissionsConfigId,
  ProjectId,
  ResolvedPermissionsConfig,
  PermissionsConfig,
  SupportedPlatform,
} from '@golemancy/shared'
import { DEFAULT_PERMISSIONS_CONFIG, isSandboxRuntimeSupported } from '@golemancy/shared'
import { services } from '../services'
import { logger } from '../logger'

const log = logger.child({ component: 'agent:resolve-permissions' })

/**
 * Resolve the effective permissions config for a project.
 *
 * Resolution steps:
 * 1. Load config by ID from project's permissions-config/ directory
 * 2. If not found, fall back to system default config
 * 3. Replace {{workspaceDir}} template in allowWrite
 * 4. Windows platform: force sandbox mode to only use deniedCommands
 *
 * @param projectId - Project ID
 * @param configId - Permissions config ID
 * @param workspaceDir - Project workspace directory (replaces {{workspaceDir}})
 * @param platform - OS platform (darwin, linux, win32)
 */
export async function resolvePermissionsConfig(
  projectId: ProjectId,
  configId: PermissionsConfigId,
  workspaceDir: string,
  platform: SupportedPlatform
): Promise<ResolvedPermissionsConfig> {
  // Step 1: Load config by ID
  let configFile = await services.permissionsConfig.getById(projectId, configId)

  // Step 2: Fall back to default if not found
  if (!configFile) {
    log.warn({ projectId, configId }, 'permissions config not found, using default')
    configFile = DEFAULT_PERMISSIONS_CONFIG
  }

  // Step 3: Replace {{workspaceDir}} template
  const config: PermissionsConfig = {
    ...configFile.config,
    allowWrite: configFile.config.allowWrite.map(p =>
      p.replace('{{workspaceDir}}', workspaceDir)
    ),
  }

  // Step 4: Windows special handling
  if (platform === 'win32' && configFile.mode === 'sandbox') {
    // Windows doesn't support sandbox runtime
    // Only deniedCommands is meaningful
    log.debug({ projectId }, 'Windows platform: sandbox mode using deniedCommands only')
    return {
      mode: 'sandbox',
      config: {
        allowWrite: [],
        denyRead: [],
        denyWrite: [],
        allowedDomains: [],
        deniedDomains: [],
        deniedCommands: config.deniedCommands,
        applyToMCP: false, // Windows doesn't support MCP sandboxing
      },
    }
  }

  return {
    mode: configFile.mode,
    config,
  }
}
```

### 4.2 Resolution vs. Old System

| Aspect | Old System | New System |
|--------|-----------|------------|
| **Layers** | Global → Project (2 layers) | Direct project lookup (1 layer) |
| **Inheritance** | Complex merge with security rules | No inheritance (direct reference) |
| **Presets** | 4 named presets (balanced, strict, etc.) | Single default config (duplicatable) |
| **Global config** | Stored in settings.json | Removed (no global config) |
| **Template vars** | None | `{{workspaceDir}}` for portability |
| **Fallback** | Global config | System default config |
| **Windows** | Runtime check in execution layer | Resolution-time platform check |

## 5. Migration Strategy

### 5.1 Config Migration

Old projects with `config.bashTool` need migration:

```typescript
// packages/server/src/migrations/migrate-permissions.ts

import type { ProjectBashToolConfig, PermissionsConfigFile, PermissionMode } from '@golemancy/shared'
import { DEFAULT_PERMISSIONS_CONFIG } from '@golemancy/shared'
import { SANDBOX_PRESETS } from '@golemancy/shared' // Import old presets for migration

/**
 * Migrate old bashTool config to new permissions config.
 *
 * Conversion rules:
 * - mode: direct mapping (restricted → restricted, sandbox → sandbox, unrestricted → unrestricted)
 * - preset → config: convert preset to config values, ignore inheritance
 * - customConfig: merge with preset as base
 * - mcpSafety: convert runInSandbox to applyToMCP
 */
export async function migrateProjectPermissions(
  projectId: ProjectId,
  oldBashToolConfig?: ProjectBashToolConfig,
  oldMCPConfig?: ProjectMCPSafetyConfig
): Promise<PermissionsConfigId> {
  // If no old config, use default
  if (!oldBashToolConfig) {
    return 'default' as PermissionsConfigId
  }

  // Determine mode
  const mode: PermissionMode = oldBashToolConfig.mode ?? 'restricted'

  // If restricted or unrestricted, use default config with mode override
  if (mode !== 'sandbox') {
    // Create new config with mode override
    const newConfig = await services.permissionsConfig.create(projectId, {
      title: `Migrated - ${mode}`,
      mode,
      config: DEFAULT_PERMISSIONS_CONFIG.config,
    })
    return newConfig.id
  }

  // For sandbox mode, convert preset + customConfig
  const globalConfig = await services.settings.get()
  const preset = globalConfig.bashTool?.sandboxPreset ?? 'balanced'
  const baseConfig = SANDBOX_PRESETS[preset] || SANDBOX_PRESETS.balanced

  // Merge customConfig on top of preset
  const mergedConfig = oldBashToolConfig.customConfig
    ? mergeSandboxConfig(baseConfig, oldBashToolConfig.customConfig)
    : baseConfig

  // Convert old SandboxConfig to new PermissionsConfig
  const permissionsConfig: PermissionsConfig = {
    allowWrite: mergedConfig.filesystem.allowWrite.map(p =>
      // Convert absolute paths to template
      p.startsWith('/workspace') ? '{{workspaceDir}}' : p
    ),
    denyRead: mergedConfig.filesystem.denyRead,
    denyWrite: mergedConfig.filesystem.denyWrite,
    allowedDomains: mergedConfig.network.allowedDomains,
    deniedDomains: [], // Old system didn't have deniedDomains
    deniedCommands: mergedConfig.deniedCommands,
    applyToMCP: oldMCPConfig?.runInSandbox ?? false,
  }

  // Create new config
  const newConfig = await services.permissionsConfig.create(projectId, {
    title: `Migrated - ${preset}`,
    mode: 'sandbox',
    config: permissionsConfig,
  })

  return newConfig.id
}

// Helper from old resolve-bash-config.ts
function mergeSandboxConfig(base: SandboxConfig, override: Partial<SandboxConfig>): SandboxConfig {
  // ... (copy from old implementation)
}
```

### 5.2 Migration Timing

Run migration:
1. On server startup (check for old configs, migrate automatically)
2. On project load (lazy migration if old config detected)
3. Via manual migration script: `pnpm --filter @golemancy/server migrate:permissions`

### 5.3 Backward Compatibility

- Old `config.bashTool` and `config.mcpSafety` fields are preserved until migration completes
- After migration, old fields are deleted from `project.json`
- Migration is idempotent (safe to run multiple times)

## 6. Files to Create/Modify/Delete

### 6.1 Create (New Files)

**Shared (Types & Services):**
- `packages/shared/src/types/permissions.ts` — Core types (PermissionMode, PermissionsConfig, PermissionsConfigFile, etc.)
- `packages/shared/src/services/interfaces/permissions-config.service.ts` — IPermissionsConfigService interface

**Server (Storage & Logic):**
- `packages/server/src/storage/permissions-config.ts` — FilePermissionsConfigStorage implementation
- `packages/server/src/agent/resolve-permissions.ts` — Permission resolution logic
- `packages/server/src/routes/permissions-config.ts` — HTTP API routes
- `packages/server/src/migrations/migrate-permissions.ts` — Migration script

**UI (Services & Components):**
- `packages/ui/src/services/mock/MockPermissionsConfigService.ts` — Mock service for development
- `packages/ui/src/services/http/PermissionsConfigService.ts` — HTTP client service
- `packages/ui/src/pages/settings/PermissionsPage.tsx` — Global permissions list (replaces SafetyPage)
- `packages/ui/src/pages/projects/ProjectPermissionsTab.tsx` — Project-level permissions config
- `packages/ui/src/components/permissions/PermissionModeSelector.tsx` — Three-mode selector (Restricted/Sandbox/Unrestricted)
- `packages/ui/src/components/permissions/PermissionsConfigForm.tsx` — Config editor form
- `packages/ui/src/components/permissions/PermissionsConfigList.tsx` — Config list with duplicate/delete actions

**Design Docs:**
- `_design/20260215-1200-permissions-refactor/architecture.md` — This document
- `_design/20260215-1200-permissions-refactor/ui-mockups.md` — UI wireframes (to be created by UI/UX Designer)
- `_design/20260215-1200-permissions-refactor/windows-behavior.md` — Windows platform specifics (to be created)

### 6.2 Modify (Existing Files)

**Shared:**
- `packages/shared/src/types/common.ts` — Add `PermissionsConfigId` branded type
- `packages/shared/src/types/settings.ts` — Remove `bashTool` and `mcpSafety` from GlobalSettings, update ProjectConfig
- `packages/shared/src/types/project.ts` — No changes (imports ProjectConfig from settings.ts)
- `packages/shared/src/services/interfaces.ts` — Add IPermissionsConfigService export
- `packages/shared/src/types/index.ts` — Export new permissions types

**Server:**
- `packages/server/src/storage/projects.ts` — Create `permissions-config/` folder on project creation (line ~61)
- `packages/server/src/storage/settings.ts` — Remove bashTool/mcpSafety from DEFAULT_SETTINGS
- `packages/server/src/app.ts` — Register permissions-config routes
- `packages/server/src/services/index.ts` — Register PermissionsConfigService in DI container
- `packages/server/src/agent/builtin-tools.ts` — Update to use resolve-permissions instead of resolve-bash-config

**UI:**
- `packages/ui/src/services/container.ts` — Register PermissionsConfigService
- `packages/ui/src/services/mock/data.ts` — Add mock permissions configs
- `packages/ui/src/pages/settings/SettingsLayout.tsx` — Replace "Safety" nav with "Permissions"
- `packages/ui/src/pages/projects/ProjectSettingsPage.tsx` — Replace "Bash Tool" tab with "Permissions"
- `packages/ui/src/stores/useAppStore.ts` — Update settings slice to remove bashTool/mcpSafety

### 6.3 Delete (Obsolete Files)

**Shared:**
- `packages/shared/src/types/bash-tool-config.ts` — Replaced by permissions.ts
- `packages/shared/src/types/bash-tool-presets.ts` — No more presets (only default config)

**Server:**
- `packages/server/src/agent/resolve-bash-config.ts` — Replaced by resolve-permissions.ts

**UI:**
- `packages/ui/src/pages/settings/SafetyPage.tsx` — Replaced by PermissionsPage.tsx
- `packages/ui/src/pages/projects/BashToolTab.tsx` — Replaced by ProjectPermissionsTab.tsx
- `packages/ui/src/pages/projects/MCPTab.tsx` — Merged into ProjectPermissionsTab.tsx (applyToMCP field)

## 7. Windows Platform Behavior

### 7.1 Sandbox Runtime Availability

- **macOS/Linux:** Full sandbox runtime support (filesystem, network, commands)
- **Windows:** No sandbox runtime → only `deniedCommands` enforcement at application layer

### 7.2 UI Differences on Windows

When `platform === 'win32'`:

**Permissions Config Form (Sandbox Mode):**
- ✅ Show: `deniedCommands` field
- ❌ Hide: `allowWrite`, `denyRead`, `denyWrite`, `allowedDomains`, `deniedDomains`, `applyToMCP`

**Mode Selector:**
- ✅ Show: All three modes (Restricted, Sandbox, Unrestricted)
- ℹ️ Info: Tooltip on Sandbox mode: "Windows only supports command filtering"

### 7.3 Resolution Behavior

```typescript
// On Windows, sandbox mode config is stripped to only deniedCommands
if (platform === 'win32' && mode === 'sandbox') {
  return {
    mode: 'sandbox',
    config: {
      allowWrite: [],
      denyRead: [],
      denyWrite: [],
      allowedDomains: [],
      deniedDomains: [],
      deniedCommands: config.deniedCommands, // Only this is used
      applyToMCP: false,
    },
  }
}
```

## 8. API Routes

### 8.1 Endpoints

```typescript
// packages/server/src/routes/permissions-config.ts

import { Hono } from 'hono'
import type { PermissionsConfigId, ProjectId } from '@golemancy/shared'
import { services } from '../services'

const app = new Hono()

// GET /api/projects/:projectId/permissions-config
app.get('/api/projects/:projectId/permissions-config', async (c) => {
  const projectId = c.req.param('projectId') as ProjectId
  const configs = await services.permissionsConfig.list(projectId)
  return c.json(configs)
})

// GET /api/projects/:projectId/permissions-config/:id
app.get('/api/projects/:projectId/permissions-config/:id', async (c) => {
  const projectId = c.req.param('projectId') as ProjectId
  const id = c.req.param('id') as PermissionsConfigId
  const config = await services.permissionsConfig.getById(projectId, id)
  if (!config) return c.json({ error: 'Not found' }, 404)
  return c.json(config)
})

// POST /api/projects/:projectId/permissions-config
app.post('/api/projects/:projectId/permissions-config', async (c) => {
  const projectId = c.req.param('projectId') as ProjectId
  const body = await c.req.json()
  const config = await services.permissionsConfig.create(projectId, body)
  return c.json(config, 201)
})

// PUT /api/projects/:projectId/permissions-config/:id
app.put('/api/projects/:projectId/permissions-config/:id', async (c) => {
  const projectId = c.req.param('projectId') as ProjectId
  const id = c.req.param('id') as PermissionsConfigId
  const body = await c.req.json()
  const config = await services.permissionsConfig.update(projectId, id, body)
  return c.json(config)
})

// DELETE /api/projects/:projectId/permissions-config/:id
app.delete('/api/projects/:projectId/permissions-config/:id', async (c) => {
  const projectId = c.req.param('projectId') as ProjectId
  const id = c.req.param('id') as PermissionsConfigId
  await services.permissionsConfig.delete(projectId, id)
  return c.json({ success: true })
})

// POST /api/projects/:projectId/permissions-config/:id/duplicate
app.post('/api/projects/:projectId/permissions-config/:id/duplicate', async (c) => {
  const projectId = c.req.param('projectId') as ProjectId
  const id = c.req.param('id') as PermissionsConfigId
  const { title } = await c.req.json()
  const config = await services.permissionsConfig.duplicate(projectId, id, title)
  return c.json(config, 201)
})

export default app
```

## 9. Summary of Key Changes

| Feature | Before | After |
|---------|--------|-------|
| **Naming** | "Bash Tool" + "MCP Safety" | Unified "Permissions" |
| **Scope** | Global + Project (2 layers) | Project-only (1 layer) |
| **Config Storage** | Inline in settings.json + project.json | Separate files in permissions-config/ |
| **Presets** | 4 named presets (balanced, strict, etc.) | Single default (duplicatable) |
| **Python Toggle** | `enablePython` boolean → injects into deniedCommands | User manually adds to deniedCommands |
| **Git Config** | `allowGitConfig` boolean | Removed (use denyWrite if needed) |
| **MCP** | Separate config (mcpSafety) | Integrated via `applyToMCP` field (UI/config only, runtime deferred) |
| **Windows** | Runtime check during execution | Resolution-time platform check |
| **Template Vars** | None | `{{workspaceDir}}` for portability |
| **Reusability** | None (inline configs) | Named configs with duplicate/share |
| **UI Pages** | Settings → Safety, Project → Bash Tool + MCP | Settings → Permissions, Project → Permissions |

## 10. Validation Rules

### 10.1 Config Validation

- `title`: Required, min 1 char, max 100 chars
- `mode`: Must be one of 'restricted', 'sandbox', 'unrestricted'
- `allowWrite`: Array of glob patterns (validated by glob library)
- `denyRead`: Array of glob patterns
- `denyWrite`: Array of glob patterns
- `allowedDomains`: Array of domain patterns (supports `*` wildcard)
- `deniedDomains`: Array of domain patterns
- `deniedCommands`: Array of command patterns (supports `*` wildcard)
- `applyToMCP`: Boolean

### 10.2 Business Rules

- System default (id='default') cannot be modified or deleted
- Cannot delete a config if it's referenced by any project
- Duplicate creates new config with new ID, timestamp, and title
- Template variables in allowWrite are replaced during resolution (not stored)

## 11. Testing Strategy

### 11.1 Unit Tests

**Shared:**
- `packages/shared/src/types/permissions.test.ts` — Type guards, isSandboxRuntimeSupported

**Server:**
- `packages/server/src/storage/permissions-config.test.ts` — CRUD operations, default config behavior
- `packages/server/src/agent/resolve-permissions.test.ts` — Template replacement, Windows platform handling
- `packages/server/src/migrations/migrate-permissions.test.ts` — Migration logic for all preset types

**UI:**
- `packages/ui/src/services/mock/MockPermissionsConfigService.test.ts` — Mock service
- `packages/ui/src/components/permissions/PermissionModeSelector.test.tsx` — Mode selector UI

### 11.2 Integration Tests

- E2E test: Create project → default config applied → edit config → duplicate → delete
- E2E test: Windows platform detection → only deniedCommands visible
- E2E test: Migration from old bashTool config → new permissions config
- E2E test: Toggle applyToMCP field → verify persistence (NOTE: actual MCP wrapping not tested in this phase)

### 11.3 Smoke Tests

```bash
# After implementation:
pnpm dev
# 1. Create new project → verify default permissions config
# 2. Project Settings → Permissions → verify mode selector
# 3. Create custom config → verify save/load
# 4. Duplicate config → verify new config created
# 5. Delete config → verify removed
```

## 12. MCP Sandbox Runtime Implementation (Future Work)

### 12.1 Overview (Requirements 32-36)

**Scope of THIS refactor:**
- ✅ Add `applyToMCP` field to PermissionsConfig (UI + storage)
- ✅ Persist the toggle state in permissions config files
- ✅ Display the toggle in Permissions UI (hidden on Windows)
- ❌ **NOT included:** Actual MCP command wrapping with `srt`

**Deferred to future implementation:**
- MCP server command wrapping with sandbox runtime (`srt`)
- `.mcp.json` config modification logic
- MCP process spawning with sandboxed commands

### 12.2 Technical Mechanism (For Future Reference)

When `applyToMCP: true`, the MCP server command should be wrapped with `srt`:

**Original command in `.mcp.json`:**
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem"]
    }
  }
}
```

**After wrapping (future implementation):**
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "srt",
      "args": [
        "npx",
        "-y",
        "@modelcontextprotocol/server-filesystem"
      ]
    }
  }
}
```

### 12.3 Implementation Notes (Future Task)

**Location:** `packages/server/src/mcp/spawn-mcp-server.ts` (or similar)

**Logic:**
1. Load project permissions config
2. Check `config.applyToMCP` field
3. If true and mode='sandbox' and platform!='win32':
   - Prepend `srt` to the command
   - Merge original command + args into new args array
4. Spawn MCP server process with modified command

**Example pseudocode:**
```typescript
function wrapMCPCommandIfNeeded(
  command: string,
  args: string[],
  permissionsConfig: ResolvedPermissionsConfig,
  platform: SupportedPlatform
): { command: string; args: string[] } {
  // Skip if MCP sandboxing disabled
  if (!permissionsConfig.config.applyToMCP) {
    return { command, args }
  }

  // Skip if not sandbox mode
  if (permissionsConfig.mode !== 'sandbox') {
    return { command, args }
  }

  // Skip on Windows (no sandbox runtime)
  if (platform === 'win32') {
    return { command, args }
  }

  // Wrap with srt
  return {
    command: 'srt',
    args: [command, ...args],
  }
}
```

### 12.4 Previous Implementation (Marked as Incorrect)

Per requirement 35: "之前可能存在的 MCP 沙箱实现是错误的，需要在后续按此方案重新实现"

Any existing MCP sandbox implementation should be reviewed and replaced with the `srt` wrapping approach.

### 12.5 Testing Strategy (Future)

**Unit tests:**
- Test command wrapping logic with various inputs
- Test platform detection (Windows skip)
- Test applyToMCP toggle behavior

**Integration tests:**
- E2E: Enable applyToMCP → spawn MCP server → verify command is wrapped with `srt`
- E2E: Disable applyToMCP → spawn MCP server → verify original command unchanged
- E2E: Windows platform → verify no wrapping even when applyToMCP=true

**Validation:**
- Verify `srt` binary is available on the system
- Verify sandbox runtime is initialized before MCP spawning
- Verify MCP server can communicate with agent under sandbox

---

## 13. Open Questions

1. **Migration rollback:** Should we keep old configs after migration for rollback?
   - **Recommendation:** Keep for 1 version, delete in next major version

2. **Shared configs across projects:** Should we support exporting/importing configs?
   - **Recommendation:** Phase 2 feature (export as JSON, import via UI)

3. **Config templates:** Should we provide more than just "default"?
   - **Recommendation:** Start with single default, add common templates based on user feedback

4. **Validation UI:** Should we validate glob patterns in real-time?
   - **Recommendation:** Yes, show error message if pattern is invalid

5. **deniedDomains precedence:** Should it fully block allowedDomains='*'?
   - **Recommendation:** Yes, deniedDomains takes precedence (blacklist over whitelist)

## End of Architecture Document

**Version:** 1.1
**Author:** Architect (Team: sandbox-permissions-refactor)
**Date:** 2026-02-15
**Status:** Ready for Implementation

**Changelog:**
- v1.0 (2026-02-15): Initial architecture design (requirements 1-31)
- v1.1 (2026-02-15): Added MCP sandbox runtime details (requirements 32-36), clarified scope
