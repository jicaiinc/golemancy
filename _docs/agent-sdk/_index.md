# Claude Agent SDK 文档索引与核心概要

> 生成时间：2026-02-24
> 文档来源：platform.claude.com/docs/en/agent-sdk/
> 包名：`@anthropic-ai/claude-agent-sdk`（TypeScript）/ `claude-agent-sdk`（Python）

---

## 一、文件目录

| 文件名 | 原始 URL | 大小 | 重要程度 |
|--------|---------|------|---------|
| `overview.md` | agent-sdk/overview | 20KB | ★★★★★ |
| `typescript-api.md` | agent-sdk/typescript | 50KB | ★★★★★ |
| `streaming-output.md` | agent-sdk/streaming-output | 15KB | ★★★★☆ |
| `hooks.md` | agent-sdk/hooks | 31KB | ★★★★★ |
| `sessions.md` | agent-sdk/sessions | 8KB | ★★★★☆ |
| `mcp.md` | agent-sdk/mcp | 24KB | ★★★★☆ |
| `custom-tools.md` | agent-sdk/custom-tools | 22KB | ★★★★★ |
| `subagents.md` | agent-sdk/subagents | 23KB | ★★★★★ |
| `skills.md` | agent-sdk/skills | 10KB | ★★★☆☆ |
| `todo-tracking.md` | agent-sdk/todo-tracking | 6KB | ★★★☆☆ |
| `permissions.md` | agent-sdk/permissions | 8KB | ★★★★☆ |
| `plugins.md` | agent-sdk/plugins | 10KB | ★★☆☆☆ |
| `user-input.md` | agent-sdk/user-input | 29KB | ★★★★☆ |
| `input-modes.md` | agent-sdk/streaming-vs-single-mode | 8KB | ★★★★☆ |
| `system-prompts.md` | agent-sdk/modifying-system-prompts | 15KB | ★★★☆☆ |

---

## 二、核心概念速览

### 2.1 SDK 本质

SDK 将 Claude Code CLI 作为子进程运行，通过 stdin/stdout JSON 流通信。调用 `query()` 函数返回 `AsyncGenerator<SDKMessage>`，逐条 yield 消息。

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Fix the bug in auth.py",
  options: { allowedTools: ["Read", "Edit", "Bash"] }
})) {
  console.log(message);
}
```

### 2.2 两种输入模式（input-modes.md）

| 模式 | 说明 | 限制 |
|------|------|------|
| **Streaming Input**（推荐） | `prompt` 传入 `AsyncIterable<SDKUserMessage>`，支持多轮、图片、中断、hooks、MCP 自定义 tools | 无 |
| **Single Message** | `prompt` 传入 `string`，单次请求 | **不支持**图片、hooks、MCP自定义tools、实时中断 |

**关键：** 使用 `createSdkMcpServer` 注入自定义 tools 时，**必须**用 Streaming Input 模式（async generator）。

### 2.3 消息流（streaming-output.md）

SDK 输出 `SDKMessage` 联合类型，按 `type` 字段分类：

| type | subtype | 说明 |
|------|---------|------|
| `system` | `init` | 会话初始化，包含 `session_id`、MCP server 状态 |
| `assistant` | - | Claude 的回复，包含 `message.content[]`（TextBlock / ToolUseBlock） |
| `result` | `success` / `error_*` | 最终结果，`result` 字段为文本摘要 |

重要字段：
- `parent_tool_use_id`：标识消息属于哪个 subagent 执行
- `session_id`：用于 resume/fork

### 2.4 Hooks 系统（hooks.md）★★★★★

Hooks 是**回调函数**，在 agent 生命周期关键节点触发。两部分：callback function + hook config（matcher + event type）。

**可用 Hook 事件：**

| Event | Python | TS | 触发时机 | 关键能力 |
|-------|--------|-----|---------|---------|
| `PreToolUse` | ✓ | ✓ | tool 执行前 | 可 allow/deny/modify input |
| `PostToolUse` | ✓ | ✓ | tool 执行后 | 拿到 `tool_response`（stream 中没有） |
| `PostToolUseFailure` | ✗ | ✓ | tool 执行失败 | 错误处理 |
| `UserPromptSubmit` | ✓ | ✓ | 用户提交 prompt | 注入上下文 |
| `Stop` | ✓ | ✓ | agent 停止 | 保存状态 |
| `SubagentStart` | ✗ | ✓ | subagent 启动 | 追踪并行任务 |
| `SubagentStop` | ✓ | ✓ | subagent 结束 | 聚合结果 |
| `PreCompact` | ✓ | ✓ | 压缩前 | 归档完整记录 |
| `PermissionRequest` | ✗ | ✓ | 权限对话框 | 自定义权限处理 |
| `SessionStart` | ✗ | ✓ | 会话开始 | 初始化 |
| `SessionEnd` | ✗ | ✓ | 会话结束 | 清理资源 |
| `Notification` | ✗ | ✓ | agent 状态消息 | 外部通知 |

**Hook 回调签名：**
```typescript
type HookCallback = (
  input: HookInput,      // hook_event_name, tool_name, tool_input, tool_response...
  toolUseID: string | undefined,
  options: { signal: AbortSignal }
) => Promise<HookJSONOutput>;
```

**Hook 输出可控制：**
- `permissionDecision`: `'allow'` | `'deny'` | `'ask'`
- `updatedInput`: 修改 tool 输入（需配合 `permissionDecision: 'allow'`）
- `systemMessage`: 注入对话上下文
- `continue`: 控制是否继续执行

**Matcher 配置：**
```typescript
hooks: {
  PreToolUse: [
    { matcher: "Write|Edit", hooks: [myCallback], timeout: 60 }
  ]
}
```
matcher 是正则，仅匹配 **tool name**（不匹配路径等参数）。

### 2.5 Sub-agents（subagents.md）★★★★★

三种定义方式：
1. **编程方式**（推荐）：`agents` 参数传入 `Record<string, AgentDefinition>`
2. **文件系统**：`.claude/agents/*.md`
3. **内置**：`general-purpose` subagent 始终可用

```typescript
// AgentDefinition
{
  description: string;  // Claude 据此决定何时调用
  prompt: string;       // subagent 的 system prompt
  tools?: string[];     // 限制可用工具
  model?: "sonnet" | "opus" | "haiku" | "inherit";
}
```

**关键特性：**
- Subagent 通过 `Task` tool 调用（必须在 `allowedTools` 中包含 `Task`）
- 消息中的 `parent_tool_use_id` 标识所属 subagent
- 支持并行运行多个 subagent
- 单层嵌套（subagent 不能再起 subagent，除非配置了 `Task` tool）
- Subagent 有**独立上下文**，不污染主对话

### 2.6 Custom Tools（custom-tools.md）★★★★★

通过 `createSdkMcpServer()` + `tool()` 创建进程内 MCP server：

```typescript
const server = createSdkMcpServer({
  name: "my-tools",
  version: "1.0.0",
  tools: [
    tool("get_weather", "Get weather", { lat: z.number(), lng: z.number() },
      async (args) => ({
        content: [{ type: "text", text: `Temp: ${temp}°F` }]
      })
    )
  ]
});
```

**使用：**
```typescript
for await (const msg of query({
  prompt: asyncGenerator(),  // ← 必须 streaming input
  options: {
    mcpServers: { "my-tools": server },
    allowedTools: ["mcp__my-tools__get_weather"]
  }
})) { ... }
```

**命名规则：** `mcp__{server_name}__{tool_name}`

### 2.7 Sessions（sessions.md）

| 操作 | 选项 | 说明 |
|------|------|------|
| Resume | `options.resume = sessionId` | 恢复已有会话，保留完整上下文 |
| Fork | `options.fork = { sessionId, messageId }` | 从某条消息分叉出新会话 |
| Continue | `options.continue = true` | 继续最近的会话 |

Session 自动管理 compaction（上下文过长时压缩）。`PreCompact` hook 可在压缩前归档。

### 2.8 Permissions（permissions.md）

四种权限模式：

| 模式 | 说明 |
|------|------|
| `default` | 未匹配的 tool 触发 `canUseTool` 回调 |
| `acceptEdits` | 自动批准文件编辑（Edit/Write/mkdir/rm/mv/cp） |
| `bypassPermissions` | 全部自动批准（**慎用**，subagent 继承且不可覆盖） |
| `plan` | 不执行任何 tool，仅规划 |

**评估顺序：** Hooks → Permission rules（deny > allow > ask）→ Permission mode → canUseTool callback

**动态切换：** `await q.setPermissionMode("acceptEdits")` 可在 streaming 过程中实时改变。

### 2.9 User Input & Approvals（user-input.md）

`canUseTool` 回调在两种场景触发：
1. **Tool 审批请求**：Claude 要用未自动批准的 tool
2. **澄清问题**：Claude 调用 `AskUserQuestion` tool

```typescript
canUseTool: async (toolName, input) => {
  if (toolName === "AskUserQuestion") {
    // 展示问题给用户，返回选择
    return { result: "allow", updatedInput: { ... } };
  }
  // 普通 tool 审批
  return { result: "allow" | "deny" };
}
```

### 2.10 MCP（mcp.md）

连接外部 MCP servers：

```typescript
mcpServers: {
  "playwright": { command: "npx", args: ["@playwright/mcp@latest"] },     // stdio
  "remote-db":  { type: "sse", url: "https://api.example.com/mcp" },      // SSE
  "custom":     createSdkMcpServer({ ... })                                // in-process
}
```

三种连接：`stdio`（子进程）、`sse`（HTTP SSE）、`sdk`（进程内）。

### 2.11 Todo/Task Tracking（todo-tracking.md）

SDK 内置 `TodoWrite` tool，agent 自动为复杂任务创建 todo。通过 stream 中的 `TodoWrite` tool_use block 获取状态更新。

注意：这是旧版 TodoWrite，SDK 同时支持更强的 Tasks API（TaskCreate/Get/List/Update，支持依赖/所有权/持久化/团队）。

### 2.12 Skills（skills.md）

基于文件系统的 `.claude/skills/*/SKILL.md` 扩展能力。需要 `settingSources: ["project"]` 才能加载。

### 2.13 Plugins（plugins.md）

目录包形式的扩展，可包含 commands/agents/skills/hooks/MCP servers。通过 `plugins: [{ type: "local", path: "./my-plugin" }]` 加载。

### 2.14 System Prompts（system-prompts.md）

四种方式定制 system prompt：
1. **CLAUDE.md**：项目级文件（需 `settingSources`）
2. **Output Styles**：持久化配置文件
3. **systemPrompt with append**：`{ preset: "claude_code", append: "..." }` 追加指令
4. **Custom systemPrompt**：完全自定义（失去内置工具指令）

### 2.15 TypeScript API 参考（typescript-api.md）

核心类型速查：

```typescript
// 核心函数
query({ prompt, options }): Query  // AsyncGenerator<SDKMessage>
tool(name, desc, schema, handler): SdkMcpToolDefinition
createSdkMcpServer({ name, version?, tools? }): McpSdkServerConfigWithInstance

// Options
interface Options {
  allowedTools?: string[];
  disallowedTools?: string[];
  maxTurns?: number;
  permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan";
  systemPrompt?: string | { preset: "claude_code", append?: string };
  settingSources?: SettingSource[];  // "user" | "project"
  cwd?: string;
  model?: string;
  resume?: string;     // session ID
  fork?: { sessionId: string; messageId?: string };
  continue?: boolean;
  agents?: Record<string, AgentDefinition>;
  mcpServers?: Record<string, McpServerConfig>;
  hooks?: Partial<Record<HookEventName, HookMatcher[]>>;
  canUseTool?: CanUseToolCallback;
  plugins?: PluginConfig[];
}

// SDKMessage union
type SDKMessage = SystemMessage | AssistantMessage | ResultMessage;

// SystemMessage.subtype: "init"
// AssistantMessage.message.content: (TextBlock | ToolUseBlock)[]
// ResultMessage.subtype: "success" | "error_max_turns" | "error_during_execution"
```

---

## 三、对 Golemancy 集成的关键发现

### 3.1 双通道架构

| 通道 | 数据来源 | 传输内容 | 延迟 |
|------|---------|---------|------|
| **Stream** | `for await (msg of query())` | 文字 delta、tool_use block（无 response） | 实时 |
| **Hooks** | `PostToolUse` callback | 完整 `tool_name` + `tool_input` + `tool_response` | tool 执行后 |

Stream 提供打字效果，Hooks 提供完整 tool 数据。两个通道在 adapter 中合并 → UIMessageStream → SSE → UI。

### 3.2 自定义 Tools 注入

Golemancy 特有工具（Bash sandbox、browser automation 等）通过 `createSdkMcpServer()` 注入。
**前提条件**：必须使用 streaming input mode（async generator prompt）。

### 3.3 Sub-agents 定义

Golemancy 的 Agent config 中定义 subAgents[]，转换为 SDK 的 `agents: Record<string, AgentDefinition>` 格式传入。SDK 负责执行机制，Golemancy 提供定义。

### 3.4 Session 管理

SDK 自带 session resume/fork/compaction。Golemancy 可利用 `session_id` 实现对话恢复功能。

### 3.5 权限映射

Golemancy 三层权限（restricted/sandbox/unrestricted）需映射到 SDK 权限模式：
- `restricted` → `plan` 或 `default` + 全 deny hooks
- `sandbox` → `default` + `canUseTool` 回调
- `unrestricted` → `bypassPermissions`

### 3.6 重要限制

1. Custom MCP tools **必须**用 streaming input mode
2. `bypassPermissions` 被 subagent 继承且不可覆盖
3. 默认 system prompt 是精简版，不含 Claude Code 的完整指令（需要 `preset: "claude_code"`）
4. `settingSources` 必须显式设置才能加载 CLAUDE.md / Skills
5. Python SDK 不支持 SessionStart/End/Notification/PostToolUseFailure/SubagentStart/PermissionRequest hooks
6. Hook matcher 只匹配 tool name，不匹配文件路径等参数

---

## 四、建议阅读顺序

1. `overview.md` — 全局理解 SDK 能力
2. `typescript-api.md` — API 参考（重点看 Options、SDKMessage、Query 类型）
3. `input-modes.md` — 理解两种输入模式的区别（直接影响架构）
4. `streaming-output.md` — 理解消息流结构
5. `hooks.md` — 掌握 hook 系统（Golemancy 集成的核心）
6. `custom-tools.md` — 自定义 tool 注入方式
7. `subagents.md` — subagent 定义与调用
8. `sessions.md` — session 管理
9. `permissions.md` + `user-input.md` — 权限与用户交互
10. `mcp.md` — 外部 MCP server 连接
11. `skills.md` / `plugins.md` / `system-prompts.md` / `todo-tracking.md` — 补充阅读
