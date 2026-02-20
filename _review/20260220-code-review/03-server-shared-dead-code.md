# 03 — Server & Shared 死代码检查报告

**审查范围**: `packages/shared/src/` + `packages/server/src/`
**审查日期**: 2026-02-20
**审查员**: server-shared-dead-code-hunter

---

## 图例
- 🔴 **已确认死代码** — 定义了但在生产代码中完全未被调用/导入
- 🟡 **可疑/待迁移** — 有使用但不完整、孤立或处于废弃过渡状态
- 🟢 **信息** — 设计模式说明或值得关注的架构现象

---

## 1. packages/shared/src — 类型与接口

### 🔴 `createId<T>()` 函数
- **位置**: `packages/shared/src/types/common.ts:16`
- **问题**: 已导出的泛型工厂函数，但在整个 `packages/` 中**零引用**（grep 确认只有定义本身）
- **影响**: 无功能影响，但污染公共 API 表面

```ts
// common.ts — 从未被 import
export function createId<T extends string>(value: string): Brand<string, T> {
  return value as Brand<string, T>
}
```

---

### 🔴 `ModeDegradedEvent` 接口
- **位置**: `packages/shared/src/types/agent.ts:48-53`
- **问题**: 在 `packages/shared` 中定义并导出，但 UI 和 Server 中**均无 import**
  - Server 有自己独立定义的等价类型 `WsModeDegradedEvent`（`packages/server/src/ws/events.ts:35`）
  - UI 中也没有任何引用
- **影响**: 类型重复定义 + shared 类型未被消费

```ts
// agent.ts — 无任何 import
export interface ModeDegradedEvent {
  type: 'mode_degraded'
  requestedMode: PermissionMode
  actualMode: PermissionMode
  reason: string
}
```

---

### 🔴 `SANDBOX_MANDATORY_DENY_WRITE` 常量
- **位置**: `packages/shared/src/types/permissions.ts:134-148`
- **问题**: 已导出的 `readonly string[]` 常量，在 `packages/` 中**零引用**（仅出现在 `_design/` 文档中）
- **影响**: 该常量描述"Sandbox Runtime 始终拒绝写入的路径"，但这个约束从未在应用层代码中被实际 enforce

---

### 🟡 `bash-tool-config.ts` — 整文件标注 `@deprecated` 但仍被生产代码使用
- **位置**: `packages/shared/src/types/bash-tool-config.ts`
- **问题**: 文件内所有类型全部标注 `@deprecated`，应迁移至 `permissions.ts`，但以下生产代码**仍在使用旧类型**：

| 类型 | 仍在使用的生产文件 |
|------|------------------|
| `SandboxConfig` | `anthropic-sandbox.ts`, `sandbox-pool.ts`, `builtin-tools.ts`, `mcp-pool.ts` |
| `ResolvedBashToolConfig` | `sandbox-pool.ts`, `builtin-tools.ts` |
| `FilesystemConfig` | `validate-path.ts` |

- `builtin-tools.ts` 和 `mcp-pool.ts` 各自定义了一个 `permissionsToSandboxConfig()` 桥接函数来适配旧类型，说明迁移**未完成**
- **影响**: 迁移路径不清晰；两套权限类型系统并存，维护负担重

---

### 🟡 `IWorkspaceService` 接口
- **位置**: `packages/shared/src/services/interfaces.ts:54-66`
- **问题**: 在 shared 中定义了完整的 workspace 服务接口，但：
  1. **Server 侧无实现**：workspace 路由（`routes/workspace.ts`）完全自包含，不使用任何 service 依赖注入
  2. **UI 侧有 mock 和 http 实现**，但 server 从不注入该接口
- **影响**: 该接口未被 server 路由遵循，与其他 12 个服务形成不一致的模式

---

## 2. packages/shared/src/services — 接口方法覆盖

### 🟡 `IConversationService.sendMessage` — 已实现但路由层未使用
- **位置**: `packages/shared/src/services/interfaces.ts:40`
- **问题**: 接口定义了 `sendMessage(projectId, conversationId, content)` 方法，`SqliteConversationStorage` 也已实现，但**所有 HTTP 路由均未调用此方法**
  - 消息持久化通过 `saveMessage()` 完成（带去重逻辑）
  - `sendMessage` 只在 storage 单元测试中被调用
- **影响**: 接口方法膨胀；`sendMessage` 和 `saveMessage` 功能重叠，语义不清晰

---

### 🟢 `ITaskService` 方法与实现扩展的分离
- **位置**: `storage/tasks.ts` + `interfaces.ts`
- **说明**: `ITaskService` 只有 `list` 和 `getById`，而 `SqliteConversationTaskStorage` 额外提供了 `create`、`update`、`delete`（注释明确标注"Methods for built-in tools (not in ITaskService)"）
- **评价**: 属于有意设计——built-in task tools 直接依赖具体实现，路由层通过接口访问。架构清晰，不属于死代码。

---

## 3. packages/server/src/routes — 路由注册覆盖

### 🟢 所有路由文件均已在 app.ts 注册
经逐一核查，`routes/` 目录下的全部 `.ts` 文件均已在 `packages/server/src/app.ts` 中被 `app.route(...)` 注册：

| 路由文件 | 注册路径 |
|---------|---------|
| `projects.ts` | `/api/projects` |
| `agents.ts` | `/api/projects/:projectId/agents` |
| `conversations.ts` | `/api/projects/:projectId/conversations` |
| `chat.ts` | `/api/chat` |
| `tasks.ts` | `/api/projects/:projectId/tasks` |
| `workspace.ts` | `/api/projects/:projectId/workspace` |
| `memories.ts` | `/api/projects/:projectId/memories` |
| `skills.ts` | `/api/projects/:projectId/skills` |
| `mcp.ts` | `/api/projects/:projectId/mcp-servers` |
| `settings.ts` | `/api/settings` |
| `cronjobs.ts` | `/api/projects/:projectId/cron-jobs` |
| `dashboard.ts` | `/api/projects/:projectId/dashboard` |
| `global-dashboard.ts` | `/api/dashboard`（条件注册）|
| `topology.ts` | `/api/projects/:projectId/topology-layout` |
| `permissions-config.ts` | `/api/projects/:projectId/permissions-config` |
| `runtime.ts` | `/api/projects/:projectId/runtime` |
| `sandbox.ts` | `/api/sandbox` |
| `uploads.ts` | `/api/projects/:projectId/uploads` |

✅ **无孤立路由文件**

---

## 4. packages/server/src/agent — 死代码

### 🔴 `AgentProcessManager` 类 (process.ts)
- **位置**: `packages/server/src/agent/process.ts`
- **问题**: 整个类在**生产代码中零引用**（grep 确认只在 `_docs/` 文档文件中提及）
- **附加问题**: 文件第 29 行有 `TODO` 注释：
  ```ts
  // TODO: worker.js is a placeholder — replace with actual agent worker implementation
  const workerPath = path.join(import.meta.dirname, 'worker.js')
  ```
  说明这是一个**未完成的功能骨架**，`worker.js` 文件实际上不存在（如果运行会立即崩溃）
- **影响**: 死代码 + 如果被误调用会运行时崩溃

---

## 5. packages/server/src/db — Schema 覆盖

### 🟢 所有数据表均被 storage 层查询

| 表名 | 对应 storage 文件 |
|-----|-----------------|
| `conversations` | `storage/conversations.ts` |
| `messages` | `storage/conversations.ts` |
| `conversationTasks` | `storage/tasks.ts` |
| `tokenRecords` | `storage/token-records.ts` |
| `cronJobRuns` | `storage/cron-job-runs.ts` |

✅ **无孤立表定义**

---

## 6. TODO / FIXME / HACK 注释

| 位置 | 内容 |
|------|------|
| `packages/server/src/agent/process.ts:29` | `// TODO: worker.js is a placeholder — replace with actual agent worker implementation` |

共 **1 处**（仅 server/src，shared/src 无任何此类注释）

---

## 汇总

| 级别 | 数量 | 说明 |
|------|------|------|
| 🔴 确认死代码 | 3 | `createId`、`ModeDegradedEvent`、`SANDBOX_MANDATORY_DENY_WRITE`（shared）；`AgentProcessManager`（server） |
| 🟡 可疑/待处理 | 3 | `bash-tool-config.ts` 未完成迁移；`IConversationService.sendMessage` 路由层弃用；`IWorkspaceService` server 侧无实现 |
| 🟢 信息 | 3 | ITaskService 设计分层、全路由注册完整、全表均使用 |

---

## 优先级建议

1. **高** — 清理 `AgentProcessManager`（含 worker.js TODO），避免误用后崩溃
2. **高** — 完成 `bash-tool-config.ts` 向 `permissions.ts` 的迁移（消除两套配置并存）
3. **中** — 移除 `createId`、`ModeDegradedEvent`、`SANDBOX_MANDATORY_DENY_WRITE` 等死导出
4. **低** — 厘清 `IConversationService.sendMessage` 的保留意图，或移除该接口方法
