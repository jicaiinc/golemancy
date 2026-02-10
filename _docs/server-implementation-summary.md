# SoloCraft Agent Server 实现总结

> **阶段**: Server 接入（UI-First → 真实后端）
> **状态**: 基础实现完成 + Code Review 修复
> **验证**: TypeScript 0 错误 · 196 server 测试 + 233 UI 测试全部通过

---

## 一、概述

在 UI-First 阶段完成后（11 页面 + 13 组件 + 8 个 Mock Service），本阶段实现了 **Agent Server** —— 为 SoloCraft 提供真实的数据持久化、AI 模型调用和进程管理能力。

### 本阶段做了什么

| 维度 | 内容 |
|------|------|
| **数据持久化** | SQLite（对话/消息/任务日志）+ 文件系统（项目/Agent/设置等）混合存储 |
| **HTTP API** | Hono 框架，9 个路由模块，30+ RESTful 端点 |
| **AI 运行时** | Vercel AI SDK v6 streamText，双模式 Provider（Gateway / Direct SDK） |
| **实时通信** | WebSocket Channel pub/sub，4 类事件推送 |
| **安全加固** | Auth Token、CORS 限制、loopback 绑定、FTS5 消毒、路径遍历防护 |
| **Electron 集成** | fork() 启动 Server 子进程、IPC 端口/Token 传递、graceful shutdown |
| **HTTP Client** | 8 个 Http*Service 实现，接入真实 Server |

### 核心设计原则

- **UI 零改动**：Server 实现完全对接 UI 阶段定义的 Service 接口，前端只需一行切换：`createMockServices()` → `createHttpServices(baseUrl)`
- **混合存储**：高频查询数据（消息、日志）用 SQLite，人类可读配置（项目、Agent、设置）用 JSON 文件
- **进程隔离**：Server 作为独立子进程运行，与 Electron 主进程/渲染进程分离

---

## 二、技术栈

| 分类 | 技术 | 版本 | 用在哪里 |
|------|------|------|---------|
| HTTP 框架 | **Hono** | 4 | Web Standards API，REST 路由 |
| HTTP 适配 | **@hono/node-server** | 1 | Node.js 环境运行 Hono |
| WebSocket | **@hono/node-ws** | 1 | 实时事件推送 |
| AI 核心 | **ai** (Vercel AI SDK) | 6 | streamText / generateText / tool / stopWhen |
| AI Provider | **@ai-sdk/anthropic** | 2 | Claude 模型 |
| AI Provider | **@ai-sdk/openai** | 2 | GPT 模型 |
| AI Provider | **@ai-sdk/google** | 2 | Gemini 模型 |
| 数据库 | **better-sqlite3** | 11 | 嵌入式 SQLite，同步驱动 |
| ORM | **drizzle-orm** | 0.45 | 类型安全 SQL + schema 定义 |
| ID 生成 | **nanoid** | 5 | 带前缀的唯一 ID |
| 验证 | **zod** | 3 | Schema 定义（预留） |
| TS 运行时 | **tsx** | 4 | dev 模式直接运行 .ts |

### 为什么选 Hono 而不是 Express

AI SDK v6 的 `streamText` 返回 Web Standard `Response` 对象。Hono 原生基于 Web Standards（Request / Response），可以直接返回；Express 需要额外转换。

---

## 三、分包变更

### 新增 `packages/server/`

```
desktop ──依赖──→ ui ──依赖──→ shared ←──依赖── server
                  ↑                              ↑
            React / Zustand              Hono / Drizzle / AI SDK
```

- `shared`：从纯类型包升级为 **类型 + 接口** 包 — 8 个 I\*Service 接口从 `packages/ui/` 迁移至此
- `server`：新包，实现全部 Service 接口的真实版本
- `ui`：新增 `services/http/` 目录，8 个 HTTP 客户端实现

### 接口迁移

```
Phase 1:  ui/services/interfaces.ts  → 定义 8 个接口
Phase 2:  shared/services/interfaces.ts → 接口迁移到 shared
          ui/services/interfaces.ts     → re-export from @solocraft/shared
          server/                       → 直接 import from @solocraft/shared
```

迁移原因：`packages/server/` 需要实现这些接口，但不能依赖 `packages/ui/`（会形成循环依赖）。

---

## 四、目录结构

```
packages/server/
├── package.json                 @solocraft/server
├── tsconfig.json                ES2022 + ESNext module
└── src/
    ├── index.ts                 入口：初始化 DB → 构造依赖 → 启动 Hono
    ├── app.ts                   Hono app 工厂：CORS + Auth + 错误处理 + 路由注册
    │
    ├── db/                      SQLite 数据层
    │   ├── schema.ts            Drizzle 表定义（conversations / messages / taskLogs）
    │   ├── client.ts            连接 + WAL + synchronous=NORMAL + foreign_keys
    │   ├── fts.ts               FTS5 虚拟表 + 3 个同步触发器
    │   └── migrate.ts           DDL 初始化（CREATE TABLE IF NOT EXISTS）
    │
    ├── storage/                 Service 实现层（7 个 File + 1 个 SQLite）
    │   ├── base.ts              共享工具：readJson / writeJson / listJsonFiles / isNodeError
    │   ├── projects.ts          FileProjectStorage — 文件系统
    │   ├── agents.ts            FileAgentStorage — 文件系统
    │   ├── conversations.ts     SqliteConversationStorage — SQLite + FTS5
    │   ├── tasks.ts             FileTaskStorage — 文件 + SQLite（日志）
    │   ├── artifacts.ts         FileArtifactStorage — 文件系统
    │   ├── memories.ts          FileMemoryStorage — 文件系统
    │   └── settings.ts          FileSettingsStorage — 文件系统
    │
    ├── routes/                  HTTP 路由层（9 个模块）
    │   ├── projects.ts          /api/projects — CRUD
    │   ├── agents.ts            /api/projects/:pid/agents — CRUD
    │   ├── conversations.ts     /api/projects/:pid/conversations — CRUD + 分页 + 搜索
    │   ├── tasks.ts             /api/projects/:pid/tasks — 列表 + 取消 + 日志
    │   ├── artifacts.ts         /api/projects/:pid/artifacts — 列表 + 删除
    │   ├── memories.ts          /api/projects/:pid/memories — CRUD
    │   ├── settings.ts          /api/settings — 读取 + 更新
    │   ├── dashboard.ts         /api/dashboard — 汇总统计
    │   └── chat.ts              /api/chat — 占位（501）
    │
    ├── agent/                   AI Agent 运行时
    │   ├── model.ts             双模式 Provider 解析（Gateway / Direct SDK）
    │   ├── runtime.ts           streamText 执行核心
    │   ├── sub-agent.ts         Agent-as-Tool 模式
    │   ├── skills.ts            Skill 工具加载
    │   └── process.ts           AgentProcessManager（fork / cancel / shutdown）
    │
    ├── ws/                      WebSocket 实时通信
    │   ├── events.ts            4 类事件类型定义
    │   └── handler.ts           WebSocketManager — Channel pub/sub
    │
    ├── utils/                   工具函数
    │   ├── paths.ts             数据目录 + ID 校验 + 路径遍历防护
    │   └── ids.ts               nanoid 带前缀 ID 生成
    │
    └── test/
        └── helpers.ts           测试工具：内存 DB + 临时目录
```

### 其他修改文件

| 文件 | 变更 |
|------|------|
| `packages/shared/src/services/interfaces.ts` | 新增：8 个接口从 ui 迁移，补充 getMessages / searchMessages / getLogs |
| `packages/shared/src/index.ts` | 新增 `export * from './services/interfaces'` |
| `packages/ui/src/services/http/` | 新增：8 个 Http\*Service + fetchJson + createHttpServices 工厂 |
| `packages/ui/src/services/interfaces.ts` | 改为 re-export from @solocraft/shared |
| `packages/ui/src/services/index.ts` | 新增 http 导出 |
| `apps/desktop/src/main/index.ts` | 重写：fork Server + IPC + Auth Token + graceful shutdown |
| `apps/desktop/src/preload/index.ts` | 新增：electronAPI（serverPort / baseUrl / token） |
| `.gitignore` | 新增 .env / .env.local / .env.\*.local |

---

## 五、数据存储设计

### 混合存储策略

```
                    ┌─────────────────────────┐
                    │     混合存储架构         │
                    ├────────────┬────────────┤
                    │  SQLite    │  文件系统   │
                    │  (查询密集) │ (人类可读)  │
                    ├────────────┼────────────┤
                    │ conversations│ projects  │
                    │ messages    │ agents    │
                    │ task_logs   │ tasks     │
                    │ messages_fts│ artifacts │
                    │             │ memories  │
                    │             │ settings  │
                    └────────────┴────────────┘
```

### 为什么这样分

| 数据 | 存在 SQLite | 原因 |
|------|------------|------|
| messages | ✅ | 高频写入、需要分页、需要全文搜索（FTS5） |
| conversations | ✅ | 与 messages 强关联（CASCADE DELETE） |
| task_logs | ✅ | 高频追加、需要游标分页 |

| 数据 | 存在文件系统 | 原因 |
|------|------------|------|
| projects | ✅ | 低频读写、JSON 可读、目录结构直观 |
| agents | ✅ | 随项目存储、配置式数据 |
| tasks | ✅ (元数据) | 状态信息为主，日志在 SQLite |
| artifacts | ✅ | 含二进制文件（图片等） |
| memories | ✅ | 低频、标签结构化 |
| settings | ✅ | 全局单例，用户可手动编辑 |

### SQLite Schema

```sql
-- 对话
CREATE TABLE conversations (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL,
  agent_id    TEXT NOT NULL,
  title       TEXT NOT NULL,
  last_message_at TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX idx_conv_project ON conversations(project_id);
CREATE INDEX idx_conv_project_agent ON conversations(project_id, agent_id);

-- 消息（级联删除）
CREATE TABLE messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,  -- user | assistant | system | tool
  content         TEXT NOT NULL,
  tool_calls      JSON,
  token_usage     JSON,
  created_at      TEXT NOT NULL
);
CREATE INDEX idx_msg_conv ON messages(conversation_id, created_at DESC);

-- 任务日志
CREATE TABLE task_logs (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id   TEXT NOT NULL,
  type      TEXT NOT NULL,  -- start | tool_call | generation | error | completed
  content   TEXT NOT NULL,
  metadata  JSON,
  timestamp TEXT NOT NULL
);
CREATE INDEX idx_tasklog_task ON task_logs(task_id, timestamp);

-- FTS5 全文搜索
CREATE VIRTUAL TABLE messages_fts USING fts5(content, content=messages, content_rowid=rowid);
-- + 3 个同步触发器（INSERT / UPDATE / DELETE）
```

### 文件系统目录结构

```
~/.solocraft/                           SOLOCRAFT_DATA_DIR
├── solocraft.db                        SQLite 数据库
├── settings.json                       全局设置
└── projects/
    └── {projectId}/
        ├── project.json                项目元数据
        ├── agents/
        │   └── {agentId}.json          Agent 配置
        ├── tasks/
        │   └── {taskId}.json           任务元数据（日志在 SQLite）
        ├── artifacts/
        │   ├── {artifactId}.meta.json  产出物元数据
        │   └── {artifactId}.{ext}      产出物文件
        ├── memory/
        │   └── {memoryId}.json         记忆条目
        └── skills/                     技能目录（预留）
```

### SQLite 优化配置

```typescript
sqlite.pragma('journal_mode = WAL')       // 并发读写
sqlite.pragma('synchronous = NORMAL')     // WAL 模式下 NORMAL 即安全，写入性能 2-5x
sqlite.pragma('foreign_keys = ON')        // 级联删除生效
```

---

## 六、HTTP API

### 路由总览

```
GET  /api/health                                        → { status: 'ok', timestamp }

     /api/projects
GET  /api/projects                                      → Project[]
GET  /api/projects/:id                                  → Project
POST /api/projects                                      → Project (201)
PATCH /api/projects/:id                                 → Project
DELETE /api/projects/:id                                → 204

     /api/projects/:projectId/agents
GET  /api/projects/:pid/agents                          → Agent[]
GET  /api/projects/:pid/agents/:id                      → Agent
POST /api/projects/:pid/agents                          → Agent (201)
PATCH /api/projects/:pid/agents/:id                     → Agent
DELETE /api/projects/:pid/agents/:id                    → 204

     /api/projects/:projectId/conversations
GET  /api/projects/:pid/conversations                   → Conversation[]        ?agentId=
GET  /api/projects/:pid/conversations/:id               → Conversation
POST /api/projects/:pid/conversations                   → Conversation (201)
DELETE /api/projects/:pid/conversations/:id              → 204
GET  /api/projects/:pid/conversations/:cid/messages     → PaginatedResult       ?page= &pageSize=
GET  /api/projects/:pid/conversations/messages/search   → PaginatedResult       ?q= &page= &pageSize=

     /api/projects/:projectId/tasks
GET  /api/projects/:pid/tasks                           → Task[]                ?agentId=
GET  /api/projects/:pid/tasks/:id                       → Task
POST /api/projects/:pid/tasks/:id/cancel                → Task
GET  /api/projects/:pid/tasks/:id/logs                  → TaskLogEntry[]        ?cursor= &limit=

     /api/projects/:projectId/artifacts
GET  /api/projects/:pid/artifacts                       → Artifact[]            ?agentId=
GET  /api/projects/:pid/artifacts/:id                   → Artifact
DELETE /api/projects/:pid/artifacts/:id                  → 204

     /api/projects/:projectId/memories
GET  /api/projects/:pid/memories                        → MemoryEntry[]
POST /api/projects/:pid/memories                        → MemoryEntry (201)
PATCH /api/projects/:pid/memories/:id                   → MemoryEntry
DELETE /api/projects/:pid/memories/:id                   → 204

     /api/settings
GET  /api/settings                                      → GlobalSettings
PATCH /api/settings                                     → GlobalSettings

     /api/dashboard
GET  /api/dashboard/summary                             → DashboardSummary
GET  /api/dashboard/active-agents                       → DashboardAgentSummary[]
GET  /api/dashboard/recent-tasks?limit=                 → DashboardTaskSummary[]
GET  /api/dashboard/activity?limit=                     → ActivityEntry[]

     /api/chat
POST /api/chat                                          → 501 Not Implemented (占位)
```

### App 工厂模式

```typescript
// packages/server/src/app.ts
export interface ServerDependencies {
  projectStorage:      IProjectService
  agentStorage:        IAgentService
  conversationStorage: IConversationService
  taskStorage:         ITaskService
  artifactStorage:     IArtifactService
  memoryStorage:       IMemoryService
  settingsStorage:     ISettingsService
  dashboardService:    IDashboardService
}

export function createApp(deps: ServerDependencies, authToken?: string): Hono
```

所有 Storage 通过 DI 注入，测试时可替换为 mock 实现。

---

## 七、Agent 运行时

### 双模式 Provider

```
用户配置                           解析结果
┌─────────────────┐
│ ACTIVE_PROVIDER  │
│ = google         │──→ createGoogleGenerativeAI({ apiKey })(modelId)
│ = openai         │──→ createOpenAI({ apiKey })(modelId)
│ = anthropic      │──→ createAnthropic({ apiKey })(modelId)
│ = custom         │──→ gateway(modelString) 或 createOpenAI({ apiKey, baseURL })(modelId)
└─────────────────┘
```

**动态导入**：Provider SDK 按需加载，不是启动时全量导入：

```typescript
case 'google': {
  const { createGoogleGenerativeAI } = await import('@ai-sdk/google')
  return createGoogleGenerativeAI({ apiKey, baseURL })(modelId)
}
```

**默认模型**：

| Provider | 默认模型 |
|----------|---------|
| google | gemini-2.5-flash |
| openai | gpt-4o-mini |
| anthropic | claude-haiku-4-5 |

### streamText 执行核心

```typescript
// packages/server/src/agent/runtime.ts
const result = streamText({
  model,                                    // resolveModel() 解析
  system: agent.systemPrompt,               // Agent 系统提示词
  messages,                                 // 对话历史
  tools,                                    // 工具集
  stopWhen: stepCountIs(10),                // 最多 10 步
  abortSignal,                              // 取消信号
  temperature: agent.modelConfig.temperature,
  maxOutputTokens: agent.modelConfig.maxTokens,
  onStepFinish: ({ toolCalls, usage }) => {
    // 每步完成后触发事件
    for (const tc of toolCalls ?? []) {
      onEvent?.({ type: 'tool_call', toolName: tc.toolName, input: tc.input })
    }
    if (usage) {
      onEvent?.({ type: 'token_usage', usage })
    }
  },
})
```

### Sub-Agent as Tool

```typescript
// packages/server/src/agent/sub-agent.ts
export function createSubAgentTool(childAgent, settings, childTools?) {
  return tool({
    description: `Delegate task to ${childAgent.name}: ${childAgent.description}`,
    parameters: z.object({
      task: z.string(),
      context: z.string().optional(),
    }),
    execute: async ({ task, context }) => {
      const model = await resolveModel(settings, childAgent.modelConfig)
      const result = await generateText({
        model,
        system: childAgent.systemPrompt,
        messages: [{ role: 'user', content: context ? `${task}\n\nContext: ${context}` : task }],
        tools: childTools,
      })
      return result.text
    },
  })
}
```

### 进程管理

```typescript
// AgentProcessManager
spawnAgent(taskId, workerData)   // fork worker，最大并发 5
cancelAgent(taskId)              // SIGTERM → 5s → SIGKILL
shutdownAll()                    // 关闭所有子进程
isRunning(taskId)                // 检查进程状态
```

---

## 八、WebSocket 实时通信

### Channel pub/sub 模型

```
Client                    Server (WebSocketManager)
  │                              │
  │── subscribe(["conv:123"]) ──→│  clients Map 记录订阅
  │                              │
  │                              │← Agent 运行中产生消息
  │←── message:delta ───────────│  emit("conv:123", event)
  │←── message:tool_call ──────│
  │←── message:end ────────────│
  │                              │
  │── unsubscribe(["conv:123"])→│
  │── ping ────────────────────→│
  │←── pong ───────────────────│
```

### 事件类型

**Server → Client**：

| 类别 | 事件 | 负载 |
|------|------|------|
| 消息 | `message:start` | conversationId, messageId |
| 消息 | `message:delta` | conversationId, messageId, delta |
| 消息 | `message:tool_call` | conversationId, messageId, toolCall |
| 消息 | `message:end` | conversationId, messageId, tokenUsage |
| 任务 | `task:started` | taskId, agentId, title |
| 任务 | `task:progress` | taskId, progress, log |
| 任务 | `task:completed` | taskId, result |
| 任务 | `task:failed` | taskId, error |
| Agent | `agent:status_changed` | agentId, status, currentTaskId |
| 系统 | `server:ready` | message |
| 系统 | `server:error` | message |

**Client → Server**：

| 类型 | 说明 |
|------|------|
| `subscribe` | 订阅 channels（如 `["conv:123", "task:456"]`） |
| `unsubscribe` | 取消订阅 |
| `ping` | 心跳检测，Server 回复 `{ event: 'pong' }` |

---

## 九、安全机制

### 安全架构总览

```
外部请求 → [127.0.0.1 绑定] → [CORS 校验] → [Bearer Token] → [ID 格式校验] → 路由处理
```

### 各层防护

| 层 | 措施 | 实现 |
|---|------|------|
| **网络层** | 仅监听 loopback | `serve({ hostname: '127.0.0.1' })` |
| **跨域层** | CORS 限制 localhost | 正则 `/^https?:\/\/(localhost\|127\.0\.0\.1)(:\d+)?$/` |
| **认证层** | Bearer Token | 启动时 `crypto.randomUUID()`，IPC 传给 Electron |
| **输入层** | ID 格式校验 | `/^[a-z]+-[A-Za-z0-9_-]+$/`，无效 ID 直接拒绝 |
| **查询层** | FTS5 消毒 | 搜索词双引号包裹 + 内部引号转义 |
| **文件层** | 路径遍历防护 | `validateFilePath()` 检查 resolved path 是否在 base 目录内 |
| **错误层** | 不泄露堆栈 | `app.onError()` 返回结构化 JSON，生产环境不含 message |

### Auth Token 流

```
Server 启动
  │
  ├── crypto.randomUUID() → authToken
  ├── createApp(deps, authToken) → Hono middleware 校验 Bearer Token
  │
  └── process.send({ type: 'ready', port, token })
       │
       ▼
Electron main process
  │
  ├── serverToken = msg.token
  │
  └── createWindow({ additionalArguments: ['--server-token=' + token] })
       │
       ▼
Preload script
  │
  └── window.electronAPI.getServerToken() → token
       │
       ▼
React app (Http*Service)
  │
  └── fetch('/api/...', { headers: { Authorization: 'Bearer ' + token } })
```

---

## 十、Electron 集成

### 启动流程

```
pnpm dev
  │
  ▼
electron-vite dev
  ├── 编译 main → apps/desktop/out/main/index.js
  ├── 编译 preload → apps/desktop/out/preload/index.mjs
  └── 启动 renderer dev server → http://localhost:5173
       │
       ▼
Electron main process (out/main/index.js)
  │
  ├── startServer()
  │   ├── serverEntry = app.getAppPath() + '/../../packages/server/src/index.ts'
  │   ├── fork(serverEntry, {
  │   │     execPath: 'node',              // 系统 Node（非 Electron 内嵌）
  │   │     execArgv: ['--import', 'tsx'],  // TypeScript 支持
  │   │     cwd: packages/server/,          // tsx 依赖解析
  │   │     env: { PORT: '0' },             // OS 分配端口
  │   │   })
  │   └── 等待 IPC 消息 { type: 'ready', port, token }
  │
  ├── createWindow()
  │   └── additionalArguments: ['--server-port=53482', '--server-token=uuid']
  │
  └── before-quit → stopServer() → SIGTERM → 5s → SIGKILL
```

### Preload API

```typescript
// window.electronAPI
{
  getServerPort(): number | null,
  getServerBaseUrl(): string | null,   // 'http://localhost:{port}'
  getServerToken(): string | null,
}
```

### 踩坑记录

详见 `_pitfalls/electron-server-fork.md`，三个关键陷阱：

1. **`__dirname` 变化** — electron-vite 编译后 `__dirname` 指向 `out/main/`，用 `app.getAppPath()` 代替
2. **tsx 找不到** — `fork()` 继承 Electron 的 cwd，tsx 在 `packages/server/node_modules/`，需设 `cwd`
3. **Native module ABI** — Electron 内嵌 Node 的 ABI 版本不同，dev 模式需用系统 `node`（`execPath: 'node'`）

---

## 十一、Service 接口演进

### 接口迁移

```
Phase 1 (UI-First):
  packages/ui/src/services/interfaces.ts → 定义 7 个接口

Phase 2 (Server):
  packages/shared/src/services/interfaces.ts → 接口迁移 + 扩展为 8 个
  packages/ui/src/services/interfaces.ts     → re-export
```

### 接口扩展

| 接口 | 新增方法 | 原因 |
|------|---------|------|
| IConversationService | `getMessages(projectId, conversationId, params)` | 分页获取消息（UI 阶段内嵌在 Conversation 对象里） |
| IConversationService | `searchMessages(projectId, query, params)` | FTS5 全文搜索 |
| ITaskService | `getLogs(taskId, cursor?, limit?)` | 游标分页获取任务日志 |

### DI 模式

**Server 端**（构造函数注入）：

```typescript
const deps: ServerDependencies = {
  projectStorage:      new FileProjectStorage(),
  agentStorage:        new FileAgentStorage(),
  conversationStorage: new SqliteConversationStorage(db),
  taskStorage:         new FileTaskStorage(db),
  // ...
}
const app = createApp(deps, authToken)
```

**UI 端**（module-level singleton）：

```typescript
const container = createHttpServices(baseUrl)
configureServices(container)
// Zustand actions: getServices().projects.list()
// React components: useServices().projects.list()
```

---

## 十二、HTTP Client 层

### 8 个 Http\*Service

| Service | 对应 API 前缀 | 说明 |
|---------|--------------|------|
| HttpProjectService | `/api/projects` | 标准 CRUD |
| HttpAgentService | `/api/projects/:pid/agents` | 项目作用域 CRUD |
| HttpConversationService | `/api/projects/:pid/conversations` | CRUD + 分页 + 搜索 |
| HttpTaskService | `/api/projects/:pid/tasks` | 列表 + 取消 + 日志 |
| HttpArtifactService | `/api/projects/:pid/artifacts` | 列表 + 详情 + 删除 |
| HttpMemoryService | `/api/projects/:pid/memories` | 标准 CRUD |
| HttpSettingsService | `/api/settings` | 全局读写 |
| HttpDashboardService | `/api/dashboard` | 汇总统计 |

### 切换方式

```typescript
// ServiceProvider.tsx — 从 Mock 切换到 HTTP
- const container = createMockServices()
+ const baseUrl = window.electronAPI?.getServerBaseUrl() ?? 'http://localhost:3000'
+ const container = createHttpServices(baseUrl)
  configureServices(container)
```

### HttpConversationService 特殊处理

```typescript
async sendMessage(...) {
  throw new Error('Use useChat() for real-time chat')
}
```

发消息不走 REST API，而是通过 AI SDK 的 `useChat` Hook + `DefaultChatTransport` 直连 Server 的流式端点。

---

## 十三、测试覆盖

| 测试文件 | 测试数 | 覆盖内容 |
|---------|--------|---------|
| `app.test.ts` | 46 | 全部 HTTP 路由：CRUD、404、分页、搜索、健康检查 |
| `storage/conversations.test.ts` | 20 | SQLite CRUD、分页、FTS5 搜索、级联删除、projectId 校验 |
| `ws/handler.test.ts` | 18 | WebSocket 连接管理、subscribe/unsubscribe、emit/broadcast |
| `db/db.test.ts` | 16 | Schema 创建、FTS5 触发器、索引、CASCADE DELETE |
| `agent/model.test.ts` | 13 | 4 个 Provider 解析、Gateway 模式、缺失配置报错 |
| `storage/agents.test.ts` | 13 | 文件 CRUD、projectId 隔离 |
| `storage/tasks.test.ts` | 13 | 文件 CRUD、批量日志查询、取消 |
| `storage/base.test.ts` | 13 | readJson / writeJson / listJsonFiles / deleteDir / isNodeError |
| `storage/projects.test.ts` | 11 | 文件 CRUD、子目录创建、删除级联 |
| `storage/memories.test.ts` | 10 | 文件 CRUD、部分更新 |
| `storage/artifacts.test.ts` | 9 | 文件 CRUD、路径遍历防护 |
| `utils/ids.test.ts` | 8 | 7 种前缀 ID 生成、格式校验 |
| `storage/settings.test.ts` | 6 | 默认值、部分更新、合并逻辑 |
| **Server 合计** | **196** | |
| **UI 合计** | **233** | |
| **总计** | **429** | |

---

## 十四、Code Review 修复

实现完成后进行了三维并行 Code Review（质量 / 安全 / 性能），共发现 35 个问题并全部修复：

### 安全修复（6 项）

| ID | 问题 | 严重度 | 修复 |
|----|------|--------|------|
| SEC-01 | FTS5 搜索查询注入 | 🔴 Critical | 双引号包裹 + 内部引号转义 |
| SEC-03 | CORS 完全开放 `origin: *` | 🟠 High | 正则限制 localhost/127.0.0.1 |
| SEC-04 | 路径遍历（ID 参数拼接路径） | 🟡 Medium | validateId() 正则校验 |
| SEC-05 | Artifact 文件删除路径遍历 | 🟡 Medium | validateFilePath() 路径包含检查 |
| SEC-07 | 无认证机制 | 🟡 Medium | Bearer Token + IPC 传递 |
| SEC-09 | 绑定 0.0.0.0 暴露局域网 | 🔵 Low | `hostname: '127.0.0.1'` |

### 质量修复（8 项）

| ID | 问题 | 修复 |
|----|------|------|
| C1 | ServerDependencies 引用具体类 | 接口补充方法 + 统一使用接口类型 |
| C2 | rowToMessage 多处 `as any` | 改为 `as MessageId`、`as ToolCallResult[]` |
| C3 | searchMessages `db.all<any>` | 定义 FtsMessageRow 接口 |
| C5 | Electron fork 路径在生产环境失效 | `app.getAppPath()` + `app.isPackaged` 分支 |
| W1 | 路由层无错误处理 | 全局 `app.onError()` 结构化 JSON |
| W4 | sendMessage/getMessages 不校验 projectId | 添加 conversation 归属验证 |
| W6 | before-quit async 不被 await | `preventDefault()` + `isQuitting` flag |
| W8 | `catch (e: any)` 模式 | `isNodeError()` 类型守卫 |

### 性能修复（6 项）

| ID | 问题 | 修复 |
|----|------|------|
| P-01 | Task N+1 查询 | 批量 `WHERE IN` + 内存分组 |
| P-02 | listJsonFiles 无限并发 | 批量 20 文件读取 |
| P-05 | AI SDK 三个 Provider 全量导入 | 动态 `import()` 按需加载 |
| P-06 | cancelAgent timer 未清理 | 保存 ref + exit 时 clearTimeout |
| P-09 | 缺 `synchronous=NORMAL` | 一行 pragma 添加 |
| S2 | WebSocket 事件用 string 而非品牌类型 | 改为 ConversationId / TaskId 等 |

---

## 十五、踩坑记录

完整记录见 `_pitfalls/electron-server-fork.md`。

### Electron fork() 启动 Server 连环三坑

| 坑 | 现象 | 根因 | 修复 |
|----|------|------|------|
| `__dirname` 错位 | 路径不存在 | electron-vite 编译改变 `__dirname` | `app.getAppPath()` |
| tsx 找不到 | `ERR_MODULE_NOT_FOUND` | fork 继承 Electron cwd，pnpm 依赖在 server 包 | `cwd: packages/server/` |
| ABI 不匹配 | `ERR_DLOPEN_FAILED` | better-sqlite3 编译给系统 Node，Electron 内嵌 Node 版本不同 | `execPath: 'node'` |

**核心教训**：单元测试无法覆盖跨进程集成。涉及 Electron + fork + native module 的改动，必须 `pnpm dev` 实际启动验证。

---

## 十六、当前限制与待实现

### 占位 / Stub

| 功能 | 状态 | 说明 |
|------|------|------|
| `POST /api/chat` | 501 占位 | 等待 `useChat` + `DefaultChatTransport` 集成 |
| DashboardService | 返回空数据 | 需要实现跨 Storage 聚合查询 |
| AgentProcessManager.worker.js | 不存在 | 需要创建 worker 入口文件 |
| dotenv | 未集成 | `.env` 文件不会自动加载，需手动传环境变量 |

### 已知安全待改进

| 功能 | 说明 |
|------|------|
| API Key 加密存储 | 当前明文存 settings.json，应使用 Electron safeStorage |
| 请求体 Schema 验证 | 所有 POST/PATCH 路由无 Zod 验证 |
| 请求体大小限制 | 无 payload size limit |
| WebSocket 认证 | 无 Token 校验 |
| WebSocket 心跳 | 无主动死连接检测 |
| 文件权限 | settings.json 默认 644，应为 600 |

### 后续路线图

| 阶段 | 内容 |
|------|------|
| **Chat 集成** | `useChat` + `DefaultChatTransport` + Server 端流式响应 |
| **Service 切换** | UI 层从 Mock 切换到 HTTP，验证端到端流程 |
| **真实 AI 调用** | 用 .env 中的 API Key 测试 Gemini/Claude/GPT |
| **Agent 生命周期** | worker.ts 实现 + AgentProcessManager 完整调度 |
| **Electron IPC** | 目录选择器、nativeTheme 同步、系统通知 |
| **Skill 系统** | createSkillTool + SKILL.md 规范 + 技能市场 |
| **浏览器自动化** | Playwright 集成 |
