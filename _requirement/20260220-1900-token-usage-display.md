# Token Usage 显示增强

## 需求

### 1. Sub-agent token 穿透
通过 `onTokenUsage` 回调从 `chat.ts` 穿透到 `sub-agent.ts`，sub-agent（包括多级嵌套）完成时发 `data-usage` SSE 事件到前端，StatusBar 累加显示。

### 2. DB 历史加载
打开/切换对话时从 `token_records` 查询该对话的历史 token 总量作为初始值。刷新页面后不丢失。

### 3. Token 详情弹窗
点击 StatusBar 的 token 显示，向上弹出 popover（参考任务状态弹窗样式），展示：
- 按 Agent 维度：Agent 名称 + in/out tokens
- 按 Model 维度：provider/model + in/out tokens
- 数据范围：当前对话

## API 设计

`GET /api/projects/:projectId/conversations/:conversationId/token-usage`

```json
{
  "total": { "inputTokens": 2200, "outputTokens": 1000 },
  "byAgent": [
    { "agentId": "agent-xxx", "name": "Main Agent", "inputTokens": 1700, "outputTokens": 700 }
  ],
  "byModel": [
    { "provider": "anthropic", "model": "claude-sonnet-4-20250514", "inputTokens": 1700, "outputTokens": 700 }
  ]
}
```

## 实现计划

### Backend（3 个改动）
1. `tools.ts` + `sub-agent.ts` + `chat.ts`：onTokenUsage 回调穿透（~15 行）
2. `storage/token-records.ts`：添加查询方法 getConversationUsage（total, byAgent, byModel）
3. 新 route 或扩展 conversations route：token-usage 接口

### Frontend（2 个改动）
1. `ChatPage.tsx`：切换对话时调 API 拿历史数据设为初始值，实时 data-usage 在此基础上累加
2. `StatusBar.tsx`：token 文字改可点击 button，弹出 popover 展示 agent/model 维度明细（复用任务弹窗样式）
