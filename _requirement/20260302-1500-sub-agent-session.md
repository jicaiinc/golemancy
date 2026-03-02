# 需求清单：Sub-Agent 有状态 Session 支持
> 创建时间：2026-03-02 15:00
> 状态：已确认

## 功能需求
1. Sub-agent 支持有状态 session——通过传入 `sessionId` 恢复之前的对话上下文，而不是每次从零开始
2. Session 复用现有 Conversation + Message 基础设施（不新建表，sub-agent session 就是一个属于子 agent 的 conversation）
3. 工具 input schema 新增可选 `sessionId` 参数——不传时行为与现在完全一致（无状态）
4. 首次调用创建 session 并返回 `sessionId`——父 agent 从 tool result 中读取 sessionId，后续传回即可恢复
5. `SubAgentStreamState` 类型新增可选 `sessionId` 字段
6. 透传 `conversationStorage`（IConversationService）：从 chat.ts / executor.ts → tools.ts → sub-agent.ts
7. 无 `conversationStorage` 时降级——完全保持原有 `prompt` 调用方式，零行为变化
8. Edge case 处理：无效 sessionId → warn + 新建 session；agentId 不匹配 → warn + 新建 session
9. v1 不包含：auto-compact、UI 过滤 sub-agent conversation、session 清理机制

## 技术约束
1. 必须使用 Vercel AI SDK v6 的 `convertToModelMessages` 将 UIMessage[] 转换为 ModelMessage[]
2. 必须使用现有的 `IConversationService` 接口（create、getById、saveMessage）
3. 必须使用 `generateId('conv')` / `generateId('msg')` 生成 ID（branded types）
4. 消息 parts 格式必须与现有 chat 流程一致（`tool-invocation` 用 `toolInvocation` 嵌套对象）
5. 不得修改数据库 schema

## 流程要求
1. 有 session（新建或恢复）时：用 `messages` 调用 streamText
2. 无 session（降级模式）时：保持原有 `prompt` 调用 streamText，零行为变化
3. 用户消息在 streamText 之前保存；助手消息在 stream 完成后保存
4. Sub-agent session 的 task tools 作用域绑定到 session conversationId
5. Token records 保持关联到父 conversation

## 涉及文件
| 文件 | 改动内容 |
|------|---------|
| `packages/shared/src/types/agent.ts` | `SubAgentStreamState` 加 `sessionId?: string` |
| `packages/server/src/agent/tools.ts` | `LoadAgentToolsParams` 加 `conversationStorage`，解构+透传 |
| `packages/server/src/routes/chat.ts` | `loadAgentTools` 调用加 `conversationStorage: deps.conversationStorage` |
| `packages/server/src/scheduler/executor.ts` | `loadAgentTools` 调用加 `conversationStorage: this.deps.conversationStorage` |
| `packages/server/src/agent/sub-agent.ts` | 核心改造：session 创建/恢复、消息构建、prompt→messages、消息持久化、buildAssistantParts |

## 注意事项
1. `buildAssistantParts` 在 v1 中不保留多步骤的精确时序（text 和 tool calls 的穿插关系），可接受
2. Sub-agent conversation 会出现在 UI 对话列表中，标题前缀 `[Sub-agent]` 可区分，v1 可接受
3. 向后兼容是硬性要求——不传 sessionId 时现有行为不得有任何变化
