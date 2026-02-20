# 07 — Legacy Code & Technical Debt Review

**审查者**: Legacy Code & Technical Debt Reviewer
**日期**: 2026-02-20
**范围**: 全仓库 `packages/`（ui / server / shared）

---

## 1. Legacy / 被替代但未删除的旧实现

### 🔴 [TD-01] `bash-tool-config.ts` — 整个文件已废弃，仍被广泛使用

**文件**: `packages/shared/src/types/bash-tool-config.ts`
**类型数量**: 6 个类型全部标注 `@deprecated`，注释写明"Kept temporarily for server-side code that hasn't migrated yet"

废弃类型仍在以下地方大量使用（**未完成的迁移**）：

| 废弃类型 | 当前使用位置 |
|---------|------------|
| `SandboxConfig` | `anthropic-sandbox.ts`, `sandbox-pool.ts`, `mcp-pool.ts`, `builtin-tools.ts`, 多个 test 文件 |
| `FilesystemConfig` | `validate-path.ts`, `validate-path.test.ts` |
| `ResolvedBashToolConfig` | `sandbox-pool.ts:9,300,330,371,378`, `builtin-tools.ts:13,82`, `sandbox-integration.test.ts` |
| `BashExecutionMode` | 含于 `ResolvedBashToolConfig` |
| `NetworkConfig` | 含于 `SandboxConfig` |
| `ResolvedMCPSafetyConfig` | 类型存在，已无明显消费方（需进一步确认） |

**问题**: 新的 `PermissionsConfig` / `ResolvedPermissionsConfig`（`permissions.ts`）已存在，但 `SandboxPool`、`AnthropicSandbox`、`validate-path.ts` 等运行时层尚未迁移。
**影响**: 双套类型系统并存，增加认知负担；迁移随时可能失控。

---

### 🔴 [TD-02] `permissionsToSandboxConfig` adapter — 两处 copy-paste，无共享抽象

**位置 1**: `packages/server/src/agent/builtin-tools.ts:146-160`
**位置 2**: `packages/server/src/agent/mcp-pool.ts:190-204`

两个函数代码完全相同（已逐行比对），均注明"This adapter will be removed when the runtime layer is migrated"。当前一处修改不会同步到另一处，存在漂移风险。

```typescript
// builtin-tools.ts:146 ≡ mcp-pool.ts:190 — 完全相同
function permissionsToSandboxConfig(pc: PermissionsConfig): SandboxConfig {
  return {
    filesystem: { allowWrite: pc.allowWrite, denyRead: pc.denyRead, denyWrite: pc.denyWrite, allowGitConfig: false },
    network: { allowedDomains: pc.networkRestrictionsEnabled ? pc.allowedDomains : undefined },
    enablePython: true,
    deniedCommands: pc.deniedCommands,
  }
}
```

**建议**: 提取到 `packages/server/src/agent/permissions-adapter.ts`，或直接推进运行时迁移。

---

### 🔴 [TD-03] `AgentProcessManager` (`process.ts`) — 从未被使用的占位实现

**文件**: `packages/server/src/agent/process.ts`
**问题**: 整个 `AgentProcessManager` 类在仓库中**没有任何导入或使用**（全局搜索无结果）。类内有关键 TODO：

```typescript
// process.ts:29-30
// TODO: worker.js is a placeholder — replace with actual agent worker implementation
const workerPath = path.join(import.meta.dirname, 'worker.js')
```

`worker.js` 文件不存在，运行时调用 `spawnAgent()` 将立即崩溃。
**结论**: 该文件是从未完成的功能的残骸，属于"设计遗留代码"。

---

## 2. 技术债务

### 🟡 [TD-04] 三对工具函数完全重复（dashboard 模块）

#### 2a. Storage 层

**位置 1**: `packages/server/src/storage/dashboard.ts:25-53`
**位置 2**: `packages/server/src/storage/global-dashboard.ts:24-53`

以下三个函数**逐字相同**：
- `toLocalDate(d: Date): string`
- `localMidnightIso(d: Date): string`
- `timeRangeToDate(range?: TimeRange): string | undefined`

#### 2b. Routes 层

**位置 1**: `packages/server/src/routes/dashboard.ts:7-9`
**位置 2**: `packages/server/src/routes/global-dashboard.ts:7-9`

```typescript
function parseTimeRange(raw?: string): TimeRange | undefined {
  if (raw === 'today' || raw === '7d' || raw === '30d' || raw === 'all') return raw
  return undefined
}
```

**建议**: 提取到 `packages/server/src/utils/time-range.ts`，四个文件统一导入。

---

### 🔴 [TD-05] Token 双表查询遗漏 — `recentCompleted` 中的 `total_tokens` 只查 `token_records`

项目规范要求所有 token 查询使用 `UNION ALL` 双表模式（`token_records` + messages fallback）。
以下两处**违反**该规范，对旧数据（无 token_record 的历史对话）显示 0 tokens：

**位置 1**: `packages/server/src/storage/dashboard.ts:582`
```sql
COALESCE((SELECT SUM(input_tokens + output_tokens) FROM token_records WHERE conversation_id = c.id), 0) as total_tokens
```

**位置 2**: `packages/server/src/storage/global-dashboard.ts:484`
```sql
COALESCE((SELECT SUM(input_tokens + output_tokens) FROM token_records WHERE conversation_id = c.id), 0) as total_tokens
```

正确模式应为（参考 `dashboard.ts:261-268` 的 getRecentChats 实现）：
```sql
COALESCE((SELECT SUM(total) FROM (
  SELECT (input_tokens + output_tokens) as total FROM token_records WHERE conversation_id = c.id
  UNION ALL
  SELECT (m2.input_tokens + m2.output_tokens) as total FROM messages m2
  WHERE m2.conversation_id = c.id AND m2.input_tokens > 0
    AND NOT EXISTS (SELECT 1 FROM token_records tr WHERE tr.message_id = m2.id)
)), 0) as total_tokens
```

---

### 🔴 [TD-06] `global-dashboard.ts:getTokenByProject` — 完全遗漏 messages fallback

**文件**: `packages/server/src/storage/global-dashboard.ts:221-223`

```typescript
const rows = db.all<{ inp: number; out: number; cnt: number }>(
  sql`SELECT COALESCE(SUM(input_tokens), 0) as inp, COALESCE(SUM(output_tokens), 0) as out, count(*) as cnt
           FROM token_records WHERE 1=1${dateCondition}`,
)
```

`getTokenByProject` 函数（第 212-241 行）**完全只查 `token_records`**，没有任何 messages 表的 fallback。与其他所有 token 查询（getSummary、getTokenByModel、getTokenByAgent、getTokenTrend）的模式不一致。对于旧项目（历史数据在 messages 表）会严重低报 token 使用量。

---

### 🟡 [TD-07] Magic Number — `process.ts:64` 中的 5000ms

**文件**: `packages/server/src/agent/process.ts:64`

```typescript
}, 5000)  // SIGKILL grace period
```

应提取为具名常量 `const AGENT_KILL_GRACE_MS = 5_000`（参考同文件模式，以及 `sandbox-pool.ts` 中的 `IPC_TIMEOUT_MS`、`mcp-pool.ts` 中的 `DEFAULT_IDLE_SCAN_INTERVAL_MS`）。

---

## 3. 不优雅的实现

### 🟡 [TD-08] `dashboard.ts` / `global-dashboard.ts` — 过长文件，getRuntimeStatus 超 150 行

- `packages/server/src/storage/dashboard.ts`: 609 行，`getRuntimeStatus` 方法从第 456 行到第 608 行（~152 行），单方法逻辑复杂。
- `packages/server/src/storage/global-dashboard.ts`: 512 行，`getRuntimeStatus` 方法从第 342 行到第 511 行（~169 行），for 循环嵌套多层 try/catch + 子查询。

两个方法实现类似逻辑（running chats → running crons → upcoming crons → recent completed），代码结构高度相似但无法复用（per-project vs global 有细微差异）。

---

### 🟡 [TD-09] 大量 `as any` 类型转换，应使用具名 branded type

**文件**: `dashboard.ts` 和 `global-dashboard.ts`
**出现位置**（部分）：

```typescript
// dashboard.ts:280, 283, 284, 476, 507, 575
conversationId: row.id as any,
agentId: row.agent_id as any,
cronJobId: row.cron_job_id as any,

// global-dashboard.ts:376, 405, 477
conversationId: entry.conversationId as any,
cronJobId: row.cron_job_id as any,
```

这些应使用 `row.id as ConversationId`、`row.agent_id as AgentId`、`row.cron_job_id as CronJobId` 等具名 branded type，利用 TypeScript 类型检查保护。

---

### 🟢 [TD-10] Dashboard 注释仍用旧名称 "Runtime Status"

**文件**: `packages/ui/src/pages/dashboard/DashboardPage.tsx:240`

```tsx
{/* Section 3: Runtime Status */}
```

根据 commit 历史，面板已从 "Runtime Status" 改名为 "Activity"（组件内标题已更新为 `ACTIVITY`），但 JSX 注释和内部状态名（`dashboardRuntimeStatus`、`loadRuntimeStatus`、`RuntimeStatusPanel`、`RuntimeStatus` 类型）仍使用旧名称，造成概念割裂。

这是纯命名一致性问题，不影响运行，但影响可读性。

---

## 4. 摘要表

| 编号 | 级别 | 类别 | 位置 | 描述 |
|------|------|------|------|------|
| TD-01 | 🔴 | Legacy | `shared/types/bash-tool-config.ts` | 整文件 @deprecated，运行时仍大量引用，迁移未完成 |
| TD-02 | 🔴 | Legacy | `agent/builtin-tools.ts:146` + `agent/mcp-pool.ts:190` | `permissionsToSandboxConfig` adapter 复制两份 |
| TD-03 | 🔴 | Legacy | `agent/process.ts` | `AgentProcessManager` 从未使用，worker.js 不存在 |
| TD-04 | 🟡 | 重复 | `storage/dashboard.ts` + `storage/global-dashboard.ts` + 两 routes | 三对工具函数完全相同 |
| TD-05 | 🔴 | Token双表 | `storage/dashboard.ts:582`, `global-dashboard.ts:484` | `recentCompleted.total_tokens` 遗漏 messages fallback |
| TD-06 | 🔴 | Token双表 | `storage/global-dashboard.ts:221-223` | `getTokenByProject` 完全无 messages fallback |
| TD-07 | 🟡 | Magic# | `agent/process.ts:64` | `5000` ms 应提取为具名常量 |
| TD-08 | 🟡 | 复杂度 | `storage/dashboard.ts:456`, `global-dashboard.ts:342` | `getRuntimeStatus` 超 150 行，逻辑可分解 |
| TD-09 | 🟡 | 类型安全 | `storage/dashboard.ts`, `global-dashboard.ts` | 多处 `as any` 应改用具名 branded type |
| TD-10 | 🟢 | 命名 | `DashboardPage.tsx:240` + 多处 | Runtime Status → Activity 改名不彻底 |

---

## 5. 重点关注：Token 双表查询覆盖性

| 查询方法 | dashboard.ts | global-dashboard.ts | 正确性 |
|---------|-------------|---------------------|--------|
| getSummary | ✅ UNION ALL | ✅ UNION ALL | 正确 |
| getAgentStats | ✅ UNION ALL | ✅ UNION ALL | 正确 |
| getRecentChats | ✅ UNION ALL | N/A | 正确 |
| getTokenTrend | ✅ UNION ALL | ✅ UNION ALL | 正确 |
| getTokenByModel | ✅ UNION ALL | ✅ UNION ALL | 正确 |
| getTokenByAgent | ✅ UNION ALL | ✅ UNION ALL | 正确 |
| **getTokenByProject** | N/A | ❌ 仅 token_records | **缺失** |
| **getRuntimeStatus (recent.totalTokens)** | ❌ 仅 token_records | ❌ 仅 token_records | **缺失** |

---

*文档完成时间: 2026-02-20*
