# UI 层 Token Usage 审查报告

## 1. 数据流追踪

### SSE → Service → Store → UI 的完整链路

```
[Server] chat.ts onFinish callback
  │
  │  const lastStepUsage = await result.usage        // AI SDK: 最后一步 usage
  │  const billingUsage = await result.totalUsage     // AI SDK: 所有步骤累加
  │  contextTokens = lastStepUsage.totalTokens        // 上下文窗口大小
  │  billingInput  = billingUsage.inputTokens          // 计费 input
  │  billingOutput = billingUsage.outputTokens         // 计费 output
  │
  │  writer.write({ type: 'data-usage', data: { contextTokens, inputTokens: billingInput, outputTokens: billingOutput } })
  │  tokenRecordStorage.save(...)  // 同时写入 token_records 表（billing total）
  ▼
[Client] ChatWindow.tsx — chat.onData callback (line 125-143)
  │
  │  part.type === 'data-usage' → 分两路:
  │    1. onUsageUpdate({ inputTokens, outputTokens })   → 计费量
  │    2. onContextUpdate(part.data.contextTokens)        → 上下文窗口
  ▼
[Client] ChatPage.tsx — 两个 handler
  │
  │  handleUsageUpdate (line 75-80):
  │    setConversationUsage(prev => prev + usage)  // 累加计费量
  │
  │  handleContextUpdate (line 82-84):
  │    setContextTokens(tokens)                    // 替换（不累加）
  ▼
[Client] StatusBar.tsx — 两个独立显示区
  │
  ├─ "Tokens: X in / Y out"       ← conversationUsage (计费累计)
  ├─ Token 弹出框 (by agent/model) ← tokenBreakdown (历史计费)
  └─ "Context: X / threshold (N%)" ← contextTokens (上下文窗口)
```

### 额外数据源：子 Agent 的 token

在 `chat.ts` line 192-198 中，`loadAgentTools` 的 `onTokenUsage` 回调也会发送 `data-usage` 事件：
```typescript
onTokenUsage: (usage) => {
  streamWriter?.write({
    type: 'data-usage' as `data-${string}`,
    data: usage,  // 子 agent 的 usage 对象
  })
}
```
这些子 agent 的用量也会被 `handleUsageUpdate` 累加，与主 agent 的 `onFinish` usage 一起构成会话总量。

### 历史数据加载

切换会话时 (`ChatPage.tsx` line 52-73)：
- 调用 `getConversationTokenUsage(projectId, conversationId)` → 返回 `token_records` 表的 SUM（计费总量）
- `setConversationUsage(result.total)` — 设为历史总量
- `setTokenBreakdown(result)` — by agent / by model 分组

---

## 2. StatusBar.tsx

### 代码位置
`packages/ui/src/components/layout/StatusBar.tsx`

### 显示内容

#### 2.1 Token 主显示 (line 219-221)
```tsx
{tokenUsage
  ? `Tokens: ${formatTokenCount(tokenUsage.inputTokens)} in / ${formatTokenCount(tokenUsage.outputTokens)} out`
  : 'Tokens: --'}
```
- **数据来源**: `tokenUsage` prop = `ChatPage.conversationUsage` state
- **语义**: 当前会话的**计费总量**（所有请求的 `totalUsage` 累加）
- **初始值**: 切换会话时从 `getConversationTokenUsage` API 加载（token_records SUM）
- **实时更新**: 每次 SSE `data-usage` 事件触发 `handleUsageUpdate` 累加

#### 2.2 Token 弹出框 (line 224-268)
点击 "Tokens" 后弹出，包含两部分：
- **BY AGENT**: `tokenBreakdown.byAgent` — 按 agent 分组的计费量
- **BY MODEL**: `tokenBreakdown.byModel` — 按 provider/model 分组的计费量
- **数据来源**: `tokenBreakdown` prop = `ChatPage.tokenBreakdown` state = `getConversationTokenUsage` API 返回
- **注意**: 弹出框数据**不会实时更新**，只在会话切换时从 API 加载一次

#### 2.3 Context Window 显示 (line 140-212)
```tsx
{contextTokens != null
  ? `Context: ${formatTokenCount(contextTokens)} / ${formatTokenCount(compactThreshold)} (${contextPercent}%)`
  : `Context: -- / ${formatTokenCount(compactThreshold)}`}
```
- **数据来源**: `contextTokens` prop = `ChatPage.contextTokens` state
- **语义**: 当前上下文窗口大小（最后一步的 `usage.totalTokens`）
- **初始值**: 切换会话时从最后一条 assistant message 的 `contextTokens` 字段恢复
- **实时更新**: SSE `data-usage` 事件中的 `contextTokens` 字段

#### 2.4 Context Window 弹出框
- 进度条 + 百分比
- "Compact Now" 按钮，触发手动 compact

### 结论
StatusBar 的 Token 显示和 Context Window 显示使用了**两个不同的数据源**，语义清晰分离：
- Token = 计费总量（billing total）
- Context = 上下文窗口大小（context window）

---

## 3. ChatPage.tsx / ChatWindow.tsx

### ChatPage.tsx (line 27-84)

#### Token 状态管理
```typescript
const [conversationUsage, setConversationUsage] = useState<{ inputTokens: number; outputTokens: number } | null>(null)
const [tokenBreakdown, setTokenBreakdown] = useState<ConversationTokenUsageResult | null>(null)
const [contextTokens, setContextTokens] = useState<number | null>(null)
```

#### 历史加载 (line 52-73)
切换会话时从 API 加载历史 token 数据：
```typescript
svc.conversations.getConversationTokenUsage(currentProject.id, currentConversationId)
  .then(result => {
    setConversationUsage(result.total)    // 设置计费总量
    setTokenBreakdown(result)              // 设置分组明细
  })
```

#### 实时累加 (line 75-80)
```typescript
const handleUsageUpdate = useCallback((usage) => {
  setConversationUsage(prev => prev
    ? { inputTokens: prev.inputTokens + usage.inputTokens, outputTokens: prev.outputTokens + usage.outputTokens }
    : usage
  )
}, [])
```
每次 SSE `data-usage` 事件都累加。这确保了：
- 历史总量（初始加载）+ 当前会话新增量 = 最新总量

#### Context 恢复 (line 36-49)
切换会话时从消息历史恢复 contextTokens：
```typescript
const lastAssistant = [...conv.messages].reverse().find(m => m.role === 'assistant')
setContextTokens(lastAssistant?.contextTokens ?? null)
```

### ChatWindow.tsx (line 122-143)

#### SSE 数据接收
通过 `chat.onData` 回调接收 SSE 事件：
```typescript
if (part.type === 'data-usage' && part.data) {
  onUsageUpdate?.({
    inputTokens: (part.data.inputTokens as number) ?? 0,
    outputTokens: (part.data.outputTokens as number) ?? 0,
  })
  if (onContextUpdate && part.data.contextTokens != null) {
    onContextUpdate(part.data.contextTokens as number)
  }
}
```

### 结论
ChatPage 和 ChatWindow 的职责分离清晰：
- ChatWindow: 接收 SSE 事件，传递给父组件
- ChatPage: 管理状态，累加计费量，传递给 StatusBar

---

## 4. Store 中的 token state

### 搜索结果
在 `packages/ui/src/stores/useAppStore.ts` 中，**没有找到** token/usage 相关的 state 或 action。

Token 数据完全由 `ChatPage` 的 `useState` 管理，不经过 Zustand store。这意味着：
- Token 数据是**页面级**的，离开 ChatPage 就丢失
- 不会在 sidebar 或其他页面显示
- 没有全局 token 统计在 store 中

### 结论
Token 状态管理在 React 组件层面，设计合理（不需要跨页面共享），但也限制了未来的扩展性。

---

## 5. Service 层 token 处理

### HttpConversationService (packages/ui/src/services/http/services.ts)

#### getConversationTokenUsage (line 119-123)
```typescript
getConversationTokenUsage(projectId: ProjectId, conversationId: ConversationId) {
  return fetchJson<ConversationTokenUsageResult>(
    `${this.baseUrl}/api/projects/${projectId}/conversations/${conversationId}/token-usage`,
  )
}
```
请求服务端 API → 服务端查询 `token_records` 表 SUM → 返回计费总量。

#### SSE data-usage 接收
SSE 数据通过 AI SDK 的 `useChat` → `chat.onData` 回调接收，**不经过** HttpConversationService。这是因为 chat 使用的是 AI SDK 的 SSE 流，不是普通 HTTP 请求。

### MockConversationService (packages/ui/src/services/mock/services.ts)

#### getConversationTokenUsage (line 278-281)
```typescript
async getConversationTokenUsage(): Promise<ConversationTokenUsageResult> {
  return { total: { inputTokens: 0, outputTokens: 0 }, byAgent: [], byModel: [] }
}
```
Mock 实现返回空数据，合理（mock 模式下不经过真实 AI 调用）。

### Mock 数据 (packages/ui/src/services/mock/data.ts)

Seed message 中的 token 数据：
```typescript
// msg-2 (assistant)
inputTokens: 1250,
outputTokens: 480,
contextTokens: 1730,
```
**注意**：这里 `inputTokens` 和 `outputTokens` 是非零值，但在真实 chat 流程中，assistant 消息的 `inputTokens`/`outputTokens` 始终为 0（chat.ts saveMessage 不传递这两个字段）。Seed 数据与实际行为**不一致**，但仅影响 mock 模式的展示，不影响真实功能。

### 结论
Service 层的 token 处理正确。`getConversationTokenUsage` API 返回的是 `token_records` 表的 SUM（计费总量），与 StatusBar 显示一致。

---

## 6. 类型定义

### Message 类型 (packages/shared/src/types/conversation.ts)
```typescript
export interface Message extends Timestamped {
  inputTokens: number   // 实际在 chat 流程中始终为 0
  outputTokens: number  // 实际在 chat 流程中始终为 0
  contextTokens: number // last-step totalTokens — actual context window size
  provider: string
  model: string
}
```

**问题发现**: `Message.inputTokens` 和 `Message.outputTokens` 字段在真实 chat 流程中未被填充（`saveMessage` 调用时不传递这两个值，默认为 0）。计费数据实际存储在 `token_records` 表中。这两个字段目前是**冗余**的。

### ConversationTokenUsageResult (packages/shared/src/services/interfaces.ts)
```typescript
export interface ConversationTokenUsageResult {
  total: { inputTokens: number; outputTokens: number }
  byAgent: Array<{ agentId: string; name: string; inputTokens: number; outputTokens: number }>
  byModel: Array<{ provider: string; model: string; inputTokens: number; outputTokens: number }>
}
```
来源: `token_records` 表 SUM。语义: **计费总量**。正确。

### StatusBar Props
```typescript
interface StatusBarProps {
  tokenUsage?: { inputTokens: number; outputTokens: number } | null    // 计费总量
  tokenBreakdown?: ConversationTokenUsageResult | null                  // 分组明细
  contextTokens?: number | null                                         // 上下文窗口
  compactThreshold?: number | null                                      // compact 阈值
}
```
Props 设计清晰，分离了计费量和上下文窗口。

---

## 7. 关键发现

### 7.1 Token 弹出框不随 SSE 实时更新
`tokenBreakdown` 只在会话切换时从 API 加载一次（`ChatPage.tsx` line 52-73）。流式传输期间，主显示 "Tokens: X in / Y out" 会实时累加，但弹出框中的 by-agent / by-model 分组**不会更新**。用户在一轮长对话后点开弹出框，看到的数据可能是过时的。

### 7.2 Message 表中 inputTokens/outputTokens 冗余
`Message.inputTokens` 和 `Message.outputTokens` 在真实 chat 流程中始终为 0，计费数据存储在独立的 `token_records` 表。这两个字段是设计残留（或预留），但 seed 数据中填充了非零值导致与实际行为不一致。

### 7.3 无 Project/Global 级别 StatusBar token 显示
StatusBar 只显示**当前会话**的 token。Project 级别和全局级别的 token 统计仅在 Dashboard 页面提供（通过 `IDashboardService` 和 `IGlobalDashboardService`），不在常驻 UI 中展示。

### 7.4 子 Agent data-usage 事件可能缺少 contextTokens
主 agent 的 `onFinish` 回调发送的 `data-usage` 包含 `{ contextTokens, inputTokens, outputTokens }`，但子 agent 的 `onTokenUsage` 回调发送的 `data-usage` 内容取决于 `loadAgentTools` 传入的 usage 对象格式。如果子 agent 的 usage 不包含 `contextTokens`，则不会触发 `onContextUpdate`（因为有 `part.data.contextTokens != null` 守卫）。这是安全的，不会导致错误。

---

## 总结表格

| UI 位置 | 显示内容 | 数据来源 | 语义 | 是否正确 | 问题描述 |
|---------|---------|---------|------|---------|---------|
| StatusBar 主显示 "Tokens: X in / Y out" | 会话级 input/output token 总量 | 初始: `getConversationTokenUsage` API (token_records SUM); 实时: SSE `data-usage` 累加 | **计费总量** (totalUsage) | **正确** | 标签仅为 "Tokens"，未明确说明是计费量 |
| StatusBar Token 弹出框 (BY AGENT) | 按 agent 分组的 input/output | `getConversationTokenUsage` API | **计费总量** (token_records SUM by agent) | **正确** | 不随 SSE 实时更新，只在会话切换时加载 |
| StatusBar Token 弹出框 (BY MODEL) | 按 model 分组的 input/output | `getConversationTokenUsage` API | **计费总量** (token_records SUM by model) | **正确** | 同上 |
| StatusBar Context Window "Context: X / threshold" | 当前上下文窗口 token 数 | 初始: 最后 assistant msg 的 `contextTokens`; 实时: SSE `data-usage.contextTokens` | **上下文窗口** (last step usage.totalTokens) | **正确** | 语义准确，用于 compact 决策 |
| StatusBar Context Window 进度条 | contextTokens / compactThreshold 百分比 | 同上 | **上下文窗口占比** | **正确** | — |
| Message.inputTokens / outputTokens | 每条消息的 token | messages 表 | **预留字段** | **N/A — 未使用** | 真实 chat 中 assistant 消息这两个字段始终为 0，实际计费在 token_records |
| Message.contextTokens | 该消息的上下文窗口大小 | messages 表 (saveMessage 时传入) | **上下文窗口** | **正确** | 用于恢复 Context Window 显示 |
| Dashboard 页面 | 项目级/全局级 token 统计 | `IDashboardService` / `IGlobalDashboardService` | **计费总量** (按时间/model/agent) | **正确** | 独立于 StatusBar，不在本次审查范围 |

## 最终结论

1. **StatusBar 的 Token 显示语义正确**: 显示的是会话级计费总量（`totalUsage` 累加），不是上下文窗口大小。数据来源清晰，从 `token_records` 表聚合。
2. **Context Window 显示语义正确**: 显示的是最后一步的 `usage.totalTokens`（上下文窗口），用于判断是否需要 compact。
3. **两种显示正确分离**: Token（计费）和 Context（上下文窗口）使用不同数据源，不会混淆。
4. **小问题**: Token 弹出框的 by-agent/by-model 数据不随流式传输实时更新；Message 表中 inputTokens/outputTokens 字段在真实流程中未使用。
