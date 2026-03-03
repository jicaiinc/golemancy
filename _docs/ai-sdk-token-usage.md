# AI SDK Token Usage 机制参考

> AI SDK v6 (`ai@6.0.82`) | 2026-02-22

## 核心概念：Step Usage vs Total Usage

AI SDK 的 run loop 中，每次 LLM 调用称为一个 **Step**。当存在工具调用时，会产生多个 Step：

```
Step 0: 用户消息 → LLM → 调用工具 A      usage₀
Step 1: 工具 A 结果 → LLM → 调用工具 B    usage₁（input 含完整历史，比 Step 0 大）
Step 2: 工具 B 结果 → LLM → 最终回答      usage₂（input 最大 = 当前上下文窗口）
```

---

## Usage 类型对照表

| 属性 | 类型 | 含义 | 代表什么 | 何时可用 |
|------|------|------|---------|---------|
| `result.usage` | `LanguageModelUsage` (generateText) / `PromiseLike` (streamText) | **最后一步**的 token 用量 | 当前**上下文窗口大小** — 反映这轮对话已消耗多少上下文 | generateText: 返回即可用; streamText: 流结束后 resolve |
| `result.totalUsage` | `LanguageModelUsage` (generateText) / `PromiseLike` (streamText) | **所有步骤的累加和** | **计费总量** — 本次请求实际消耗的 token 总数 | 同上 |
| `result.steps[i].usage` | `LanguageModelUsage` | **第 i 步**的 token 用量 | 单步消耗，用于逐步分析 | 同上 |

### 数值示例

| | inputTokens | outputTokens | 说明 |
|---|---|---|---|
| `steps[0].usage` | 100 | 20 | Step 0: 初始请求 |
| `steps[1].usage` | 150 | 25 | Step 1: input 增长（含 Step 0 完整历史 + 工具结果） |
| `steps[2].usage` | 200 | 50 | Step 2: input 最大（当前上下文窗口） |
| **`result.usage`** | **200** | **50** | = steps[2]，最后一步 = 上下文窗口 |
| **`result.totalUsage`** | **450** | **95** | = 三步累加，计费总量 |

---

## 回调中的 Usage

| 回调 | 触发时机 | 可用的 Usage | 用途 |
|------|---------|-------------|------|
| `onStepFinish({ usage })` | 每步完成时 | `usage` — 该步的 Step Usage | 实时推送每步 token 消耗 |
| `onFinish({ usage, totalUsage, steps })` | 全部步骤完成时 | `usage` = 最后一步; `totalUsage` = 累计; `steps[].usage` = 每步 | 最终汇总、持久化 |
| `onAbort({ steps })` | 流被中止时 | `steps[].usage` — 已完成步骤的 Usage | 收集部分 token（需手动累加） |

### 中止场景注意

| 行为 | 结果 |
|------|------|
| `onFinish` | **不触发** |
| `onAbort` | 触发，`steps` 仅含已完成步骤 |
| `result.totalUsage` | Promise **reject**（AbortError） |
| `onStepFinish` | 仅对已完成步骤触发 |

---

## 流事件中的 Usage

| 事件类型 | 包含的 Usage 字段 | 说明 |
|----------|-------------------|------|
| `{ type: 'finish-step' }` | `usage: LanguageModelUsage` | 该步的 Step Usage |
| `{ type: 'finish' }` | `totalUsage: LanguageModelUsage` | 所有步骤累加 |
| `{ type: 'abort' }` | 无 | 需从 `onAbort` 回调获取 |

---

## LanguageModelUsage 完整字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `inputTokens` | `number \| undefined` | 输入（prompt）token 数 |
| `outputTokens` | `number \| undefined` | 输出（completion）token 数 |
| `totalTokens` | `number \| undefined` | Provider 报告的总数（可能 ≠ input + output，含 reasoning 等额外开销） |
| `inputTokenDetails.noCacheTokens` | `number \| undefined` | 非缓存的输入 token |
| `inputTokenDetails.cacheReadTokens` | `number \| undefined` | 缓存命中读取的 token |
| `inputTokenDetails.cacheWriteTokens` | `number \| undefined` | 写入缓存的 token |
| `outputTokenDetails.textTokens` | `number \| undefined` | 输出中的文本 token |
| `outputTokenDetails.reasoningTokens` | `number \| undefined` | 输出中的推理 token（o1/o3 等模型） |
| `raw` | `JSONObject \| undefined` | Provider 原始 usage 数据 |

---

## v4 → v5/v6 迁移注意

```typescript
// v4: result.usage 是累计值
result.usage          // 所有步骤累加

// v5/v6: result.usage 仅最后一步，totalUsage 才是累计
result.usage          // 仅最后一步（上下文窗口）
result.totalUsage     // 所有步骤累加（计费）
```

---

## 一句话总结

> **`usage` = 最后一步 = 上下文窗口大小；`totalUsage` = 所有步骤累加 = 计费总量。**
