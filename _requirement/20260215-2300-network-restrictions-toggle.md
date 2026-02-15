# Network Restrictions Toggle & MCP Error Improvement

## Background

`@anthropic-ai/sandbox-runtime` uses a proxy-based network filtering system. When `allowedDomains` is defined (even as `["*"]`), all traffic is routed through a proxy that filters by domain. The `*` wildcard is NOT supported as a catch-all — it's treated as a literal string and never matches any hostname, effectively blocking all network access.

When `allowedDomains` is `undefined` (not passed), the sandbox runtime skips network proxy entirely → `(allow network*)` in the macOS sandbox profile → all traffic allowed.

## Requirements

### 1. Network Restrictions Toggle

- Rename section from "NETWORK PERMISSIONS" to "Network Restrictions" (or similar appropriate term)
- Add a toggle switch: OFF (default) = no restrictions, ON = restrictions enabled
- Add descriptive text **next to the "Network Restrictions" title** explaining:
  - OFF: all network traffic is allowed (default)
  - ON: only configured domains are accessible
- When OFF: collapse/hide the allowedDomains and deniedDomains configuration fields
- When ON: expand and show them

### 2. Domain Format Hints & Validation

- In the allowedDomains input area, always show small helper text explaining valid formats:
  - Exact domain: `example.com`
  - Wildcard subdomain: `*.example.com` (requires 2+ parts after `*.`)
- When user inputs invalid patterns (`*`, `*.com`, etc.), show inline warning
- Validation rules (from sandbox-runtime `sandbox-config.js`):
  - No protocols, paths, or ports in patterns
  - `*.` prefix allowed only with 2+ domain parts after it (e.g., `*.example.com` OK, `*.com` NOT OK)
  - Bare `*` is NOT allowed
  - Must contain at least one dot (except `localhost`)

### 3. Config Passing Fix

- When toggle is OFF → do NOT pass `allowedDomains` to sandbox runtime config → achieves true "all allowed"
- When toggle is ON → pass the user-configured domain lists normally
- Modify `sandboxConfigToRuntimeConfig()` in `sandbox-pool.ts`
- Also update `permissionsToSandboxConfig()` in `mcp-pool.ts`

### 4. MCP Stderr Capture

- `@ai-sdk/mcp`'s `StdioMCPTransport` accepts a `stderr` option (can be a `Stream`)
- Pass a `PassThrough` stream to capture stderr from MCP child processes
- When MCP connection fails, include captured stderr in the error message
- Affects `buildTransport()`, `testConnection()`, `doConnect()` in `mcp-pool.ts`

### 5. No Data Migration

- Do NOT auto-convert existing `allowedDomains: ['*']` to toggle=off
- Existing configs keep their values; the toggle state is derived from a new field

## Key Files

- `packages/ui/src/components/settings/PermissionsSettings.tsx` — UI toggle + validation
- `packages/shared/src/types/permissions.ts` — PermissionsConfig type (may need new field for toggle)
- `packages/server/src/agent/sandbox-pool.ts` — `sandboxConfigToRuntimeConfig()`
- `packages/server/src/agent/mcp-pool.ts` — `permissionsToSandboxConfig()`, `buildTransport()`, `testConnection()`, `doConnect()`
- `node_modules/@anthropic-ai/sandbox-runtime/dist/sandbox/sandbox-config.js` — validation reference (read-only)
