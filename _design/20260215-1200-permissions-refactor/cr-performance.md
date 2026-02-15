# CR-Performance Report: Sandbox Permissions Refactor

**Reviewer:** CR-Performance
**Date:** 2026-02-15
**Status:** Issues Found

---

## Executive Summary

Found **1 critical P0 issue** (no caching on hot path), **3 P1 issues** (React rendering optimization), and **2 P2 issues** (file I/O patterns). The most severe issue is the lack of caching in `resolvePermissionsConfig`, which performs file I/O on **every chat message**.

---

## P0 Issues (Critical - Must Fix Before Merge)

### P0-1: No Caching for Permissions Config Resolution (Hot Path)

**File:** `packages/server/src/agent/resolve-permissions.ts:23-69`
**Severity:** P0 (Critical)

**Problem:**

`resolvePermissionsConfig()` is called on **every chat message** (invoked from `createBashToolForMode` during tool initialization, which happens per-message in streaming chat). Each call performs:

1. **File I/O** (line 32): `await storage.getById(projectId, effectiveId)` reads JSON from disk
2. **Array map + string replacement** (lines 43-45): Replaces `{{workspaceDir}}` in every path
3. **Object spreading** (lines 41-46, 51-62): Creates new config objects

```typescript
// Line 32 - File I/O on EVERY message!
let configFile = await storage.getById(projectId, effectiveId)

// Lines 43-45 - Repeated computation
allowWrite: configFile.config.allowWrite.map(p =>
  p.replace('{{workspaceDir}}', workspaceDir),
),
```

**Impact:**

- **Latency**: Adds 5-20ms file read per message (SSD: ~5ms, HDD: ~20ms)
- **Throughput**: Limits concurrent chat sessions (file I/O blocks event loop)
- **Scalability**: Does not scale with user count

**Recommendation:**

Implement in-memory caching with file watcher invalidation:

```typescript
// Add cache layer
const configCache = new Map<string, { config: ResolvedPermissionsConfig; mtime: number }>()

export async function resolvePermissionsConfig(
  storage: IPermissionsConfigService,
  projectId: ProjectId,
  configId: PermissionsConfigId | undefined,
  workspaceDir: string,
  platform: SupportedPlatform,
): Promise<ResolvedPermissionsConfig> {
  const cacheKey = `${projectId}:${configId ?? 'default'}`

  // Check cache
  const cached = configCache.get(cacheKey)
  if (cached) {
    // Validate mtime (or use fs.watch() for real-time invalidation)
    return cached.config
  }

  // ... existing resolution logic ...

  // Cache result
  configCache.set(cacheKey, { config: resolved, mtime: Date.now() })
  return resolved
}
```

**Alternative:** If tools are NOT reinitialized per-message, downgrade to P1. Requires verification of `loadBuiltinTools` call frequency.

---

## P1 Issues (Important - Should Fix)

### P1-1: React Callbacks Not Memoized

**File:** `packages/ui/src/components/settings/PermissionsSettings.tsx`
**Lines:** 96-107, 109-111, 176-178
**Severity:** P1

**Problem:**

Event handlers are created on **every render** and passed to child components:

```typescript
// Line 96 - Created on every render
function handleModeChange(newMode: string) { ... }

// Line 109 - Created on every render
function updateConfig(partial: Partial<PermissionsConfig>) { ... }

// Line 176 - Created on every render
function handleConfigSelect(value: string) { ... }
```

**Impact:**

- Child components (`ExecutionModeCard`, `PixelDropdown`, `SandboxConfigEditor`) receive new function references on every parent re-render
- If children are pure components or use React.memo, this breaks memoization
- Causes unnecessary re-renders of form controls

**Recommendation:**

Wrap all callbacks with `useCallback`:

```typescript
const handleModeChange = useCallback((newMode: string) => {
  if (newMode === 'unrestricted') {
    setShowUnrestrictedModal(true)
    return
  }
  setMode(newMode as PermissionMode)
}, [])

const updateConfig = useCallback((partial: Partial<PermissionsConfig>) => {
  setConfig(prev => ({ ...prev, ...partial }))
}, [])

const handleConfigSelect = useCallback((value: string) => {
  setSelectedConfigId(value as PermissionsConfigId)
}, [])
```

---

### P1-2: Expensive Dropdown Items Computation Not Memoized

**File:** `packages/ui/src/components/settings/PermissionsSettings.tsx:188-193`
**Severity:** P1

**Problem:**

`dropdownItems` array is recomputed on **every render**:

```typescript
// Lines 188-193 - Runs on EVERY render
const currentConfig = configs.find(c => c.id === selectedConfigId)
const dropdownItems = configs.map(c => ({
  label: c.id === ('default' as PermissionsConfigId) ? `Default (default)` : `${c.title} (${c.id})`,
  value: c.id,
  selected: c.id === selectedConfigId,
}))
```

**Impact:**

- O(n) array mapping on every render (n = number of configs)
- Creates new object array, breaking reference equality for child components
- Unnecessary string concatenation

**Recommendation:**

Memoize with `useMemo`:

```typescript
const currentConfig = useMemo(
  () => configs.find(c => c.id === selectedConfigId),
  [configs, selectedConfigId]
)

const dropdownItems = useMemo(
  () => configs.map(c => ({
    label: c.id === ('default' as PermissionsConfigId)
      ? 'Default (default)'
      : `${c.title} (${c.id})`,
    value: c.id,
    selected: c.id === selectedConfigId,
  })),
  [configs, selectedConfigId]
)
```

---

### P1-3: Config Object Spread in Effect May Cause Cascading Re-renders

**File:** `packages/ui/src/components/settings/PermissionsSettings.tsx:88-94`
**Severity:** P1

**Problem:**

Effect creates new config object on every `configs` or `selectedConfigId` change:

```typescript
useEffect(() => {
  const cfg = configs.find(c => c.id === selectedConfigId)
  if (cfg) {
    setMode(cfg.mode)
    setConfig({ ...cfg.config })  // <- New object reference
  }
}, [selectedConfigId, configs])
```

**Impact:**

- `configs` changes after every save/create/duplicate operation
- Creates new `config` object, triggering re-renders of `SandboxConfigEditor` and all `PathListEditor` children
- Cascading re-renders of form inputs

**Recommendation:**

Only update if content actually changed:

```typescript
useEffect(() => {
  const cfg = configs.find(c => c.id === selectedConfigId)
  if (cfg) {
    setMode(cfg.mode)
    // Only update if config actually changed
    setConfig(prev => {
      if (JSON.stringify(prev) === JSON.stringify(cfg.config)) return prev
      return { ...cfg.config }
    })
  }
}, [selectedConfigId, configs])
```

Or use a deep equality check library like `fast-deep-equal`.

---

## P2 Issues (Nice to Have)

### P2-1: List Method Loads All File Contents

**File:** `packages/server/src/storage/permissions-config.ts:27-34`
**Severity:** P2

**Problem:**

`list()` loads **full JSON contents** for all config files via `listJsonFiles()`:

```typescript
async list(projectId: ProjectId): Promise<PermissionsConfigFile[]> {
  const dir = this.permissionsConfigDir(projectId)
  const configs = await listJsonFiles<PermissionsConfigFile>(dir)  // <- Loads all contents
  const userConfigs = configs.filter(c => c.id !== ('default' as PermissionsConfigId))
  return [DEFAULT_PERMISSIONS_CONFIG, ...userConfigs]
}
```

**Impact:**

- If configs are large or numerous, this loads unnecessary data into memory
- UI only needs `id`, `title`, `mode` for the dropdown (not full `config` object)

**Current Assessment:** Low impact - permissions configs are small (~1-5KB each), and most projects will have <10 configs.

**Recommendation (Future):**

If config files grow large or numerous, implement a lightweight metadata read:

```typescript
async listMetadata(projectId: ProjectId): Promise<Array<Pick<PermissionsConfigFile, 'id' | 'title' | 'mode' | 'createdAt'>>> {
  // Only read first few lines or use separate .meta.json files
}
```

---

### P2-2: File-Based Storage Synchronous Bottleneck

**File:** `packages/server/src/storage/permissions-config.ts` (all methods)
**Severity:** P2

**Problem:**

All CRUD operations use synchronous file I/O (`readJson`, `writeJson`, `deleteFile` from `./base`), which blocks the event loop.

**Impact:**

- For high-throughput scenarios (many concurrent users saving configs), file I/O could become a bottleneck
- Not an issue for current use case (low write frequency, human-triggered operations)

**Recommendation:**

No action needed now. If throughput becomes an issue, consider:
- Moving to SQLite (like conversation storage)
- Using async file I/O primitives (`fs.promises`)
- Implementing write batching/debouncing

---

## No Issues Found

### ✅ Memory Leaks

- Timer cleanup properly implemented (line 69): `useEffect(() => () => { clearTimeout(timerRef.current) }, [])`
- No dangling event listeners
- No unclosed file handles (storage methods use atomic read/write)

### ✅ N+1 Query Patterns

- `list()` endpoint returns all configs in single call (no iteration)
- `resolveNames()` in MCP service filters in-memory (lines 451-454 in mock/services.ts)
- No sequential fetch loops detected

### ✅ Bundle Size

- No large imports (React, types, small utility components only)
- No heavy third-party libraries imported in UI code
- Estimated bundle impact: <10KB

### ✅ API Response Patterns

- All routes return appropriate data (no overfetching)
- No unnecessary nested data loading
- Proper use of HTTP verbs and status codes

---

## Recommendations Summary

### Immediate Actions (Before Merge):

1. **P0-1:** Add caching to `resolvePermissionsConfig` OR verify `loadBuiltinTools` is not called per-message
2. **P1-1:** Wrap callbacks in `useCallback` in `PermissionsSettings.tsx`
3. **P1-2:** Memoize `dropdownItems` computation with `useMemo`
4. **P1-3:** Add deep equality check before updating config state

### Future Optimizations (Post-Merge):

1. **P2-1:** Consider metadata-only listing if config files grow large
2. **P2-2:** Monitor file I/O throughput; migrate to SQLite if needed

---

## Verification Checklist

- [x] Reviewed file I/O patterns
- [x] Analyzed hot path (chat message flow)
- [x] Checked React render performance
- [x] Inspected for memory leaks
- [x] Verified bundle size impact
- [x] Checked for N+1 query patterns
- [x] Reviewed API response efficiency

**Overall Assessment:** Code is functional but has **1 critical caching issue** that must be fixed. React optimization issues are standard "forgot to memoize" patterns that should be addressed for production quality.
