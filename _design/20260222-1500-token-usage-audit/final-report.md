# Token Usage 审查最终报告

> 审查日期：2026-02-22
> Team Lead 二次确认：已完成（亲自阅读全部关键源码验证）

## AI SDK 核心概念速查

| AI SDK 字段 | 语义 | 用途 |
|-------------|------|------|
| `result.usage` | 最后一步的 token 用量 | **上下文窗口大小**（反映当前对话消耗了多少上下文） |
| `result.totalUsage` | 所有步骤的 token 累加 | **计费总量**（本次请求实际消耗的 token 总数） |
| `onStepFinish({ usage })` | 单步 token 用量 | 实时推送每步消耗 |
| `onAbort({ steps })` | 已完成步骤的 usage | abort 时需手动累加 `steps[].usage` |

---

## 审查总表

### 一、Agent Runtime 层

| # | 文件 | 代码位置 | 使用的 AI SDK 字段 | 语义 | 是否正确 | 问题描述 |
|---|------|---------|-------------------|------|---------|---------|
| 1 | `runtime.ts` | L39-53 `onStepFinish` | `onStepFinish({ usage })` | 单步消耗 | ⚠️ 代码正确但未使用 | `runAgent()` 在生产中未被调用（仅 live test），属死代码 |
| 2 | `sub-agent.ts` | L178 正常完成 | `result.totalUsage` | 计费总量 | ✅ 正确 | — |
| 3 | `sub-agent.ts` | L100-127 中止 | `steps[].usage` 手动累加 | 已完成步骤计费 | ✅ 正确 | — |
| 4 | `compact.ts` | L98-99 | `result.usage` | 最后一步（=计费，因单步） | ⚠️ 值正确但语义不精确 | 应改用 `result.totalUsage` 匹配计费语义，当前单步场景值相同 |
| 5 | `executor.ts` | L159 token_records | `result.totalUsage` | 计费总量 | ✅ 正确 | — |
| 6 | `executor.ts` | L166-175 消息保存 | `result.totalUsage` | 计费总量写入 message | ⚠️ 缺少 contextTokens | 未保存 `result.usage.totalTokens`（上下文窗口），与 chat.ts 不一致 |
| 7 | `executor.ts` | 整体 | 无 `onAbort` | — | ⚠️ 遗漏 | 异常/中断时已消耗 token 不会被记录 |

### 二、Server 路由与存储层

| # | 文件 | 代码位置 | 使用的 AI SDK 字段 | 语义 | 是否正确 | 问题描述 |
|---|------|---------|-------------------|------|---------|---------|
| 8 | `chat.ts` onFinish | L374 `result.usage` | `result.usage.totalTokens` | 上下文窗口 | ✅ 正确 | 存入 messages.contextTokens，用于 auto-compact |
| 9 | `chat.ts` onFinish | L375 `result.totalUsage` | `totalUsage.inputTokens/outputTokens` | 计费总量 | ✅ 正确 | 存入 token_records |
| 10 | `chat.ts` onFinish | L416-419 SSE | contextTokens + billing | 上下文 + 计费 | ✅ 正确 | 推送给前端两种数据 |
| 11 | `chat.ts` onAbort | L299-325 | `steps[].usage` 手动累加 | 已完成步骤计费 | ✅ 正确 | 标记 `aborted: true` |
| 12 | `chat.ts` sub-agent SSE | L192-197 | `onTokenUsage` 回调 | 子 agent 计费 | ✅ 正确 | 推送到 SSE，前端累加 |
| 13 | `chat.ts` auto-compact | L255-260 | `compactResult.*` | generateText 总 usage | ✅ 正确 | `source: 'chat'` 不够精确（建议 `'compact'`） |
| 14 | `conversations.ts` | L210-229 token-usage API | token_records `SUM` | conversation 计费总量 | ✅ 正确 | — |
| 15 | `token-records.ts` | save/query | 直接读写 | 纯数据落盘 | ✅ 正确 | — |
| 16 | `schema.ts` messages | messages 表 | `context_tokens` 字段 | 上下文窗口 | ✅ 正确 | `input_tokens`/`output_tokens` 为 legacy 字段，当前始终为 0 |
| 17 | `schema.ts` token_records | token_records 表 | `input_tokens`/`output_tokens` | 计费记录 | ✅ 正确 | — |
| 18 | `dashboard.ts` | getSummary 等 | token_records `SUM` + messages 回退 | 项目计费总量 | ✅ 正确 | `UNION ALL` + `NOT EXISTS` 向后兼容，去重正确 |
| 19 | `global-dashboard.ts` | 跨 project 聚合 | 同 dashboard.ts | 全局计费总量 | ✅ 正确 | — |

### 三、UI 层

| # | UI 位置 | 显示内容 | 数据来源 | 语义 | 是否正确 | 问题描述 |
|---|---------|---------|---------|------|---------|---------|
| 20 | StatusBar "Tokens: X in / Y out" | 会话级 input/output | 初始: token_records SUM; 实时: SSE `data-usage` 累加 | **计费总量** | ✅ 正确 | — |
| 21 | StatusBar Token 弹出框 | by agent / by model 分组 | `getConversationTokenUsage` API | **计费总量** | ✅ 正确 | 不随 SSE 实时更新，仅切换会话时加载 |
| 22 | StatusBar "Context: X / threshold" | 上下文窗口占比 | 初始: 最后 assistant msg 的 `contextTokens`; 实时: SSE | **上下文窗口** | ✅ 正确 | — |
| 23 | Dashboard 页面 | 项目/全局 token 统计 | `IDashboardService` | **计费总量** | ✅ 正确 | — |
| 24 | Message.inputTokens/outputTokens | 每条消息的 token | messages 表 | — | N/A — 冗余字段 | chat 流程中始终为 0，计费在 token_records |

---

## 问题汇总

| 优先级 | 问题 | 文件 | 影响 | 建议修复 |
|--------|------|------|------|---------|
| **P2** | compact.ts 使用 `result.usage` 而非 `result.totalUsage` | `compact.ts:98` | 当前值正确（单步场景），但若未来添加工具则计费不完整 | 改为 `result.totalUsage` |
| **P2** | executor.ts 未保存 `contextTokens` | `executor.ts:166-175` | cron 对话无法触发 auto-compact | 补充 `contextTokens: (await result.usage).totalTokens` |
| **P2** | executor.ts 消息字段与 chat.ts 不统一 | `executor.ts:166-175` | executor 存 `inputTokens/outputTokens` 到消息，chat 只存 `contextTokens` | 统一为只存 `contextTokens` |
| **P3** | executor.ts 缺少 onAbort/abortSignal | `executor.ts:136-142` | 异常时已消耗 token 丢失 | 添加 abort 处理 |
| **P3** | compact token 的 source 标记不精确 | `chat.ts:259`, `conversations.ts:186` | 无法区分 compact 和正常 chat 的 token 消耗 | 新增 `source: 'compact'` |
| **P4** | Token 弹出框不实时更新 | `ChatPage.tsx:52-73` | 长对话后弹出框数据过时 | 流结束后重新 fetch，或用 SSE 增量更新 |
| **P4** | runtime.ts `runAgent()` 死代码 | `runtime.ts` | 无实际影响 | 评估是否废弃 |
| **info** | Message 表 `inputTokens`/`outputTokens` 冗余 | `schema.ts` | 字段始终为 0（除 executor），legacy 保留用于 dashboard 回退 | 长期可 deprecated |

---

## 数据流总图

```
streamText (chat.ts / executor.ts)
  │
  ├── result.usage (最后一步)
  │     └── .totalTokens → contextTokens → messages 表 → auto-compact 阈值判断
  │                                       → SSE data-usage.contextTokens → StatusBar Context
  │
  ├── result.totalUsage (所有步骤累加)
  │     └── .inputTokens/.outputTokens → token_records 表 → Dashboard / API 查询
  │                                    → SSE data-usage.inputTokens/outputTokens → StatusBar Tokens
  │
  ├── onAbort ({ steps })
  │     └── 手动累加 steps[].usage → token_records (aborted=true)
  │
  └── Sub-agent (sub-agent.ts)
        ├── result.totalUsage → token_records (source='sub-agent')
        └── onTokenUsage → SSE data-usage → StatusBar Tokens 累加

compact (compact.ts / generateText)
  └── result.usage (单步=总量) → token_records (source='chat')
                               → compact_records (元数据)
```

---

## 结论

**整体 token usage 计算正确，架构设计合理**。

核心设计亮点：
1. `result.usage`（上下文窗口）和 `result.totalUsage`（计费总量）在 chat.ts 中正确分离
2. 双表设计：messages 表存 contextTokens（用于 compact），token_records 表存计费数据
3. SSE 同时推送两种数据，前端正确分离显示
4. 子 agent token 无重复计数：各层独立记录自己的 API 调用消耗
5. Dashboard 的 `UNION ALL` + `NOT EXISTS` 向后兼容设计

主要改进点集中在 `executor.ts`（与 chat.ts 的字段不统一）和 `compact.ts`（语义不精确）。均非计算错误，而是健壮性和一致性问题。
