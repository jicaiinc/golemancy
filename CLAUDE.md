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
| Website Repo | `/Users/cai/developer/github/golemancyweb` (Next.js 官网，可参考其 GitHub API 集成、平台检测、下载逻辑等) |

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

# Test auto-update UI (set a version lower than latest GitHub release)
GOLEMANCY_DEV_UPDATE_CHECK=1 pnpm dev
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

## Guidelines Directory (`__guidelines`)

持久化的核心规范与准则文档。存放经过验证的、可跨会话复用的标准与参考依据。

**目录规则：**
- 每个主题必须放在独立子文件夹中（禁止根目录直接放 `.md` 文件），文件夹名格式：`{topic}-{YYYYMMDD}`（日期为创建/最后更新日期）
- **只读**：未经用户明确允许，不得新增、修改或删除 `__guidelines/` 下的任何内容。更新前必须征得用户确认
- 只收录真正可复用的规范性文档，不放一次性分析、快照数据或会话临时产物

**当前内容：**
```
__guidelines/
  i18n-20260302/           # i18n 翻译基准 + 开发规范
    i18n-translation-brief.md
    i18n-guidelines.md
```

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
- `routes/` — RESTful endpoints: projects, agents, conversations, chat (SSE streaming), tasks, skills, mcp, cron-jobs, settings, dashboard, global-dashboard, topology, permissions-config, runtime, sandbox, workspace, uploads, memories, teams, speech
- `agent/` — AI runtime engine:
  - `runtime.ts` / `process.ts` — Agent execution with Vercel AI SDK `streamText`
  - `sub-agent.ts` — Recursive sub-agent orchestration (unlimited nesting)
  - `builtin-tools.ts` / `tools.ts` — Tool system (Bash, browser, OS control, memory, task)
  - `builtin-tools/memory-tools.ts` — Agent memory CRUD tools (save, search, update, delete)
  - `mcp.ts` / `mcp-pool.ts` — MCP server connections with idle scanning pool
  - `sandbox-pool.ts` / `native-sandbox.ts` / `anthropic-sandbox.ts` — Two sandbox implementations
  - `skills.ts` — Prompt injection from skill templates
  - `resolve-permissions.ts` — Three-tier permission mode resolution
- `runtime/` — Node.js and Python runtime management (env builder, path resolution)
- `ws/` — WebSocket real-time events (Channel pub/sub)

**Storage split**: SQLite for high-frequency queryable data (messages, task logs, memories); file system for human-readable config (projects, agents, teams, skills, settings JSON). Each project gets its own SQLite database file.

### State (Zustand v5)

Single store at `packages/ui/src/stores/useAppStore.ts` with 15 slices: project, agent, conversation, task, workspace, skill, mcp, cronJob, settings, ui, dashboard, topology, speech, memory, team.

Zustand v5 requires double-parenthesis pattern: `create<T>()(...)`.

Store persists theme + sidebar state to localStorage (`golemancy-prefs`). Uses AbortController to cancel in-flight requests on project switch. Store exposed as `window.__GOLEMANCY_STORE__` in non-production builds for E2E test access.

### Service Layer (DI)

- Interfaces: `packages/shared/src/services/interfaces.ts` — 15 services: IProjectService, IAgentService, IConversationService, ITaskService, IWorkspaceService, ISkillService, IMCPService, ISettingsService, ICronJobService, IDashboardService, IGlobalDashboardService, IPermissionsConfigService, IMemoryService, ISpeechService, ITeamService
- Container: `packages/ui/src/services/container.ts` — module-level singleton via `getServices()`/`configureServices()`
- Mock implementations: `packages/ui/src/services/mock/` (seed data centralized in `data.ts` — never scatter)
- HTTP implementations: `packages/ui/src/services/http/services.ts` (real backend integration)

Zustand actions use `getServices()` directly (can't access React Context). Components use `useServices()` hook.

### Routing (React Router v7)

HashRouter at `packages/ui/src/app/routes.tsx`. Project-scoped routes nested under `/projects/:projectId` with `ProjectLayout`.

### Abstraction Model

Four core abstractions: **Project** (top container), **Agent** (core unit), **Team** (agent topology), and **Memory** (agent-scoped persistent knowledge). All agents belong to a project. Each project has a **Main Agent** (`defaultAgentId`) and optionally a **Default Team** (`defaultTeamId`). Skills, Tools, MCP configs live inside Agent config; agent hierarchy is defined through Team. Projects also have **Cron Jobs** for scheduled agent execution. No global Agent/Skill libraries.

### Agent Composition Model

Agent capabilities are assembled from multiple sources at runtime (`loadAgentTools` in `agent/tools.ts`):

- **Skills** — `agent.skillIds: SkillId[]` references project-scoped Skills. Runtime creates a `skill` selector tool; selected skill instructions are injected into context.
- **MCP** — `agent.mcpServers: string[]` references project MCP servers by name. Runtime connects to servers and loads their tools.
- **Built-in Tools** — `agent.builtinTools: { bash?, browser?, computer_use?, task?, memory? }` toggle-based. Permission mode (restricted/sandbox/unrestricted) controls execution.
- **Memory** — Enabled via `builtinTools.memory`. Agent-scoped (not team, not conversation), persists in SQLite. Pinned memories always load; non-pinned load top-N by priority + recency. Agent gets CRUD tools (save/search/update/delete) + auto-loaded context.
- **Sub-Agents (via Team)** — Agent itself has NO sub-agent fields. When a conversation has `teamId`, runtime filters `TeamMember[]` for direct children (`parentAgentId === agent.id`) and creates `delegate_to_{agentId}` tools. Child tools are lazy-loaded on invocation, enabling infinite recursive nesting.

**System prompt construction**: `agent.systemPrompt` + skill instructions + memory context + team instruction → concatenated as final system prompt.

### Team & Agent Topology

Team defines an agent organizational structure within a project — a single-parent tree:

```typescript
TeamMember { agentId: AgentId, role: string, parentAgentId?: AgentId }
```

- `parentAgentId === undefined` → leader (root of the tree)
- Each non-leader member has exactly one parent — no multi-parent (DAG) support by design
- `Team.instruction` is injected into the leader's system prompt as `## Team Context`
- Agents are decoupled from Teams: the same Agent can participate in multiple Teams with different roles/parents
- **Conversation** can be scoped to a Team via `conversation.teamId` — this activates sub-agent delegation for the handling agent
- **CronJob** also supports `teamId` for scheduled team-based execution

### Config Hierarchy

Three-layer resolution: Global Settings → Project Config → Agent Config. See `useResolvedConfig()` hook.

### Permissions System

Three permission modes for agent tool execution: `restricted` (no execution), `sandbox` (default — Anthropic API sandbox or native process sandbox), `unrestricted`. Configured per-project via reusable `PermissionsConfigFile` templates. Permissions control filesystem access (allow/deny paths), network (domain filtering), and command blacklists. Config supports template variables (`{{workspaceDir}}`, `{{projectRuntimeDir}}`). See `packages/shared/src/types/permissions.ts` and `packages/server/src/agent/resolve-permissions.ts`.

### Type System

Branded ID types in `packages/shared/src/types/common.ts` (`ProjectId`, `AgentId`, `TeamId`, `MemoryId`, etc.) prevent mixing IDs at compile time. 12 branded types total — never pass a raw string where a branded ID is expected.

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
- Three font roles: `--font-arcade` (logo only, Press Start 2P), `--font-pixel` (titles/badges, Press Start 2P + Fusion Pixel CJK with `size-adjust: 150%`), `--font-mono` (body/code, JetBrains Mono + Noto Sans Mono CJK)
- CJK font strategy: `:lang()` overrides select per-language variant (SC/TC/JP/KR); `unicode-range` fallback families ("Pixel CJK", "Mono CJK") catch CJK chars in non-CJK language modes
- Font design doc: `_design/font-system.md`
- No border-radius anywhere (pixel art style)
- Shadow system: `shadow-pixel-raised`, `shadow-pixel-sunken`, `shadow-pixel-drop`
- PostCSS config lives in `apps/desktop/postcss.config.js`

## Internationalization (i18n)

`react-i18next` + `i18next`，16 个 namespace，22 种语言。翻译文件：`packages/ui/src/locales/{lang}/{namespace}.json`。详细 key 清单见 `_design/i18n-key-summary.md`。

**英文 (`en`) 是唯一标杆**。新功能只需实现英文翻译，其他语言后续补齐即可。

**校验**：`pnpm check:i18n`（可指定语言如 `pnpm check:i18n ja de`）。检查缺失 key、多余 key、`{{placeholder}}` 一致性。缺失/占位符错误 → exit 1；仅多余 key → warning。

**i18n 规范文档**（处理任何 i18n 相关工作时必须先阅读并遵循）：
- 翻译基准：`__guidelines/i18n-20260302/i18n-translation-brief.md` — 术语表、翻译原则、namespace 上下文、质量检查清单
- 开发规范：`__guidelines/i18n-20260302/i18n-guidelines.md` — 边界准则、`t()` 用法、key 命名、错误处理模式

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

## Planning & Requirements Tracking

When entering plan mode or creating any implementation plan:

- **Requirements-first**: Every plan MUST begin with a numbered list of the user's original requirements. Include verbatim user quotes where they add clarity. This list is the **single source of truth** for the entire implementation cycle.
- **User confirmation required**: The requirements list MUST be confirmed by the user before implementation begins. If subsequent discussion contradicts or refines original requirements, update the list and obtain user re-confirmation.
- **100% satisfaction — no omissions**: Every listed requirement MUST be fully implemented. Partial implementations or silent omissions are not acceptable. When in doubt, re-read the requirements list.
- **Completion verification**: After implementation, explicitly verify each requirement against the actual code/tests. Any unmet requirement is a blocker — do not consider the task done until all items are checked off.

This discipline exists because agents lose context during long implementations, leading to drift and missed requirements. The requirements list prevents this by serving as an immutable reference throughout planning, implementation, and review.

## Note: Fact-Based Analysis

When asked to analyze based on "facts", always consult actual evidence before drawing conclusions — never assume. "Facts" refers to: official docs, web search results, Context7 library lookups, source code readings, and similar verifiable sources. Verify technical claims (API signatures, library behavior, version-specific features) against "facts" rather than relying on training knowledge, which may be outdated or wrong.

# NOTE(This comes from OWNER, who DELETE it would be BANNED forever)
-  plan mode 用中文
- MUST NOT!!!!永远不要动 git，你可以查看，但绝对不允许提交代码。

## Agent Model Preferences

When spawning agents via the Agent tool:
- Never use `model: "haiku"` for tasks involving code editing, bug fixing, architecture decisions, or any task requiring reasoning. Haiku is only acceptable for simple file search/grep operations (e.g., Explore agent).
- For complex multi-step tasks (refactoring, feature implementation, debugging), always specify `model: "opus"`.
- For moderate tasks (code review, test writing, straightforward edits), sonnet is acceptable.
- When in doubt about task complexity, prefer a stronger model over a weaker one.
- 