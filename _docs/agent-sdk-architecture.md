# Claude Agent SDK 集成架构设计

> 创建时间：2026-02-25
> 前置文档：`_docs/agent-sdk-integration-research.md`（技术调研）、`_docs/agent-sdk/_index.md`（SDK 文档索引）
> 状态：待审核

---

## 一、文档遗漏补充

在全面阅读 15 篇 SDK 官方文档后，发现以下调研文档中未充分覆盖的要点：

| 遗漏项 | 来源文档 | 对集成的影响 |
|--------|---------|------------|
| `canUseTool` 完整交互模型 | user-input.md | Golemancy 需要实现「用户审批」的完整链路：SDK 阻塞 → WebSocket 推给 UI → 用户选择 → 回传结果 |
| `includePartialMessages: true` | typescript-api.md | 启用后才有 token 级 text_delta 事件，否则只有完整 AssistantMessage。**UI 打字效果依赖此项** |
| `maxBudgetUsd` | typescript-api.md | 可映射 Golemancy 的 per-project / per-agent 成本限额 |
| `enableFileCheckpointing` | typescript-api.md | 追踪文件变更，潜在用于 Golemancy 的 Artifact 系统 |
| `outputFormat` 结构化输出 | typescript-api.md | JSON Schema 约束输出格式，Cron Job 等场景可用 |
| `Notification` hook | hooks.md | Agent 状态消息推送（permission_prompt, idle_prompt 等），映射到 WebSocket |
| 动态权限切换 `setPermissionMode()` | permissions.md | Streaming 过程中可实时切换权限模式，无需重启 session |
| `ResultMessage.total_cost_usd` | streaming-output.md | SDK 直接返回美元金额，含按模型 breakdown，可直接写入计费 |
| V2 interface preview (send/receive) | typescript-api.md | 新接口预览，简化多轮对话。**暂不采用**，等稳定后再评估 |

---

## 二、需求与目标变化

### 2.1 原始目标（不变）

- 用户可在 Agent 配置中选择 runtime（Vercel AI SDK / Claude Agent SDK）
- SDK runtime 走 Claude Max 订阅，减少 API 费用
- UI 层对用户**透明**——无论哪个 runtime，聊天体验一致

### 2.2 理解深化后的目标修正

| 维度 | 原来的理解 | 修正后 |
|------|-----------|--------|
| **Sub-agents** | 笼统说"SDK 机制 + Golemancy 定义" | 明确：Golemancy Agent.subAgents[] → 转换为 SDK `agents` Record → 通过 Task tool 调度。但 SDK 仅**单层**，Golemancy 原来支持无限嵌套——需做取舍 |
| **Token 追踪** | 从 ResultMessage 提取 | ResultMessage 给的是**整个 session 的**累计 usage + cost_usd。但 Golemancy 按 conversation+message 粒度记录。需在每次 user message turn 结束时提取增量 |
| **消息存储** | 镜像到 SQLite | SDK 消息格式 ≠ Vercel AI UIMessage 格式。需要在 adapter 中做格式转换，保持 UI 查询接口不变 |
| **MCP** | Golemancy 配置转格式传入 | SDK 每次 query 会启动新的 MCP server 进程。**不能**与 Vercel runtime 共享 MCP 连接池。两套 runtime 的 MCP 生命周期完全独立 |
| **Compact** | SDK 自动管理 | SDK compact 是其内部行为。但 Golemancy 需要知道 compact 发生了（`PreCompact` hook 通知），且可能需要同步到自己的 compact 记录 |
| **User Approval** | 通过 hooks | 不够。`canUseTool` 回调是阻塞式的——SDK 挂起等待返回值。需要异步桥接：callback → WebSocket → 用户操作 → resolve callback |
| **文本流式输出** | Stream 提供 | 需要 `includePartialMessages: true` 才能获得 token 级 delta。否则只有完整的 AssistantMessage |

### 2.3 已确认的设计取舍

| 取舍 | 决策 | 理由 |
|------|------|------|
| Sub-agent 嵌套深度 | SDK runtime 限制为**单层** | SDK 不支持嵌套 Task。用户接受此限制——多数场景单层够用 |
| MCP 连接池 | 两套 runtime 各自管理 | SDK 子进程无法访问 Golemancy 进程内的连接池 |
| Skills 格式 | SDK runtime 用 SDK 的 SKILL.md | 需要在 .claude/skills/ 下放置对应文件 |
| Compact 记录 | 双写（SDK 自管 + Golemancy 通过 PreCompact hook 记录） | Golemancy UI 需要显示 compact 历史 |

---

## 三、目标架构

### 3.1 全局视图

```
┌────────────────────────── Golemancy Server ──────────────────────────┐
│                                                                      │
│  POST /chat                                                          │
│    │                                                                 │
│    ├── 公共逻辑                                                       │
│    │   ├── 校验请求（messages, projectId, agentId）                    │
│    │   ├── 解析 agent 配置                                            │
│    │   ├── 注册 ActiveChatRegistry                                    │
│    │   └── 标记 agent 状态 → running                                  │
│    │                                                                 │
│    ├── runtime == "vercel" ─────────────────────────────────┐        │
│    │                                                         │        │
│    │   [现有流程，不变]                                        │        │
│    │   loadAgentTools → streamText → UIMessageStream → SSE   │        │
│    │                                                         │        │
│    ├── runtime == "claude-sdk" ─────────────────────────────┐│        │
│    │                                                         ││        │
│    │   ┌─────────────┐   ┌──────────────┐                   ││        │
│    │   │ ConfigMapper │──▶│ SDK query()  │                   ││        │
│    │   └─────────────┘   └──────┬───────┘                   ││        │
│    │                            │                            ││        │
│    │              ┌─────────────┼──────────────┐             ││        │
│    │              │             │              │             ││        │
│    │        Stream 通道    Hooks 通道    canUseTool          ││        │
│    │        (AsyncIter)   (callbacks)   (callback)          ││        │
│    │              │             │              │             ││        │
│    │              └─────────────┼──────────────┘             ││        │
│    │                            │                            ││        │
│    │                     ┌──────┴───────┐                    ││        │
│    │                     │ StreamAdapter │                    ││        │
│    │                     └──────┬───────┘                    ││        │
│    │                            │                            ││        │
│    │                    UIMessageStream                       ││        │
│    │                                                         ││        │
│    └─── 公共逻辑                                              ││        │
│         ├── SSE 输出                                ◀────────┘│        │
│         ├── 保存消息到 SQLite                                  │        │
│         ├── 记录 token usage                                  │        │
│         ├── WebSocket 事件广播                                 │        │
│         └── Cleanup（卸载 registry，标记 idle）                 │        │
│                                                               │        │
└───────────────────────────────────────────────────────────────┘        │
                                                                         │
                    ┌──────── UI (React) ──────────┐                     │
                    │  SSE 消费 → 渲染消息/工具/任务  │◀────────────────────┘
                    │  WebSocket → 状态/通知/审批    │
                    └──────────────────────────────┘
```

### 3.2 SDK Runtime 内部模块分解

```
sdk-handler.ts（入口）
    │
    ├── ConfigMapper
    │   ├── mapAgentToOptions()      ── Agent config → SDK Options
    │   ├── mapSubAgents()           ── Agent.subAgents[] → Record<string, AgentDefinition>
    │   ├── mapMcpServers()          ── Agent.mcpServers[] → Record<string, McpServerConfig>
    │   ├── mapPermissions()         ── Golemancy 权限 → SDK permissionMode + hooks
    │   └── mapSystemPrompt()        ── Agent.systemPrompt → SDK systemPrompt 配置
    │
    ├── HooksFactory
    │   ├── createToolDataForwarder()     ── PostToolUse → StreamAdapter 推送
    │   ├── createPermissionEnforcer()    ── PreToolUse → 权限校验/审计
    │   ├── createTaskTracker()           ── PostToolUse(Task*) → Task 数据转发
    │   ├── createSubagentTracker()       ── SubagentStart/Stop → WebSocket
    │   ├── createCompactRecorder()       ── PreCompact → Golemancy compact 记录
    │   ├── createSessionLifecycle()      ── SessionStart/End → 生命周期管理
    │   └── createNotificationForwarder() ── Notification → WebSocket 状态
    │
    ├── CustomToolsBuilder
    │   └── buildGolemancyTools()    ── 浏览器工具等 → createSdkMcpServer
    │
    ├── StreamAdapter
    │   ├── consumeStream()          ── SDK AsyncGenerator → 解析每条 SDKMessage
    │   ├── hookDataReceiver()       ── 接收 hook 推送的 tool 数据
    │   ├── mergeChannels()          ── 两路数据按时序合并
    │   └── toUIMessageStream()      ── 转换为 Golemancy UIMessageStream 格式
    │
    ├── ApprovalBridge
    │   └── canUseTool()             ── SDK 阻塞回调 → WebSocket → 用户选择 → resolve
    │
    └── UsageExtractor
        └── extractUsage()           ── ResultMessage → TokenRecord → SQLite
```

### 3.3 数据流详图（一次 Chat 请求的完整生命周期）

```
用户发送消息
    │
    ▼
[1] POST /chat { messages, projectId, agentId, conversationId }
    │
    ▼
[2] chat.ts 公共逻辑
    ├── 从 storage 加载 Agent 配置
    ├── 检查 agent.runtime == "claude-sdk"
    │
    ▼
[3] sdk-handler.ts
    │
    ├── [3a] ConfigMapper 转换配置
    │   ├── Agent.modelConfig → SDK model
    │   ├── Agent.systemPrompt → { preset: "claude_code", append: agentPrompt }
    │   ├── Agent.subAgents[] → agents: { "reviewer": {...}, "tester": {...} }
    │   ├── Agent.mcpServers → mcpServers: { "playwright": {...} }
    │   ├── Agent.tools → allowedTools: ["Read", "Edit", "Bash", "Task", "mcp__golemancy__*"]
    │   └── Agent.permissionMode → permissionMode + PreToolUse hooks
    │
    ├── [3b] HooksFactory 构建 hooks
    │   └── 返回完整的 hooks 配置对象
    │
    ├── [3c] CustomToolsBuilder（如果 Agent 配置了 Golemancy 独有工具）
    │   └── createSdkMcpServer({ name: "golemancy", tools: [...] })
    │
    ├── [3d] 构建 Streaming Input Generator
    │   ├── 从 conversationId 加载历史消息
    │   ├── 如果有 SDK session_id → 用 resume 而非重放历史
    │   └── yield 当前用户消息
    │
    ├── [3e] 调用 SDK query()
    │   │
    │   │   ┌──────────────── SDK 子进程 ────────────────┐
    │   │   │                                             │
    │   │   │  Claude Code CLI                            │
    │   │   │    ├── 调用 Anthropic API                    │
    │   │   │    ├── 执行内置工具 (Read/Write/Bash/...)    │
    │   │   │    ├── 调用 MCP 工具                         │
    │   │   │    ├── 调度 Sub-agents (Task tool)           │
    │   │   │    └── 自动管理 session / compact            │
    │   │   │                                             │
    │   │   └─────────────────────────────────────────────┘
    │   │                │                  │
    │   │          Stream 输出         Hooks 回调
    │   │                │                  │
    │   │                ▼                  ▼
    │   │
    │   ├── [3f] Stream 通道处理
    │   │   ├── system(init) → 提取 session_id，存入 conversation 元数据
    │   │   ├── assistant(partial) → text_delta → StreamAdapter
    │   │   ├── assistant(tool_use) → tool-call event → StreamAdapter
    │   │   └── result → finish event + usage 数据 → StreamAdapter + UsageExtractor
    │   │
    │   ├── [3g] Hooks 通道处理
    │   │   ├── PostToolUse → { tool_name, tool_input, tool_response } → StreamAdapter
    │   │   ├── PreToolUse → 权限检查，可 deny/allow/modify
    │   │   ├── PostToolUse(TaskCreate/Update) → 转发 task 数据给 UI
    │   │   ├── SubagentStart → WebSocket: agent 启动子 agent
    │   │   ├── SubagentStop → WebSocket: 子 agent 完成
    │   │   ├── PreCompact → 记录到 Golemancy compact 存储
    │   │   └── Notification → WebSocket: agent 状态消息
    │   │
    │   └── [3h] canUseTool 审批通道
    │       ├── SDK 暂停执行，调用 canUseTool(toolName, input)
    │       ├── ApprovalBridge 通过 WebSocket 推送审批请求到 UI
    │       ├── 用户在 UI 上选择 allow / deny
    │       ├── WebSocket 回传选择
    │       └── canUseTool 返回 { result: "allow" | "deny" } → SDK 继续
    │
    ▼
[4] StreamAdapter 合并输出
    ├── Stream 的 text_delta → UIMessageStream text-delta 事件
    ├── Hooks 的 tool data → UIMessageStream tool-call + tool-result 事件
    ├── Tasks 数据 → UIMessageStream data-task 自定义事件
    └── Usage 数据 → UIMessageStream data-usage 事件
    │
    ▼
[5] SSE 输出到 UI
    │
    ▼
[6] 后处理（Stream 结束后）
    ├── 保存 assistant message 到 conversationStorage
    ├── 保存 token record 到 tokenRecordStorage (source: 'sdk')
    ├── 存储 SDK session_id 到 conversation 元数据
    ├── WebSocket: runtime:chat_ended
    └── Cleanup: 卸载 ActiveChatRegistry，标记 idle
```

---

## 四、关键逻辑细节

### 4.1 Session 管理策略

**问题**：SDK 的 session 是独立的（基于文件系统 `~/.claude/sessions/`），而 Golemancy 的 conversation 也是独立的。如何关联？

**方案**：

```
Conversation 元数据增加 sdkSessionId 字段

首次对话：
  conversationId=conv_1, sdkSessionId=null
    → query({ prompt: generator })
    → 从 system(init) 消息获取 session_id="sdk_abc"
    → 保存 conv_1.sdkSessionId = "sdk_abc"

继续对话：
  conversationId=conv_1, sdkSessionId="sdk_abc"
    → query({ prompt: "新消息", options: { resume: "sdk_abc" } })
    → SDK 自动恢复上下文（包括之前读过的文件、对话历史）

新对话（同一 Agent）：
  conversationId=conv_2, sdkSessionId=null
    → 创建新 session（不 resume）
```

**优势**：
- SDK 负责 context window 管理和 compact
- Golemancy 不需要将历史消息重放给 SDK
- Resume 比重放快且省 token

**注意**：
- SDK session 有自动过期时间。如果过期，回退到创建新 session
- Golemancy 仍需保存消息到 SQLite（用于 UI 展示），但不需要传给 SDK

### 4.2 Token 追踪适配

**问题**：Golemancy 按 conversation + message + agent 粒度记录 token，SDK 的 ResultMessage 给的是整个 turn 的累计值。

**方案**：

```
每次 user prompt turn 结束时（收到 ResultMessage）：

ResultMessage.usage = {
  input_tokens: 12345,      // 本轮输入
  output_tokens: 6789,      // 本轮输出
  cache_read_input_tokens: 1000,
  cache_creation_input_tokens: 500,
}
ResultMessage.total_cost_usd = 0.15
ResultMessage.cost_usd_by_model = {
  "claude-opus-4-6": 0.12,
  "claude-sonnet-4-6": 0.03
}

→ 保存到 tokenRecordStorage：
  {
    conversationId,
    messageId: 生成的 assistant message ID,
    agentId,
    provider: "anthropic-sdk",       // 新 provider 标识
    model: "claude-opus-4-6",        // 从 cost_by_model 可拆分
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    source: "sdk",                   // 新 source 类型
    costUsd: total_cost_usd,         // 新增字段
  }
```

**Sub-agent tokens**：SDK 的 ResultMessage 已经包含了 sub-agent 的累计 token。不需要像 Vercel runtime 那样单独追踪子 agent token。但如果需要按 sub-agent 拆分，可通过 `cost_usd_by_model` 推断（不同 sub-agent 可能用不同 model）。

### 4.3 消息格式转换

**问题**：SDK 输出的 `SDKMessage` 与 Golemancy UI 期望的 `UIMessage` 格式不同。

**方案：StreamAdapter 中做映射**

```
SDK SDKAssistantMessage:
  {
    type: "assistant",
    message: {
      content: [
        { type: "text", text: "分析结果..." },
        { type: "tool_use", id: "tu_1", name: "Read", input: { file_path: "..." } }
      ]
    },
    parent_tool_use_id: null    // null = 主 agent; 非空 = sub-agent
  }

→ 转换为 UIMessageStream 事件序列：
  { type: "text-delta", textDelta: "分析结果..." }
  { type: "tool-call", toolCallId: "tu_1", toolName: "Read", args: { file_path: "..." } }

SDK PostToolUse Hook:
  {
    tool_name: "Read",
    tool_input: { file_path: "/src/app.ts" },
    tool_response: { content: "文件内容..." }     // ← Stream 中拿不到
  }

→ 转换为：
  { type: "tool-result", toolCallId: "tu_1", result: "文件内容..." }
```

**tool_use 和 tool_result 的关联**：
- Stream 给出 tool_use block（含 tool_use ID）
- PostToolUse hook 给出 tool_response（含 tool_use_id 参数）
- StreamAdapter 通过 tool_use_id 将两者关联

### 4.4 用户审批桥接（ApprovalBridge）

**问题**：SDK 的 `canUseTool` 是**同步阻塞回调**（返回 Promise，SDK 挂起直到 resolve）。但 Golemancy 的用户审批是异步的（WebSocket 推送 → 用户操作 → 回传）。

**方案**：

```
canUseTool 回调内部：

1. 收到 SDK 的审批请求 (toolName, toolInput)
2. 生成 approvalId = randomUUID()
3. 通过 WebSocket 推送给 UI：
   { type: "tool_approval_request", approvalId, toolName, toolInput }
4. 创建 Promise，注册到 pendingApprovals Map:
   pendingApprovals.set(approvalId, { resolve, reject })
5. 等待 Promise（设超时 5 分钟）

UI 端：
6. 用户看到审批弹窗，选择 Allow / Deny
7. WebSocket 回传：{ type: "tool_approval_response", approvalId, decision: "allow" }

Server 端：
8. WebSocket handler 收到回传
9. pendingApprovals.get(approvalId).resolve({ result: "allow" })
10. canUseTool 的 Promise resolve → SDK 继续执行

超时处理：
- 5 分钟无响应 → resolve({ result: "deny" })
- 用户断开连接 → resolve({ result: "deny" })
```

**注意**：`bypassPermissions` 和 `acceptEdits` 模式下不会触发 canUseTool。只有 `default` 模式下未被 hooks/rules 处理的 tool 才会触发。

### 4.5 权限模式映射

**问题**：Golemancy 的三级权限（restricted / sandbox / unrestricted）如何映射到 SDK 的四级模式？

**方案**：

```
Golemancy restricted:
  → SDK permissionMode: "default"
  → PreToolUse hook: 对所有工具返回 { permissionDecision: "deny" }
  → 效果：Agent 不能执行任何工具（纯对话）
  → 注意："plan" 模式也可以，但 plan 模式还会改变 Agent 的行为指令

Golemancy sandbox:
  → SDK permissionMode: "default"
  → canUseTool callback: 实现 ApprovalBridge
  → PreToolUse hook: 只读工具 (Read/Glob/Grep) 自动 allow
  → 效果：只读工具自动通过，写入/执行工具需要用户审批

Golemancy unrestricted:
  → SDK permissionMode: "bypassPermissions"
  → 注意：此模式下 subagent 也继承 bypass，且不可覆盖
  → 效果：所有工具自动执行
```

### 4.6 Custom Tools 注入

**问题**：Golemancy 有自己的工具（浏览器自动化 22 个 Playwright 工具等），SDK 没有内置。如何注入？

**方案**：

```
CustomToolsBuilder 逻辑：

1. 读取 Agent 配置中的 tools 列表
2. 过滤出 Golemancy 独有的工具（SDK 已内置的不需要注入）
3. 对每个工具：
   ├── 获取原始 Vercel AI tool 定义
   ├── 提取 description, parameters.shape (ZodRawShape)
   ├── 包装 execute 函数：
   │     原返回值 → 转为 { content: [{ type: "text", text: JSON.stringify(result) }] }
   └── 调用 SDK tool(name, desc, shape, wrappedExecute)
4. createSdkMcpServer({ name: "golemancy", tools: [...] })
5. 传入 query options:
   {
     mcpServers: { golemancy: server },
     allowedTools: [..., "mcp__golemancy__browser_click", ...]
   }
```

**SDK 内置 vs 需要注入**：

| 工具 | SDK 有？ | 处理方式 |
|------|---------|---------|
| Read/Write/Edit | ✓ | 使用 SDK 内置 |
| Bash | ✓ | 使用 SDK 内置 |
| Glob/Grep | ✓ | 使用 SDK 内置 |
| WebSearch/WebFetch | ✓ | 使用 SDK 内置 |
| browser_* (22 个) | ✗ | createSdkMcpServer 注入 |
| os_* (屏幕/鼠标/键盘) | ✗ | createSdkMcpServer 注入 |
| Task/Todo 工具 | ✓ | 使用 SDK 内置 Tasks API |

**关键约束**：使用 createSdkMcpServer 后，prompt 必须是 async generator（streaming input mode）。

### 4.7 Sub-agent 定义转换

**问题**：Golemancy 的 Sub-agent 是完整的 Agent 实体（有自己的 ID、配置、工具列表），SDK 的 sub-agent 是轻量的 AgentDefinition。

**方案**：

```
Golemancy Agent 配置：
  {
    id: "agent_main",
    subAgents: [
      { agentId: "agent_reviewer", delegateDescription: "代码审查" },
      { agentId: "agent_tester", delegateDescription: "测试执行" }
    ]
  }

转换逻辑 (mapSubAgents)：
  1. 遍历 agent.subAgents[]
  2. 对每个 subAgentRef，从 storage 加载完整 Agent 配置
  3. 转换为 AgentDefinition:
     {
       "code-reviewer": {
         description: ref.delegateDescription || childAgent.description,
         prompt: childAgent.systemPrompt,
         tools: mapToolNames(childAgent.tools),  // Golemancy 工具名 → SDK 工具名
         model: mapModel(childAgent.modelConfig),
       }
     }
  4. 注意：不要在子 agent 的 tools 中包含 "Task"（防止嵌套）
  5. 如果子 agent 配置了 MCP server，在 query 级别的 mcpServers 中注册
     （SDK 子 agent 通过 tools 数组引用 MCP 工具名）

丢失的能力（SDK 限制）：
  - 子 agent 不能再有子 agent（单层限制）
  - 子 agent 没有独立的 MCP 连接（共享 query 级别的）
  - 子 agent 没有独立的 permission mode（继承父 agent 的）
```

### 4.8 Streaming Input Generator 构建

**问题**：SDK 要求 custom tools 使用 streaming input mode。如何将 Golemancy 的对话模型适配？

**方案**：

```
两种场景：

场景 A — 新 session（无 sdkSessionId）：
  async function* generateMessages() {
    // 如果有历史 compact summary，作为第一条 context message
    if (compactSummary) {
      yield {
        type: "user",
        message: { role: "user", content: `[历史上下文]\n${compactSummary}` }
      };
    }
    // 当前用户消息
    yield {
      type: "user",
      message: { role: "user", content: userMessage }
    };
  }
  → query({ prompt: generateMessages(), options: { ... } })

场景 B — 恢复 session（有 sdkSessionId）：
  async function* generateMessages() {
    // 只发当前消息，SDK 自动恢复上下文
    yield {
      type: "user",
      message: { role: "user", content: userMessage }
    };
  }
  → query({ prompt: generateMessages(), options: { resume: sdkSessionId, ... } })
```

**为什么总是用 generator？** 即使只有一条消息，也用 generator 格式。因为：
1. Custom tools 需要 streaming input mode
2. 统一处理逻辑，避免两条代码路径
3. 未来可支持多轮（yield 第二条消息实现追问）

### 4.9 Compact 双写策略

**问题**：SDK 会自动 compact（无法禁止），但 Golemancy 也有 compact 记录系统。

**方案**：

```
SDK 侧：
  自动管理 compact（时机、策略由 SDK 内部决定）

Golemancy 侧（通过 PreCompact hook）：
  hooks: {
    PreCompact: [{
      hooks: [async (input) => {
        // input.trigger: "manual" | "auto"
        // input.custom_instructions: 自定义压缩指令

        // 记录到 Golemancy 的 compactRecordStorage
        compactRecordStorage.save(projectId, {
          conversationId,
          trigger: input.trigger,
          timestamp: Date.now(),
          source: 'sdk',
        });

        return {};  // 不阻止 compact
      }]
    }]
  }
```

**注意**：Golemancy 的 `contextTokens` 阈值对 SDK runtime 不生效（SDK 有自己的策略）。SDK runtime 下 Golemancy 不主动触发 compact。

### 4.10 中断与取消

**问题**：用户点击「停止生成」时如何中断 SDK？

**方案**：

```
SDK query() 返回 Query 对象（extends AsyncGenerator）：
  const q = query({ prompt: generator, options: { ... } });

  // 正常消费
  for await (const msg of q) { ... }

  // 中断
  q.abort();  // 或 q.return();

映射到 Golemancy 的 AbortController：
  chat.ts 中 c.req.raw.signal（HTTP 请求的 AbortSignal）
  → 监听 signal.addEventListener('abort', () => q.abort())
  → SDK 子进程收到中断，停止执行，返回部分结果

  中断后仍会收到 ResultMessage（subtype 可能是 error_*）
  → 正常处理 token 记录和消息保存
```

### 4.11 错误处理

**问题**：SDK 可能出现的错误类型和处理方式？

**方案**：

```
错误来源与处理：

1. SDK 子进程启动失败（Claude CLI 未安装/版本不对）
   → 检测：query() throw Error
   → 处理：SSE 发送 error event，建议用户安装 Claude CLI

2. 认证失败（API Key 无效 / OAuth 过期）
   → 检测：ResultMessage.subtype == "error_during_execution"
   → 处理：SSE 发送 error event，提示认证问题

3. 达到 maxTurns 限制
   → 检测：ResultMessage.subtype == "error_max_turns"
   → 处理：正常保存已有结果，SSE 发送 finish event + 提示

4. 达到 maxBudgetUsd 限制
   → 检测：ResultMessage 中的 cost 信息
   → 处理：正常结束，记录费用

5. Tool 执行失败
   → 检测：PostToolUseFailure hook
   → 处理：记录错误，SDK 会自动重试或调整策略

6. MCP 连接失败
   → 检测：system(init) 消息中 mcp_servers[].status == "failed"
   → 处理：SSE 发送 warning event，继续执行（其他工具仍可用）

7. Session resume 失败（过期/不存在）
   → 检测：query() throw 或 result error
   → 处理：清除 sdkSessionId，以新 session 重试
```

---

## 五、模块新增/变更清单

### 5.1 新增文件

| 文件 | 位置 | 职责 |
|------|------|------|
| `sdk-handler.ts` | `packages/server/src/agent/` | SDK runtime 的主入口，编排 ConfigMapper + HooksFactory + StreamAdapter |
| `sdk-config-mapper.ts` | `packages/server/src/agent/` | Agent 配置 → SDK Options 转换 |
| `sdk-hooks-factory.ts` | `packages/server/src/agent/` | 根据 Agent/Project 配置生成 hooks 对象 |
| `sdk-stream-adapter.ts` | `packages/server/src/agent/` | SDK 双通道 → UIMessageStream 适配 |
| `sdk-custom-tools.ts` | `packages/server/src/agent/` | Golemancy 工具 → SDK MCP server 构建 |
| `sdk-approval-bridge.ts` | `packages/server/src/agent/` | canUseTool ↔ WebSocket 审批桥接 |

### 5.2 变更文件

| 文件 | 变更内容 |
|------|---------|
| `packages/shared/src/types/agent.ts` | Agent 类型增加 `runtime: "vercel" \| "claude-sdk"` 字段 |
| `packages/server/src/routes/chat.ts` | 根据 runtime 分发到不同 handler |
| `packages/server/src/storage/token-records.ts` | source 类型增加 `"sdk"`，增加 `costUsd` 字段 |
| `packages/ui/src/stores/slices/conversationSlice.ts` | Conversation 元数据增加 `sdkSessionId` |
| Agent 配置 UI | 增加 Runtime 选择器 |

### 5.3 不变更的文件

所有 Vercel AI SDK runtime 的代码保持不变：`process.ts`, `runtime.ts`, `sub-agent.ts`, `tools.ts`, `mcp-pool.ts`, `compact.ts`。两套 runtime 完全独立，互不影响。

---

## 六、风险与待确认项

| 风险 | 影响 | 缓解方案 |
|------|------|---------|
| Claude Max 订阅认证可能被封堵 | SDK runtime 不可用 | 保留 Vercel runtime 作为 fallback，runtime 可随时切换 |
| SDK 子进程资源开销（1GiB RAM） | 多用户并发时内存压力 | 限制并发 SDK session 数量，队列等待 |
| SDK 版本更新导致 API 变化 | 适配层需要更新 | 集中在 ConfigMapper 和 StreamAdapter 中，易于修改 |
| Sub-agent 单层限制 | 复杂工作流受限 | 文档告知用户此限制，设计时避免深层嵌套 |
| Session resume 可能因 SDK 内部变化失败 | 对话上下文丢失 | Golemancy 保存消息副本，可回退到新 session + 历史重放 |
| canUseTool 审批超时 | SDK 长时间挂起 | 设置 5 分钟超时自动 deny，释放 SDK 资源 |
