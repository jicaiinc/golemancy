# Server 路由与存储层 Token Usage 审查报告

## 审查范围

本报告审查服务端所有与 token usage 相关的代码路径：
- `routes/chat.ts` — onFinish/onAbort 中的 token 记录逻辑、SSE data-usage 推送
- `routes/conversations.ts` — conversation 级别的 token 汇总查询、手动 compact token 记录
- `storage/token-records.ts` — token_records 持久化与查询
- `storage/conversations.ts` — messages 表中 token 字段的存取
- `db/schema.ts` — 数据库 schema 定义
- `storage/dashboard.ts` / `storage/global-dashboard.ts` — 项目/全局级别 token 汇总
- `agent/sub-agent.ts` — 子 agent token 记录
- `agent/compact.ts` — compact 操作的 token 记录

## AI SDK v6 关键语义参考

| API | 含义 |
|-----|------|
| `result.usage` (streamText) | 最后一步的 usage = 当前上下文窗口大小 |
| `result.totalUsage` (streamText) | 所有步骤累加 = 计费总量 |
| `step.usage` (onStepFinish/onAbort) | 单步 usage |
| `result.usage` (generateText) | 总 usage（generateText 无多步概念，等价于 totalUsage）|

---

## 1. routes/chat.ts — Token 记录逻辑

### 1.1 onFinish 路径（正常完成）

**代码位置**: `chat.ts:370-424`

```ts
// result.usage = last step (= context window size)
// result.totalUsage = sum of all steps (= billing total for this request)
const lastStepUsage = await result.usage        // line 373
const billingUsage = await result.totalUsage     // line 374
const contextTokens = lastStepUsage.totalTokens ?? 0   // line 376
const billingInput = billingUsage.inputTokens ?? 0      // line 377
const billingOutput = billingUsage.outputTokens ?? 0    // line 378
```

**三个写入目标的分析：**

#### (A) 写入 messages 表（assistant 消息）

```ts
await deps.conversationStorage.saveMessage(projectId, conversationId, {
  id: responseMessage.id,
  role: 'assistant',
  contextTokens,          // ← lastStepUsage.totalTokens
  provider: ..., model: ...,
  // 注意：inputTokens, outputTokens 未传递，默认为 0
})
```

- `contextTokens = lastStepUsage.totalTokens` = 最后一步的 input + output tokens
- **语义**: 代表最后一步的上下文窗口总 token 占用（含 reasoning tokens）
- **用途**: 供 auto-compact 阈值判断使用
- `inputTokens` / `outputTokens` 未传递 → 存储层默认写入 0
- **结论**: ✅ 正确。messages 表只存 contextTokens 用于 compact 判断，计费数据由 token_records 承载。

#### (B) 写入 token_records 表

```ts
deps.tokenRecordStorage.save(projectId, {
  conversationId, messageId: responseMessage.id,
  agentId, provider, model,
  inputTokens: billingInput,     // ← totalUsage.inputTokens
  outputTokens: billingOutput,   // ← totalUsage.outputTokens
  source: 'chat',
})
```

- 使用 `result.totalUsage`（所有步骤累计）作为计费数据
- 关联了 `messageId`，可用于去重
- **结论**: ✅ 正确。totalUsage 是多步累计，正确反映本次请求的总计费量。

#### (C) SSE data-usage 事件推送

```ts
writer.write({
  type: 'data-usage',
  data: { contextTokens, inputTokens: billingInput, outputTokens: billingOutput },
})
```

- `contextTokens` = 上下文窗口大小（last step totalTokens）
- `inputTokens` / `outputTokens` = 计费总量（totalUsage）
- **结论**: ✅ 正确。前端可同时获取上下文窗口大小和计费数据。

### 1.2 onAbort 路径（中断）

**代码位置**: `chat.ts:299-325`

```ts
onAbort: async ({ steps }) => {
  let inputTokens = 0, outputTokens = 0
  for (const step of steps) {
    inputTokens += step.usage?.inputTokens ?? 0
    outputTokens += step.usage?.outputTokens ?? 0
  }
  deps.tokenRecordStorage.save(projectId, {
    conversationId, agentId, provider, model,
    inputTokens, outputTokens,
    source: 'chat', aborted: true,
  })
}
```

- 手动遍历已完成步骤累加 usage，等价于 totalUsage 的逻辑
- 标记 `aborted: true`
- 未关联 `messageId`（中断时可能没有完整的 responseMessage）
- **结论**: ✅ 正确。onAbort 的 `steps` 只含已完成步骤的 usage，手动累加是正确做法。

### 1.3 Auto-compact token 记录

**代码位置**: `chat.ts:255-260`

```ts
deps.tokenRecordStorage.save(projectId, {
  conversationId, agentId,
  provider, model,
  inputTokens: compactResult.inputTokens,
  outputTokens: compactResult.outputTokens,
  source: 'chat',
})
```

- compact 使用 `generateText`，其 `result.usage` = 总 usage（无多步）
- `source: 'chat'` — compact 的 token 记录标记为 chat 来源
- **结论**: ✅ 正确。⚠️ 但 `source: 'chat'` 可能不够精确，无法与正常聊天 token 区分。可考虑增加 `source: 'compact'`，但这是优化建议，不是 bug。

### 1.4 Sub-agent onTokenUsage 回调（SSE 推送）

**代码位置**: `chat.ts:192-197`

```ts
onTokenUsage: (usage) => {
  streamWriter?.write({
    type: 'data-usage',
    data: usage,   // { inputTokens, outputTokens }
  })
}
```

- 当子 agent 完成时，通过 SSE 推送子 agent 的计费数据
- **注意**: 此处推送的 data 只有 `inputTokens` + `outputTokens`，没有 `contextTokens`
- **结论**: ✅ 正确。子 agent 的 contextTokens 对父 agent 的前端显示无意义。

---

## 2. routes/conversations.ts — Token 汇总查询

### 2.1 Conversation Token Usage 端点

**代码位置**: `conversations.ts:210-229`

```ts
app.get('/:conversationId/token-usage', async (c) => {
  const usage = tokenRecordStorage.getConversationUsage(projectId, conversationId)
  // Resolve agent names...
  return c.json({
    total: usage.total,
    byAgent: usage.byAgent.map(a => ({ ...a, name: agentMap.get(...) })),
    byModel: usage.byModel,
  })
})
```

- 完全从 `token_records` 表查询，不涉及 messages 表
- 按 agent 和 model 分组汇总
- **结论**: ✅ 正确。

### 2.2 Manual Compact Token 记录

**代码位置**: `conversations.ts:194-203`

```ts
deps.tokenRecordStorage.save(projectId, {
  conversationId: convId,
  agentId: agent.id,
  provider, model,
  inputTokens: result.inputTokens,
  outputTokens: result.outputTokens,
  source: 'chat',
})
```

- 与 auto-compact 一样使用 `source: 'chat'`
- `result` 来自 `compactConversation()`，使用 `generateText().usage`
- **结论**: ✅ 正确（同 1.3 的 source 标记建议）。

---

## 3. storage 层

### 3.1 token-records.ts — TokenRecordStorage

**代码位置**: `token-records.ts:25-83`

#### save()

```ts
save(projectId: ProjectId, data: TokenRecordData): string {
  // INSERT INTO token_records (... input_tokens, output_tokens, source, aborted ...)
}
```

- 接收 `inputTokens`, `outputTokens` 直接写入
- 支持 `messageId`, `parentRecordId`, `aborted` 等字段
- **结论**: ✅ 正确。纯粹的数据落盘，不涉及语义变换。

#### getConversationUsage()

```ts
getConversationUsage(projectId, conversationId): ConversationTokenUsage {
  // SUM(input_tokens), SUM(output_tokens) FROM token_records WHERE conversation_id = ?
  // GROUP BY agent_id
  // GROUP BY provider, model
}
```

- 从 `token_records` 表按 conversation_id 过滤并汇总
- 包含所有 source 类型（chat、sub-agent、compact）
- 包含 aborted 记录
- **结论**: ✅ 正确。conversation 级汇总应包含所有 API 调用的 token 消耗。

### 3.2 conversations.ts — SqliteConversationStorage

#### saveMessage()

**代码位置**: `conversations.ts:101-142`

```ts
await db.insert(schema.messages).values({
  id: data.id,
  inputTokens: data.inputTokens ?? 0,
  outputTokens: data.outputTokens ?? 0,
  contextTokens: data.contextTokens ?? 0,
  provider: data.provider ?? '',
  model: data.model ?? '',
  ...
})
```

- 当前调用方（chat.ts onFinish）只传递 `contextTokens`、`provider`、`model`
- `inputTokens` 和 `outputTokens` 默认为 0
- **结论**: ✅ 正确。messages 表中的 inputTokens/outputTokens 是 legacy 字段，保留用于向后兼容的 dashboard 回退查询。新数据只通过 token_records 记录计费。

#### rowToMessage()

**代码位置**: `conversations.ts:305-320`

```ts
private rowToMessage(row): Message {
  return {
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    contextTokens: row.contextTokens,
    ...
  }
}
```

- 原样返回，无语义变换
- **结论**: ✅ 正确。

---

## 4. db/schema.ts

**代码位置**: `schema.ts:1-69`

### messages 表

```ts
inputTokens: integer('input_tokens').notNull().default(0),
outputTokens: integer('output_tokens').notNull().default(0),
contextTokens: integer('context_tokens').notNull().default(0),
provider: text('provider').notNull().default(''),
model: text('model').notNull().default(''),
```

- `inputTokens` / `outputTokens`: legacy 字段，当前代码写入 0，保留用于 dashboard 回退查询
- `contextTokens`: 存储 last step totalTokens（上下文窗口大小），供 auto-compact 阈值判断
- **结论**: ✅ 正确。

### token_records 表

```ts
export const tokenRecords = sqliteTable('token_records', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id'),        // nullable — cron job 可能无 conversation
  messageId: text('message_id'),                   // nullable — abort/compact 无 messageId
  agentId: text('agent_id').notNull(),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  inputTokens: integer('input_tokens').notNull(),  // 计费 input tokens
  outputTokens: integer('output_tokens').notNull(), // 计费 output tokens
  source: text('source').notNull(),                 // 'chat' | 'cron' | 'sub-agent'
  parentRecordId: text('parent_record_id'),         // 子 agent 关联
  aborted: integer('aborted').notNull().default(0), // 是否中断
  createdAt: text('created_at').notNull(),
})
```

- schema 完整，覆盖了所有使用场景
- `messageId` 可 nullable，正确处理 abort/compact/sub-agent 无 message 关联的情况
- **结论**: ✅ 正确。

### compact_records 表

```ts
export const compactRecords = sqliteTable('compact_records', {
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  ...
})
```

- 记录 compact 操作自身的 token 消耗
- **注意**: compact 的 token 同时被写入 `token_records`（source='chat'），所以 compact_records 和 token_records 存在数据冗余。但这是设计选择（compact_records 记录 compact 元数据，token_records 记录计费），不是 bug。
- **结论**: ✅ 正确。

---

## 5. Dashboard/Project 级别汇总

### 5.1 storage/dashboard.ts — DashboardService（项目级）

#### getSummary() — Token 汇总

**代码位置**: `dashboard.ts:69-77`

```sql
SELECT COALESCE(SUM(inp), 0) as inp, COALESCE(SUM(out), 0) as out FROM (
  SELECT input_tokens as inp, output_tokens as out FROM token_records WHERE 1=1 [dateCondition]
  UNION ALL
  SELECT m.input_tokens as inp, m.output_tokens as out FROM messages m
  WHERE m.input_tokens > 0 [dateCondition]
    AND NOT EXISTS (SELECT 1 FROM token_records tr WHERE tr.message_id = m.id)
)
```

- **主数据源**: `token_records` 表
- **回退数据源**: `messages` 表（仅 `input_tokens > 0` 且无对应 token_record 的记录）
- **去重机制**: `NOT EXISTS (SELECT 1 FROM token_records tr WHERE tr.message_id = m.id)`
- **分析**: 当前代码中 messages 的 inputTokens 始终为 0，因此回退查询不会返回数据。这是正确的向后兼容设计——旧数据（可能有 inputTokens > 0 的 messages 但无 token_records）也能被正确汇总。
- **结论**: ✅ 正确。

#### getTokenTrend() — 日/小时维度趋势

**代码位置**: `dashboard.ts:267-361`

- 同样使用 `token_records UNION ALL messages` 回退模式
- 使用 SQLite `datetime(created_at, 'localtime')` 做本地时区分桶
- **结论**: ✅ 正确。

#### getTokenByModel() / getTokenByAgent()

**代码位置**: `dashboard.ts:363-424`

- 同样使用回退 UNION ALL 模式
- `getTokenByAgent` 中对 messages 使用 `JOIN conversations c` 关联 agent_id
- **结论**: ✅ 正确。

#### getAgentStats() — Agent 统计

**代码位置**: `dashboard.ts:136-163`

- `totalTokens = input_tokens + output_tokens`，统计的是 billing total
- **结论**: ✅ 正确。

#### getRecentChats() — 最近对话

**代码位置**: `dashboard.ts:228-238`

- 使用子查询从 token_records + messages 计算每个 conversation 的 total_tokens
- **结论**: ✅ 正确。

### 5.2 storage/global-dashboard.ts — GlobalDashboardService（全局级）

**代码位置**: `global-dashboard.ts:24-493`

- 遍历所有 project，对每个 project DB 执行与 DashboardService 相同的查询模式
- 在内存中跨 project 聚合
- **结论**: ✅ 正确。查询模式与 DashboardService 完全一致。

---

## 6. 相关模块分析

### 6.1 agent/sub-agent.ts — 子 Agent Token 记录

**代码位置**: `sub-agent.ts:178-200`

```ts
// 正常完成
const childUsage = await result.totalUsage  // 所有步骤累计
tokenRecordStorage.save(projectId, {
  conversationId, agentId: childAgent.id,
  inputTokens: childInputTokens, outputTokens: childOutputTokens,
  source: 'sub-agent',
})
onTokenUsage?.({ inputTokens: childInputTokens, outputTokens: childOutputTokens })
```

```ts
// 中断
onAbort: async ({ steps }) => {
  let inputTokens = 0, outputTokens = 0
  for (const step of steps) {
    inputTokens += step.usage?.inputTokens ?? 0
    outputTokens += step.usage?.outputTokens ?? 0
  }
  tokenRecordStorage.save(projectId, { ..., source: 'sub-agent', aborted: true })
  onTokenUsage?.({ inputTokens, outputTokens })
}
```

- 正常完成使用 `result.totalUsage`（计费总量）✅
- 中断手动累加 steps 的 usage（与 chat.ts onAbort 一致）✅
- 通过 `onTokenUsage` 回调将 token 推送到父 agent 的 SSE stream ✅
- `source: 'sub-agent'` 可区分子 agent 的 token 消耗 ✅
- **结论**: ✅ 正确。

### 6.2 agent/compact.ts — Compact 操作

**代码位置**: `compact.ts:91-99`

```ts
const result = await generateText({ ... })
const inputTokens = result.usage.inputTokens ?? 0
const outputTokens = result.usage.outputTokens ?? 0
```

- `generateText` 无多步概念，`result.usage` = 总 usage
- **结论**: ✅ 正确。

### 6.3 Auto-compact 阈值判断

**代码位置**: `chat.ts:221-227`

```ts
const lastAssistant = conv.messages.filter(m => m.role === 'assistant').at(-1)
const totalTokens = lastAssistant?.contextTokens ?? 0
if (totalTokens >= threshold) { ... }
```

- 读取最后一条 assistant 消息的 `contextTokens`（= last step totalTokens）
- 与配置的 compact 阈值比较
- **结论**: ✅ 正确。contextTokens 反映上下文窗口 + 输出的总 token 占用，用于判断是否需要压缩是合理的。

---

## 总结表格

| 文件 | 统计位置 | 使用的字段 | 语义 | 是否正确 | 问题描述 |
|------|----------|-----------|------|---------|---------|
| `chat.ts` onFinish | messages 表 | `contextTokens` = `result.usage.totalTokens` | 最后一步 totalTokens = 上下文窗口大小 | ✅ | — |
| `chat.ts` onFinish | token_records 表 | `inputTokens`/`outputTokens` = `result.totalUsage.*` | 所有步骤累计 = 计费总量 | ✅ | — |
| `chat.ts` onFinish | SSE data-usage | `contextTokens` + `billingInput`/`billingOutput` | 上下文窗口 + 计费总量 | ✅ | — |
| `chat.ts` onAbort | token_records 表 | 手动累加 `steps[].usage.*` | 已完成步骤累计 = 部分计费量 | ✅ | — |
| `chat.ts` auto-compact | token_records 表 | `compactResult.inputTokens`/`outputTokens` | generateText 总 usage | ✅ | source='chat' 不够精确 |
| `chat.ts` sub-agent SSE | SSE data-usage | `onTokenUsage` 回调 | 子 agent 计费总量 | ✅ | — |
| `conversations.ts` token-usage | token_records | `SUM(input_tokens)`, `SUM(output_tokens)` | conversation 计费总量 | ✅ | — |
| `conversations.ts` manual compact | token_records | `compactResult.*` | generateText 总 usage | ✅ | source='chat' 不够精确 |
| `token-records.ts` save | token_records | 直接写入 | 纯数据落盘 | ✅ | — |
| `token-records.ts` getConversationUsage | token_records | `SUM` 查询 | conversation 汇总 | ✅ | — |
| `conversations.ts` saveMessage | messages 表 | `inputTokens` 默认 0, `contextTokens` | legacy + 上下文窗口 | ✅ | — |
| `schema.ts` messages | schema | `input_tokens`, `output_tokens`, `context_tokens` | legacy 计费 + 上下文窗口 | ✅ | — |
| `schema.ts` token_records | schema | `input_tokens`, `output_tokens`, `source`, `aborted` | 计费记录 | ✅ | — |
| `dashboard.ts` getSummary | token_records + messages 回退 | `SUM(input_tokens + output_tokens)` | 项目计费总量 | ✅ | — |
| `dashboard.ts` getTokenTrend | token_records + messages 回退 | 日/时维度 SUM | 趋势图数据 | ✅ | — |
| `dashboard.ts` getTokenByModel | token_records + messages 回退 | 按 model 分组 SUM | 模型维度统计 | ✅ | — |
| `dashboard.ts` getTokenByAgent | token_records + messages 回退 | 按 agent 分组 SUM | Agent 维度统计 | ✅ | — |
| `global-dashboard.ts` 所有方法 | 跨 project 聚合 | 同 dashboard.ts | 全局统计 | ✅ | — |
| `sub-agent.ts` 正常完成 | token_records | `result.totalUsage.*` | 子 agent 计费总量 | ✅ | — |
| `sub-agent.ts` 中断 | token_records | 手动累加 `steps[].usage.*` | 子 agent 部分计费量 | ✅ | — |
| `compact.ts` | 返回值 | `result.usage.*` | generateText 总 usage | ✅ | — |

---

## 总体结论

**服务端路由和存储层的 token usage 实现整体正确**，关键语义使用无误：

1. **`result.usage` vs `result.totalUsage` 区分正确**：onFinish 中正确使用 `result.usage` 获取上下文窗口大小（contextTokens），使用 `result.totalUsage` 获取计费总量。
2. **onAbort 手动累加正确**：遍历 `steps[].usage` 累加等价于 totalUsage 的逻辑。
3. **双表设计合理**：messages 表存 contextTokens（用于 auto-compact），token_records 表存计费数据（用于 dashboard/统计）。
4. **Dashboard 向后兼容**：使用 `UNION ALL` + `NOT EXISTS` 回退查询模式，确保旧数据（messages 有 token 但无 token_records）也能被正确统计，且不会与新数据双重计数。
5. **SSE 推送数据完整**：前端同时获得 contextTokens（上下文窗口）和 inputTokens/outputTokens（计费总量）。

### 优化建议（非 Bug）

1. **Compact token 的 source 标记**：auto-compact 和 manual-compact 的 token_records 使用 `source: 'chat'`，无法与正常聊天调用区分。建议新增 `source: 'compact'`，便于后续分析。
2. **messages 表 legacy 字段**：`input_tokens` 和 `output_tokens` 字段当前始终为 0。长期可考虑标记为 deprecated 或在未来 migration 中移除，但不影响正确性。
