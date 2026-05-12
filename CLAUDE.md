# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Golemancy 0.2 rebuild baseline. A local-first AI workbench desktop client — Tauri shell, React + Vite UI, Node 24 sidecar, local Hono API, SQLite, MV3 browser extension. v0.1 source was wiped in `cfb2698` and is intentionally not migrated. Treat 0.2 as a clean rewrite; v0.1 install state is considered incompatible (see `_decisions/release-compatibility-considerations.zh.md`).

The authoritative product / architecture brief lives in `_docs/local-desktop-agent-product-architecture.zh.md` and `_docs/ui-designer-handoff.zh.md`; the technology boundaries are in `_decisions/desktop-technical-decisions.md` and `_decisions/cloud-technical-decisions.md` (cloud is out of scope for this repo). The dataDir layout — what lives under `~/.golemancy/`, per-type ownership (DB / Keychain / blob CAS / attachments / cache / logs), and backup/export boundaries — is in `_decisions/desktop-data-storage-layout.zh.md`. These dirs are gitignored (`/_*/`) — they are local planning docs, not commits.

## Tooling baseline

- Node 24 (`.nvmrc`), pnpm 10 (`packageManager` pinned). The desktop app must bundle a fixed Node 24 runtime in production so `node:sqlite` behavior is controlled.
- Rust + Cargo for Tauri shell.
- Turborepo orchestrates workspaces; pnpm workspaces own dependency resolution.
- TypeScript `NodeNext` + `verbatimModuleSyntax` everywhere (so imports must use the `.js` suffix even from `.ts` sources).
- `exactOptionalPropertyTypes` was deliberately **disabled** in `tsconfig.base.json` — it fights React props and `process.env`; do not turn it back on without replacing those patterns.

## Common commands

```sh
pnpm install                                       # 10 workspace projects; runs `wxt prepare` postinstall
pnpm typecheck                                     # turbo run typecheck across all packages
pnpm format                                        # prettier write
pnpm exec turbo run typecheck --filter='@golemancy/*'   # use this if turbo's default scope detection is wrong
pnpm exec turbo run <task> --filter='@golemancy/<pkg>'  # scope to one package

# sidecar (the local backend; UI calls it via 127.0.0.1)
# In normal dev you don't run this yourself — the Tauri supervisor spawns it.
# Use these only for sidecar-only iteration without a window:
pnpm --filter @golemancy/sidecar run dev           # tsx watch
pnpm --filter @golemancy/sidecar run start         # tsx, no watch
GOLEMANCY_HOST=127.0.0.1 GOLEMANCY_PORT=18901 pnpm --filter @golemancy/sidecar run start

# desktop (Tauri shell + React UI). tauri:dev runs Vite via beforeDevCommand
# AND spawns the sidecar through the Rust supervisor (apps/desktop/src-tauri/src/sidecar.rs).
pnpm --filter @golemancy/desktop run dev           # Vite only (no native window, no sidecar)
pnpm --filter @golemancy/desktop run tauri:dev     # Tauri opens window + supervises sidecar
pnpm --filter @golemancy/desktop run tauri:build   # packaged build; requires icons (see below)
pnpm --filter @golemancy/desktop run build         # frontend-only: tsc -b && vite build

# browser extension (MV3)
pnpm --filter @golemancy/extension run dev         # WXT chrome dev
pnpm --filter @golemancy/extension run build       # WXT build → .output/chrome-mv3
```

Sidecar runs via `tsx` (not `node --experimental-strip-types`) because NodeNext `.js`-suffix imports do not resolve under strip-types. Production should bundle to JS before shipping.

### Tauri icons

`tauri:dev` works without icons. `tauri:build` and packaged artifacts need them. Generate from a 1024×1024 source:

```sh
pnpm --filter @golemancy/desktop exec tauri icon apps/desktop/src-tauri/icons/source.png \
  --output apps/desktop/src-tauri/icons
```

Generated PNG/ICNS/ICO files are gitignored (see root `.gitignore`).

### Tests

Vitest is wired at the workspace root for the current unit/integration layer:

```sh
pnpm test
pnpm test:coverage
```

Current coverage is intentionally on existing product boundaries: protocol schemas/path builders, runtime event mapping and provider engine resolution, tool registry/approval bridge, SQLite repositories, sidecar auth/routes/browser bridge, desktop API/SSE helpers, i18n locale storage, and extension native-host wiring.

Playwright is wired for the auxiliary desktop web smoke path:

```sh
pnpm test:e2e
```

This is **not** the final desktop validation substitute. Real packaged-Tauri smoke tests still belong to M7 and must validate the Tauri shell, supervised Node 24 sidecar, SQLite, secure storage, SSE, shell/CLI execution, browser extension bridge, and native messaging registration.

## Architecture (the big picture)

```
Tauri Rust shell  ───spawns───►  Node 24 sidecar  ◄──HTTP(SSE/WS)──  React/Vite UI
       │                              │   │   │
       │ OS keychain bridge           │   │   └─► SQLite (node:sqlite + drizzle-orm/sqlite-proxy)
       │ (secret_get/set/delete)      │   └───► Tool Registry (shell / mcp / skills / cli-agent / browser)
       └─ writes handshake file ◄─────┘   └───► Provider Runtime (engine × transport)
         ~/.golemancy/native-host-runtime.json
                       ▲
                       │ reads URL + bearer token
                       │
              Browser extension (MV3 + WXT)
                       │ Native Messaging: com.golemancy.bridge
                       └─►  sidecar /browser/native/*
```

**Boundaries (load-bearing, do not blur)**

| Layer | Owns | Does NOT own |
|---|---|---|
| Tauri/Rust (`apps/desktop/src-tauri`) | Window lifecycle, sidecar process management, OS Secure Storage bridge, Native Messaging host registration | Agent run loop, provider SDK calls, business DB writes, MCP, tool execution |
| Node sidecar (`packages/sidecar`) | Local Hono API, agent runtime engines, tool registry, MCP client, CLI agent, SQLite read/write, streaming, browser bridge | UI rendering, Rust-level OS integration |
| React UI (`packages/ui` consumed by `apps/desktop`) | Rendering, local state, calling sidecar HTTP API | Direct DB access, direct provider SDK calls, secret storage |

UI **never** touches SQLite directly; Rust **never** writes business DB. Local SQLite is the canonical history — provider-side conversation state (e.g. OpenAI `previousResponseId`) is at best an optimization layer.

**Package graph**

- `packages/shared` — domain types: `RunEvent`, `ProviderTransport`, `ToolMode`, `ProviderConfig`, `ShellCommandResult`, branded ID types. Everything depends on this.
- `packages/protocol` — local-API contracts: path constants, zod schemas for `/health`, `/runs`, `/providers`, `/tools/*`, `/browser/*`, `/mcp/*`, `/settings`, plus the `NativeHostRuntime` handshake schema. Shared between sidecar, UI, and the extension.
- `packages/db` — Drizzle schema (16 tables) + repositories. Uses `drizzle-orm/sqlite-proxy` wrapping `node:sqlite` synchronously. **Do not switch to `better-sqlite3`** — that violates the "no native addon" decision.
- `packages/runtime` — `ProviderRegistry` + `RuntimeEngine` interface + engine stubs in `src/engines/` (`agents-sdk.ts`, `cli-agent.ts`). Engines are looked up by `provider.engine`; today they throw `EngineNotImplementedError`. The interface is what matters now, not the implementations.
- `packages/tools` — `ToolRegistry`, `ApprovalQueue`, plus interfaces for shell / cli-agent / MCP / skills / browser. `ApprovalQueue` is explicitly **a bridge**, not a scheduler: OpenAI Agents SDK owns tool scheduling/interruption/resume; the queue only translates SDK `needsApproval` pauses into the sidecar's HTTP surface (SSE `approval_required` event + POST `/tools/:id/approve`). Browser tools live here, **not** as an MCP server.
- `packages/sidecar` — Hono server + bearer auth middleware + route stubs + main entry that writes the handshake file and prints `GOLEMANCY_SIDECAR_READY {json}` so the Rust supervisor can parse URL/token.
- `packages/ui` — design-system components ported 1:1 from `_docs/design/golemancy-rebuild-v0-2/project/app.{jsx,css}`. Theme via `:root[data-theme]` CSS variables (light/dark). i18n is real (i18next + react-i18next, exposed through `@golemancy/i18n` and re-exported from `@golemancy/ui`): default locale `zh-CN`, single `ui` namespace, supported locales `['zh-CN', 'en']`. Call sites use `t(key, fallback, vars?)` (the third arg flows into i18next interpolation, e.g. `{{pid}}`). `useT()`, `useLocale()`, `setLocalePersisted('auto' | Locale)`, and `detectLocale()` cover the runtime API; `<I18nProvider>` no longer needs a `locale` prop — `detectLocale()` runs at module load and consults `localStorage['golemancy.locale']` then `navigator.language`. After adding keys, run `pnpm i18n:extract` (sweeps `packages/ui/src` and `apps/desktop/src` per `i18next-parser.config.ts`, writes `packages/i18n/src/locales/{en,zh-CN}/ui.json`). Dynamic-key call sites like `t(s.labelKey, s.fallback)` are invisible to the extractor — the config uses `keepRemoved: true` to avoid wiping them, so audit catalogs manually to retire truly stale keys.
- `apps/desktop` — Tauri config + Rust shell + Vite/React entry. Rust runs a real **sidecar supervisor** (`src-tauri/src/sidecar.rs`): spawns `pnpm --filter @golemancy/sidecar run start`, parses the `GOLEMANCY_SIDECAR_READY` line, exposes status via the `sidecar_runtime` tauri command and the `sidecar_state` event, restarts up to `MAX_RESTARTS` (3), and on `ExitRequested` sends SIGTERM with a 3s grace window before hard kill. The React side consumes this through `apps/desktop/src/lib/sidecar.ts` (`useSidecarStatus`, `fetchSidecarStatus`) and `lib/api-client.ts` (`createApiClient`, `isReady`). Production sidecar bundling (M7) will replace the `pnpm` spawn with a bundled Node 24 binary.
- `apps/extension` — WXT MV3 extension; background connects via `chrome.runtime.connectNative('com.golemancy.bridge')`.

## Provider / Runtime model

The product event model is **`RunEvent`** in `packages/shared/src/run-event.ts` — `run_started | text_delta | tool_request | tool_result | approval_required | usage | done | error`. Provider raw events must be **mapped to this** before they hit SQLite or the UI. Anything provider-specific lives in `providerData` / `raw_provider` metadata, not as first-class fields.

Providers are described by **two axes**, both declared in `packages/shared/src/provider.ts`:

- **`engine: RuntimeEngineKind`** — `'agents-sdk' | 'cli-agent'`. Which run-loop engine drives the provider. `agents-sdk` is the canonical Plan A path (OpenAI Agents SDK owns tool scheduling, `needsApproval`, interruption, resume). `cli-agent` covers Claude Code CLI / Codex CLI and similar — they bring their own auth/subscription state and need real process lifecycle management, not shell-tool plumbing.
- **`transport?: ProviderTransport`** — `'openai-style' | 'ai-sdk'`. Only meaningful for `engine: 'agents-sdk'`. `'openai-style'` (default for most providers) hits `/v1/chat/completions` via `baseURL` and stays the preferred path; `'ai-sdk'` is the escape hatch when AI SDK is more stable than direct compatibility. `transport` is `undefined` for `cli-agent`.

`ProviderRegistry.resolveEngine(provider)` keys off `provider.engine`. The DB schema (`packages/db/src/schema/providers.ts`) stores `engine` as NOT NULL and `transport` as nullable.

Capability tests (streaming / native tool calling / JSON schema / vision / max context / etc.) still feed `ToolMode` selection (`auto | native | prompted | disabled`) — that part of the model is unchanged from the architecture doc.

## Sidecar handshake

On startup `packages/sidecar/src/main.ts`:
1. Generates a random bearer token (`auth.ts`).
2. Binds Hono on `127.0.0.1:<port>` (port 0 picks an ephemeral one unless `GOLEMANCY_PORT` is set).
3. Writes `~/.golemancy/native-host-runtime.json` (`{ url, token, pid, version, writtenAt }`, mode 0o600) via atomic temp-then-rename. This is the file the **browser-launched Native Messaging host** reads to find the current sidecar.
4. Prints `GOLEMANCY_SIDECAR_READY {url, token}` on stdout. The **Tauri supervisor** parses this line to populate `SidecarStatus::Ready { url, token, pid }`, which the React side gets via the `sidecar_runtime` command + `sidecar_state` event. UI code should always read URL/token from `useSidecarStatus()` (or the equivalent imperative `fetchSidecarStatus()`), not from the on-disk handshake file — the file is the **extension's** channel, not the UI's.

Auth: `bearerAuth` middleware (`packages/sidecar/src/auth.ts`) requires `Authorization: Bearer <token>` on every route **except `/health`**. CORS is locked to local Tauri/Vite origins.

## TypeScript / module gotchas

- All cross-file imports inside `packages/*` use the `.js` suffix (e.g. `import { ... } from './foo.js'`). TS resolves the `.ts`/`.tsx` source; runtime uses the compiled `.js` or `tsx`'s on-the-fly transform.
- `packages/ui/src/assets/assets.d.ts` declares ambient `*.png`/`*.svg` modules so PNG imports inside `packages/ui` typecheck without `vite/client`. Don't add `import`/`export` to that file — it must stay a script-style ambient declaration.
- `apps/desktop` and `apps/extension` use `moduleResolution: Bundler` (different from packages, which use `NodeNext`) because Vite/WXT bundle them.
- The browser extension `tsconfig.json` extends WXT's generated `./.wxt/tsconfig.json` to pick up the `defineBackground` / `defineContentScript` globals.

## Branch / commit conventions

Active rebuild work happens on the working branch (currently detached HEAD off `main`). The git log style is short imperative subject lines (`docs: add desktop rebuild reference docs`, `desktop: add Golemancy OAuth provider + loopback callback server`); follow that. `_*/` directories are local-only planning docs and must not be committed.
