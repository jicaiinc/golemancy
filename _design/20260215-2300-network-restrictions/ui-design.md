# Network Restrictions Toggle — UI & Data Model Design

## 1. New Field in `PermissionsConfig`

### Field Name: `networkRestrictionsEnabled`

```typescript
// In packages/shared/src/types/permissions.ts → PermissionsConfig
/**
 * Whether network domain restrictions are enforced.
 *
 * - false (default): All network traffic allowed. The sandbox runtime
 *   skips network proxy entirely (allowedDomains is NOT passed).
 * - true: Only domains listed in allowedDomains/deniedDomains are
 *   accessible. Traffic is routed through the sandbox proxy.
 */
networkRestrictionsEnabled: boolean
```

**Default value**: `false` (in `DEFAULT_PERMISSIONS_CONFIG.config`)

**Rationale**: Named `networkRestrictionsEnabled` to match the section title "Network Restrictions" and clearly convey that this is a boolean toggle controlling whether restrictions are active. Alternative considered: `enableNetworkRestrictions` — rejected because `networkRestrictionsEnabled` reads more naturally as a state property (consistent with how the value is consumed: `if (config.networkRestrictionsEnabled)`).

## 2. Section Title & Descriptive Text

### Section Title

Replace:
```
NETWORK PERMISSIONS
```

With:
```
NETWORK RESTRICTIONS
```

### Descriptive Text (next to toggle)

The section header row contains: title on the left, toggle on the right, with descriptive text between them.

Layout:
```
┌─────────────────────────────────────────────────────────────────┐
│ NETWORK RESTRICTIONS                                            │
│                                                                 │
│ ┌──────────┐  Off — all network traffic is allowed              │
│ │ [TOGGLE] │  On — only configured domains are accessible       │
│ └──────────┘                                                    │
│                                                                 │
│ (when ON, domain config fields appear below)                    │
└─────────────────────────────────────────────────────────────────┘
```

Actual implementation layout (matching existing patterns):

```tsx
<PixelCard>
  <div className="font-pixel text-[9px] text-text-dim mb-3">NETWORK RESTRICTIONS</div>
  <div className="flex items-center gap-2">
    <PixelToggle
      checked={config.networkRestrictionsEnabled}
      onChange={checked => onUpdate({ networkRestrictionsEnabled: checked })}
      label="Enable"
    />
    <span className="font-mono text-[11px] text-text-dim">
      {config.networkRestrictionsEnabled
        ? 'Only configured domains are accessible'
        : 'All network traffic is allowed'}
    </span>
  </div>

  {/* Collapsed when toggle is OFF, expanded when ON */}
  {config.networkRestrictionsEnabled && (
    <div className="flex flex-col gap-4 mt-4">
      <PathListEditor label="ALLOWED DOMAINS" ... />
      <PathListEditor label="DENIED DOMAINS" ... />
    </div>
  )}
</PixelCard>
```

**Key design decisions**:
- Toggle label is just "Enable" (concise, since the section title provides context)
- Descriptive text changes dynamically based on toggle state (same pattern as `applyToMCP` toggle)
- Domain config fields are conditionally rendered (not just visually hidden) — matches existing patterns in the codebase where `mode === 'sandbox'` gates entire sections

## 3. Toggle Collapse/Expand Behavior

When **OFF** (default):
- The `PixelCard` shows only the section title + toggle + "All network traffic is allowed"
- `allowedDomains` and `deniedDomains` PathListEditors are not rendered
- The existing values in `config.allowedDomains` / `config.deniedDomains` are preserved (NOT cleared)

When **ON**:
- Domain config fields appear below the toggle with `mt-4` spacing
- User can configure `allowedDomains` and `deniedDomains` as before
- Updated helper text for `allowedDomains` (see section 4)

**Animation**: No animation needed — simple conditional render matches the rest of the codebase (the `mode === 'sandbox'` section toggle doesn't animate either).

## 4. Domain Format Helper Text

### allowedDomains helper text

Replace:
```
Network domains agents can access. Default: all allowed.
```

With:
```
Domains agents can access. Exact: example.com — Wildcard: *.example.com (2+ parts after *.)
```

This is always visible within the PathListEditor input area (using the existing `helperText` prop).

### deniedDomains helper text

Keep existing:
```
Domains to block network access.
```

But append format hint:
```
Domains to block. Same format as allowed domains.
```

## 5. Inline Validation Warning Messages

### Where validation runs

Validation occurs in the `PathListEditor` `handleAdd` function (or a wrapper) — when the user presses Enter or clicks "Add". Invalid patterns are **still added** (to avoid data loss) but a warning is shown.

**Design decision**: We do NOT block adding invalid patterns. The user may be mid-edit or have a pattern that looks invalid but is intentional. Instead, we show inline warnings on individual chips.

### Validation Rules (from sandbox-runtime `sandbox-config.js`)

```typescript
function validateDomainPattern(value: string): string | null {
  // Returns null if valid, or an error message string if invalid

  // Reject protocols, paths, ports
  if (value.includes('://') || value.includes('/') || value.includes(':'))
    return 'Remove protocol, path, or port (just the domain)'

  // Allow localhost
  if (value === 'localhost') return null

  // Wildcard domains
  if (value.startsWith('*.')) {
    const domain = value.slice(2)
    if (!domain.includes('.') || domain.startsWith('.') || domain.endsWith('.'))
      return 'Wildcard needs 2+ parts after *. (e.g., *.example.com)'
    const parts = domain.split('.')
    if (parts.length < 2 || parts.some(p => p.length === 0))
      return 'Wildcard needs 2+ parts after *. (e.g., *.example.com)'
    return null
  }

  // Any other wildcard usage
  if (value.includes('*'))
    return 'Only *.domain.com wildcard format is supported'

  // Regular domains — must have at least one dot
  if (!value.includes('.') || value.startsWith('.') || value.endsWith('.'))
    return 'Must be a valid domain with at least one dot (e.g., example.com)'

  return null
}
```

### Warning Display

Two options considered:

**Option A (Recommended)**: Chip-level warning — invalid domain chips get a different style:
```
┌───────────────────────────────────────────┐
│ ALLOWED DOMAINS                           │
│ Domains agents can access...              │
│                                           │
│ [api.github.com ×] [*.com ⚠ ×]          │
│                                           │
│ ⚠ *.com: Wildcard needs 2+ parts after   │
│   *. (e.g., *.example.com)               │
│                                           │
│ [________________________] [Add]          │
└───────────────────────────────────────────┘
```

Invalid chips: `border-accent-amber` + `text-accent-amber` prefix icon `⚠`
Warning messages: listed below the chip area in `text-[11px] text-accent-amber`

**Option B**: Input-level validation — show warning only at input time, before adding.
Rejected because: existing patterns loaded from config files wouldn't get validated.

### Implementation Approach

Add an optional `validateItem` prop to `PathListEditor`:

```typescript
interface PathListEditorProps {
  // ... existing props
  /** Optional validation function. Returns error string or null if valid. */
  validateItem?: (value: string) => string | null
}
```

Inside `PathListEditor`:
- Run `validateItem` on each item in the `items` array
- Render invalid chips with warning styling
- Show aggregated warning messages below the chip list
- Also show validation on the input field in real-time (as user types)

## 6. Config Flow: Toggle OFF → No `allowedDomains` Passed

### Key insight from requirement

When `allowedDomains` is passed to sandbox-runtime (even as `["*"]`), traffic is routed through a proxy that does domain filtering. The `*` wildcard does NOT work as a catch-all — it's treated as a literal string and blocks everything.

When `allowedDomains` is `undefined` (not passed), the sandbox runtime skips the network proxy entirely → all traffic is allowed.

### Changes needed in two functions

#### A. `sandboxConfigToRuntimeConfig()` in `sandbox-pool.ts`

Current code:
```typescript
network: {
  allowedDomains: config.network.allowedDomains,
  deniedDomains: [],
},
```

The `SandboxConfig.network` type needs to support `allowedDomains` being `undefined`. When `networkRestrictionsEnabled` is `false`, `allowedDomains` should not be passed → the network object should be `{ deniedDomains: [] }` without `allowedDomains`.

New logic:
```typescript
network: {
  ...(config.network.allowedDomains !== undefined && {
    allowedDomains: config.network.allowedDomains,
  }),
  deniedDomains: [],
},
```

#### B. `permissionsToSandboxConfig()` in `mcp-pool.ts` AND `builtin-tools.ts`

Both have identical functions. When `networkRestrictionsEnabled` is `false`, the bridge should set `network.allowedDomains` to `undefined`:

```typescript
function permissionsToSandboxConfig(pc: PermissionsConfig): SandboxConfig {
  return {
    filesystem: {
      allowWrite: pc.allowWrite,
      denyRead: pc.denyRead,
      denyWrite: pc.denyWrite,
      allowGitConfig: false,
    },
    network: {
      allowedDomains: pc.networkRestrictionsEnabled ? pc.allowedDomains : undefined,
    },
    enablePython: true,
    deniedCommands: pc.deniedCommands,
  }
}
```

#### C. Type change in `NetworkConfig`

`NetworkConfig.allowedDomains` (in `bash-tool-config.ts`) needs to become optional:
```typescript
interface NetworkConfig {
  allowedDomains?: string[]  // undefined = all allowed (no proxy)
}
```

This ensures the runtime config mapping can correctly omit the field.

## 7. Default Config Update

In `DEFAULT_PERMISSIONS_CONFIG`:
```typescript
config: {
  allowWrite: ['{{workspaceDir}}'],
  denyRead: [...COMMON_DENY_READ, ...UNIX_DENY_READ],
  denyWrite: [],
  networkRestrictionsEnabled: false,  // NEW — default: no restrictions
  allowedDomains: ['*'],              // Keep existing (but ignored when toggle off)
  deniedDomains: [],
  deniedCommands: UNIX_DENIED_COMMANDS,
  applyToMCP: true,
},
```

**Note on existing data**: The requirement says "Do NOT auto-convert existing `allowedDomains: ['*']`". Since `networkRestrictionsEnabled` defaults to `false` in the type, existing configs without this field will correctly default to "no restrictions" via `config.networkRestrictionsEnabled ?? false`. No migration needed.

## 8. Summary of Changes

| File | Change |
|------|--------|
| `packages/shared/src/types/permissions.ts` | Add `networkRestrictionsEnabled: boolean` to `PermissionsConfig` |
| `packages/shared/src/types/permissions.ts` | Update `DEFAULT_PERMISSIONS_CONFIG` with `networkRestrictionsEnabled: false` |
| `packages/shared/src/types/bash-tool-config.ts` | Make `NetworkConfig.allowedDomains` optional (`string[] \| undefined`) |
| `packages/ui/src/components/settings/PermissionsSettings.tsx` | Replace "NETWORK PERMISSIONS" section with new toggle + collapse UI |
| `packages/ui/src/components/settings/PathListEditor.tsx` | Add optional `validateItem` prop for domain validation |
| `packages/server/src/agent/sandbox-pool.ts` | Conditionally omit `allowedDomains` in `sandboxConfigToRuntimeConfig()` |
| `packages/server/src/agent/mcp-pool.ts` | Use `networkRestrictionsEnabled` in `permissionsToSandboxConfig()` |
| `packages/server/src/agent/builtin-tools.ts` | Same change in its `permissionsToSandboxConfig()` |
