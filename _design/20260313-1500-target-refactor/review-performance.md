# Performance Review — targetType + targetId Refactor

**Reviewer:** Code Reviewer-Performance
**Date:** 2026-03-13
**Scope:** All changed files in the target-refactor branch

---

## Executive Summary

本次重构在 API 层面是一次正确的简化，但在 **数据库索引设计**上存在一个严重的性能回归（P0），以及一个中等严重的迁移原子性问题（P1）。其余问题均为 P2 级别。有几处是真实的性能改进。

---

## P0 — 严重

### P0-1: 复合索引 `(target_type, target_id)` 无法被 `WHERE target_id = $1` 使用

**文件：** `db/schema.ts`, `db/migrate.ts`, `storage/dashboard.ts`, `storage/conversations.ts`

**问题：**
新建索引为复合索引：
```sql
CREATE INDEX IF NOT EXISTS idx_conversations_target ON conversations(target_type, target_id)
```

SQLite 的复合索引只支持**前缀匹配**（leading column first）。只有在查询条件包含 `target_type` 时，索引才能生效。

然而，以下所有高频查询均只过滤 `target_id`，**不包含 `target_type`**：

**dashboard.ts — `getAgentStats()`（N 个 agent 各执行 4 次，每次全表扫描）：**
```sql
-- 1. 会话计数
SELECT count(*) as cnt FROM conversations WHERE target_id = $agentId

-- 2. 消息 token 统计（join）
WHERE c.target_id = $agentId AND m.input_tokens > 0

-- 3. 任务统计（join）
WHERE c.target_id = $agentId

-- 4. 最近活跃（join）
WHERE c.target_id = $agentId
```

**conversations.ts — `list()`（Drizzle ORM）：**
```ts
if (agentId) conditions.push(eq(schema.conversations.targetId, agentId))
// 生成: WHERE target_id = $1 — 不走索引
```

**影响评估：**
- 旧索引 `idx_conversations_agent ON conversations(agent_id)` 对 `WHERE agent_id = $1` 是完全覆盖索引（index-only scan）
- 新索引对 `WHERE target_id = $1` **完全无效**，退化为全表扫描
- `getAgentStats()` 对每个 agent 执行 4 次查询 × N 个 agent，数据量大时性能呈 O(n²) 退化
- conversations 较少时（< 1000 行）感知不明显，但随数据增长线性恶化

**修复方案（二选一）：**

方案 A（推荐）：在所有查询中补充 `AND target_type = 'agent'`：
```sql
WHERE target_type = 'agent' AND target_id = $agentId
-- 现在可以用复合索引的前缀
```

方案 B：改变索引列顺序为 `(target_id, target_type)`，或额外添加单列索引 `idx_conversations_target_id ON conversations(target_id)`。

---

## P1 — 重要

### P1-1: Migration v10 缺少事务包装，存在部分迁移风险

**文件：** `db/migrate.ts`

**问题：**
Migration v10 包含 5 个连续的 DDL/DML 操作：
```ts
db.run(`ALTER TABLE conversations ADD COLUMN target_type`)  // step 1
db.run(`ALTER TABLE conversations ADD COLUMN target_id`)    // step 2
db.run(`UPDATE conversations SET target_type = ..., target_id = ...`)  // step 3
db.run(`DROP INDEX IF EXISTS idx_conversations_agent`)      // step 4
db.run(`ALTER TABLE conversations DROP COLUMN agent_id`)    // step 5
```

这些操作没有包裹在事务中。若服务器在 step 3（大表 UPDATE）执行过程中崩溃：
- `target_type` 列存在（step 1 已完成）
- 数据只部分迁移（UPDATE 未完成）
- 再次启动时，因 `hasTargetType = true`，migration 跳过
- 结果：`target_id` 列为空字符串 `DEFAULT ''`，所有未迁移行的会话无法正常加载

**影响评估：**
生产环境崩溃（电源故障、OOM kill）后数据库进入不可恢复状态，需手动干预。

**修复方案：**
将 Migration v10 的全部步骤包裹在 SQLite 事务中：
```ts
db.run(sql`BEGIN`)
try {
  // ... all migration steps ...
  db.run(sql`COMMIT`)
} catch (e) {
  db.run(sql`ROLLBACK`)
  throw e
}
```

### P1-2: `getTokenByAgent` 将 team 会话 target_id 当作 agentId 聚合

**文件：** `storage/dashboard.ts` (line ~400), `storage/global-dashboard.ts` (line ~151)

**问题：**
```sql
SELECT c.target_id as agent_id, m.input_tokens as inp, m.output_tokens as out
FROM messages m
JOIN conversations c ON c.id = m.conversation_id
WHERE m.input_tokens > 0
```

对于 `target_type = 'team'` 的会话，`target_id` 是 `TeamId`（如 `team_xxx`）。此查询把它当作 `agent_id` 用于 GROUP BY，结果：
- 团队会话的 token 被归到一个不存在于 `agentMap` 的幽灵 ID 下
- 这些 token 在 agent token 报告中消失（`agentName: 'Unknown'`），既不计入 agent 也不计入 team
- token 统计数据不准确

**修复方案：**
在此查询中加入 `WHERE c.target_type = 'agent'` 过滤，或添加逻辑将 team 会话按其 leader agent 归因。

---

## P2 — 轻微

### P2-1: normalize() 函数无写回（每次读取都重复运算）

**文件：** `storage/cronjobs.ts`, `storage/projects.ts`

**问题：**
`normalize()` 在每次 `list()`、`getById()`、`listAll()` 时对旧格式数据进行格式转换，但不写回磁盘。对于仍使用旧格式的 CronJob/Project，每次读取都会创建新对象。

**影响评估：**
CPU 影响极小（O(1) per item），但存在永不清零的持续"技术债"。若 cron job 数量大（如数百个全量扫描），加起来有少量 GC 压力。

**建议：** 可接受，但可考虑 lazy migration（首次 normalize 后写回文件）。

### P2-2: dashboard 中 team 目标的 agentName 始终为 'Unknown'

**文件：** `storage/dashboard.ts` (getRecentChats, getRuntimeStatus/upcoming)

**问题：**
```ts
// getRecentChats
agentId: (row.target_type === 'agent' ? row.target_id : '') as AgentId,
agentName: agentMap.get(row.target_id as AgentId) ?? 'Unknown',
// ↑ team 会话: agentMap 用 TeamId 查找，始终 'Unknown'

// upcoming cron jobs (global-dashboard.ts line ~402)
const resolvedAgentId = job.targetType === 'agent'
  ? job.targetId as AgentId
  : job.targetId as AgentId // team target — best-effort lookup by targetId
// ↑ 注释声称 best-effort 但实际与 agent target 走同样路径，只是 teamId 无法在 agentMap 中找到
```

**影响：** UI 中所有 team 会话的 agent 名称显示为 "Unknown"，且有一处注释具有误导性。功能不完整而非性能问题，但也会造成多余的 Map 查找（虽然代价极低）。

### P2-3: Migration v9 和 v10 重复调用 `PRAGMA table_info`

**文件：** `db/migrate.ts`

**问题：**
```ts
const convColsV9 = db.all(sql`PRAGMA table_info(conversations)`)  // v9 check
// ...
const convColsV10 = db.all(sql`PRAGMA table_info(conversations)`) // v10 check — same state
```

两次 PRAGMA 调用返回相同结果，可复用。

**影响：** 极低（PRAGMA 很快），仅代码冗余。

### P2-4: `resolveAgentId` 对未加载 team 抛异常可能引发 500

**文件：** `shared/src/utils/target.ts`, `routes/conversations.ts`

**问题：**
在 `conversations.ts` 的 compact 路由中：
```ts
let compactTeam: Awaited<ReturnType<ITeamService['getById']>> | undefined
if (conv.targetType === 'team') {
  compactTeam = (await deps.teamStorage.getById(...)) ?? undefined
}
const convAgentId = resolveAgentId(conv.targetType, conv.targetId, compactTeam ?? undefined)
```

若 team 已被删除（`getById` 返回 null），则 `compactTeam = undefined`，`resolveAgentId` 抛出：
```
Error: Cannot resolve agent from team target XXX: team not provided
```

导致 compact 操作返回 500。这是 data consistency 问题，但调用路径上没有专门的降级处理。

**建议：** 在 `resolveAgentId` 调用前检查 team 是否存在，并返回恰当的 404/422 响应。

---

## 性能改进亮点（正面评价）

| 改进 | 文件 | 说明 |
|------|------|------|
| 消除双重会话查询 | `routes/chat.ts` | 旧代码对同一 conversationId 查询两次（一次取 agentId，一次取 teamId）；新代码一次取 targetType+targetId |
| `useMemo` 包裹 `currentAgent` | `ChatPage.tsx` | 旧代码每次渲染重新 `.find()`；现在正确使用 memoization |
| `handleNewChat` 简化 | `ChatPage.tsx` | 移除了冗余的 team leader 解析逻辑 |
| 团队判断提前到 `targetType` 字段 | `ChatWindow.tsx` | 避免 `conversation.teamId` 的可选链判断，逻辑更直接 |
| 聊天缓存失效逻辑更精准 | `useAppStore.ts` | `changesTarget` 检测覆盖 targetType + targetId，无遗漏 |

---

## 优先级汇总

| 级别 | 问题 | 文件 |
|------|------|------|
| **P0** | 复合索引不被 `WHERE target_id = $1` 使用，全表扫描 | `db/migrate.ts`, `storage/dashboard.ts`, `storage/conversations.ts` |
| **P1** | Migration v10 无事务保护，崩溃风险 | `db/migrate.ts` |
| **P1** | team 会话 token 归因错误，数据失真 | `storage/dashboard.ts`, `storage/global-dashboard.ts` |
| **P2** | normalize() 无写回，每次读取重复运算 | `storage/cronjobs.ts`, `storage/projects.ts` |
| **P2** | team 会话 agentName 始终 'Unknown' | `storage/dashboard.ts`, `storage/global-dashboard.ts` |
| **P2** | PRAGMA table_info 冗余调用 | `db/migrate.ts` |
| **P2** | resolveAgentId 对已删除 team 抛异常 | `routes/conversations.ts` |
