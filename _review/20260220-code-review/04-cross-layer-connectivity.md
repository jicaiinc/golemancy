# 跨层连通性审查报告（Task #4）

审查范围：shared types ↔ server routes/storage ↔ UI http/mock services

---

## 总结

共发现 **1 个红色（运行时不匹配）**、**3 个黄色（潜在问题）**、**多项绿色（正常匹配）**。

---

## 🔴 严重不匹配

### 1. `ICronJobService.trigger` 返回类型不匹配

| 层 | 位置 | 描述 |
|---|---|---|
| 接口声明 | `shared/src/services/interfaces.ts:108` | `trigger?: (...) => Promise<CronJobRun>` |
| UI HTTP 服务 | `ui/src/services/http/services.ts:268-272` | `fetchJson<CronJobRun>(...trigger)` — 期望接收 `CronJobRun` |
| Mock 服务 | `ui/src/services/mock/services.ts:569-583` | 正确返回完整 `CronJobRun` 对象 ✓ |
| **Server 路由** | `server/src/routes/cronjobs.ts:122-134` | **实际返回 `{ ok: true, cronJobId }` — 不是 `CronJobRun`** |

**问题详情：**

Server 的 `POST /:id/trigger` 路由：
```ts
// server/src/routes/cronjobs.ts:128
return c.json({ ok: true, cronJobId })
```

`CronJobRun` 类型（`shared/src/types/cronjob.ts:21-31`）需要：`id`, `cronJobId`, `projectId`, `agentId`, `status`, `triggeredBy`, `createdAt`, `updatedAt`。

UI Store 调用链：
```ts
// ui/src/stores/useAppStore.ts:716
const run = await svc.trigger(projectId, id)
// ...
return run  // 实际值是 { ok: true, cronJobId }，但类型标注为 CronJobRun | null
```

Store 的 `triggerCronJob` 返回 `run`，TypeScript 认为类型是 `CronJobRun`，但运行时值是 `{ ok: true, cronJobId }`。目前 `CronJobsPage.tsx:190` 调用时丢弃返回值，所以没有可见的 UI bug，但任何未来依赖返回值的代码都会出错。

**建议修复：** Server trigger 路由改为触发后通过 storage 返回完整的 `CronJobRun`，或将接口的返回类型改为 `Promise<void>` 并将 Mock 服务同步。

---

## 🟡 潜在问题

### 2. `saveMessage` 接口签名 vs 实现不一致

| 层 | 签名 |
|---|---|
| 接口 | `data: { id; role; parts; content; inputTokens?: number; outputTokens?: number; provider?: string; model?: string }` |
| HTTP 服务 | `data: { id; role; parts; content }` — 缺少可选的 token/provider/model 字段 |
| Mock 服务 | 同 HTTP 服务，签名也缺少那些可选字段 |
| Server 路由 | `server/src/routes/conversations.ts:82`，也只解构 `{ id, role, parts, content }` |

**分析：**

接口定义（`shared/src/services/interfaces.ts:41`）中的 `inputTokens?`, `outputTokens?`, `provider?`, `model?` 是可选字段，但：
- HTTP 服务（`ui/src/services/http/services.ts:89`）和 Mock 服务（`ui/src/services/mock/services.ts:212`）都使用了更窄的参数类型。
- Server 路由同样不读取这些字段。

功能上不影响运行，但接口声明和实现不一致，TypeScript 类型安全依赖 bivariant 方法参数检查逃逸。建议将接口中的可选字段与实现对齐（要么都去掉，要么都加上）。

---

### 3. `WsServerEvent` 类型缺少 `pong` 响应

| 层 | 位置 | 描述 |
|---|---|---|
| Server 类型声明 | `server/src/ws/events.ts:47` | `WsServerEvent` union 不包含 `pong` |
| Server 实现 | `server/src/ws/handler.ts:54` | 直接发送 `JSON.stringify({ event: 'pong' })` — 绕过类型系统 |
| UI | `ui/src/providers/WebSocketProvider.tsx:37-40` | 监听 `data.event`，没有注册 `pong` 监听器，静默忽略 |

**分析：** 功能上没问题（UI 安全忽略），但服务端绕过了类型安全发送了一个未定义的事件。`{ event: 'pong' }` 应该加入 `WsServerEvent` union，或改为使用不同字段（如 `type: 'pong'`）以区分控制消息和业务事件。

---

### 4. Global Dashboard 路由条件注册但 UI 无保护

| 层 | 位置 | 描述 |
|---|---|---|
| Server app.ts | `server/src/app.ts:137-139` | `if (deps.globalDashboardService)` 才注册 `/api/dashboard/...` |
| UI HTTP 服务 | `ui/src/services/http/services.ts:337-360` | `HttpGlobalDashboardService` 无条件调用 `/api/dashboard/...` |

**分析：** 当 `globalDashboardService` 未提供时（例如测试或某些运行时配置），全局 Dashboard 的所有 API 调用将得到 404。UI 层无防护，会抛出未处理的异常。属于有意设计但值得关注。

---

## 🟢 正常匹配确认

### API 端点路径（Server 路由 ↔ UI HTTP 服务）

| 功能 | Server 路径 | UI 调用路径 | 状态 |
|---|---|---|---|
| Projects CRUD | `/api/projects` | 同 | ✓ |
| Agents CRUD | `/api/projects/:pid/agents` | 同 | ✓ |
| Conversations CRUD | `/api/projects/:pid/conversations` | 同 | ✓ |
| Save message | `/api/projects/:pid/conversations/:convId/messages` | 同 | ✓ |
| Get messages (paginated) | `/api/projects/:pid/conversations/:convId/messages` | 同 | ✓ |
| Search messages | `/api/projects/:pid/conversations/messages/search` | 同 | ✓ |
| Token usage | `/api/projects/:pid/conversations/:convId/token-usage` | 同 | ✓ |
| Tasks | `/api/projects/:pid/tasks` | 同 | ✓ |
| Workspace list | `/api/projects/:pid/workspace` | 同 | ✓ |
| Workspace file | `/api/projects/:pid/workspace/file` | 同 | ✓ |
| Workspace raw | `/api/projects/:pid/workspace/raw` | 同 | ✓ |
| Memories | `/api/projects/:pid/memories` | 同 | ✓ |
| Skills | `/api/projects/:pid/skills` | 同 | ✓ |
| Skills import | `/api/projects/:pid/skills/import-zip` | 同 | ✓ |
| MCP servers | `/api/projects/:pid/mcp-servers` | 同 | ✓ |
| MCP test | `/api/projects/:pid/mcp-servers/:name/test` | 同 | ✓ |
| Cron jobs | `/api/projects/:pid/cron-jobs` | 同 | ✓ |
| Cron runs (project) | `/api/projects/:pid/cron-jobs/runs` | 同 | ✓ |
| Cron runs (job) | `/api/projects/:pid/cron-jobs/:id/runs` | 同 | ✓ |
| Cron trigger | `/api/projects/:pid/cron-jobs/:id/trigger` | 同 | ✓ (但返回值不匹配 → 见 🔴) |
| Settings | `/api/settings` | 同 | ✓ |
| Settings test provider | `/api/settings/providers/:slug/test` | 同 | ✓ |
| Dashboard | `/api/projects/:pid/dashboard/...` | 同 | ✓ |
| Global Dashboard | `/api/dashboard/...` | 同 | ✓ (条件注册 → 见 🟡) |
| Permissions config | `/api/projects/:pid/permissions-config` | 同 | ✓ |
| Permissions duplicate | `/api/projects/:pid/permissions-config/:id/duplicate` | 同 | ✓ |
| Topology layout | `/api/projects/:pid/topology-layout` | 同（直接 fetch，不通过 service 层）| ✓ |

---

### WebSocket 事件名称（Server ↔ UI）

| 事件名 | Server 定义（events.ts） | UI 监听者 | 状态 |
|---|---|---|---|
| `runtime:chat_started` | `WsRuntimeEvent` | DashboardPage, GlobalDashboardPage | ✓ |
| `runtime:chat_ended` | `WsRuntimeEvent` | DashboardPage, GlobalDashboardPage | ✓ |
| `runtime:cron_started` | `WsRuntimeEvent` | DashboardPage, GlobalDashboardPage | ✓ |
| `runtime:cron_ended` | `WsRuntimeEvent` | DashboardPage, GlobalDashboardPage | ✓ |
| `agent:status_changed` | `WsAgentEvent` | ProjectLayout | ✓ |
| `token:recorded` | `WsTokenEvent` | DashboardPage, GlobalDashboardPage | ✓ |
| `mode_degraded` | `WsModeDegradedEvent` | 无监听（见 ChatPage.tsx:176 TODO 注释） | 🟡 有事件但无消费 |
| `message:start/delta/tool_call/end` | `WsMessageEvent` | 无监听（chat 用 SSE，不用 WS） | 设计意图 |

---

### Shared 类型 ↔ Server Storage 数据结构

| 类型 | 关键字段 | Server 返回 | 状态 |
|---|---|---|---|
| `DashboardSummary` | `todayTokens`, `totalAgents`, `activeChats`, `totalChats` | `storage/dashboard.ts:121-131` | ✓ |
| `DashboardAgentStats` | `agentId`, `projectId`, `projectName`, `agentName`, `model`, `status`, `totalTokens`, `conversationCount`, `taskCount`, `completedTasks`, `failedTasks`, `lastActiveAt` | `storage/dashboard.ts:219-233` | ✓ |
| `DashboardRecentChat` | `conversationId`, `projectId`, `projectName`, `agentId`, `agentName`, `title`, `messageCount`, `totalTokens`, `lastMessageAt` | `storage/dashboard.ts:279-289` | ✓ |
| `DashboardTokenTrend` | `date`, `inputTokens`, `outputTokens` | `storage/dashboard.ts:346-350` | ✓ |
| `DashboardTokenByModel` | `provider`, `model`, `inputTokens`, `outputTokens`, `callCount` | `storage/dashboard.ts:409-415` | ✓ |
| `DashboardTokenByAgent` | `agentId`, `agentName`, `inputTokens`, `outputTokens`, `callCount` | `storage/dashboard.ts:443-449` | ✓ |
| `RuntimeStatus` | `runningChats`, `runningCrons`, `upcoming`, `recentCompleted` | `storage/dashboard.ts:607` | ✓ |
| `RuntimeChatSession` | `conversationId`, `projectId`, `agentId`, `agentName`, `title`, `startedAt` | `storage/dashboard.ts:474-483` | ✓ (`projectName` 可选，project-level 实现未填充) |
| `ConversationTokenUsageResult` | `total`, `byAgent[]{agentId,name,...}`, `byModel` | `routes/conversations.ts:148-155` + `storage/token-records.ts` | ✓ (server 路由正确添加了 `name` 字段) |
| `FilePreviewData` | `absolutePath?` 为可选 | `routes/workspace.ts:106` 填充 `absolutePath` | ✓ |

---

### Shared Interfaces ↔ Server Storage 实现覆盖率

| 接口 | Server 实现文件 | 所有方法覆盖 | 状态 |
|---|---|---|---|
| `IProjectService` | `storage/projects.ts` | list, getById, create, update, delete | ✓ |
| `IAgentService` | `storage/agents.ts` | list, getById, create, update, delete | ✓ |
| `IConversationService` | `storage/conversations.ts` | list, getById, create, sendMessage, saveMessage, getMessages, searchMessages, update, delete, getConversationTokenUsage? | ✓ |
| `ITaskService` | `storage/tasks.ts` | list, getById | ✓ |
| `IMemoryService` | `storage/memories.ts` | list, create, update, delete | ✓ |
| `ISkillService` | `storage/skills.ts` | list, getById, create, update, delete, importZip | ✓ |
| `IMCPService` | `storage/mcp.ts` | list, getByName, create, update, delete, resolveNames | ✓ (test? 不在 storage 中，仅 HTTP/Mock) |
| `ISettingsService` | `storage/settings.ts` | get, update, testProvider | ✓ |
| `ICronJobService` | `storage/cronjobs.ts` | list, getById, create, update, delete, trigger?, listRuns? | ✓ |
| `IDashboardService` | `storage/dashboard.ts` | getSummary, getAgentStats, getRecentChats, getTokenTrend, getTokenByModel, getTokenByAgent, getRuntimeStatus | ✓ |
| `IGlobalDashboardService` | `storage/global-dashboard.ts` | getSummary, getTokenByModel, getTokenByAgent, getTokenByProject, getTokenTrend, getRuntimeStatus | ✓ |
| `IPermissionsConfigService` | `storage/permissions-config.ts` | list, getById, create, update, delete, duplicate | ✓ |
| `IWorkspaceService` | `routes/workspace.ts`（无独立 storage，直接 fs） | listDir, readFile, deleteFile, getFileUrl | ✓ |

---

### Mock Services 覆盖率

所有 Mock 服务（`ui/src/services/mock/services.ts`）实现了对应接口的全部方法，与 shared interfaces 完全对齐。✓

---

## 结论

- **🔴 1 个确认 bug**：`trigger` 路由返回类型与接口不符，当前 UI 代码偶然未使用返回值所以没有显现，但存在隐患。
- **🟡 3 个值得关注的潜在问题**：`saveMessage` 参数类型不一致、`pong` 事件缺类型声明、全局 Dashboard 条件注册无防护。
- **整体连通性良好**：API 路径全部匹配，WebSocket 事件名称完全一致，Dashboard/RuntimeStatus 数据结构双向吻合。
