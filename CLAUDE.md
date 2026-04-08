## Sub-agent Preference

Prefer handling tasks yourself rather than delegating to sub-agents. Sub-agents run with thinking disabled and reduced context, which limits their reasoning depth. The user prioritizes deep thinking and thoroughness over speed or cost — delegate only when the task genuinely does not require deep thinking.

## Thinking Depth & Output Quality

These rules override the default "Output efficiency" and "Tone and style" sections:

- Do not default to "short and concise". Scale response depth to task complexity — simple questions deserve short answers, complex tasks require thorough analysis with full reasoning visible.
- Do not lead with the answer while hiding the thought process. On non-trivial tasks, show the reasoning chain before the conclusion.
- Do not default to the simplest approach without comparison. Evaluate trade-offs between approaches, then choose the best one.
- Do not compress explanations when depth aids understanding. Use as many sentences as correctness and clarity demand.
- Do not reduce analysis depth, investigation thoroughness, or reasoning steps in the name of "avoiding over-engineering". That principle applies strictly to code structure (no speculative abstractions).
- Do not jump to the first guess without checking, nor keep searching after the answer is clear. Follow evidence systematically — verify before concluding, but commit once evidence is conclusive.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Golemancy — AI Agent orchestration platform. Electron desktop app with pixel art (Minecraft) aesthetic, dark theme only. Language: Chinese for discussions/docs, English for code.

GitHub: https://github.com/jicaiinc/golemancy | Domain: golemancy.ai | Copyright: Jicai, Inc. | Website repo: `/Users/cai/developer/github/golemancyweb`

## Rules

**`__guidelines/` 目录只读** — 未经用户允许不得新增、修改或删除。每个主题独立子文件夹，格式 `{topic}-{YYYYMMDD}`。当前内容：`__guidelines/i18n-20260302/`（翻译基准 + 开发规范）。

### Critical Library Choices

Do NOT use the alternatives:

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

## Commands

```bash
pnpm dev                    # Development (Electron + server + HMR)
pnpm build                  # Build all packages
pnpm lint                   # Type-check all packages
pnpm test                   # Run all tests
pnpm test:live              # Live tests (requires running server + API keys)
pnpm test:build             # Build preflight checks
pnpm pack                   # Package for local test
pnpm dist                   # Package for distribution

# Single package
pnpm --filter @golemancy/ui test
pnpm --filter @golemancy/server test
pnpm --filter @golemancy/server dev              # Server standalone

# Single test file
pnpm --filter @golemancy/ui exec vitest run src/components/base/PixelButton.test.tsx
pnpm --filter @golemancy/ui exec vitest src/components/base/PixelButton.test.tsx  # watch mode
```

## Monorepo Structure

```
apps/desktop/      @golemancy/desktop  — Electron shell, forks server as child process
packages/ui/       @golemancy/ui       — React UI, business logic, store, services
packages/server/   @golemancy/server   — Hono HTTP server, SQLite, AI agent runtime
packages/shared/   @golemancy/shared   — Pure TypeScript types + service interfaces (zero runtime)
packages/tools/    @golemancy/tools    — Browser automation tool (Playwright-based)
```

Dependency: `desktop → ui → shared ← server ← tools` (strict one-way). Turborepo + pnpm v10 workspaces.

## Architecture

### Core Abstractions

Four top-level abstractions: **Project** (container), **Agent** (core unit), **Team** (agent topology), **Memory** (agent-scoped knowledge). All agents belong to a project. Each project has a Main Agent (`defaultAgentId`) and optionally a Default Team (`defaultTeamId`). Projects also have Cron Jobs for scheduled execution. No global Agent/Skill libraries.

**Agent capabilities** assembled at runtime (`agent/tools.ts`):
- **Skills** — `agent.skillIds` → project-scoped, injected into system prompt
- **MCP** — `agent.mcpServers` → connects to MCP servers, loads their tools
- **Built-in Tools** — `agent.builtinTools: { bash?, browser?, computer_use?, task?, memory? }` → permission mode controls execution
- **Memory** — Agent-scoped, persists in SQLite. Pinned memories always load; non-pinned load top-N by priority + recency
- **Sub-Agents** — Agent itself has NO sub-agent fields. When conversation has `teamId`, runtime creates `delegate_to_{agentId}` tools from `TeamMember[]` children. Lazy-loaded, infinite nesting

**System prompt** = `agent.systemPrompt` + skill instructions + memory context + team instruction (injected as `## Team Context`)

**Team** = single-parent tree of `TeamMember { agentId, role, parentAgentId? }`. Agents decoupled from Teams (same agent can join multiple teams). Conversation scoped to Team via `conversation.teamId` activates sub-agent delegation; CronJob also supports `teamId`. Details in `/Users/cai/.claude/_docs/team.md`.

### Electron ↔ Server

Electron main fork()s server child process (PORT=0), server sends `{ port, token }` via IPC, main passes to renderer via `additionalArguments` + preload `contextBridge`. All UI↔Server communication is HTTP to `127.0.0.1:port` with per-session Bearer token. Without Electron, UI falls back to mock services.

**Pitfalls**: see `_pitfalls/electron-server-fork.md`. Key: use `app.getAppPath()` not `__dirname`; use `execPath: 'node'` in dev for native modules; always `pnpm dev` smoke test after Electron/server changes. **Never use `localhost` for internal Electron↔Server communication — always use `127.0.0.1`.** On some Windows machines (especially Win11 Insider), `localhost` resolves to `::1` (IPv6) while the server only listens on IPv4, causing all fetch requests to fail silently (user sees white screen).

### Server

Hono HTTP server + SQLite (drizzle-orm) + Vercel AI SDK. **Storage split**: SQLite for high-frequency queryable data (messages, task logs, memories); file system for human-readable config (projects, agents, teams, skills, settings JSON). Each project gets its own SQLite database. FTS5 for message search. **Logs**: 用户通过 app 启动时，日志存放在 `~/.golemancy/logs/`。

Key dirs in `packages/server/src/`: `app.ts` (Hono factory), `db/` (SQLite + migrations), `storage/` (service impl), `routes/` (REST endpoints), `agent/` (AI runtime, tools, MCP, sandbox, permissions), `runtime/` (Node/Python env), `ws/` (WebSocket events).

### UI

Zustand v5 single store (`useAppStore.ts`), double-parenthesis pattern: `create<T>()(...)`. Persists theme + sidebar to localStorage.

Service layer DI: interfaces in `shared/services/interfaces.ts`, container via `getServices()`/`configureServices()`. Mock impls for dev (seed data centralized in `mock/data.ts` — never scatter), HTTP impls for real backend. Zustand actions use `getServices()` directly; components use `useServices()` hook.

HashRouter at `packages/ui/src/app/routes.tsx`, project-scoped routes under `/projects/:projectId`.

### Config & Permissions

Config hierarchy: Global Settings → Project Config → Agent Config. See `useResolvedConfig()`.

Permission modes: `restricted` (no execution), `sandbox` (default), `unrestricted`. Controls filesystem, network, commands. Template variables: `{{workspaceDir}}`, `{{projectRuntimeDir}}`.

### Type System

Branded ID types (`ProjectId`, `AgentId`, `TeamId`, `MemoryId`, etc.) in `shared/types/common.ts` — never pass raw strings where branded IDs are expected.

## Styling

Tailwind CSS v4, CSS-first config in `packages/ui/src/styles/global.css`:
- Design tokens in `@theme {}` block
- **No border-radius anywhere** (pixel art style)
- Three font roles: `--font-arcade` (logo only), `--font-pixel` (titles/badges), `--font-mono` (body/code)
- Shadow system: `shadow-pixel-raised`, `shadow-pixel-sunken`, `shadow-pixel-drop`
- Font design doc: `_design/font-system.md`. PostCSS config: `apps/desktop/postcss.config.js`

## Naming Conventions

- **Components**: `Pixel*` prefix for base components (PixelButton, PixelCard, etc.)
- **Pages**: `*Page` suffix, organized in `packages/ui/src/pages/` by domain
- **Services**: `I*Service` interfaces, `Mock*Service` / `Http*Service` implementations
- **Motion presets**: `packages/ui/src/lib/motion.ts`

## i18n

`react-i18next` + `i18next`，16 namespace，22 语言。翻译文件：`packages/ui/src/locales/{lang}/{namespace}.json`。Key 清单：`_design/i18n-key-summary.md`。

**英文 (`en`) 是唯一标杆**。新功能只需实现英文翻译。

**校验**：`pnpm check:i18n`（可指定语言如 `pnpm check:i18n ja de`）。缺失/占位符错误 → exit 1；仅多余 key → warning。

**规范文档**（i18n 工作时必须先读）：
- `__guidelines/i18n-20260302/i18n-translation-brief.md` — 术语表、翻译原则、质量检查
- `__guidelines/i18n-20260302/i18n-guidelines.md` — `t()` 用法、key 命名、错误处理

**关键规则：**
- `server/agent/` 下文本给 AI 读，永远不做 i18n
- 外部/动态错误原样透传，只 i18n fallback 兜底字符串
- 共用按钮用 `common:button.*`，复数用 `_one`/`_other` 后缀

## Testing

Vitest: jsdom (UI), Node (server). Tests co-located (`*.test.{ts,tsx}`). UI setup: `packages/ui/src/test/setup.ts`.

### E2E Testing

Playwright + Electron，84 个文件，479 个用例。测试文件在 `apps/desktop/e2e/`。

**完整用例目录**：`apps/desktop/e2e/test-catalog.md`（479 个用例按层级/模块/文件分类）
**测试运行记录**：`apps/desktop/e2e/TEST-LOG.md`（每次测试更新）
**执行报告**：`apps/desktop/e2e/reports/{YYYYMMDD}-{layers}.md`（每次 E2E 执行后生成）

#### E2E 执行报告格式

每次运行 E2E 测试后，必须在 `apps/desktop/e2e/reports/` 生成报告，文件名 `{YYYYMMDD}-{layers}.md`（如 `20260401-smoke-server.md`）。

**结构**：

1. **YAML Frontmatter** — `date`, `layers`, `duration`, `total/passed/flaky/skipped/failed`, `environment`（os/node/runner/workers）, `commit`
2. **正文** — 按层级分组的文件级表格，每行：`# | 文件 | 用例数 | 通过 | 跳过 | Flaky | 状态 | 说明`，末尾小计行
3. **备注** — flaky/skip/fail 根因分析，环境异常，与上次对比

**状态图标**：✅ 全部通过 | ⚡ 有 flaky（重试后通过）| ⏭️ 全部跳过 | ❌ 有失败

#### 4 个层级

| 层级 | 文件数 | 需要 API Key | 说明 |
|------|--------|-------------|------|
| smoke | 30 | 否 | UI 渲染、交互、导航 |
| server | 28 | 否 | API CRUD、数据验证 |
| ai | 25 | 是 | AI 对话、工具调用、token 计量 |
| onboarding | 1 | 否 | 独立 Electron 实例，空 data dir |

#### 运行方式（推荐单文件运行）

`test:e2e:only` 内置 `--no-deps`，跑单文件时不会触发依赖链（不会先跑全部 smoke/server）。

```bash
# 1. 先 build（UI 代码没改就不用重复）
pnpm --filter @golemancy/desktop exec electron-vite build --mode test

# 2. 跑单个文件（推荐，只弹 1 个 Electron 窗口，30-60 秒）
pnpm --filter @golemancy/desktop test:e2e:only -- e2e/smoke/team-page.spec.ts
pnpm --filter @golemancy/desktop test:e2e:only -- --project=ai e2e/ai/task-tool.spec.ts

# 3. 按用例名匹配
pnpm --filter @golemancy/desktop test:e2e:only -- -g "memory tab shows empty state"

# 4. 按关键字跑一组相关测试
pnpm --filter @golemancy/desktop test:e2e:only -- -g "Team"

# 5. 按层级跑（单层，不触发依赖）
pnpm --filter @golemancy/desktop test:e2e:only -- --project=smoke
pnpm --filter @golemancy/desktop test:e2e:only -- --project=server
pnpm --filter @golemancy/desktop test:e2e:only -- --project=onboarding

# 6. 全量（CI 用，不推荐日常使用，10+ 分钟，大量弹窗）
pnpm --filter @golemancy/desktop test:e2e        # smoke + server
pnpm --filter @golemancy/desktop test:e2e:all    # all tiers (needs API keys)
```

> **⚠️ 重要**：`test:e2e:only` 已包含 `--no-deps`。**绝对不要**用 `--project=ai` 不带 `--no-deps` 跑单文件，否则会先跑全部 smoke + server（53 个文件的依赖链 = 大量弹窗）。

#### 关键规则

- **单文件运行优先** — 每个文件独立启动 Electron，无状态污染，快速反馈
- **不要在日常开发中跑全量** — 全量跑会弹出多个 Electron 窗口、耗时长
- **AI 测试用宽松断言** — `toContain`/regex，不精确匹配完整回复
- **修改 UI 代码后需重新 build** — `electron-vite build --mode test`
- **测试文件修改不需要 build** — 直接跑即可

#### E2E 架构

- Fixtures: `e2e/fixtures/`（electron.ts, test-helper.ts, store-bridge.ts, console-logger.ts, onboarding.ts）
- Constants: `e2e/constants.ts`（SELECTORS, TIMEOUTS）
- Config: `e2e/playwright.config.ts`（4 projects: smoke → server → ai + onboarding 独立）
- Global setup/teardown: 创建临时 data dir，seed settings.json，清理进程

E2E pitfalls: macOS GUI 不继承 PATH → `GOLEMANCY_FORK_EXEC_PATH`; Playwright 下 `app.getAppPath()` returns `out/main/` → `GOLEMANCY_ROOT_DIR`. Store exposed as `window.__GOLEMANCY_STORE__` (non-production).

