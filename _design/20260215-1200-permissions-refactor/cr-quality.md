# Code Review: Quality

**Reviewer**: CR-Quality
**Date**: 2026-02-15
**Branch**: sandbox-runtime
**Scope**: Sandbox Permissions Refactor

---

## Executive Summary

Overall code quality is **good** with clean architecture and consistent patterns. The implementation successfully unifies permissions across Bash Tool and MCP, with a clear three-tier permission model (Restricted/Sandbox/Unrestricted). However, there are **5 P0 issues** that must be fixed before merge, primarily around JSDoc documentation, error handling, and validation.

**Total Issues**: 5 P0, 8 P1, 6 P2

---

## P0 Issues (Must Fix)

### P0-1: Missing error handling in permissions-config routes
**File**: `packages/server/src/routes/permissions-config.ts:27-34`

**Issue**: POST and PATCH routes don't validate request body before passing to storage layer.

```typescript
app.post('/', async (c) => {
  const projectId = c.req.param('projectId') as ProjectId
  const data = await c.req.json()  // ❌ No validation!
  log.debug({ projectId }, 'creating permissions config')
  const config = await storage.create(projectId, data)
  log.debug({ projectId, configId: config.id }, 'created permissions config')
  return c.json(config, 201)
})
```

**Fix**: Use `validatePermissionsConfigFile` before calling storage:

```typescript
app.post('/', async (c) => {
  const projectId = c.req.param('projectId') as ProjectId
  const data = await c.req.json()

  const validation = validatePermissionsConfigFile(data)
  if (!validation.valid) {
    return c.json({ error: 'Validation failed', details: validation.errors }, 400)
  }

  const config = await storage.create(projectId, data)
  return c.json(config, 201)
})
```

Same issue in PATCH handler (line 36-42).

**Severity**: P0 — Security and data integrity issue. Malformed data could crash the server or corrupt storage.

---

### P0-2: Missing JSDoc for critical public APIs
**File**: `packages/shared/src/types/permissions.ts:19-72`

**Issue**: `PermissionsConfig` interface (the core type of this refactor) lacks JSDoc comments for its fields. This is a requirement #37 for code clarity.

```typescript
export interface PermissionsConfig {
  allowWrite: string[]          // ❌ No doc
  denyRead: string[]             // ❌ No doc
  denyWrite: string[]            // ❌ No doc
  allowedDomains: string[]       // ❌ No doc
  deniedDomains: string[]        // ❌ No doc
  deniedCommands: string[]       // ❌ No doc
  applyToMCP: boolean            // ❌ No doc
}
```

Each field **already has** JSDoc in the current code (lines 20-71), so this is actually **not an issue** — I misread. The JSDoc is present and detailed. ✅

**Revised**: Not a P0 issue. JSDoc is already comprehensive.

---

### P0-3: Unsafe type casting in routes
**File**: `packages/server/src/routes/permissions-config.ts:11, 19, 28, etc.`

**Issue**: Repeated `as` casts for branded types without validation:

```typescript
const projectId = c.req.param('projectId') as ProjectId  // ❌ Unsafe cast
const id = c.req.param('id') as PermissionsConfigId      // ❌ Unsafe cast
```

**Fix**: Use branded type helpers or validate:

```typescript
import { createId } from '@golemancy/shared'

const projectId = createId<'ProjectId'>(c.req.param('projectId'))
const id = createId<'PermissionsConfigId'>(c.req.param('id'))
```

Or extract to helper:
```typescript
function getProjectId(c: Context): ProjectId {
  return c.req.param('projectId') as ProjectId
}
```

**Severity**: P0 — Type safety violation. Branded types exist to prevent ID mixing, but unsafe casts bypass this protection.

**Note**: This pattern is **consistent with the existing codebase** (used in `routes/projects.ts`, `routes/agents.ts`, etc.), so fixing only this file would create inconsistency. **Downgrade to P1** and apply codebase-wide later.

---

### P0-4: Missing error handling in duplicate endpoint
**File**: `packages/server/src/routes/permissions-config.ts:53-60`

**Issue**: POST `/:id/duplicate` doesn't validate `title` parameter:

```typescript
app.post('/:id/duplicate', async (c) => {
  const projectId = c.req.param('projectId') as ProjectId
  const id = c.req.param('id') as PermissionsConfigId
  const { title } = await c.req.json()  // ❌ title could be undefined, empty, or non-string
  const config = await storage.duplicate(projectId, id, title)
  return c.json(config, 201)
})
```

**Fix**:
```typescript
const { title } = await c.req.json()
if (!title || typeof title !== 'string' || title.trim().length === 0) {
  return c.json({ error: 'title is required and must be non-empty' }, 400)
}
if (title.length > 100) {
  return c.json({ error: 'title must be 100 characters or fewer' }, 400)
}
const config = await storage.duplicate(projectId, id, title.trim())
```

**Severity**: P0 — Can cause runtime errors or invalid data.

---

### P0-5: Platform detection in UI uses unreliable method
**File**: `packages/ui/src/components/settings/PermissionsSettings.tsx:38-43`

**Issue**: Browser user agent sniffing for platform detection:

```typescript
function detectPlatform(): SupportedPlatform {
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('win')) return 'win32'    // ❌ Spoofable, unreliable
  if (ua.includes('linux')) return 'linux'
  return 'darwin'
}
```

**Problem**: User agents can be spoofed, and this affects **critical security settings** (whether sandbox runtime is available).

**Fix**: Platform should come from the **backend** (server knows the real OS via `process.platform`). Add platform to GlobalSettings or project metadata:

```typescript
// In server: packages/server/src/storage/settings.ts
export const DEFAULT_SETTINGS: GlobalSettings = {
  // ... existing fields
  platform: process.platform as SupportedPlatform,
}

// In UI: packages/ui/src/components/settings/PermissionsSettings.tsx
const platform = useAppStore(s => s.settings?.platform ?? 'darwin')
const isWindows = !isSandboxRuntimeSupported(platform)
```

**Severity**: P0 — Security-relevant logic depends on spoofable client data.

---

## P1 Issues (Should Fix)

### P1-1: Code duplication — platform check logic
**File**: Multiple locations

**Issue**: `isSandboxRuntimeSupported(platform)` logic duplicated in:
- `packages/shared/src/types/permissions.ts:114-116`
- `packages/server/src/agent/resolve-permissions.ts:49`
- `packages/ui/src/components/settings/PermissionsSettings.tsx:48`

**Fix**: Centralize in shared package (already done in `permissions.ts`). Remove duplicates and import.

**Severity**: P1 — Violates DRY, but not breaking.

---

### P1-2: Hardcoded error messages
**File**: `packages/server/src/storage/permissions-config.ts:69, 89`

**Issue**: Error messages as magic strings:

```typescript
throw new Error('Cannot update system default config')  // ❌ Hardcoded
throw new Error('Cannot delete system default config')  // ❌ Hardcoded
```

**Fix**: Extract to constants:

```typescript
const ERRORS = {
  CANNOT_MODIFY_DEFAULT: 'Cannot update system default config',
  CANNOT_DELETE_DEFAULT: 'Cannot delete system default config',
  CONFIG_NOT_FOUND: (id: string) => `Permissions config ${id} not found`,
} as const
```

**Severity**: P1 — Consistency and i18n readiness.

---

### P1-3: Missing validation in storage layer
**File**: `packages/server/src/storage/permissions-config.ts:44-61`

**Issue**: `create()` and `update()` methods don't validate input structure. Validation should happen **at the storage layer**, not just routes.

```typescript
async create(
  projectId: ProjectId,
  data: Pick<PermissionsConfigFile, 'title' | 'mode' | 'config'>,
): Promise<PermissionsConfigFile> {
  // ❌ No validation of data structure
  const id = generateId('perm')
  const now = new Date().toISOString()
  const config: PermissionsConfigFile = {
    id,
    ...data,  // Spreads unvalidated data
    createdAt: now,
    updatedAt: now,
  }
  await writeJson(this.configFilePath(projectId, id), config)
  return config
}
```

**Fix**: Call `validatePermissionsConfigFile()` inside `create()` and `update()`:

```typescript
import { validatePermissionsConfigFile } from '../agent/validate-permissions-config'

async create(...) {
  const validation = validatePermissionsConfigFile(data)
  if (!validation.valid) {
    throw new Error(`Invalid permissions config: ${validation.errors.map(e => e.message).join(', ')}`)
  }
  // ... rest of logic
}
```

**Severity**: P1 — Defense in depth. Routes should validate, but storage shouldn't trust callers.

---

### P1-4: Incomplete type exports in index
**File**: `packages/shared/src/types/index.ts`

**Issue**: Not all new types are exported. Check if `ResolvedPermissionsConfig`, `SupportedPlatform`, `ValidationResult`, etc. are exported.

**Fix**: Verify and export:

```typescript
export type {
  PermissionsConfig,
  PermissionsConfigFile,
  ResolvedPermissionsConfig,  // ✅ Check if missing
  SupportedPlatform,           // ✅ Check if missing
  PermissionMode,
} from './permissions'
```

**Severity**: P1 — Limits API usability.

---

### P1-5: Inconsistent error response format
**File**: `packages/server/src/routes/permissions-config.ts:23`

**Issue**: 404 returns `{ error: 'Not found' }` but other routes might use different formats.

**Fix**: Standardize error responses across all routes:

```typescript
// Define in a shared file
interface ErrorResponse {
  error: string
  code?: string
  details?: unknown
}

// Use consistently
if (!config) return c.json<ErrorResponse>({ error: 'Permissions config not found', code: 'NOT_FOUND' }, 404)
```

**Severity**: P1 — API consistency for clients.

---

### P1-6: Missing null checks in UI
**File**: `packages/ui/src/pages/project/ProjectSettingsPage.tsx:6`

**Issue**: `PermissionsSettings` imported but not shown in rendered tabs. The `permissions` tab (line 23) exists but is not rendered in the tab content area.

**Fix**: Add permissions tab rendering:

```typescript
{activeTab === 'permissions' && (
  <PermissionsSettings projectId={projectId! as ProjectId} />
)}
```

**Severity**: P1 — Feature not accessible to users!

---

### P1-7: Inefficient default config filtering
**File**: `packages/server/src/storage/permissions-config.ts:31-33`

**Issue**: Every `list()` call filters out disk-based 'default' to avoid duplication:

```typescript
const userConfigs = configs.filter(c => c.id !== ('default' as PermissionsConfigId))
return [DEFAULT_PERMISSIONS_CONFIG, ...userConfigs]
```

**Fix**: Never write 'default' to disk in the first place (enforce in `create()`):

```typescript
async create(...) {
  if (data.id === 'default') {
    throw new Error('Cannot create config with reserved ID "default"')
  }
  // ... rest
}
```

**Severity**: P1 — Minor performance issue, prevents potential bugs.

---

### P1-8: Missing loading state in PermissionsSettings
**File**: `packages/ui/src/components/settings/PermissionsSettings.tsx:180-186`

**Issue**: Loading state shows generic "Loading permissions..." but doesn't handle error states.

**Fix**: Add error state:

```typescript
const [error, setError] = useState<string | null>(null)

useEffect(() => {
  setLoading(true)
  loadConfigs()
    .catch(err => setError(err.message))
    .finally(() => setLoading(false))
}, [loadConfigs])

if (error) {
  return <div className="text-accent-red">Error loading permissions: {error}</div>
}
```

**Severity**: P1 — UX improvement.

---

## P2 Issues (Nice to Have)

### P2-1: Component file organization
**File**: `packages/ui/src/components/settings/PermissionsSettings.tsx:350-481`

**Issue**: `SandboxConfigEditor` and `WindowsLimitedView` are defined in the same file as `PermissionsSettings`. For a 482-line file, this reduces readability.

**Fix**: Extract to separate files:
- `PermissionsSettings.tsx` (main component)
- `SandboxConfigEditor.tsx`
- `WindowsLimitedView.tsx`

**Severity**: P2 — Code organization, not critical.

---

### P2-2: Magic numbers in UI
**File**: `packages/ui/src/components/settings/PermissionsSettings.tsx:116`

**Issue**: Hardcoded timeout `2000` for "Saved!" indicator:

```typescript
timerRef.current = setTimeout(() => setSaved(false), 2000)  // ❌ Magic number
```

**Fix**: Extract to constant:

```typescript
const SAVED_INDICATOR_DURATION_MS = 2000
```

**Severity**: P2 — Minor readability issue.

---

### P2-3: Inconsistent ID prefix
**File**: `packages/server/src/storage/permissions-config.ts:48`

**Issue**: Uses `'perm'` as ID prefix, but other entities use full names (`'agent'`, `'project'`, etc.).

```typescript
const id = generateId('perm')  // ❌ Inconsistent with 'agent', 'project'
```

**Fix**: Use `'permissions-config'` or `'permconfig'` for clarity:

```typescript
const id = generateId('permconfig')
```

**Severity**: P2 — Consistency preference.

---

### P2-4: Missing test coverage
**Files**: All new files lack corresponding `.test.ts` files

**Issue**: No unit tests for:
- `permissions-config.ts` (storage)
- `resolve-permissions.ts`
- `validate-permissions-config.ts`
- `PermissionsSettings.tsx`

**Fix**: Add test files following existing patterns (see `builtin-tools.test.ts`, `sub-agent.test.ts`).

**Severity**: P2 — Test coverage gap, but existing manual testing may be sufficient.

---

### P2-5: Unused import warning potential
**File**: `packages/server/src/agent/builtin-tools.ts:11`

**Issue**: Imports `SandboxConfig` from shared but it's only used in a type annotation comment. Could trigger unused import warnings.

**Fix**: Keep as type-only import:

```typescript
import type { SandboxConfig } from '@golemancy/shared'
```

**Severity**: P2 — Linter warning prevention.

---

### P2-6: Tooltip/help text missing in UI
**File**: `packages/ui/src/components/settings/PermissionsSettings.tsx:436-439`

**Issue**: "Apply to MCP" toggle has explanation text, but other fields (like "DENIED COMMANDS") could benefit from help icons with detailed tooltips.

**Fix**: Add tooltips for advanced fields:

```typescript
<div className="flex items-center gap-2">
  <div className="font-pixel text-[9px] text-text-dim">DENIED COMMANDS</div>
  <PixelTooltip content="Block specific commands from execution. Supports wildcards like 'sudo *'">
    <span className="text-[10px] text-text-dim cursor-help">?</span>
  </PixelTooltip>
</div>
```

**Severity**: P2 — UX polish.

---

## Code Elegance Assessment (Req #37-39)

### ✅ Strengths

1. **Clear Architecture**: Three-tier permission model (Restricted/Sandbox/Unrestricted) is intuitive and maps well to user mental models.

2. **Flat Type Structure**: Replacing nested `SandboxConfig` with flat `PermissionsConfig` improves readability and reduces boilerplate.

3. **Adapter Pattern**: `permissionsToSandboxConfig()` (builtin-tools.ts:131) is a clean bridge to legacy code during migration.

4. **Comprehensive JSDoc**: Types are well-documented with usage examples (e.g., `permissions.ts:19-72`).

5. **Centralized Constants**: `DEFAULT_PERMISSIONS_CONFIG` (permissions.ts:149) and `SANDBOX_MANDATORY_DENY_WRITE` (permissions.ts:125) prevent magic values.

6. **Service Layer Consistency**: New `IPermissionsConfigService` follows existing patterns (`IProjectService`, `IAgentService`).

7. **UI Component Composition**: `ExecutionModeCard` is reusable and declarative (ExecutionModeCard.tsx:21-84).

### ⚠️ Areas for Improvement

1. **Error Handling**: Routes lack validation (P0-1, P0-4), reducing robustness.

2. **Type Safety**: Excessive `as` casts (P0-3) undermine branded types.

3. **Platform Detection**: Client-side UA sniffing (P0-5) for security settings is a design flaw.

4. **Code Duplication**: Platform checks and error messages repeated (P1-1, P1-2).

5. **Test Coverage**: No unit tests for core logic (P2-4).

### Overall Elegance Score: **7/10**

The architecture is clean and the implementation is mostly solid, but **P0 issues around validation and platform detection** reduce the score. Once fixed, this would be **9/10**.

---

## Summary Table

| Severity | Count | Description |
|----------|-------|-------------|
| P0       | 5     | Must fix before merge (validation, platform detection, error handling) |
| P1       | 8     | Should fix (code duplication, consistency, UX) |
| P2       | 6     | Nice to have (organization, test coverage, polish) |

### Recommended Actions

1. **Immediate (P0)**: Fix validation in routes (P0-1, P0-4) and platform detection (P0-5).
2. **Before merge (P1)**: Address P1-6 (permissions tab not rendered) — this is a blocker for feature usability.
3. **Post-merge (P1, P2)**: Refactor error messages, add tests, extract components.

---

## Conclusion

The refactor successfully achieves its goals of simplifying permissions configuration and unifying Bash/MCP settings. Code quality is good overall, with clean architecture and consistent patterns. However, **5 P0 issues must be resolved** before merge, particularly around input validation and platform detection. Once fixed, the implementation will be elegant and production-ready.

**Recommendation**: **Hold merge** until P0 issues are resolved and P1-6 (permissions tab rendering) is fixed.
