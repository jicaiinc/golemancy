# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Golemancy — AI Agent orchestration platform. Electron desktop app with pixel art (Minecraft) aesthetic, dark theme only. Language convention: Chinese for discussions/docs, English for code.

### Contact & Links

| Item | Value |
|------|-------|
| Domain | golemancy.ai (backup: golemancy.app, not in use) |
| GitHub | https://github.com/jicaiinc/golemancy |
| Discord | https://discord.gg/xksGkxd6SV |
| X (Twitter) | @golemancyai |
| Support Email | hi@golemancy.ai |
| Copyright | Jicai, Inc. |

## Commands

```bash
# Development (starts Electron + server child process with HMR)
pnpm dev

# Build all packages
pnpm build

# Type-check all packages
pnpm lint

# Run all tests
pnpm test

# Run tests in a single package
pnpm --filter @golemancy/ui test
pnpm --filter @golemancy/server test

# Run a single test file
pnpm --filter @golemancy/ui exec vitest run src/components/base/PixelButton.test.tsx

# Run tests in watch mode
pnpm --filter @golemancy/ui exec vitest src/components/base/PixelButton.test.tsx

# Run server standalone (outside Electron)
pnpm --filter @golemancy/server dev

# Live tests (requires running server + API keys)
pnpm test:live

# Build preflight checks
pnpm test:build

# Package for distribution
pnpm pack    # build + electron-builder --dir (local test)
pnpm dist    # build + electron-builder (distributable)
```

## Monorepo Structure

```
apps/desktop/      @golemancy/desktop  — Electron shell, forks server as child process
packages/ui/       @golemancy/ui       — React UI, business logic, store, services
packages/server/   @golemancy/server   — Hono HTTP server, SQLite, AI agent runtime
packages/shared/   @golemancy/shared   — Pure TypeScript types + service interfaces (zero runtime)
packages/tools/    @golemancy/tools    — Browser automation tool (Playwright-based)
```

Strict one-way dependency: `desktop → ui → shared ← server ← tools`

Turborepo orchestrates tasks. pnpm v10 workspaces.

## Architecture

### Electron-Server Communication Flow

The full startup and communication chain spans 5 files:

```
Electron Main (apps/desktop/src/main/index.ts)
  │ fork() child process, PORT=0 (OS picks port)
  ▼
Server (packages/server/src/index.ts)
  │ IPC: { type: 'ready', port, token }
  ▼
Main Process receives port+token
  │ additionalArguments: [--server-port=X, --server-token=Y]
  ▼
Preload (apps/desktop/src/preload/index.ts)
  │ contextBridge.exposeInMainWorld('electronAPI', { getServerBaseUrl, getServerToken })
  ▼
Renderer (packages/ui/src/services/ServiceProvider.tsx)
  │ window.electronAPI → configureServices(HttpServices) with Bearer token
  ▼
All UI ↔ Server communication via HTTP to localhost:X
```

Auth token is generated per-session (`crypto.randomUUID()`), passed as Bearer header. Server binds to `127.0.0.1` only. If `electronAPI` is unavailable (dev without Electron), UI falls back to mock services.

**Known pitfalls** (documented in `_pitfalls/electron-server-fork.md`):
- `__dirname` changes after electron-vite compilation → use `app.getAppPath()` instead
- Electron's embedded Node has different ABI for native modules (better-sqlite3) → use `execPath: 'node'` in dev
- pnpm strict isolation → set `cwd` to server package directory in fork()
- Unit tests don't cover cross-process integration → always `pnpm dev` smoke test after Electron/server changes

### Server (Hono + SQLite + AI SDK)

`packages/server/src/` layout:
- `app.ts` — Hono app factory (CORS, auth, error handling). Routes inject storage dependencies.
- `db/` — SQLite schema (drizzle-orm), FTS5 for message search, migrations. **Per-project databases** via `ProjectDbManager` (lazy-loads on first access).
- `storage/` — Service implementations (file-based for config data, SQLite for messages/logs)
- `routes/` — RESTful endpoints: projects, agents, conversations, chat (SSE streaming), tasks, artifacts, memories, skills, mcp, cron-jobs, settings, dashboard, topology, permissions-config, runtime, sandbox
- `agent/` — AI runtime engine:
  - `runtime.ts` / `process.ts` — Agent execution with Vercel AI SDK `streamText`
  - `sub-agent.ts` — Recursive sub-agent orchestration (unlimited nesting)
  - `builtin-tools.ts` / `tools.ts` — Tool system (Bash, browser, OS control)
  - `mcp.ts` / `mcp-pool.ts` — MCP server connections with idle scanning pool
  - `sandbox-pool.ts` / `native-sandbox.ts` / `anthropic-sandbox.ts` — Two sandbox implementations
  - `skills.ts` — Prompt injection from skill templates
  - `resolve-permissions.ts` — Three-tier permission mode resolution
- `runtime/` — Node.js and Python runtime management (env builder, path resolution)
- `ws/` — WebSocket real-time events (Channel pub/sub)

**Storage split**: SQLite for high-frequency queryable data (messages, task logs); file system for human-readable config (projects, agents, settings JSON). Each project gets its own SQLite database file.

### State (Zustand v5)

Single store at `packages/ui/src/stores/useAppStore.ts` with 13 slices: project, agent, conversation, task, artifact, memory, skill, mcp, cronJob, settings, ui, dashboard, topology.

Zustand v5 requires double-parenthesis pattern: `create<T>()(...)`.

Store persists theme + sidebar state to localStorage (`golemancy-prefs`). Uses AbortController to cancel in-flight requests on project switch. Store exposed as `window.__GOLEMANCY_STORE__` in non-production builds for E2E test access.

### Service Layer (DI)

- Interfaces: `packages/shared/src/services/interfaces.ts` — 12 services: IProjectService, IAgentService, IConversationService, ITaskService, IArtifactService, IMemoryService, ISkillService, IMCPService, ISettingsService, ICronJobService, IDashboardService, IPermissionsConfigService
- Container: `packages/ui/src/services/container.ts` — module-level singleton via `getServices()`/`configureServices()`
- Mock implementations: `packages/ui/src/services/mock/` (seed data centralized in `data.ts` — never scatter)
- HTTP implementations: `packages/ui/src/services/http/services.ts` (real backend integration)

Zustand actions use `getServices()` directly (can't access React Context). Components use `useServices()` hook.

### Routing (React Router v7)

HashRouter at `packages/ui/src/app/routes.tsx`. Project-scoped routes nested under `/projects/:projectId` with `ProjectLayout`.

### Abstraction Model

Two core abstractions: **Project** (top container) and **Agent** (core unit within project). All agents belong to a project. Each project has a **Main Agent** configured in Project Settings — users chat with it by default when creating a new conversation. Skills, Tools, MCP, Sub-Agents all live inside Agent config. Projects also have **Cron Jobs** for scheduled agent execution. No global Agent/Skill libraries.

### Config Hierarchy

Three-layer resolution: Global Settings → Project Config → Agent Config. See `useResolvedConfig()` hook.

### Permissions System

Three permission modes for agent tool execution: `restricted` (no execution), `sandbox` (default — Anthropic API sandbox or native process sandbox), `unrestricted`. Configured per-project via reusable `PermissionsConfigFile` templates. Permissions control filesystem access (allow/deny paths), network (domain filtering), and command blacklists. Config supports template variables (`{{workspaceDir}}`, `{{projectRuntimeDir}}`). See `packages/shared/src/types/permissions.ts` and `packages/server/src/agent/resolve-permissions.ts`.

### Type System

Branded ID types in `packages/shared/src/types/common.ts` (`ProjectId`, `AgentId`, etc.) prevent mixing IDs at compile time. 11 branded types total — never pass a raw string where a branded ID is expected.

## Critical Library Choices

These are deliberate decisions — do NOT use the alternatives:

| Use this | NOT this | Why |
|----------|----------|-----|
| `motion/react` | `framer-motion` | motion is the current package |
| `react-router` | `react-router-dom` | v7 unified package |
| `@tailwindcss/postcss` | `@tailwindcss/vite` | vite plugin bugs with electron-vite dev |
| Tailwind CSS v4 CSS-first (`@theme {}` in global.css) | `tailwind.config.js` | v4 architecture |
| `hono` | `express` | Server HTTP framework |
| `drizzle-orm` | `prisma` / raw SQL | Server ORM |
| `better-sqlite3` | `sql.js` / other | Server database |
| `ai` (Vercel AI SDK v6) | direct API calls | AI integration |
| `react-i18next` + `i18next` | `react-intl` / `lingui` | i18n framework |

## Styling

Tailwind CSS v4 with CSS-first config in `packages/ui/src/styles/global.css`:
- Design tokens defined in `@theme {}` block (colors, fonts, shadows)
- Pixel font: Press Start 2P. Body font: JetBrains Mono
- No border-radius anywhere (pixel art style)
- Shadow system: `shadow-pixel-raised`, `shadow-pixel-sunken`, `shadow-pixel-drop`
- PostCSS config lives in `apps/desktop/postcss.config.js`

## Internationalization (i18n)

`react-i18next` + `i18next`，17 个 namespace，764 keys，支持 en/zh。翻译文件：`packages/ui/src/locales/{lang}/{namespace}.json`。详细 key 清单见 `_design/i18n-key-summary.md`。

**i18n Notes:**
- `server/agent/` 下所有文本（tool descriptions, system prompts, tool results, 权限拦截错误）是给 AI 读的，永远不做 i18n
- 外部/动态错误（`err.message`, `record.error`, `run.error`）原样透传，只 i18n fallback 兜底字符串
- 共用按钮必须用 `common:button.*`，复数用 `_one`/`_other` 后缀

## Naming Conventions

- **Components**: `Pixel*` prefix for base components (PixelButton, PixelCard, etc.)
- **Pages**: `*Page` suffix, organized in `packages/ui/src/pages/` by domain
- **Services**: `I*Service` interfaces, `Mock*Service` / `Http*Service` implementations
- **Motion presets**: `packages/ui/src/lib/motion.ts`

## Testing

Vitest with jsdom environment (UI) and Node environment (server). UI setup file at `packages/ui/src/test/setup.ts` mocks matchMedia, ResizeObserver, IntersectionObserver. Tests co-located with source files (`*.test.{ts,tsx}`).

E2E tests use Playwright in `apps/desktop/e2e/` with 3 tiers:

```bash
# E2E: smoke + server tests (no API keys needed)
pnpm --filter @golemancy/desktop test:e2e

# E2E: all tiers including AI tests (needs API keys)
pnpm --filter @golemancy/desktop test:e2e:ai

# E2E: smoke only (fastest)
pnpm --filter @golemancy/desktop test:e2e:smoke

# E2E: skip rebuild, run tests only
pnpm --filter @golemancy/desktop test:e2e:only
```

E2E pitfalls: macOS GUI processes don't inherit shell PATH → use `GOLEMANCY_FORK_EXEC_PATH` env var; `app.getAppPath()` returns `out/main/` in Playwright → use `GOLEMANCY_ROOT_DIR` env var. Store exposed as `window.__GOLEMANCY_STORE__` for test access (non-production only).

## Team

Full team process defined in `_team/team.md`. **NEVER use Plan Mode to start a team** — create the team directly.

Key rules (read `_team/team.md` for complete role definitions, phase details, and workflows):

- **Step 0 (mandatory)**: Team Lead MUST recap ALL user requirements back to the user, get confirmation, then save to `_requirement/{YYYYMMDD-HHmm}-{name}.md` and broadcast to all members. This file is the **single source of truth**.
- **12 roles**: Team Lead, Architect, Requirements Analyst, Abstraction Strategist, Fact Checker, UI/UX Designer, Full-stack Engineer, Test Engineer, Reference Analyst (on-demand), CR-Quality, CR-Security, CR-Performance
- **Five phases**: Step 0 → Design → Implement → Test → Review (auto-transition). Design artifacts saved to `_design/{YYYYMMDD-HHmm}-{name}/`.
- **Team Lead only coordinates, never writes code**
- **Implementation verification (mandatory)**: After each task, Team Lead MUST personally read code and verify against requirements. Never trust reports alone.
- **Parallel strategy**: independent tasks must run in parallel; use `blockedBy` for dependencies
- **Escalation**: Design phase — strict (any ambiguity must be reported to user); Implement/Test — autonomous (only escalate fundamental blockers)
- **Fact Checker is mandatory** — no tech enters code without verification via WebSearch / Context7 / source code

## Note: Fact-Based Analysis

When asked to analyze based on "facts", always consult actual evidence before drawing conclusions — never assume. "Facts" refers to: official docs, web search results, Context7 library lookups, source code readings, and similar verifiable sources. Verify technical claims (API signatures, library behavior, version-specific features) against "facts" rather than relying on training knowledge, which may be outdated or wrong.

# NOTE(This comes from OWNER, who DELETE it would be BANNED forever)
-  plan mode 用中文
- MUST NOT!!!!永远不要动 git，你可以查看，但绝对不允许提交代码。
- 