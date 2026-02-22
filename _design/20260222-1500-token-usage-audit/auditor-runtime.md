# Runtime 层 Token Usage 审查报告

## 1. runtime.ts

### 代码位置

`packages/server/src/agent/runtime.ts:39-53`

```typescript
onStepFinish: ({ toolCalls, usage }) => {
  if (onEvent) {
    if (usage) {
      onEvent({
        type: 'token_usage',
        usage: { inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0 },
      })
    }
  }
},
```

### 分析

| 项目 | 内容 |
|------|------|
| 使用的字段 | `onStepFinish({ usage })` — 每步回调中的 `usage` |
| 语义 | **单步消耗** — 该步骤（一次 LLM API 调用）的 input/output tokens |
| 用途 | 通过 `onEvent` 回调向上层发射 `token_usage` 事件 |

**关键发现**：`runAgent()` 在生产代码中**未被使用**。通过 Grep 搜索确认，仅在 live test 文件中引用：
- `agent-execution.live.test.ts`
- `permission-modes.live.test.ts`

实际生产路径（`chat.ts`、`sub-agent.ts`、`executor.ts`）均**直接调用 `streamText`**，不经过 `runAgent()`。

**逻辑正确性**：就函数本身而言，使用 `onStepFinish.usage` 报告单步用量是正确的。AI SDK v6 的 `onStepFinish({ usage })` 确实表示该步骤的独立 token 消耗。但因为该函数未在生产中使用，对实际行为无影响。

### 结论：⚠️ 代码正确但未使用

函数逻辑本身正确（`onStepFinish.usage` = 单步消耗），但属于死代码（仅 live test 引用）。不影响生产环境 token 计算。


---

## 2. sub-agent.ts

### 代码位置

#### 正常完成路径：`packages/server/src/agent/sub-agent.ts:178-207`

```typescript
// Capture child agent token usage
const childUsage = await result.totalUsage
const childInputTokens = childUsage.inputTokens ?? 0
const childOutputTokens = childUsage.outputTokens ?? 0
state.usage = {
  inputTokens: childInputTokens,
  outputTokens: childOutputTokens,
  totalTokens: childUsage.totalTokens ?? 0,
}

// Propagate sub-agent token usage to SSE stream
if (onTokenUsage) {
  onTokenUsage({ inputTokens: childInputTokens, outputTokens: childOutputTokens })
}

// Persist token_record for the sub-agent API call
if (tokenRecordStorage) {
  tokenRecordStorage.save(projectId as ProjectId, {
    conversationId,
    agentId: childAgent.id,
    provider: childAgent.modelConfig.provider,
    model: childAgent.modelConfig.model,
    inputTokens: childInputTokens,
    outputTokens: childOutputTokens,
    source: 'sub-agent',
  })
}
```

#### 中止路径：`packages/server/src/agent/sub-agent.ts:100-127`

```typescript
onAbort: async ({ steps }) => {
  // Sum usage from completed steps (matches chat.ts pattern)
  let inputTokens = 0, outputTokens = 0
  for (const step of steps) {
    inputTokens += step.usage?.inputTokens ?? 0
    outputTokens += step.usage?.outputTokens ?? 0
  }
  // ... save to tokenRecordStorage and onTokenUsage
}
```

### 分析

| 路径 | 使用的字段 | 语义 | 正确性 |
|------|-----------|------|--------|
| 正常完成 | `result.totalUsage` | **计费总量** — 子 agent 所有步骤的 token 累加 | ✅ |
| 中止 | `steps[].usage` 手动累加 | **已完成步骤的计费部分** — abort 时 `totalUsage` 不可用 | ✅ |

**详细分析**：

1. **正常完成**：使用 `result.totalUsage` 是完全正确的。AI SDK v6 的 `totalUsage` = 所有步骤 usage 的累加 = 计费总量。子 agent 可能有多步（工具调用循环），`totalUsage` 正确反映了整个子 agent 执行的计费消耗。

2. **中止路径**：`onAbort({ steps })` 中只能访问已完成的步骤，`result.totalUsage` 此时不可用（promise 不会 resolve）。手动累加 `steps[].usage` 是 AI SDK 推荐的 abort 处理方式，等效于"已完成部分的 totalUsage"。

3. **传播机制**：
   - `onTokenUsage` 回调将用量传给父级 SSE stream（最终通过 `data-usage` 事件发给前端）
   - `tokenRecordStorage.save()` 持久化到数据库
   - `state.usage` 存入工具返回值（随 tool-result 持久化）
   - 三条路径确保了 token 数据不丢失

4. **潜在问题 — 嵌套子 agent 的 token 传播**：
   - 子 agent 自身的 `totalUsage` 已包含其**直接** API 调用的所有步骤
   - 但如果子 agent 又调用了孙 agent（无限嵌套），孙 agent 的 `onTokenUsage` 回调会在子 agent 的 `loadTools` 中绑定，通过 `onTokenUsage` 链逐层传播到顶层
   - 这意味着：子 agent 的 `tokenRecordStorage.save()` 只记录其自身的 API 调用消耗，孙 agent 的消耗由孙 agent 自己记录 — 这是正确的，不会重复计数

### 结论：✅ 正确

正常完成和中止两条路径均正确使用了 AI SDK 的 token 字段。嵌套传播逻辑无重复计数问题。


---

## 3. compact.ts

### 代码位置

`packages/server/src/agent/compact.ts:91-99`

```typescript
const result = await generateText({
  model: opts.model,
  system: 'You are a helpful AI assistant tasked with summarizing conversations.',
  messages: [...opts.messages, { role: 'user', content: compactPromptText }],
  abortSignal: opts.signal,
})

const inputTokens = result.usage.inputTokens ?? 0
const outputTokens = result.usage.outputTokens ?? 0
```

调用方（`chat.ts:242-260`）将 compact 结果保存到 tokenRecordStorage：

```typescript
const compactResult = await compactConversation({...})

deps.tokenRecordStorage.save(projectId as ProjectId, {
  conversationId, agentId: agentId as string,
  provider: agent.modelConfig.provider, model: agent.modelConfig.model,
  inputTokens: compactResult.inputTokens, outputTokens: compactResult.outputTokens,
  source: 'chat',
})
```

### 分析

| 项目 | 内容 |
|------|------|
| 使用的字段 | `result.usage`（generateText 的返回值）|
| 语义 | **最后一步的 token 用量** = 当前上下文窗口大小 |
| 实际意图 | 应记录计费总量 |

**关键问题**：

1. `generateText` 调用时**未传入 `tools`**，也**未设置 `maxSteps`**，因此只会执行**一步**。
2. 只有一步时，`result.usage === result.totalUsage`（值相同）。
3. 因此在当前实现下，取 `result.usage` 和 `result.totalUsage` 得到的数值完全一致。

**但存在语义不精确**：
- `result.usage` 的语义是"最后一步的用量"（对应上下文窗口大小）
- `result.totalUsage` 的语义是"所有步骤累加"（对应计费总量）
- 这里的用途是记录到 `tokenRecordStorage`（计费记录），语义上应使用 `result.totalUsage`
- 如果未来 compact 添加了工具（如搜索工具辅助摘要）或 `maxSteps > 1`，`result.usage` 只会返回最后一步，导致计费记录不完整

### 结论：⚠️ 当前值正确，但语义不精确

数值无误（单步场景 `usage === totalUsage`），但应改用 `result.totalUsage` 以匹配计费语义，提升代码健壮性。建议修改：

```typescript
// 建议：改用 totalUsage 以匹配计费语义
const inputTokens = result.totalUsage.inputTokens ?? 0
const outputTokens = result.totalUsage.outputTokens ?? 0
```


---

## 4. executor.ts (Cron Job 执行器)

### 代码位置

`packages/server/src/scheduler/executor.ts:159-194`

```typescript
// 10. Save assistant response with full parts (tool calls, tool results, text)
const usage = await result.totalUsage
const assistantContent = await result.text
const inputTokens = usage.inputTokens ?? 0
const outputTokens = usage.outputTokens ?? 0

// 保存到消息记录
await this.deps.conversationStorage.saveMessage(projectId, conversationId, {
  id: assistantMsgId as any,
  role: 'assistant',
  parts: assistantParts,
  content: assistantContent,
  inputTokens,       // totalUsage.inputTokens（计费总量）
  outputTokens,      // totalUsage.outputTokens（计费总量）
  provider: agent.modelConfig.provider,
  model: agent.modelConfig.model,
})

// 保存到 token_record
this.deps.tokenRecordStorage.save(projectId, {
  conversationId,
  messageId: assistantMsgId,
  agentId: cronJob.agentId,
  provider: agent.modelConfig.provider,
  model: agent.modelConfig.model,
  inputTokens,
  outputTokens,
  source: 'cron',
})
```

### 分析

| 项目 | 内容 |
|------|------|
| 使用的字段 | `result.totalUsage` |
| 语义 | **计费总量** — 所有步骤的 token 累加 |
| 正确性 | tokenRecordStorage 部分 ✅，消息保存部分 ⚠️ |

**正确的部分**：
1. `result.totalUsage` 正确用于 `tokenRecordStorage.save()`（计费记录）
2. 有工具支持（`stopWhen: stepCountIs(10)`），多步场景下 `totalUsage` 正确累加

**问题 1 — 消息保存的字段语义不一致**：

对比 `chat.ts` 的消息保存：
```typescript
// chat.ts — 保存 contextTokens（上下文窗口大小）
const lastStepUsage = await result.usage          // 最后一步
const contextTokens = lastStepUsage.totalTokens   // 上下文窗口大小
await deps.conversationStorage.saveMessage(..., {
  contextTokens,  // ← 上下文窗口
})
```

```typescript
// executor.ts — 保存 inputTokens/outputTokens（计费总量）
const usage = await result.totalUsage  // 所有步骤累加
await this.deps.conversationStorage.saveMessage(..., {
  inputTokens,   // ← 计费总量
  outputTokens,  // ← 计费总量
})
```

`chat.ts` 保存的是 `contextTokens`（上下文窗口大小，用于 auto-compact 阈值判断），而 `executor.ts` 保存的是 `inputTokens` / `outputTokens`（计费总量）。这两组是不同的字段名，所以不会互相覆盖。但 `executor.ts` **没有保存 `contextTokens`**。

**影响**：如果 cron 对话后续需要 auto-compact（比如 cron job 多轮对话扩展），因为缺少 `contextTokens`，auto-compact 的阈值检查 (`lastAssistant?.contextTokens ?? 0`) 始终为 0，永远不会触发。当前 cron 只执行单轮对话所以无实际影响，但属于遗漏。

**问题 2 — 缺少 `onAbort` 处理**：

`executor.ts` 的 `streamText` 调用没有传入 `abortSignal`，也没有 `onAbort` 回调。这意味着：
- 正常情况下无法中止 cron 执行
- 如果 LLM 流中间出错（网络断开等），异常会被 catch 捕获，但**已消耗的 token 不会被记录**
- 对比 `chat.ts` 和 `sub-agent.ts` 都有完整的 `onAbort` 处理

**问题 3 — 消息字段不统一**：

`executor.ts` 将 `inputTokens` / `outputTokens` 直接写到消息上（可能是为了显示），但 `chat.ts` 不写这两个字段到消息上（它只写 `contextTokens`，计费数据走 `tokenRecordStorage`）。两个代码路径保存的消息字段不一致，可能导致 UI 层展示逻辑混乱。

### 结论：⚠️ 核心计费逻辑正确，但有三处遗漏

1. **缺少 `contextTokens`**：未保存上下文窗口大小（`result.usage.totalTokens`）
2. **缺少 `onAbort`**：异常时丢失已消耗的 token 记录
3. **消息字段不统一**：与 `chat.ts` 保存的消息字段不一致（`inputTokens/outputTokens` vs `contextTokens`）


---

## 总结表格

| 文件 | 使用的字段 | 语义 | 是否正确 | 问题描述 |
|------|-----------|------|---------|---------|
| `runtime.ts` | `onStepFinish({ usage })` | 单步消耗 | ⚠️ 代码正确但未使用 | 函数 `runAgent()` 在生产中未被调用（仅 live test），属于死代码 |
| `sub-agent.ts` (正常) | `result.totalUsage` | 计费总量 | ✅ 正确 | 无问题 |
| `sub-agent.ts` (中止) | `steps[].usage` 手动累加 | 已完成步骤的计费部分 | ✅ 正确 | 无问题 |
| `compact.ts` | `result.usage` | 最后一步用量（≈上下文窗口） | ⚠️ 值正确但语义不精确 | 应改用 `result.totalUsage` 匹配计费语义；当前单步场景值相同，但不够健壮 |
| `executor.ts` (正常) | `result.totalUsage` | 计费总量 | ⚠️ 计费正确但有遗漏 | ① 缺少 `contextTokens` 保存 ② 缺少 `onAbort` ③ 消息字段与 chat.ts 不统一 |

## 建议修复优先级

| 优先级 | 文件 | 修复项 |
|--------|------|--------|
| P2 | `compact.ts` | `result.usage` → `result.totalUsage`（语义修正，防止未来添加工具后出错） |
| P2 | `executor.ts` | 补充 `contextTokens` 保存（`result.usage.totalTokens`），与 chat.ts 对齐 |
| P3 | `executor.ts` | 考虑添加 `abortSignal` + `onAbort`，使 cron 可取消且异常时记录 token |
| P3 | `executor.ts` | 统一消息保存字段（只存 `contextTokens`，不存 `inputTokens/outputTokens`） |
| P4 | `runtime.ts` | 评估 `runAgent()` 是否应废弃或重新整合到生产路径 |
