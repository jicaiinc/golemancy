# 代码审查汇总报告

**日期**: 2026-02-20
**审查团队**: 7 名审查员并发执行，Team Lead 逐一验证
**范围**: 全仓库 packages/ + apps/

---

## 统计概览

| 严重级别 | 数量 | 描述 |
|---------|------|------|
| 🔴 Critical / Confirmed Bug | 11 | 需要立即修复 |
| 🟡 Warning / Suspicious | 16 | 应当处理 |
| 🟢 Info / Minor | 8 | 锦上添花 |

---

## 🔴 Critical — 需要立即修复

### BUG 类（运行时影响）

#### 1. SQL 歧义列名 `created_at`（getTokenByAgent UNION ALL）
- **位置**: `server/storage/dashboard.ts:434`, `server/storage/global-dashboard.ts:188`
- **来源**: Task #6 (server-bug-hunter), Team Lead 验证 ✅
- **描述**: `getTokenByAgent()` 的 UNION ALL 子查询中，`messages JOIN conversations` 部分的 `dateCondition`（`AND created_at >= ?`）未加表别名。两张表都有 `created_at`，SQLite 报 "ambiguous column name"。catch 吞掉错误返回 `[]`。
- **影响**: 选择 Today/7d/30d 时 By Agent 数据为空（All Time 不受影响，因为 dateCondition 为空）
- **修复**: `dateCondition` 在 messages 子查询中改为 `AND m.created_at >= ?`

#### 2. Token 双表遗漏 — `recentCompleted.totalTokens`
- **位置**: `server/storage/dashboard.ts:582`, `server/storage/global-dashboard.ts:484`
- **来源**: Task #7 (legacy-reviewer), Team Lead 验证 ✅
- **描述**: Activity 面板 Recent tab 中每个条目的 `totalTokens` 只查 `token_records`，未加 messages fallback
- **影响**: 旧对话（数据仅在 messages 表）的 token 显示为 0

#### 3. Token 双表遗漏 — `getTokenByProject`
- **位置**: `server/storage/global-dashboard.ts:221-223`
- **来源**: Task #7 (legacy-reviewer), Team Lead 验证 ✅
- **描述**: Global Dashboard 的 By Project 视图完全只查 `token_records`，无 UNION ALL
- **影响**: 旧项目的 token 数据严重低报

#### 4. `ICronJobService.trigger` 返回类型不匹配
- **位置**: `server/routes/cronjobs.ts:128`
- **来源**: Task #4 (connectivity-reviewer), Team Lead 验证 ✅
- **描述**: 接口声明返回 `CronJobRun`，server 实际返回 `{ ok: true, cronJobId }`
- **影响**: 当前 UI 偶然未使用返回值，无可见 bug，但任何未来依赖返回值的代码会出错

#### 5. bodyLimit 中间件冲突
- **位置**: `server/app.ts:57-58`
- **来源**: Task #6 (server-bug-hunter), Team Lead 验证 ✅
- **描述**: `/api/chat` 注册 50MB limit，`/api/*` 注册 2MB limit，两者都匹配 chat 路由，第二个覆盖第一个
- **影响**: 含 base64 图片的聊天请求 >2MB 会被 413 拒绝

#### 6. ProjectLayout 竞态重定向
- **位置**: `ui/app/layouts/ProjectLayout.tsx:34-45`
- **来源**: Task #5 (ui-bug-hunter), Team Lead 验证 ✅
- **描述**: `projects=[]` + `projectsLoading=false` 初始状态，页面加载完成前 `exists` 为 falsy → 错误重定向到 `/`
- **影响**: 直接导航到项目 URL 时会闪烁重定向

### 死代码类（维护风险）

#### 7. `AgentProcessManager` — 死代码 + 崩溃风险
- **位置**: `server/agent/process.ts`
- **来源**: Task #3 + #7 交叉确认, Team Lead 验证 ✅
- **描述**: 整个类零引用，且依赖不存在的 `worker.js`，若被误调用会立即崩溃

#### 8. `ProjectDashboardPage` — 孤儿页面
- **位置**: `ui/pages/project/ProjectDashboardPage.tsx` (181行)
- **来源**: Task #1 + #2 交叉确认, Team Lead 验证 ✅
- **描述**: 未在 routes.tsx 注册，无任何消费者，完全无法访问

### Legacy 类（技术债务）

#### 9. `bash-tool-config.ts` 迁移未完成
- **位置**: `shared/types/bash-tool-config.ts`
- **来源**: Task #3 + #7 交叉确认, Team Lead 验证 ✅
- **描述**: 6 个类型全标 @deprecated，但 `SandboxConfig`/`ResolvedBashToolConfig`/`FilesystemConfig` 仍被 20+ 处引用

#### 10. `permissionsToSandboxConfig` copy-paste
- **位置**: `server/agent/builtin-tools.ts:146` ≡ `server/agent/mcp-pool.ts:190`
- **来源**: Task #7, Team Lead 验证 ✅
- **描述**: 完全相同的适配器函数复制两份，一处修改不会同步

#### 11. 死代码导出 — shared 包
- **位置**: `shared/types/common.ts:createId`, `shared/types/agent.ts:ModeDegradedEvent`, `shared/types/permissions.ts:SANDBOX_MANDATORY_DENY_WRITE`
- **来源**: Task #3, Team Lead 验证 ✅
- **描述**: 三个导出在全项目零引用

---

## 🟡 Warning — 应当处理

### 架构 / 设计

| # | 问题 | 位置 | 来源 |
|---|------|------|------|
| W1 | GlobalDashboard 用本地 useState，未通过 Zustand store | GlobalDashboardPage.tsx | Task #1 |
| W2 | TopologySlice 绕过 Service Layer，直接 fetchJson | useAppStore.ts:843-858 | Task #1 |
| W3 | 路由命名不一致: `/artifacts` → `WorkspacePage` | routes.tsx:45 | Task #1 |
| W4 | CLAUDE.md 过时（12→13 services, IArtifactService→IWorkspaceService） | CLAUDE.md | Task #1 |
| W5 | `services/interfaces.ts` 纯重导出无附加值 | ui/services/interfaces.ts | Task #1 |

### Bug / 可疑

| # | 问题 | 位置 | 来源 |
|---|------|------|------|
| W6 | `prevAgentCountRef` early return 跳过更新 | TopologyView.tsx:61-71 | Task #5 |
| W7 | AbortController signal 未传递给 service 调用 | useAppStore.ts:237-284 | Task #5 |
| W8 | `availableProviders.length` 代替完整引用做 useEffect 依赖 | AgentDetailPage.tsx:148-154 | Task #5 |
| W9 | `usePermissionMode`/`usePermissionConfig` 无 async 清理 | hooks/index.ts | Task #5 |
| W10 | WS `emit()` 无 try-catch，异常中断广播 | ws/handler.ts:62-69 | Task #6 |
| W11 | Sub-agent 无递归深度限制 | agent/sub-agent.ts | Task #6 |
| W12 | `saveMessage` 接口签名 vs 实现不一致 | shared → ui → server | Task #4 |
| W13 | `WsServerEvent` 类型缺少 `pong` | ws/events.ts:47 | Task #4 |
| W14 | Global Dashboard 条件注册无 UI 防护 | app.ts:137 + ui http services | Task #4 |

### 技术债务

| # | 问题 | 位置 | 来源 |
|---|------|------|------|
| W15 | Dashboard 工具函数重复 4 份 | dashboard.ts + global-dashboard.ts + 2 routes | Task #7 |
| W16 | 多处 `as any` 应改用 branded types | dashboard.ts, global-dashboard.ts | Task #7 |

---

## 🟢 Info — 锦上添花

| # | 问题 | 位置 | 来源 |
|---|------|------|------|
| I1 | "Runtime Status" → "Activity" 改名不彻底 | 多处 | Task #7 |
| I2 | `motion.ts` 4 个动画预设未使用 | lib/motion.ts | Task #2 |
| I3 | `useProjectAgents` hook 零消费 | hooks/index.ts | Task #2 |
| I4 | `clearWorkspace()` / `markDashboardStale()` store action 零调用 | useAppStore.ts | Task #2 |
| I5 | `PixelProgress` / `PixelTooltip` 仅测试使用 | components/ | Task #2 |
| I6 | `components/project/index.ts` 空桶文件 | components/project/index.ts | Task #2 |
| I7 | `relativeTime` 6 处重复实现 | 多处 | Task #2 |
| I8 | `updatedAt` 硬编码为 `createdAt` | conversations storage | Task #6 |

---

## Token 双表查询完整性检查

此次审查的核心发现之一是 token 数据查询模式的一致性问题。项目使用两张表存储 token 数据：`token_records`（新）和 `messages`（旧），所有查询必须 UNION ALL。

| 查询方法 | dashboard.ts | global-dashboard.ts | 状态 |
|---------|-------------|---------------------|------|
| getSummary | ✅ UNION ALL | ✅ UNION ALL | 正确 |
| getAgentStats | ✅ UNION ALL | ✅ UNION ALL | 正确 |
| getRecentChats | ✅ UNION ALL | N/A | 正确 |
| getTokenTrend | ✅ UNION ALL | ✅ UNION ALL | 正确 |
| getTokenByModel | ✅ UNION ALL | ✅ UNION ALL | 正确 |
| getTokenByAgent | ⚠️ 有但 created_at 歧义 | ⚠️ 有但 created_at 歧义 | **BUG #1** |
| getTokenByProject | N/A | ❌ 仅 token_records | **BUG #3** |
| getRuntimeStatus (recent.totalTokens) | ❌ 仅 token_records | ❌ 仅 token_records | **BUG #2** |

---

## 修复优先级建议

### P0 — 立即修复（影响用户可见功能）
1. **BUG #1**: `getTokenByAgent` SQL 歧义 → 加 `m.` 前缀
2. **BUG #2**: `recentCompleted.totalTokens` → 加 UNION ALL
3. **BUG #3**: `getTokenByProject` → 加 UNION ALL
4. **BUG #5**: `bodyLimit` 冲突 → 调整中间件顺序或合并
5. **BUG #6**: `ProjectLayout` 竞态 → 检查 `projectsLoading`

### P1 — 尽快修复（代码质量 + 防止未来 bug）
6. **BUG #4**: `trigger` 返回类型
7. **BUG #7**: 删除 `AgentProcessManager` 死代码
8. **BUG #8**: 删除 `ProjectDashboardPage` 孤儿页面
9. **W6**: `prevAgentCountRef` early return bug
10. **W2**: TopologySlice 绕过 Service Layer

### P2 — 计划内处理（技术债务清理）
11. `bash-tool-config.ts` 迁移完成
12. `permissionsToSandboxConfig` 抽象去重
13. Dashboard 工具函数去重
14. `as any` → branded types
15. 其他死代码清理

---

## 审查文档索引

| 文件 | 审查员 | 内容 |
|------|--------|------|
| `01-architecture.md` | arch-reviewer | 架构 & 设计模式 |
| `02-ui-dead-code.md` | ui-dead-code | UI 死代码 & 未引用导出 |
| `03-server-shared-dead-code.md` | server-dead-code | Server & Shared 死代码 |
| `04-cross-layer-connectivity.md` | connectivity-reviewer | 跨层连通性 |
| `05-ui-bugs.md` | ui-bug-hunter | UI Bug |
| `06-server-bugs.md` | server-bug-hunter | Server Bug |
| `07-legacy-tech-debt.md` | legacy-reviewer | Legacy & 技术债务 |
| `00-summary.md` | Team Lead | 本汇总报告 |

所有发现均经 Team Lead 独立验证。每项发现标注了来源 Task 编号，可追溯到对应审查员的详细报告。
