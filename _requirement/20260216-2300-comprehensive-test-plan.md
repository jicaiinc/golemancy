# Golemancy 全面测试方案

> 日期: 2026-02-16
> 状态: 执行中
> 执行方式: 串行，按 Phase 顺序逐步推进

---

## 一、现状评估

### 1.1 已有测试（66 个文件）

| 层级 | 数量 | 覆盖内容 |
|------|------|----------|
| UI 基础组件 | 14 | PixelButton/Card/Input/TextArea/Modal/Dropdown/Tabs/Toggle/Badge/Avatar/Spinner/Progress/Tooltip |
| UI 页面 | 6 | ChatWindow, Dashboard, MCP, Cron, ProjectCreate, GlobalSettings |
| Zustand Store | 1 | 630 行，覆盖 project/agent/conversation/task/theme/dashboard slice |
| Service 层 | 3 | ServiceProvider, Mock services, dashboard-types |
| Server Agent | 10 | tools, mcp, mcp-pool, builtin-tools (unit+integration), model, sub-agent, sandbox-pool, native-sandbox, anthropic-sandbox |
| Server Storage | 9 | projects, agents, conversations, tasks, artifacts, memories, mcp, base, settings |
| Server DB | 2 | Schema validation, v2 migration |
| Server Runtime | 4 | env-builder, node-manager, python-manager, paths |
| Server Routes | 1 | **仅 MCP 路由** |
| Server Security | 2 | command blacklist, path validation |
| Server Utils | 2 | IDs, WebSocket handler |
| E2E Smoke | 5 | app-launch, project-crud, agent-crud, navigation, settings |
| E2E Server | 1 | chat-ui |
| E2E AI | 2 | agent-persona, chat-flow |
| Browser Tool | 1 | Playwright driver |

### 1.2 核心缺失

#### P0 — 完全没有测试的核心逻辑

1. **Chat 路由** (`routes/chat.ts`) — 系统最复杂的端点：流式传输、tool 加载、消息持久化、清理逻辑，零测试
2. **13 个路由处理器** — projects/agents/conversations/tasks/artifacts/memories/skills/settings/cronjobs/dashboard/permissions-config/runtime，全部没有路由级测试
3. **Permission 解析** (`resolve-permissions.ts`) — 模板展开 `{{workspaceDir}}`、三层合并、平台感知逻辑，零测试
4. **Code Runtime 集成** — Python venv 创建/包安装、Node.js 运行时执行，只有 manager 单元测试，无真实执行集成测试
5. **HTTP Service 实现** (`services/http/services.ts`) — UI 侧 12 个 HTTP service 完全没有测试
6. **Live Agent 测试** — 从未用真实 API key 调用过 LLM，所有 model.test.ts 全部 mock

#### P1 — 测试深度不够

7. **Sandbox 模式切换** — restricted/sandbox/unrestricted 三种模式的端到端行为验证缺失
8. **Sub-agent 递归调度** — lazy loading、结果传递、清理链，只有浅层 mock 测试
9. **FTS5 全文搜索** — SQL 查询、排名、分页逻辑未验证
10. **MCP Pool** — fingerprint 失效、idle 扫描、crash 恢复缺少集成测试
11. **Config 三层解析** (`useResolvedConfig`) — Agent > Project > Global 合并逻辑无测试

#### P2 — 缺少的 E2E 场景

12. **Code 执行 E2E** — Agent 调用 bash tool 执行 Python/Node 代码
13. **Permission 模式 E2E** — 切换 sandbox 模式后的行为差异
14. **错误恢复 E2E** — 服务器崩溃、网络断开、超时处理

---

## 二、API Key 与测试环境

### 2.1 Key 来源

项目根目录 `.env` 包含所有 provider 的 API key：

```
AI_GATEWAY_API_KEY=...    # Vercel AI Gateway
OPENAI_API_KEY=...        # OpenAI (gpt-5-mini)
ANTHROPIC_API_KEY=...     # Anthropic (claude-haiku-4-5)
GOOGLE_API_KEY=...        # Google (gemini-2.5-flash)
ACTIVE_PROVIDER=google    # 默认 provider
```

### 2.2 Key 流转路径

```
.env (根目录)
  ↓ 测试 helper 读取
GlobalSettings.providers[].apiKey
  ↓
resolveModel(settings, agentConfig)
  ↓
createGoogle/OpenAI/Anthropic({ apiKey })
  ↓
streamText(model, messages, tools)
```

服务端不直接读 `.env`，通过 `GlobalSettings.providers[]` 传入。测试需要 helper 桥接。

### 2.3 测试分层

```
pnpm test           → 纯 mock 单元/集成测试（CI 必跑，无需 API key）
pnpm test:live      → 真实 API 调用测试（需要 .env 中的 key）
pnpm test:e2e       → E2E smoke + server（无需 key）
pnpm test:e2e:ai    → E2E 含真实 AI（需要 key）
```

### 2.4 测试基础设施（前置依赖）

所有 Phase 共享的基础设施，在 Phase 1 开始时首先建设：

```
packages/server/src/test/
├── helpers.ts          (已有) createTestDb, createTmpDir
├── live-settings.ts    (新增) loadLiveSettings, describeWithApiKey
└── route-helpers.ts    (新增) createTestApp (含 mock storage 的 Hono app)
```

- `live-settings.ts`: 读取根目录 `.env` → 构建 `GlobalSettings`，无 key 时自动 skip
- `route-helpers.ts`: 创建带 mock storage 的完整 Hono app，用于路由集成测试
- vitest.config.ts 追加 `envDir: '../../'` 以加载根 `.env`

---

## 三、Phase 详细计划

### Phase 0: 测试基础设施 [前置]

| # | 任务 | 文件 | 说明 |
|---|------|------|------|
| 0.1 | 创建 live-settings helper | `packages/server/src/test/live-settings.ts` | 读 `.env` → `GlobalSettings`，支持 `describeWithApiKey` |
| 0.2 | 创建 route-helpers | `packages/server/src/test/route-helpers.ts` | `createTestApp()` 工厂：注入 mock storage 的 Hono app |
| 0.3 | 更新 vitest.config.ts | `packages/server/vitest.config.ts` | 追加 envDir, live test include 模式 |
| 0.4 | 更新 package.json 脚本 | `packages/server/package.json` + 根 `package.json` | 新增 `test:live` 命令 |

---

### Phase 1: Server Route 集成测试 [最高优先级]

使用 Hono `app.request()` 做 HTTP 级集成测试，mock storage 层，不启动真正的服务器。

| # | 任务 | 新增文件 | 测试点 |
|---|------|----------|--------|
| 1.1 | Chat 路由测试 | `routes/chat.test.ts` | 正常消息流(mock streamText)、工具加载验证、消息持久化(user+assistant)、去重、ensureCleanup 只一次、错误(agent不存在/消息格式错/流中断)、abort signal |
| 1.2 | Projects 路由测试 | `routes/projects.test.ts` | CRUD 全流程、删除行为、404 |
| 1.3 | Agents 路由测试 | `routes/agents.test.ts` | CRUD + projectId 关联、删除级联(mainAgentId)、归属验证 |
| 1.4 | Conversations 路由测试 | `routes/conversations.test.ts` | CRUD + 消息列表、FTS5 搜索(中文/英文/分页/排名)、saveMessage 去重、lastMessageAt 更新 |
| 1.5 | Tasks 路由测试 | `routes/tasks.test.ts` | 列表 + 日志(cursor 分页)、取消 |
| 1.6 | Skills 路由测试 | `routes/skills.test.ts` | CRUD、ZIP 导入(frontmatter 解析/资源提取)、agent 引用检查 |
| 1.7 | Permissions 路由测试 | `routes/permissions-config.test.ts` | CRUD + 验证、default 不可改、复制、非法配置拒绝 |
| 1.8 | Runtime 路由测试 | `routes/runtime.test.ts` | 状态查询、Python 包管理(安装/卸载/列表/重置)、venv 不存在时行为 |
| 1.9 | Settings 路由测试 | `routes/settings.test.ts` | GET + PATCH |
| 1.10 | Artifacts 路由测试 | `routes/artifacts.test.ts` | CRUD |
| 1.11 | Memories 路由测试 | `routes/memories.test.ts` | CRUD |
| 1.12 | CronJobs 路由测试 | `routes/cronjobs.test.ts` | CRUD |
| 1.13 | Dashboard 路由测试 | `routes/dashboard.test.ts` | summary/agents/tasks/feed |

---

### Phase 2: Permission & Sandbox 集成测试

| # | 任务 | 新增文件 | 测试点 |
|---|------|----------|--------|
| 2.1 | Permission 解析测试 | `agent/resolve-permissions.test.ts` | 默认配置、模板展开 `{{workspaceDir}}`/`{{projectRuntimeDir}}`、平台感知(win32 剥离)、mandatory deny 不可覆盖、空配置 fallback |
| 2.2 | Builtin tools 集成增强 | `agent/builtin-tools.integration.test.ts` | 增加: restricted 模式文件挂载、sandbox 模式包装验证、unrestricted 直接执行、权限过滤实际生效、command blacklist |
| 2.3 | Sandbox 集成测试 | `agent/sandbox-integration.test.ts` | SandboxPool→Worker 通信、配置变更重建 Worker、Worker crash lazy 恢复、并发命令、超时(120s) + 输出截断(1MB) |
| 2.4 | MCP Pool 集成测试 | `agent/mcp-pool.integration.test.ts` | 连接建立 + tool 获取、fingerprint 重连、idle 超时(mock timer)、sandbox 命令包装、restricted 阻断 stdio、并发 getTools 去重 |

---

### Phase 3: Code Runtime 集成 + Live Agent 测试

| # | 任务 | 新增文件 | 测试点 |
|---|------|----------|--------|
| 3.1 | Python 集成测试 | `runtime/python-integration.test.ts` | venv 创建(tmp dir)、包安装(pip install 真实执行)、包列表、包卸载、venv 重置、多项目隔离、错误(无效包名) |
| 3.2 | Node 集成测试 | `runtime/node-integration.test.ts` | 运行时状态检测、版本号正确、npm 可用 |
| 3.3 | Env builder 集成测试 | `runtime/env-builder.integration.test.ts` | PATH 拼接(venv bin + node bin + 原始)、PIP_CACHE_DIR、VIRTUAL_ENV、MCP 环境 |
| 3.4 | Model live 测试 | `agent/model.live.test.ts` | Google/OpenAI/Anthropic 真实 resolveModel + doGenerate 返回文本 |
| 3.5 | Agent 执行 live 测试 | `agent/agent-execution.live.test.ts` | 纯文本对话、bash tool 调用(`echo hello`)、Python 代码执行、Node.js 代码执行、多轮上下文保持 |
| 3.6 | Sandbox 模式 live 测试 | `agent/sandbox-modes.live.test.ts` | unrestricted 执行成功、sandbox denyRead 拒绝、restricted just-bash 运行、命令黑名单拒绝 |

---

### Phase 4: UI Service & Hook & 页面测试

| # | 任务 | 新增文件 | 测试点 |
|---|------|----------|--------|
| 4.1 | HTTP Service 测试 | `services/http/services.test.ts` | 12 个 HTTP service 请求格式(mock fetch)、Bearer token 附加、4xx/5xx → HttpError、网络错误、body 序列化 |
| 4.2 | Hooks 测试增强 | `hooks/hooks.test.ts` | useResolvedConfig 三层合并(5 种场景)、usePermissionMode、usePermissionConfig(含 sandboxSupported)、detectPlatform |
| 4.3 | Chat instances 增强 | `lib/chat-instances.test.ts` | 缓存命中/创建、server vs mock transport、destroyChat 停止流、destroyAllChats 项目切换、消息格式转换 |
| 4.4 | AgentDetailPage 测试 | `pages/agent/AgentDetailPage.test.tsx` | 6 tab 渲染切换、system prompt 编辑保存、skill 添加/移除、tool 开关(bash 始终开启)、MCP 分配+安全警告、sub-agent 管理、model config 覆盖 |
| 4.5 | ProjectSettingsPage 测试 | `pages/project/ProjectSettingsPage.test.tsx` | Main agent 选择、provider override、permission 模式切换 |

---

### Phase 5: E2E 测试增强

| # | 任务 | 新增文件 | 测试点 |
|---|------|----------|--------|
| 5.1 | Code 执行 E2E | `e2e/server/code-execution.spec.ts` | 发送 Python 代码执行请求 → 验证输出、Node.js 代码执行、pip install 后执行、超时处理 |
| 5.2 | Permission 模式 E2E | `e2e/server/permission-modes.spec.ts` | sandbox 路径受限、restricted 阻断 stdio MCP、unrestricted 红色边框、模式切换行为变化 |
| 5.3 | Runtime 管理 E2E | `e2e/server/runtime-management.spec.ts` | Runtime 状态页面、Python 包安装 UI、包列表刷新 |
| 5.4 | Agent 配置 E2E | `e2e/smoke/agent-config.spec.ts` | Agent 详情 6 tab 导航、system prompt 编辑、model config 修改 |

---

### Phase 6: 构建验证

| # | 任务 | 新增文件 | 测试点 |
|---|------|----------|--------|
| 6.1 | Preflight check 测试 | `scripts/preflight-check.test.mjs` | 全部存在 → pass、缺 runtime → 明确错误、缺 server bundle → 明确错误、缺 electron-vite output → 明确错误 |
| 6.2 | Bundle 结构验证 | `scripts/bundle-server.test.mjs` | 输出目录存在、index.js 可 require、sandbox-worker.js 存在、node_modules 含关键依赖 |

---

## 四、技术方案

| 测试类型 | 工具 | 策略 |
|---------|------|------|
| Route 集成测试 | Vitest + `app.request()` | 内存中 Hono 请求，mock storage 层 |
| Sandbox 集成测试 | Vitest + 真实进程 | 需要 OS-level 验证 |
| Runtime 集成测试 | Vitest + tmp dir | 真实 venv 创建 |
| Live Agent 测试 | Vitest + 真实 API | 读 `.env` key，无 key 自动 skip |
| UI Service 测试 | Vitest + mock fetch | 拦截 HTTP 请求验证格式 |
| Hook 测试 | Vitest + renderHook | Testing Library React Hooks |
| 页面测试 | Vitest + render | Testing Library React |
| E2E 测试 | Playwright | 沿用现有三层架构 |
| 构建验证 | Node assert | 轻量脚本 |

## 五、文件命名约定

| 类型 | 命名模式 | 运行时机 |
|------|---------|---------|
| 单元/集成测试 | `*.test.ts` / `*.test.tsx` | `pnpm test` |
| 真实 API 测试 | `*.live.test.ts` | `pnpm test:live` |
| E2E 测试 | `*.spec.ts` | `pnpm test:e2e` / `pnpm test:e2e:ai` |
| 构建验证 | `*.test.mjs` | `pnpm test:build` |

## 六、预期产出

| 指标 | 当前 | 目标 |
|------|------|------|
| 测试文件总数 | 66 | ~100 |
| Server Route 测试 | 1/14 | 14/14 |
| Live Agent 测试 | 0 | 3+ |
| E2E 场景 | 8 | 12+ |
| Permission 测试 | 0 | 4+ |
| Runtime 集成测试 | 0 | 3+ |
