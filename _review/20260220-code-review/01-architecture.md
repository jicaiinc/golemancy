# 架构审查报告 — 宏观层面

**审查人**: Architecture Reviewer
**日期**: 2026-02-20
**范围**: Golemancy monorepo 整体架构与设计模式

---

## 1. Monorepo 单向依赖审查

**结论**: ✅ 通过

| 包 | 依赖关系 | 是否合规 |
|----|---------|--------|
| `@golemancy/shared` | 无 workspace 依赖 | ✅ |
| `@golemancy/tools` | → shared | ✅ |
| `@golemancy/server` | → shared, tools | ✅ |
| `@golemancy/ui` | → shared（不依赖 server、desktop） | ✅ |
| `@golemancy/desktop` | → ui, shared | ✅ |

声明的单向依赖 `desktop → ui → shared ← server ← tools` 在 `package.json` 层面得到严格遵守，无循环依赖。

---

## 2. Service Layer DI 审查

### 2.1 接口对齐

`packages/shared/src/services/interfaces.ts` 定义了 **13 个接口**：

| 接口 | container.ts 字段 | HTTP 实现 | Mock 实现 |
|-----|----------------|---------|--------|
| IProjectService | projects | HttpProjectService | MockProjectService |
| IAgentService | agents | HttpAgentService | MockAgentService |
| IConversationService | conversations | HttpConversationService | MockConversationService |
| ITaskService | tasks | HttpTaskService | MockTaskService |
| **IWorkspaceService** | workspace | HttpWorkspaceService | MockWorkspaceService |
| IMemoryService | memory | HttpMemoryService | MockMemoryService |
| ISkillService | skills | HttpSkillService | MockSkillService |
| IMCPService | mcp | HttpMCPService | MockMCPService |
| ISettingsService | settings | HttpSettingsService | MockSettingsService |
| ICronJobService | cronJobs | HttpCronJobService | MockCronJobService |
| IDashboardService | dashboard | HttpDashboardService | MockDashboardService |
| IGlobalDashboardService | globalDashboard | HttpGlobalDashboardService | MockGlobalDashboardService |
| IPermissionsConfigService | permissionsConfig | HttpPermissionsConfigService | MockPermissionsConfigService |

HTTP 与 Mock 实现均完整对齐 interfaces.ts 定义。✅

### 2.2 可选方法一致性

以下接口中含有可选方法（`?`）：
- `IMCPService.test?` — HTTP 和 Mock 均实现 ✅
- `ICronJobService.trigger?` / `listRuns?` — HTTP 和 Mock 均实现 ✅
- `IConversationService.getConversationTokenUsage?` — HTTP 实现，Mock 也实现 ✅

### 2.3 🟡 Warning: interfaces.ts 冗余中间层

`packages/ui/src/services/interfaces.ts` 仅是纯粹的重导出：

```ts
export type { IProjectService, ... } from '@golemancy/shared'
```

`container.ts` 从这个本地文件导入，而非直接从 `@golemancy/shared`。这一额外的间接层没有提供任何价值，增加了维护负担。

### 2.4 🟡 Warning: 双重服务访问模式

项目中存在两种访问服务的方式：

1. **`getServices()`** — module-level singleton（用于 Zustand store、GlobalDashboardPage）
2. **`useServiceContext()` / `useServices()`** — React Context hook（用于组件）

两者最终引用同一个底层单例对象（`configureServices()` 在 `ServiceProvider` 中同时设置两者）。
这种双重模式增加认知负担，且 `GlobalDashboardPage` 直接调用 `getServices()` 而非通过 hook，破坏了组件层的一致性约定。

---

## 3. Zustand Store 13 个 Slices 审查

### 3.1 Slice 职责划分

| Slice | 职责 | 评估 |
|-------|-----|-----|
| ProjectSlice | 项目列表与当前选中项目 | ✅ 清晰 |
| AgentSlice | 当前项目的 Agent 列表 | ✅ 清晰 |
| ConversationSlice | 对话列表与当前对话 | ✅ 清晰 |
| TaskSlice | 对话任务列表 | ✅ 清晰 |
| WorkspaceSlice | 文件目录浏览与文件预览 | ✅ 清晰 |
| MemorySlice | 记忆条目 | ✅ 清晰 |
| SkillSlice | Skill 列表 | ✅ 清晰 |
| MCPSlice | MCP Server 配置列表 | ✅ 清晰 |
| CronJobSlice | 定时任务及运行记录 | ✅ 清晰 |
| SettingsSlice | 全局设置 | ✅ 清晰 |
| UISlice | 界面状态（sidebar、chatHistory、主题） | ✅ 清晰 |
| DashboardSlice | **项目维度** Dashboard 数据 | ✅ 清晰，但见下方问题 |
| TopologySlice | 拓扑图布局坐标 | 🟡 见下方问题 |

总体无重复状态，职责划分清晰。

### 3.2 🟡 Warning: GlobalDashboard 状态不在 Store 中

`DashboardSlice` 管理**项目维度**的 dashboard（加载、时间范围、数据），但 `GlobalDashboardPage.tsx` 使用**本地 `useState`** 管理其全局 dashboard 数据，完全绕过了 store。

两个 dashboard 页面的状态管理方式不一致：
- `DashboardPage` → Zustand store，受 WebSocket stale 事件驱动
- `GlobalDashboardPage` → 组件内 useState，无 WebSocket 集成

这意味着全局 dashboard 在 AI 运行完成后不会自动刷新（`markDashboardStale` 只影响项目维度 dashboard）。

### 3.3 🟡 Warning: TopologySlice 绕过 Service Layer

`topologyLayout` 相关 actions 直接调用底层 HTTP：

```ts
// useAppStore.ts
const layout = await fetchJson<...>(`${getBaseUrl()}/api/projects/${projectId}/topology-layout`)
await fetchJson(`...`, { method: 'PUT', ... })
```

其他所有 slices 通过 `getServices()` 访问服务，而 topology 直接调用 `fetchJson` + `getBaseUrl()`，破坏了 Service Layer 抽象，导致：
- topology 无法使用 mock 服务（E2E/单元测试受影响）
- 不符合架构统一性约定

### 3.4 🟡 Warning: 主题状态双重来源

- `settings.theme` — 来自 SettingsSlice，从服务器加载
- `themeMode` — 来自 UISlice，持久化到 localStorage

`updateSettings` 同步更新两者，但 `loadSettings` 只更新 `settings` 对象，依赖已持久化的 `themeMode`。这在多窗口场景下可能导致短暂状态不一致。

---

## 4. 路由设计审查

### 4.1 路由与页面对应关系

```
/                         → ProjectListPage（或重定向）   ✅
/dashboard                → GlobalDashboardPage           ✅
/settings                 → GlobalSettingsPage             ✅
/projects/:projectId      → DashboardPage（index）         ✅
/projects/:projectId/agents         → AgentListPage        ✅
/projects/:projectId/agents/:id     → AgentDetailPage      ✅
/projects/:projectId/skills         → SkillsPage           ✅
/projects/:projectId/mcp-servers    → MCPServersPage       ✅
/projects/:projectId/chat           → ChatPage             ✅
/projects/:projectId/tasks          → TaskListPage         ✅
/projects/:projectId/cron           → CronJobsPage         ✅
/projects/:projectId/artifacts      → WorkspacePage        🟡 命名不一致
/projects/:projectId/memory         → MemoryPage           ✅
/projects/:projectId/settings       → ProjectSettingsPage  ✅
```

### 4.2 🟡 Warning: 路由名 "artifacts" 与实现名 "workspace" 不一致

路由路径为 `/artifacts`，但：
- 页面叫 `WorkspacePage`
- 服务接口叫 `IWorkspaceService`
- 服务器路由叫 `/workspace`
- Store slice 叫 `WorkspaceSlice`

这一名称不一致贯穿整个调用链（URL 层 vs 实现层），增加了维护混乱。CLAUDE.md 甚至将此服务误记为 `IArtifactService`。

### 4.3 🟢 Info: ProjectDashboardPage 未出现在路由或页面 index 中

`packages/ui/src/pages/project/ProjectDashboardPage.tsx` 未被 `pages/index.tsx` 导出，但可能被 project 子目录内部使用（作为 DashboardPage 的子组件）。需确认是否为孤儿文件。

### 4.4 缺少 Permissions Config 独立路由

`IPermissionsConfigService` 完整实现了 CRUD，但 UI 中无独立路由——权限配置管理内嵌于 ProjectSettingsPage。这是设计决策，不是 Bug，但降低了功能可发现性。

---

## 5. Electron-Server 通信架构审查

整体流程实现正确，有完善的 pitfalls 文档。

### 5.1 架构优点
- 服务器绑定 `127.0.0.1`，CORS 限制 localhost ✅
- Bearer token per-session（crypto.randomUUID）✅
- dev 环境使用系统 Node 避免 ABI 冲突 ✅
- 15 秒启动超时兜底处理 ✅
- `SIGTERM → SIGKILL` 优雅停止 ✅

### 5.2 🟢 Info: token 通过 argv 传递

server token 通过 `additionalArguments` 传递给渲染进程，因此存在于进程命令行参数中。在 macOS/Linux 上，`ps aux` 可见。对于本地单用户桌面应用风险可接受，但值得记录。

### 5.3 🟢 Info: `webRequest` 仅拦截 `/uploads/*`

自动注入 Bearer token 的 `onBeforeSendHeaders` 仅覆盖 `uploads` 路径。其他通过 `<img>` 或 fetch 发起的请求（如 workspace raw 文件 URL）需要显式包含 token 参数或另行处理。

---

## 6. Shared 包 "Zero Runtime" 声明核查

CLAUDE.md 声明 shared 是 "Pure TypeScript types + service interfaces (zero runtime)"。

**实际情况**：

| 文件 | 内容 | 是否有运行时代码 |
|-----|-----|------------|
| `types/*.ts` | 纯 interface/type 定义 | ✅ 无 |
| `services/interfaces.ts` | 纯 interface，`export type *` | ✅ 无 |
| `constants/index.ts` | `APP_VERSION`, `DEFAULT_COMPACT_THRESHOLD` 常量 | 🟡 有（常量值） |
| `constants/default-agent.ts` | `DEFAULT_AGENT_SYSTEM_PROMPT` 字符串 | 🟡 有（字符串常量） |
| `types/common.ts` | `createId<T>()` 工厂函数 | 🟡 有（函数） |
| `lib/file-categories.ts` | `getFileCategory()`, `getMimeType()`, `isTier1()` | 🟡 有（函数 + 查找表） |

### 🟡 Warning: CLAUDE.md 文档与实际不符

shared 包包含：常量值、工厂函数、文件分类工具函数——这些都是运行时代码。"zero runtime" 的表述不准确，应更新为 "无第三方依赖，仅含纯工具代码"。

---

## 7. 过度工程 / 工程不足评估

### 工程不足
1. **TopologyService 缺失**：topology 逻辑直接嵌入 store，未抽象为 Service，是唯一的架构漏洞。
2. **GlobalDashboard 无 store slice**：状态管理不统一，缺少 WebSocket 驱动的自动刷新。

### 适度工程（不需要改动）
- 品牌化 ID 类型（Branded Types）：compile-time 安全，开销极小 ✅
- Service DI + 接口分离：正确支持了 mock/http 切换 ✅
- AbortController 取消飞行中请求：合理 ✅
- Per-project SQLite 数据库：隔离合理 ✅

### 轻微过度工程
- `interfaces.ts` 纯重导出文件（可直接从 `@golemancy/shared` 导入）

---

## 8. 汇总问题清单

| 严重程度 | 问题 | 位置 |
|---------|-----|-----|
| 🟡 Warning | GlobalDashboard 状态不在 store，无 WebSocket 自动刷新 | `GlobalDashboardPage.tsx` |
| 🟡 Warning | TopologySlice 绕过 Service Layer，直接调用 fetchJson | `useAppStore.ts:840-858` |
| 🟡 Warning | 路由名 "artifacts" 与实现名 "workspace" 不一致 | `routes.tsx:45` |
| 🟡 Warning | CLAUDE.md 错误描述：IArtifactService（实为 IWorkspaceService） | `CLAUDE.md` |
| 🟡 Warning | CLAUDE.md 错误描述："12 services"（实为 13）, shared "zero runtime"（有运行时代码） | `CLAUDE.md` |
| 🟡 Warning | 双重服务访问模式（getServices vs useServiceContext），GlobalDashboardPage 混用 | `GlobalDashboardPage.tsx`, `ServiceProvider.tsx` |
| 🟡 Warning | 主题状态双重来源（settings.theme vs UISlice.themeMode） | `useAppStore.ts` |
| 🟢 Info | `packages/ui/src/services/interfaces.ts` 纯重导出，可简化 | `services/interfaces.ts` |
| 🟢 Info | `ProjectDashboardPage.tsx` 未出现在 pages/index.tsx 导出，可能为孤儿 | `pages/project/` |
| 🟢 Info | Token 通过 argv 传递（桌面应用可接受，但应文档说明） | `apps/desktop/src/main/index.ts:200` |

---

## 9. 总体评价

Golemancy 的整体架构**设计合理**：单向依赖严格执行、Service DI 层完整、路由结构清晰、Electron 通信模式文档完善。主要改进点集中在：

1. **一致性问题**（GlobalDashboard 脱离 store、Topology 绕过服务层）
2. **命名不一致**（artifacts vs workspace）
3. **文档更新**（CLAUDE.md 已过时）

无关键性安全或功能漏洞。建议优先修复 Topology Service Layer 绕过问题（影响可测试性），并在下次文档更新时同步修正 CLAUDE.md。
