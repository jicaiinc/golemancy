# Security Review: targetType + targetId Refactoring

**审查员**: CR-Security
**日期**: 2026-03-13
**范围**: `target_type / target_id` 统一重构相关所有改动文件

---

## 总结

重构整体安全性良好。SQL 查询全部使用参数化（drizzle-orm `sql\`\`` 模板），无 SQL 注入风险。主要问题集中在**运行时输入验证缺失**和**异常处理不完整**两个方面。无 Critical 级别问题。

---

## Critical（严重）

_无_

---

## High（高风险）

_无_

---

## Medium（中等风险）

### M1 — `targetType` 未做枚举验证（routes/chat.ts, routes/conversations.ts）

**文件**: `packages/server/src/routes/chat.ts:65–66`, `packages/server/src/routes/conversations.ts:69,79`

**问题**:
用户输入的 `targetType` 未被验证为 `'agent' | 'team'`，直接用 `as TargetType` 做类型断言：

```typescript
// chat.ts line 65-66
let targetType = body.targetType as TargetType | undefined
let targetId = body.targetId as (AgentId | TeamId) | undefined

// conversations.ts line 69 — 直接传给 storage，无任何检查
const { targetType, targetId, title } = await c.req.json()
const conv = await storage.create(projectId, targetType, targetId, title)
```

**影响**:
- 非法 `targetType`（如 `"admin"` 、`"__proto__"`）会绕过枚举约束进入存储层
- `resolveAgentId()` 对非 `'team'` 值一律走 `if (targetType === 'agent')` 分支，直接把 `targetId` 当 AgentId 返回，相当于绕过 type 校验仍能执行
- 非法值会被持久化到 SQLite，后续读取时 `row.targetType as TargetType` 断言失效

**修复建议**:
在路由层加枚举白名单验证：
```typescript
const VALID_TARGET_TYPES: TargetType[] = ['agent', 'team']
if (targetType && !VALID_TARGET_TYPES.includes(targetType as TargetType)) {
  return c.json({ error: 'INVALID_TARGET_TYPE' }, 400)
}
```

---

### M2 — `resolveAgentId()` 抛出异常未被捕获，导致 500 / 静默失败

**文件**:
- `packages/server/src/routes/chat.ts:115`
- `packages/server/src/routes/conversations.ts:254`
- `packages/server/src/scheduler/executor.ts:289`

**问题**:
当 `targetType === 'team'` 但对应 team 已被删除或不存在时，`team` 为 `undefined`，`resolveAgentId()` 抛出 `Error`：

```typescript
// utils/target.ts line 22-24
if (!team) {
  throw new Error(`Cannot resolve agent from team target ${targetId}: team not provided`)
}
```

在 chat.ts 和 conversations.ts 中，该异常未被 try-catch 包裹，直接变为 HTTP 500。
在 executor.ts 中，team 解析在主 try-catch **之前**（约 line 282-289），异常会导致 cron 执行崩溃且**不记录失败的 CronJobRun**，造成静默丢失。

**影响**:
- 攻击面：client 可以传递一个已删除 team 的 id 使接口返回 500
- Cron 执行失败无任何运行记录，运维盲区

**修复建议**:
- 在 team 查找后加 not-found 检查，返回 404 而非 throw
- executor.ts 中将 team+agentId 解析移入主 try-catch 内，或者前置检查后 early return

---

### M3 — `conversations.ts POST /` 缺少必填字段校验

**文件**: `packages/server/src/routes/conversations.ts:67–73`

**问题**:
```typescript
app.post('/', async (c) => {
  const { targetType, targetId, title } = await c.req.json()
  const conv = await storage.create(projectId, targetType, targetId, title)
  ...
})
```

`targetType` 和 `targetId` 为 `undefined` 时，直接传入 storage 层，drizzle insert 会以 `NOT NULL` 违反约束失败，产生未处理的 DB 异常（500）。

**修复建议**:
```typescript
if (!targetType || !targetId) {
  return c.json({ error: 'TARGET_REQUIRED' }, 400)
}
```

---

## Low（低风险）

### L1 — Migration v10 无显式事务，部分失败可能留下不一致状态

**文件**: `packages/server/src/db/migrate.ts:211–256`

**问题**:
v10 迁移包含 5 个独立 DDL/DML 步骤（ADD COLUMN × 2 → UPDATE → DROP INDEX → DROP COLUMN × 2 → CREATE INDEX），未包裹在显式事务中。若 step 3（UPDATE）成功但 step 4（DROP COLUMN）因任何原因失败，数据库会处于「新旧列并存，数据已迁移」的中间态。

由于迁移入口检查为 `hasAgentId && !hasTargetType`，中间态下重启会跳过迁移（因为 `target_type` 列已存在），旧 `agent_id` 列也仍存在，不一致状态无法自愈。

**修复建议**: 将整个 v10 迁移块包裹在 `db.transaction(() => { ... })`（better-sqlite3 支持同步事务）。

---

### L2 — `target_id DEFAULT ''` 允许空字符串 ID 持久化

**文件**: `packages/server/src/db/migrate.ts:60`, `packages/server/src/db/schema.ts`

**问题**:
```sql
ALTER TABLE conversations ADD COLUMN target_id TEXT DEFAULT ''
```
以及 schema 中 `targetId: text('target_id').notNull()` 没有对应 CHECK 约束。迁移中若某行 `agent_id` 和 `team_id` 均为 NULL，`target_id` 会被设为空字符串 `''`。

后续所有使用 `WHERE target_id = ?` 的查询都可能意外匹配到这些孤立行，导致数据混乱。

**修复建议**: 迁移 Step 2 后增加 sanity check:
```sql
SELECT count(*) FROM conversations WHERE target_id = '' OR target_id IS NULL
```
如果 > 0 则 log.warn，并考虑将这类行设置为特殊标记或移除。

---

### L3 — `conversations.list()` 按 agentId 过滤时未加 `target_type = 'agent'` 条件

**文件**: `packages/server/src/storage/conversations.ts:25`

**问题**:
```typescript
if (agentId) conditions.push(eq(schema.conversations.targetId, agentId))
```
未同时添加 `AND target_type = 'agent'`。
若某个 TeamId 的值碰巧与某个 AgentId 相同（虽然极低概率，但理论可能），team 会话会出现在 agent 视图中，造成信息越界显示。

**修复建议**:
```typescript
if (agentId) {
  conditions.push(eq(schema.conversations.targetId, agentId))
  conditions.push(eq(schema.conversations.targetType, 'agent'))
}
```

---

### L4 — dashboard.ts / global-dashboard.ts 对 team 类型 cron job 的 agentId 处理语义错误

**文件**:
- `packages/server/src/storage/dashboard.ts:498–499, 669–670`
- `packages/server/src/storage/global-dashboard.ts:399–401`

**问题**:
```typescript
const resolvedAgentId = job.targetType === 'agent'
  ? job.targetId as AgentId
  : job.targetId as AgentId // team target — best-effort lookup by targetId
```
两个分支做了相同的事：把 `targetId` 强转为 `AgentId`。对于 team 类型的 cron job，`targetId` 是 `TeamId`，不会出现在 `agentMap` 中，导致 `agentName` 始终显示 `'Unknown'`，且 token 统计归属错误。

此外在 token 统计查询中：
```sql
SELECT c.target_id as agent_id, m.input_tokens ...
FROM messages m JOIN conversations c ...
```
对于 team 会话，`c.target_id` 是 TeamId，与 `token_records.agent_id`（真实 AgentId）无法匹配，造成 team 会话的 token 统计缺失（不计入任何 agent 统计）。

**安全影响**: 无直接安全风险，但导致计费/审计数据不准确。建议在后续 sprint 补齐 team target 的 dashboard 聚合逻辑。

---

## Info（信息性）

### I1 — SQL 注入风险：无（drizzle-orm 参数化）

所有 SQL 查询均使用 drizzle-orm 的 `sql\`\`` tagged template 或 ORM 方法，变量自动参数化。未发现任何字符串拼接构造 SQL 的情况。✅

### I2 — 数据迁移完整性：已验证

v10 迁移使用 `CASE WHEN team_id IS NOT NULL THEN team_id ELSE agent_id END` 进行数据迁移，逻辑正确。有 team 的会话迁移为 `target_type='team'`，其余为 `target_type='agent'`。✅

### I3 — 类型断言 `as AgentId` / `as TeamId` 安全性

从 DB 读取的行数据做类型断言（`row.targetId as AgentId | TeamId`），依赖 DB 数据的正确性。若外部直接操作 SQLite 文件写入非法值，运行时无法检测。这是 SQLite 无 enum 字段类型的固有限制，可接受。

### I4 — `resolveAgentId()` 的错误信息不泄露敏感数据

错误消息 `"Cannot resolve agent from team target ${targetId}"` 会暴露 targetId 值。在 Electron 本地 app 场景下（API 只绑定 127.0.0.1），可接受。

---

## 优先级建议

| 优先 | 编号 | 描述 |
|------|------|------|
| P1   | M1   | targetType 枚举验证（防止非法值持久化） |
| P1   | M2   | resolveAgentId 异常处理（防止 500 + cron 静默失败） |
| P1   | M3   | conversations POST 必填字段校验 |
| P2   | L1   | Migration v10 事务包裹 |
| P2   | L3   | list() 补加 target_type 条件 |
| P3   | L2   | 空字符串 target_id sanity check |
| P3   | L4   | Dashboard team target agentId 修正 |
