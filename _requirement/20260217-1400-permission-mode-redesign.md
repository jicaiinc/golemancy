# Permission Mode Flow Redesign

## Date: 2026-02-17

## Problem

The current permission mode system has 5 core defects:
1. Silent degradation from sandbox → restricted in `builtin-tools.ts:94-96`
2. Dev mode missing `GOLEMANCY_RESOURCES_PATH` in `index.ts:40-43`
3. No mode validation when user selects sandbox in `PermissionsSettings.tsx`
4. StatusBar shows configured mode, not actual running mode
5. Error information from SandboxPool not surfaced to user

## Requirements

### Functional

1. **SandboxReadinessCheck service** — `packages/server/src/agent/sandbox-readiness.ts`, checks all sandbox dependencies (platform, sandbox-runtime, ripgrep, resources-path, workspace), returns `{ available, issues[] }`
2. **`/api/sandbox/readiness` API endpoint** — Expose readiness check in server routes, supports `?projectId=xxx`
3. **Eliminate silent degradation** — `builtin-tools.ts` sandbox failure throws `SandboxUnavailableError` instead of silently falling back, notifies caller via `onModeDegraded` callback
4. **`mode_degraded` event type** — Defined in shared agent events, carries requestedMode, actualMode, reason
5. **Dev mode auto-detect bundled runtime** — `apps/desktop/src/main/index.ts` auto-detects `apps/desktop/resources/runtime/` in non-packaged mode, sets `GOLEMANCY_RESOURCES_PATH`
6. **UI mode validation** — `PermissionsSettings.tsx` calls readiness API when user selects sandbox, shows modal with issues and fix suggestions when unavailable
7. **StatusBar shows actual mode** — When actual running mode differs from configured mode, StatusBar shows degradation warning

### Technical Constraints

8. `SandboxUnavailableError` must include `requestedMode` and `fallbackMode` properties
9. `loadBuiltinTools()` return value must include `actualMode` field
10. Degradation still uses restricted mode (not full block), but MUST notify user
11. Each readiness issue must include `component`, `message`, `fix?` (optional fix suggestion)

### Style/Interaction

12. Follow pixel art dark theme, use existing PixelModal, PixelButton, etc.
13. Degradation warning uses `text-accent-amber`
14. StatusBar degradation format: `Sandbox (degraded → Restricted)`

### Implementation Phases

15. Phase 1: readiness check + API endpoint (independent)
16. Phase 2: dev mode auto-detection (independent)
17. Phase 3: eliminate silent degradation + event passing (core change)
18. Phase 4: UI validation + StatusBar (frontend changes)
19. Phase 1 and Phase 2 can run in parallel; Phase 3 depends on Phase 1; Phase 4 depends on Phase 1+3

### Quality

20. All changes must pass `pnpm lint`
21. Existing tests must not break
22. Chinese for discussion, English for code
