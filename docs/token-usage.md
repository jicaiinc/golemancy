# Token Usage 统计逻辑

本文档描述 Golemancy 中 token 使用量的采集、计算、持久化和 UI 展示的完整流程。

## 核心概念

### 三个 token 指标

| 指标 | 来源 | 含义 |
|------|------|------|
| `contextTokens` | `(await result.usage).totalTokens` | **最后一步**的 `totalTokens`，代表当前上下文窗口大小（prompt + visible output）。用于 auto-compact 阈值判断 |
| `billingInput` | `(await result.totalUsage).inputTokens` | **所有步骤** inputTokens 之和。代表实际计费的输入 token（对 thinking model 包含 thinking tokens） |
| `billingOutput` | `(await result.totalUsage).outputTokens` | **所有步骤** outputTokens 之和。代表实际计费的输出 token |

### AI SDK v6 `streamText` 中的 usage 语义

```
result.usage      → 最后一步 (last step) 的 usage
result.totalUsage → 所有步骤的 usage 之和
```

对于单步响应（无 tool call），两者相同。对于多步（有 tool call），`totalUsage` 是所有步骤的累加。

### 多步 (Multi-step) 场景

当模型调用 tool 时，`streamText` 会产生多个 step：

```
Step 1: 模型生成 tool call → 执行 tool → 返回 tool result
Step 2: 模型处理 tool result → 再次生成 tool call 或最终回复
Step 3: ...
```

每一步都会重新发送完整的上下文（系统提示 + 历史消息 + 前面步骤的 tool 结果），所以 `billingInput` 会远大于 `contextTokens`。

**示例**（3 步 tool call）：

| Step | inputTokens | outputTokens | totalTokens |
|------|-------------|-------------|-------------|
| 1    | 2,330       | 459         | 2,789       |
| 2    | 2,973       | 59          | 3,032       |
| 3    | 3,206       | 30          | 3,236       |

- `contextTokens` = Step 3 的 `totalTokens` = **3,236**
- `billingInput` = 2330 + 2973 + 3206 = **8,509**
- `billingOutput` = 459 + 59 + 30 = **548**

### Thinking Model 注意事项

对于 Gemini 2.5 Flash 等 thinking model：

- `inputTokens` 可能包含 thinking tokens（thinking 按 input 费率计费）
- `totalTokens` 通常等于 `inputTokens + outputTokens`（每步内）
- `contextTokens` 是上下文窗口的有效度量，thinking tokens 是临时的不会持久化到消息历史

## 数据流

### 1. Chat 流程 (`packages/server/src/routes/chat.ts`)

```
用户发送消息
    │
    ▼
保存 user message → messages 表
    │
    ▼
Auto-compact 检查：
    读取上一条 assistant message 的 contextTokens
    if contextTokens >= threshold → 触发 compact
    │
    ▼
streamText() 开始
    │
    ├─ onStepFinish (每步)
    │   └─ log.debug: step, finishReason, inputTokens, outputTokens, totalTokens, toolCalls
    │
    ├─ toUIMessageStream.onFinish (流结束)
    │   ├─ contextTokens = (await result.usage).totalTokens
    │   ├─ billingInput  = (await result.totalUsage).inputTokens
    │   ├─ billingOutput = (await result.totalUsage).outputTokens
    │   │
    │   ├─ 保存 assistant message → messages 表 (含 contextTokens)
    │   ├─ 保存 token record   → token_records 表 (billingInput, billingOutput, source='chat')
    │   ├─ SSE: data-usage { contextTokens, inputTokens, outputTokens }
    │   └─ WS: token:recorded { inputTokens, outputTokens }
    │
    └─ onAbort (中断)
        ├─ 汇总已完成步骤的 token
        └─ 保存 token record → token_records 表 (source='chat', aborted=true)
```

### 2. Auto-Compact 流程

```
Auto-compact 触发 (contextTokens >= threshold)
    │
    ▼
SSE: data-compact { status: 'started' }
    │
    ▼
compactConversation()
    ├─ 使用 streamText 生成对话摘要
    ├─ 不传 tools（模型无法调用工具）
    └─ prompt 中明确 "Do not call any tools"
    │
    ▼
保存 compact record → compact_records 表
保存 token record  → token_records 表 (source='compact')
SSE: data-compact { status: 'completed', record }
SSE: data-usage { inputTokens, outputTokens }  ← compact 的 token 消耗
    │
    ▼
使用 compact summary 重建消息列表
    ├─ [compact-summary message] 替代旧消息
    └─ [boundary 之后的新消息] 保留
    │
    ▼
继续正常的 streamText 聊天流程
```

### 3. Manual Compact 流程 (`/api/projects/:id/conversations/:convId/compact`)

```
用户点击 StatusBar "Compact Now"
    │
    ▼
HTTP POST → compact endpoint
    ├─ compactConversation() 执行
    ├─ 保存 compact record → compact_records 表
    └─ 保存 token record  → token_records 表 (source='compact')
    │
    ▼
UI 重新加载 conversation 获取更新后的 compactRecords 和 messages
```

## DB 持久化

### messages 表

每条 assistant message 保存 `contextTokens`（最后一步的 `totalTokens`），用于下次请求的 auto-compact 阈值判断。

```sql
-- 关键字段
contextTokens INTEGER  -- lastStep.totalTokens，上下文窗口大小
inputTokens   INTEGER  -- 未使用（历史遗留，默认 0）
outputTokens  INTEGER  -- 未使用（历史遗留，默认 0）
```

### token_records 表

每次 AI 调用（chat / compact / sub-agent）保存一条记录。

```sql
-- 关键字段
inputTokens   INTEGER  -- billingInput (totalUsage)
outputTokens  INTEGER  -- billingOutput (totalUsage)
source        TEXT     -- 'chat' | 'compact' | 'sub-agent' | 'cron'
aborted       INTEGER  -- 1 = 流被中断
```

### compact_records 表

每次 compact 保存一条记录。

```sql
-- 关键字段
summary            TEXT     -- 压缩后的摘要
boundaryMessageId  TEXT     -- compact 边界（之前的消息被压缩）
inputTokens        INTEGER  -- compact 本身消耗的 input tokens
outputTokens       INTEGER  -- compact 本身消耗的 output tokens
trigger            TEXT     -- 'auto' | 'manual'
```

## UI 展示 (`StatusBar`)

### Context Window 显示

```
Context: {contextTokens} / {compactThreshold} ({percent}%)
```

- `contextTokens`：来自 SSE `data-usage` 事件的 `contextTokens` 字段
- 每次收到新的 `data-usage`（含 `contextTokens`），**替换**当前值（不累加）
- 颜色规则：< 80% 灰色，>= 80% 琥珀色，> 100% 红色
- 初始加载时从最后一条 assistant message 的 `contextTokens` 恢复

### Token Usage 显示

```
Tokens: {totalInput} in / {totalOutput} out
```

- 每次收到 SSE `data-usage` 事件，**累加** `inputTokens` 和 `outputTokens`
- 包含 chat + compact + sub-agent 的 token 消耗
- 初始加载时从 `getConversationTokenUsage()` API 查询 DB 获取历史总量

### SSE 事件与 StatusBar 更新时序

以一次包含 auto-compact 的请求为例：

```
[Compact 阶段]
  SSE: data-compact { status: 'started' }    → StatusBar 显示 "Compacting (auto)"
  SSE: data-compact { status: 'completed' }  → StatusBar 隐藏 compacting 状态
  SSE: data-usage { in: 5562, out: 587 }     → Tokens 累加 compact 消耗

[Chat 阶段]
  SSE: (streaming text/tool-calls)            → 消息区渲染
  SSE: data-usage { ctx: 3502, in: 9136, out: 487 }
    → Context 替换为 3502
    → Tokens 再累加 chat 消耗
```

## 完整示例

以下是一次 4 轮对话的完整 token 统计（threshold=5000）：

### Per-Step 明细

**Turn 1** (首条消息，3 步 tool call)：

| Step | finishReason | input | output | total | tools |
|------|-------------|-------|--------|-------|-------|
| 1 | tool-calls | 2,330 | 459 | 2,789 | TaskUpdate |
| 2 | tool-calls | 2,973 | 59 | 3,032 | TaskCreate |
| 3 | stop | 3,206 | 30 | 3,236 | - |

→ contextTokens=**3,236** | billingInput=**8,509** | billingOutput=**548**

**Turn 2** (3 步 tool call)：

| Step | finishReason | input | output | total | tools |
|------|-------------|-------|--------|-------|-------|
| 1 | tool-calls | 3,762 | 324 | 4,086 | TaskUpdate |
| 2 | tool-calls | 4,260 | 370 | 4,630 | TaskCreate |
| 3 | stop | 4,853 | 60 | 4,913 | - |

→ contextTokens=**4,913** | billingInput=**12,875** | billingOutput=**754**

**Turn 3** (3 步 tool call)：

| Step | finishReason | input | output | total | tools |
|------|-------------|-------|--------|-------|-------|
| 1 | tool-calls | 5,320 | 181 | 5,501 | TaskUpdate |
| 2 | tool-calls | 5,722 | 382 | 6,104 | TaskCreate |
| 3 | stop | 6,293 | 45 | 6,338 | - |

→ contextTokens=**6,338** | billingInput=**17,335** | billingOutput=**608**

**Turn 4** (auto-compact 触发 + 3 步 tool call)：

Compact: inputTokens=**5,562** | outputTokens=**587** | summary=1,157 chars

| Step | finishReason | input | output | total | tools |
|------|-------------|-------|--------|-------|-------|
| 1 | tool-calls | 2,635 | 259 | 2,894 | TaskUpdate |
| 2 | tool-calls | 3,083 | 144 | 3,227 | TaskCreate |
| 3 | stop | 3,418 | 84 | 3,502 | - |

→ contextTokens=**3,502** | billingInput=**9,136** | billingOutput=**487**

### StatusBar 逐步更新

| 时刻 | Context | Tokens |
|------|---------|--------|
| 初始 | -- / 5.0k | -- |
| Turn 1 完成 | 3.2k / 5.0k (65%) | 8.5k in / 0.5k out |
| Turn 2 完成 | 4.9k / 5.0k (98%) | 21.4k in / 1.3k out |
| Turn 3 完成 | 6.3k / 5.0k (127%) 🔴 | 38.7k in / 1.9k out |
| Turn 4 compact 完成 | 6.3k (未变) | 44.3k in / 2.5k out |
| Turn 4 chat 完成 | 3.5k / 5.0k (70%) | 53.4k in / 3.0k out |

### 总账

| Source | inputTokens | outputTokens |
|--------|------------|-------------|
| Turn 1 chat | 8,509 | 548 |
| Turn 2 chat | 12,875 | 754 |
| Turn 3 chat | 17,335 | 608 |
| Turn 4 compact | 5,562 | 587 |
| Turn 4 chat | 9,136 | 487 |
| **合计** | **53,417** | **2,984** |

## 关键代码位置

| 功能 | 文件 | 行 |
|------|------|---|
| Chat stream + token 采集 | `packages/server/src/routes/chat.ts` | `streamText()` 及 `onStepFinish` / `onFinish` |
| Compact 执行 | `packages/server/src/agent/compact.ts` | `compactConversation()` |
| Compact 消息重建 | `packages/server/src/agent/compact.ts` | `buildMessagesForModel()` |
| Auto-compact 触发判断 | `packages/server/src/routes/chat.ts` | `compactInputs` 构建逻辑 |
| Token record 持久化 | `packages/server/src/storage/token-records.ts` | `TokenRecordStorage.save()` |
| Message 持久化 (含 contextTokens) | `packages/server/src/storage/conversations.ts` | `saveMessage()` |
| UI token 累加 | `packages/ui/src/pages/chat/ChatPage.tsx` | `handleUsageUpdate()` |
| UI context 更新 | `packages/ui/src/pages/chat/ChatPage.tsx` | `handleContextUpdate()` |
| StatusBar 渲染 | `packages/ui/src/components/layout/StatusBar.tsx` | `StatusBar` component |
| SSE data-usage 接收 | `packages/ui/src/pages/chat/ChatWindow.tsx` | `chat.onData` handler |
