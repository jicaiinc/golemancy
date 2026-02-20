# Server Bug Hunt — 06-server-bugs.md

审查日期：2026-02-20
审查人：server-bug-hunter
审查范围：packages/server/src/（routes、storage、agent、ws、scheduler、db）

---

## 🔴 已确认 Bug

---

### BUG-01：SQL 歧义列名 — `getTokenByAgent()` JOIN 查询中 `dateCondition` 无表前缀

**文件**：
- `packages/server/src/storage/dashboard.ts:427-436`
- `packages/server/src/storage/global-dashboard.ts:181-190`

**复现条件**：在 Dashboard 页面选择 `today`/`7d`/`30d` 时间范围，请求 `/token-by-agent` 端点。

**问题描述**：

`dateCondition` 变量构造为：
```typescript
const dateCondition = startDate ? sql` AND created_at >= ${startDate}` : sql``
```

此片段被注入到一个包含 `JOIN conversations c` 的子查询中：
```sql
SELECT c.agent_id, m.input_tokens as inp, m.output_tokens as out
FROM messages m
JOIN conversations c ON c.id = m.conversation_id
WHERE m.input_tokens > 0 AND created_at >= ${startDate}   -- ← 歧义列！
  AND NOT EXISTS (SELECT 1 FROM token_records tr WHERE tr.message_id = m.id)
```

`messages` 表和 `conversations` 表都有 `created_at` 列（参见 `db/schema.ts:9,24`）。
SQLite 遇到无前缀的 `created_at` 时会报 **"ambiguous column name: created_at"**，整个查询失败。

**对比**：同文件的 `getAgentStats()` 在类似的 JOIN 查询中正确使用了 `m.created_at`（`dashboard.ts:182`），是参考正确写法的范例。

**影响**：`timeRange` 非 `all` 时 token-by-agent 图表数据全部为空，UI 显示异常。

**涉及位置**：
- `dashboard.ts:433`（messages JOIN conversations，第二个 `dateCondition`）
- `global-dashboard.ts:188`（同样问题）

---

### BUG-02：bodyLimit 中间件冲突 — 2MB 通配符覆盖 50MB Chat 限制

**文件**：`packages/server/src/app.ts:57-58`

**代码**：
```typescript
app.use('/api/chat', bodyLimit({ maxSize: 50 * 1024 * 1024 }))  // 50 MB
app.use('/api/*', bodyLimit({ maxSize: 2 * 1024 * 1024 }))       // 2 MB
```

**问题描述**：

Hono 中间件按注册顺序依次执行，两个 `app.use()` 对路径 `/api/chat` 都会匹配并依次运行：

1. 50MB 检查：body ≤ 50MB → 调用 `next()`，进入下一个中间件
2. 2MB 检查：body > 2MB → 返回 **413 Payload Too Large**，请求终止

Chat 请求携带 base64 图片时，请求体通常远超 2MB。这意味着：
- 含图片的聊天请求（2MB ~ 50MB）会被第二个中间件错误拒绝
- 50MB 的宽限设置形同虚设

**影响**：用户上传图片后，Chat 请求返回 413，功能不可用。

**正确做法**：应将通配符限制改为排除 `/api/chat`，或反转顺序使更宽松的限制优先覆盖 chat 路由。

---

## 🟡 疑似 Bug

---

### BUG-03：WebSocket `emit()` 无错误隔离 — 单个客户端异常中断广播

**文件**：`packages/server/src/ws/handler.ts:62-70`

**代码**：
```typescript
emit(channel: string, event: WsServerEvent) {
  const data = JSON.stringify(event)
  for (const client of this.clients.values()) {
    if (client.channels.has(channel)) {
      client.ws.send(data)  // ← 无 try-catch
    }
  }
}
```

`client.ws.send()` 在底层 WebSocket 已关闭（CLOSING/CLOSED 状态）时会抛出异常。没有 try-catch，一旦某个客户端出现错误，**后续所有客户端都收不到该事件**。`broadcast()` 方法同样存在此问题（`ws/handler.ts:72-78`）。

**影响**：客户端网络抖动期间，事件广播可能中断，其他客户端 UI 无法实时更新（agent 状态、token 记录等）。

---

### BUG-04：`agent/process.ts` 引用不存在的 `worker.js`

**文件**：`packages/server/src/agent/process.ts:30`

**代码**：
```typescript
// TODO: worker.js is a placeholder — replace with actual agent worker implementation
const workerPath = path.join(import.meta.dirname, 'worker.js')
const child = fork(workerPath, ...)
```

`worker.js` 文件不存在于 agent 目录中。若 `AgentProcessManager.spawnAgent()` 被调用，`fork()` 会立即失败，抛出 `Error: ENOENT`。目前该类未在 `app.ts` 中被实例化，但属于潜在的隐藏炸弹。

---

### BUG-05：CronJob 创建时 `cronExpression` 缺少必填校验

**文件**：`packages/server/src/routes/cronjobs.ts:70-71`

**代码**：
```typescript
if (data.cronExpression && !validateCronExpression(data.cronExpression)) {
  return c.json({ error: 'Invalid cron expression' }, 400)
}
```

仅当 `cronExpression` 为**非空字符串**时才执行验证。若客户端提交 `cronExpression: ""` 或不传此字段（`undefined`），条件短路，不进行验证，数据直接存储。

调度器随后尝试 `new Cron(undefined)` 或 `new Cron("")` 会静默失败（`scheduler.ts:74: log.warn`），该 Job 永远不会触发，但用户不会收到创建时的错误提示。

---

### BUG-06：`triggerManual()` 使用 `as any` 绕过品牌类型检查

**文件**：`packages/server/src/scheduler/scheduler.ts:114`

**代码**：
```typescript
const job = await this.cronJobStorage.getById(projectId as any, cronJobId)
```

`triggerManual()` 的参数 `projectId` 是 `string`，而 `getById` 期望品牌类型 `ProjectId`。`as any` 绕过了类型系统，且调用点 `routes/cronjobs.ts:127` 直接传入 `c.req.param('projectId') as ProjectId`，类型正确，但 scheduler 内部对 `string` 使用 `as any` 是类型不一致的症状，理应统一。

---

### BUG-07：`saveMessage()` 两步操作非事务性

**文件**：`packages/server/src/storage/conversations.ts:121-138`

**代码**：
```typescript
await db.insert(schema.messages).values({...})           // step 1
await db.update(schema.conversations).set({...}).where(  // step 2
  eq(schema.conversations.id, conversationId)
)
```

两步操作之间没有 SQLite 事务。若进程在步骤 1 完成后、步骤 2 执行前崩溃：
- 消息已持久化
- `conversations.lastMessageAt` 和 `updatedAt` 未更新

后果：对话列表排序错误，"最近活跃" 指示器显示过时时间戳。

---

### BUG-08：Sub-agent 无递归深度限制，循环配置导致无限递归

**文件**：`packages/server/src/agent/sub-agent.ts:60-74`

**问题描述**：

`createSubAgentTool` 的 `execute()` 调用注入的 `loadTools` 函数（即 `loadAgentTools`）：
```typescript
execute: async function*({ task, context }, { abortSignal }) {
  const childToolsResult = await loadTools({  // ← 递归调用 loadAgentTools
    agent: childAgent,
    allAgents,  // 所有 agent 均传入
    ...
  })
```

若 Agent A 配置了 B 为 sub-agent，B 又配置了 A 为 sub-agent，调用链如下：

```
A.execute() → loadAgentTools(A) → createSubAgentTool(B) → [invoke] → loadAgentTools(B)
→ createSubAgentTool(A) → [invoke] → loadAgentTools(A) → ... (∞)
```

当前没有深度计数器，也没有循环引用检测。由于 `createSubAgentToolSet` 只有在 AI 实际调用工具时才递归（lazy），因此仅在运行时触发，配置阶段不报错，错误难以发现。

---

## 🟢 轻微问题

---

### MINOR-01：`rowToMessage()` 中 `updatedAt` 硬编码为 `createdAt`

**文件**：`packages/server/src/storage/conversations.ts:314`

```typescript
updatedAt: row.createdAt,  // messages 表无 updatedAt 列，复用 createdAt
```

Messages 表不含 `updatedAt`，此处复用 `createdAt` 作为填充。虽然 Message 是不可变的，但字段语义具有误导性——调用方可能认为 `updatedAt !== createdAt` 时消息被修改过。

---

### MINOR-02：`ProjectDbManager` 使用非公开内部 API 关闭数据库

**文件**：`packages/server/src/db/project-db.ts:34-36`

```typescript
;(db as any)._.session.client.close()
```

通过 `as any` 访问 drizzle-orm 的内部属性 `_.session.client`，这不是公开的稳定 API。drizzle-orm 版本升级可能导致此路径失效，静默忽略关闭错误（`catch { log.warn }` 而非 `log.error`），数据库可能无法正常关闭，造成文件锁或 WAL 文件残留。

---

## 总结

| 严重度 | 数量 | 主要影响 |
|--------|------|----------|
| 🔴 确认 Bug | 2 | Token 统计失效、Chat 图片上传 413 |
| 🟡 疑似 Bug | 6 | WebSocket 广播中断、Cron 调度失效、Sub-agent 递归崩溃 |
| 🟢 轻微问题 | 2 | 字段语义误导、内部 API 不稳定 |

**最高优先级修复**：BUG-01（SQL 歧义列名）和 BUG-02（bodyLimit 冲突），这两个 bug 在用户正常操作下即可触发，且功能完全失效。
