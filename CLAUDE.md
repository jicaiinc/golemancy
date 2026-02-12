# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

SoloCraft — AI Agent orchestration platform. Electron desktop app with pixel art (Minecraft) aesthetic, dark theme only. Language convention: Chinese for discussions/docs, English for code.

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
pnpm --filter @solocraft/ui test
pnpm --filter @solocraft/server test

# Run a single test file
pnpm --filter @solocraft/ui exec vitest run src/components/base/PixelButton.test.tsx

# Run tests in watch mode
pnpm --filter @solocraft/ui exec vitest src/components/base/PixelButton.test.tsx

# Run server standalone (outside Electron)
pnpm --filter @solocraft/server dev
```

## Monorepo Structure

```
apps/desktop/      @solocraft/desktop  — Electron shell, forks server as child process
packages/ui/       @solocraft/ui       — React UI, business logic, store, services
packages/server/   @solocraft/server   — Hono HTTP server, SQLite, AI agent runtime
packages/shared/   @solocraft/shared   — Pure TypeScript types + service interfaces (zero runtime)
```

Strict one-way dependency: `desktop → ui → shared ← server`

Turborepo orchestrates tasks. pnpm v10 workspaces.

## Architecture

### Electron-Server Integration

Desktop forks the server via `child_process.fork()` (`apps/desktop/src/main/index.ts`). Server sends `{ type: 'ready', port, token }` over IPC. Port and token are passed to renderer via `additionalArguments` → preload script.

**Known pitfalls** (documented in `_pitfalls/electron-server-fork.md`):
- `__dirname` changes after electron-vite compilation → use `app.getAppPath()` instead
- Electron's embedded Node has different ABI for native modules (better-sqlite3) → use `execPath: 'node'` in dev
- pnpm strict isolation → set `cwd` to server package directory in fork()
- Unit tests don't cover cross-process integration → always `pnpm dev` smoke test after Electron/server changes

### Server (Hono + SQLite + AI SDK)

`packages/server/src/` layout:
- `app.ts` — Hono app factory (CORS, auth, error handling)
- `db/` — SQLite schema (drizzle-orm), FTS5 for message search, migrations
- `storage/` — Service implementations (file-based for config data, SQLite for messages/logs)
- `routes/` — RESTful endpoints (projects, agents, conversations, tasks, artifacts, memories, settings, dashboard)
- `agent/` — AI runtime (model provider resolution, streamText, sub-agent orchestration)
- `ws/` — WebSocket real-time events (Channel pub/sub)

**Storage split**: SQLite for high-frequency queryable data (messages, task logs); file system for human-readable config (projects, agents, settings JSON).

### State (Zustand v5)

Single store at `packages/ui/src/stores/useAppStore.ts` with slices: project, agent, conversation, task, artifact, memory, settings, ui, dashboard.

Zustand v5 requires double-parenthesis pattern: `create<T>()(...)`.

Store persists theme + sidebar state to localStorage. Uses AbortController to cancel in-flight requests on project switch.

### Service Layer (DI)

- Interfaces: `packages/shared/src/services/interfaces.ts` (8 services, shared by UI and server)
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

### Type System

Branded ID types in `packages/shared/src/types/common.ts` (`ProjectId`, `AgentId`, etc.) prevent mixing IDs at compile time.

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

## Styling

Tailwind CSS v4 with CSS-first config in `packages/ui/src/styles/global.css`:
- Design tokens defined in `@theme {}` block (colors, fonts, shadows)
- Pixel font: Press Start 2P. Body font: JetBrains Mono
- No border-radius anywhere (pixel art style)
- Shadow system: `shadow-pixel-raised`, `shadow-pixel-sunken`, `shadow-pixel-drop`
- PostCSS config lives in `apps/desktop/postcss.config.js`

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
pnpm --filter @solocraft/desktop test:e2e

# E2E: all tiers including AI tests (needs API keys)
pnpm --filter @solocraft/desktop test:e2e:ai

# E2E: smoke only (fastest)
pnpm --filter @solocraft/desktop test:e2e:smoke

# E2E: skip rebuild, run tests only
pnpm --filter @solocraft/desktop test:e2e:only
```

E2E pitfalls: macOS GUI processes don't inherit shell PATH → use `SOLOCRAFT_FORK_EXEC_PATH` env var; `app.getAppPath()` returns `out/main/` in Playwright → use `SOLOCRAFT_ROOT_DIR` env var. Store exposed as `window.__SOLOCRAFT_STORE__` for test access (non-production only).

## Team

When creating a team, follow `_team/team.md`. **NEVER use Plan Mode to start a team** — create the team directly.

- **12 roles**: Team Lead, Architect, Requirements Analyst, Abstraction Strategist, Fact Checker, UI/UX Designer, Full-stack Engineer, Test Engineer, Reference Analyst (on-demand), CR-Quality, CR-Security, CR-Performance
- **Four phases**: Design → Implement → Test → Review (auto-transition between phases)
  - **Design** — architecture, research, requirements confirmation (all roles except engineers and reviewers). All artifacts saved to `_design/{YYYYMMDD-HHmm}-{name}/` as markdown files to persist across team sessions.
  - **Implement** — write code (Team Lead + Engineer + Fact Checker, others on-demand)
  - **Test** — run all tests (Test Engineer + Engineer for fixes)
  - **Review** — three CR roles run in parallel
- **Phase flow**: Implement done → auto-enter Test → tests pass → auto-enter Review. If CR finds P0 issues → back to Implement → Test → Review. Loop until no P0. If loop exceeds 3 rounds, pause and ask user.
- **Team Lead only coordinates, never writes code**
- **Parallel strategy**: independent tasks must run in parallel; use `blockedBy` in Task List for dependencies
- **Escalation strategy**: Phase 1 — strict (any ambiguity/choice must be reported to user); Phase 2 — autonomous (only escalate fundamental blockers)
- **Fact Checker is mandatory** — no tech enters code without verification via WebSearch / Context7 / source code
- **Reference Analyst is on-demand** — only activated when user provides a reference project (source path or doc) to study; analyzes architecture, patterns, and best practices for team reuse

## Note: Fact-Based Analysis

When asked to analyze based on "facts", always consult actual evidence before drawing conclusions — never assume. "Facts" refers to: official docs, web search results, Context7 library lookups, source code readings, and similar verifiable sources. Verify technical claims (API signatures, library behavior, version-specific features) against "facts" rather than relying on training knowledge, which may be outdated or wrong.
