# Claude Agent SDK 技术调研与集成知识库

> 调研时间：2026-02-24
> 最后更新：2026-02-24
> 状态：调研完成，架构设计待重新规划

---

## 一、背景与动机

Golemancy 当前使用 Vercel AI SDK (`ai` v6) + Hono HTTP Server 作为 agent 执行引擎。用户希望集成 Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`)，核心动机：

1. **成本优化**：用户为 Claude Max 付费订阅用户，Claude Code CLI 的使用包含在订阅额度内。通过 Agent SDK（spawn Claude Code CLI 子进程），agent 执行可走订阅而非按 token 计费的 API Key
2. **能力增强**：Agent SDK 内置 Claude Code 级别的工具（Read/Write/Edit/Bash/Glob/Grep/WebSearch/WebFetch），比自建工具更成熟

### 关于认证方式的验证

官方文档声明 Agent SDK 需要 `ANTHROPIC_API_KEY`，不允许使用 OAuth 订阅认证。但本地实测表明：

- 环境中 `ANTHROPIC_API_KEY=NOT_SET`（未设置）
- Agent SDK v0.1.18 成功通过本地 Claude CLI OAuth 认证执行任务
- init 消息显示 `apiKeySource: 'none'`
- 完成了完整的文件读取、分析、编辑任务

**结论**：技术上可行，但存在 ToS 风险（Anthropic 可能随时在服务端加强检测）。

---

## 二、Agent SDK 技术调研

### 2.1 核心架构

Agent SDK 本质上是把 Claude Code CLI 作为子进程 spawn 出来。通信通过 stdin/stdout JSON streaming。

```
你的进程 (Node.js)
  └── claude (子进程 - Claude Code CLI)
        ├── 调用 api.anthropic.com (HTTPS)
        ├── 自主执行工具 (Read, Write, Edit, Bash, Glob, Grep...)
        ├── 自主管理 session / compact / permissions
        └── 通过 IPC 流式返回 SDKMessage
```

### 2.2 SDK 完整能力清单

| 能力 | 详情 |
|------|------|
| **Built-in Tools (14+)** | Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch, AskUserQuestion, TodoWrite, NotebookEdit, Task (sub-agents), Skill, TaskCreate/TaskGet/TaskList/TaskUpdate |
| **Custom Tools** | 通过 `createSdkMcpServer()` 创建 in-process MCP server，需 streaming input mode |
| **Hooks (12 种)** | PreToolUse, PostToolUse, PostToolUseFailure, UserPromptSubmit, Stop, SubagentStart, SubagentStop, PreCompact, PermissionRequest, SessionStart, SessionEnd, Notification |
| **Sub-agents** | 通过 `agents` 配置传入 + Task tool 调用。Task 工具单层限制（`iP6` 过滤），但可通过 **MCP Bridge 模式**实现无限嵌套（运行时验证 Test 8+9） |
| **Tasks/Todo** | 新 Tasks API (CRUD + 依赖 + 分配 + 持久化 + 团队) + 旧 TodoWrite (扁平列表) |
| **Skills** | 文件系统加载 (.claude/skills/SKILL.md)，支持脚本（Python/Bash/JS），渐进加载 |
| **MCP Servers** | 支持 stdio / SSE / HTTP / in-process SDK 四种传输 |
| **Permissions** | 4 种模式：default / acceptEdits / bypassPermissions / plan + canUseTool 回调 + hooks |
| **Sessions** | 自动管理，支持 resume / fork / checkpoint，自动 compact |
| **Plugins** | 文件系统插件包，可包含 commands / agents / skills / hooks / MCP servers |
| **Sandbox** | 内置沙箱配置（enabled, network, excludedCommands 等） |
| **Structured Output** | JSON Schema 支持，结果在 ResultMessage.structured_output |
| **Token/Cost 追踪** | ResultMessage 包含 usage (input/output/cache tokens) + total_cost_usd + 按模型分 breakdown |

### 2.3 SDK 配置项（Options，共 38 个）

关键配置：

| 配置 | 类型 | 说明 |
|------|------|------|
| `allowedTools` | `string[]` | 工具白名单 |
| `disallowedTools` | `string[]` | 工具黑名单 |
| `agents` | `Record<string, AgentDefinition>` | 子 agent 定义（由调用方传入） |
| `mcpServers` | `Record<string, McpServerConfig>` | MCP 服务器 |
| `permissionMode` | `PermissionMode` | 权限模式 |
| `canUseTool` | `CanUseTool` | 自定义权限回调 |
| `systemPrompt` | `string \| { preset: 'claude_code', append?: string }` | 系统提示词 |
| `settingSources` | `('user' \| 'project' \| 'local')[]` | 文件系统设置加载 |
| `hooks` | `Partial<Record<HookEvent, HookCallbackMatcher[]>>` | 钩子回调 |
| `maxTurns` | `number` | 最大轮次 |
| `maxBudgetUsd` | `number` | 预算上限（美元） |
| `model` | `string` | Claude 模型 |
| `resume` | `string` | 恢复 session ID |
| `forkSession` | `boolean` | 分叉 session |
| `cwd` | `string` | 工作目录 |
| `sandbox` | `SandboxSettings` | 沙箱配置 |
| `plugins` | `SdkPluginConfig[]` | 本地插件 |
| `includePartialMessages` | `boolean` | 启用 token 级流式输出 |
| `enableFileCheckpointing` | `boolean` | 文件变更追踪 |
| `outputFormat` | `{ type: 'json_schema', schema }` | 结构化输出 |

### 2.4 SDK 流式消息类型

| 类型 | 说明 |
|------|------|
| `SDKSystemMessage` (init) | 会话初始化：session_id, tools, mcp_servers, model, permissions |
| `SDKAssistantMessage` | Claude 响应：text + tool_use blocks |
| `SDKUserMessage` | 用户消息 / tool_result |
| `SDKPartialAssistantMessage` (stream_event) | token 级流式事件（需 `includePartialMessages: true`） |
| `SDKResultMessage` | 最终结果：success/error + usage + cost + duration |
| `SDKCompactBoundaryMessage` | compact 边界标记 |

### 2.5 Hooks 系统（详细）

SDK 提供 12 种 hook 事件，是 Agent SDK 最重要的扩展机制之一。Hooks 不仅能观察，还能**主动控制行为**。

#### 2.5.1 Hook 回调签名

```typescript
type HookCallback = (
  input: HookInput,
  toolUseID: string | undefined,    // 关联 PreToolUse 和 PostToolUse
  options: { signal: AbortSignal }
) => Promise<HookJSONOutput>;
```

#### 2.5.2 全部 12 种事件

| Hook 事件 | 触发时机 | Python | TypeScript |
|-----------|---------|--------|------------|
| `PreToolUse` | 工具执行前（可阻止/修改） | Yes | Yes |
| `PostToolUse` | 工具执行成功后 | Yes | Yes |
| `PostToolUseFailure` | 工具执行失败后 | No | Yes |
| `UserPromptSubmit` | 用户提交 prompt | Yes | Yes |
| `Stop` | Agent 执行停止 | Yes | Yes |
| `SubagentStart` | 子 agent 启动 | No | Yes |
| `SubagentStop` | 子 agent 完成 | Yes | Yes |
| `PreCompact` | 上下文压缩前 | Yes | Yes |
| `PermissionRequest` | 权限对话框弹出前 | No | Yes |
| `SessionStart` | Session 初始化 | No | Yes |
| `SessionEnd` | Session 终止 | No | Yes |
| `Notification` | Agent 状态通知 | No | Yes |

#### 2.5.3 各事件 Input 类型

所有 hook input 共享基础字段：

```typescript
type BaseHookInput = {
  session_id: string;
  transcript_path: string;
  cwd: string;
  permission_mode?: string;
}
```

关键事件的专属字段：

```typescript
// PreToolUse — 工具执行前
type PreToolUseHookInput = BaseHookInput & {
  hook_event_name: "PreToolUse";
  tool_name: string;        // "Bash", "Write", "mcp__server__action"
  tool_input: unknown;      // 完整参数对象
}

// PostToolUse — 工具执行后
type PostToolUseHookInput = BaseHookInput & {
  hook_event_name: "PostToolUse";
  tool_name: string;
  tool_input: unknown;
  tool_response: unknown;   // ← 关键：完整的工具执行结果（stream 中拿不到）
}

// PostToolUseFailure — 工具执行失败
type PostToolUseFailureHookInput = BaseHookInput & {
  hook_event_name: "PostToolUseFailure";
  tool_name: string;
  tool_input: unknown;
  error: string;
  is_interrupt?: boolean;
}

// SubagentStart
type SubagentStartHookInput = BaseHookInput & {
  hook_event_name: "SubagentStart";
  agent_id: string;
  agent_type: string;
}

// SessionStart
type SessionStartHookInput = BaseHookInput & {
  hook_event_name: "SessionStart";
  source: "startup" | "resume" | "clear" | "compact";
}

// SessionEnd
type SessionEndHookInput = BaseHookInput & {
  hook_event_name: "SessionEnd";
  reason: "clear" | "logout" | "prompt_input_exit" | "bypass_permissions_disabled" | "other";
}
```

#### 2.5.4 Hook 输出与行为控制

Hook 不只是观察者，可以主动控制 Agent 行为：

```typescript
type HookJSONOutput = {
  // 通用控制
  continue?: boolean;           // false → 停止 agent
  stopReason?: string;          // 停止原因
  suppressOutput?: boolean;     // 隐藏 stdout
  systemMessage?: string;       // 注入系统消息到对话

  // PreToolUse 专属
  hookSpecificOutput?: {
    hookEventName: "PreToolUse";
    permissionDecision?: "allow" | "deny" | "ask";   // 控制工具是否执行
    permissionDecisionReason?: string;
    updatedInput?: Record<string, unknown>;           // 修改工具输入参数
  }

  // PostToolUse / UserPromptSubmit / SessionStart
  | {
    hookEventName: "PostToolUse" | "UserPromptSubmit" | "SessionStart";
    additionalContext?: string;   // 追加上下文信息
  }
}
```

**关键能力**：
- **阻止工具执行**：`permissionDecision: "deny"`
- **修改工具输入**：`updatedInput: { file_path: "/sandbox" + path }`（需配合 `permissionDecision: "allow"`）
- **注入系统消息**：`systemMessage: "注意：/etc 目录受保护"`
- **停止 Agent**：`continue: false, stopReason: "安全策略违规"`
- **推送外部系统**：hook 是 async 函数，可以 fetch/WebSocket/写数据库

#### 2.5.5 Matcher 配置

```typescript
hooks: {
  PreToolUse: [
    { matcher: "Write|Edit", hooks: [validateHook] },    // 正则匹配工具名
    { matcher: "^mcp__", hooks: [mcpAuditHook] },        // 所有 MCP 工具
    { hooks: [globalLogger] }                              // 无 matcher = 全部
  ],
  PostToolUse: [
    { matcher: "TaskCreate|TaskUpdate", hooks: [taskForwarder] }
  ]
}
```

- Matcher 是**正则表达式**，匹配 `tool_name`
- 仅对 PreToolUse / PostToolUse / PostToolUseFailure / PermissionRequest 生效
- 生命周期事件（Stop, SessionStart 等）忽略 matcher
- 多个 hook 返回权限决策时优先级：deny > ask > allow

#### 2.5.6 Hook 与 Stream 的关系（重要）

Hooks 和 Stream 是**正交**的两个数据通道：

| 维度 | Stream (query iterator) | Hooks |
|------|------------------------|-------|
| **数据** | 文本 delta、tool_use block 碎片 | 结构化完整的 tool_name + tool_input + tool_response |
| **时机** | 实时逐 token | 语义边界（工具执行前/后） |
| **Tool 执行结果** | 拿不到（在下一轮 user message 里） | PostToolUse 直接给 `tool_response` |
| **能否控制行为** | 不能（只读） | 能（阻止/修改/注入） |
| **适合** | 文本流式展示（打字效果） | 工具调用数据转发、权限控制、审计 |

**结论：两者互补，不是替代关系。**

### 2.6 Sub-agents 机制（详细）

#### 2.6.1 AgentDefinition 接口

Sub-agents 通过 `agents` 配置传入 query()，**定义由调用方提供**（不是 SDK 内置的固定 agent）：

```typescript
interface AgentDefinition {
  description: string;    // 描述何时使用（Claude 据此决定是否委派）
  prompt: string;         // 系统提示词（角色、行为、约束）
  tools?: string[];       // 工具白名单（省略则继承父 agent 全部工具）
  model?: 'sonnet' | 'opus' | 'haiku' | 'inherit';
}
```

#### 2.6.2 使用方式

```typescript
query({
  prompt: generateMessages(),
  options: {
    allowedTools: ["Read", "Grep", "Task"],  // Task 必须在白名单中
    agents: {
      "code-reviewer": {
        description: "代码审查专家",
        prompt: "你是代码审查专家...",
        tools: ["Read", "Grep", "Glob"],   // 只读权限
        model: "sonnet"
      },
      "test-runner": {
        description: "测试执行者",
        prompt: "你负责运行测试...",
        tools: ["Bash", "Read", "Grep"],
        model: "haiku"
      }
    }
  }
})
```

#### 2.6.3 关键规则

- `Task` 必须在父 agent 的 `allowedTools` 中，否则无法调用子 agent
- 子 agent 的 Task 工具被 `iP6` 过滤（无法通过 Task 嵌套），但可通过 **MCP Bridge 模式**实现无限嵌套：在 `createSdkMcpServer` 的 tool handler 内调用 `query()` 创建独立 CLI 会话（运行时验证 Test 8+9）
- ~~MCP 工具在 query 级别配置，子 agent 通过 tools 数组引用~~ → **已修正**：子 agent 的 `AgentDefinition` **支持** `mcpServers` 字段（运行时验证 Test 2+4），可通过字符串引用（`mcpServers: ['name']`）或内联定义使用
- ~~子 agent 的 AgentDefinition 没有 mcpServers 字段~~ → **已修正**：有，且工作正常（运行时验证 Test 2+4）
- 子 agent 可以有不同的 `model`（成本优化）
- 定义可以动态生成（工厂函数）
- 流中可通过 `parent_tool_use_id` 字段识别来自子 agent 的消息

#### 2.6.4 与 Golemancy 的集成方式

Golemancy 的 Agent 有 `subAgents: SubAgentRef[]`。集成时：

```
Golemancy Agent.subAgents[]
  → 查询每个子 Agent 的配置
  → 转换为 SDK AgentDefinition Record
  → 传入 query({ options: { agents: {...} } })
```

**SDK 提供执行机制（Task tool 调度），Golemancy 提供 agent 身份定义（prompt、description、可用工具）。**

### 2.7 Tasks/Todo 系统（详细）

SDK 有两套任务管理系统，新的 Tasks API 远比旧的 TodoWrite 强大。

#### 2.7.1 TodoWrite（旧，功能有限）

```typescript
// 输入
interface TodoWriteInput {
  todos: Array<{
    id: string;
    content: string;
    status: "pending" | "in_progress" | "completed";
    activeForm: string;
  }>;
}

// 输出
interface TodoWriteOutput {
  message: string;
  stats: { total: number; pending: number; in_progress: number; completed: number; };
}
```

- **Write-all 语义**：每次调用替换整个列表（无增量操作）
- **Session 级**：退出或 `/clear` 即丢失
- **无依赖/分配**

#### 2.7.2 Tasks API（新，完整 CRUD）

4 个工具：`TaskCreate`, `TaskGet`, `TaskList`, `TaskUpdate`

```typescript
// TaskCreate
{ subject: string; description: string; activeForm: string; metadata?: Record<string, any> }
→ { taskId: string }

// TaskGet
{ taskId: string }
→ { id, subject, description, status, owner, blockedBy, blocks, activeForm, metadata }

// TaskUpdate
{ taskId: string; status?: "pending"|"in_progress"|"completed"|"deleted";
  subject?: string; description?: string; owner?: string;
  addBlockedBy?: string[]; addBlocks?: string[]; metadata?: Record<string, any> }

// TaskList
→ [{ id, subject, status, owner, blockedBy }]
```

#### 2.7.3 Tasks vs TodoWrite 对比

| 特性 | TodoWrite | Tasks API |
|------|-----------|-----------|
| CRUD | 仅全量写入 | Create/Get/List/Update/Delete |
| 依赖关系 | 无 | `blockedBy` / `blocks` |
| 任务分配 | 无 | `owner` 字段 |
| 持久化 | Session 级（退出即丢） | 磁盘 `~/.claude/tasks/` (JSONL) |
| 跨 Session | 不支持 | 支持（通过 `CLAUDE_CODE_TASK_LIST_ID`） |
| 团队协作 | 无 | TeamCreate + SendMessage |
| 元数据 | 无 | `metadata: Record<string, any>` |

#### 2.7.4 团队机制

SDK 内置完整的团队协作系统：

- `TeamCreate`：创建团队 → 团队配置 `~/.claude/teams/{name}/config.json` + 任务列表 `~/.claude/tasks/{name}/`
- `SendMessage`：agent 间通信（message / broadcast / shutdown_request / shutdown_response）
- Inbox：`~/.claude/teams/{name}/inboxes/{agent}.json`
- Spawn backends：in-process / tmux / iterm2

#### 2.7.5 从外部读取 Tasks 状态的三种方式

1. **Stream 拦截**：从 SDKAssistantMessage 的 `tool_use` blocks 中提取 TaskCreate/TaskUpdate 调用
2. **文件系统读取**：直接读 `~/.claude/tasks/{id}/` 目录的 JSONL 文件
3. **PostToolUse Hook**：注册 hook 捕获每次 task 操作，推给 Golemancy 存储层

```typescript
// 方式 3：Hook 拦截（推荐）
hooks: {
  PostToolUse: [{
    matcher: "TaskCreate|TaskUpdate|TaskList",
    hooks: [async (input, toolUseId) => {
      // input.tool_name, input.tool_input, input.tool_response
      // → 推给 Golemancy UI / 写入 SQLite
      return {};
    }]
  }]
}
```

### 2.8 Custom Tools 注入（详细）

#### 2.8.1 createSdkMcpServer

创建 in-process MCP server（零序列化开销）：

```typescript
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';

const server = createSdkMcpServer({
  name: "my-tools",
  version: "1.0.0",
  tools: [
    tool("tool_name", "description", zodRawShape, asyncHandler)
  ]
});

// 返回类型
type McpSdkServerConfigWithInstance = {
  type: "sdk";
  name: string;
  instance: McpServer;  // @modelcontextprotocol/sdk
}
```

#### 2.8.2 tool() 函数签名

```typescript
function tool<Schema extends ZodRawShape>(
  name: string,
  description: string,
  inputSchema: Schema,          // ZodRawShape（不是 z.object()，是里面的 shape）
  handler: (args: z.infer<ZodObject<Schema>>, extra: unknown) => Promise<CallToolResult>
): SdkMcpToolDefinition<Schema>

// 返回值必须是 CallToolResult
type CallToolResult = {
  content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }>;
  isError?: boolean;
}
```

#### 2.8.3 工具命名规则

注入的 MCP 工具在 Claude 中显示为 `mcp__{server_name}__{tool_name}`。

```typescript
// 例：server name = "golemancy", tool name = "browser_click"
// → Claude 看到的工具名：mcp__golemancy__browser_click
// → allowedTools 中也用这个名字
```

#### 2.8.4 Streaming Input Mode 要求（关键限制）

使用 `createSdkMcpServer` 时，**必须用 streaming input mode**（async generator），不能传纯字符串 prompt：

```typescript
// 正确 ✓
async function* generateMessages() {
  yield { type: "user" as const, message: { role: "user" as const, content: "..." } };
}
query({ prompt: generateMessages(), options: { mcpServers: { ... } } })

// 错误 ✗ — 纯字符串 + custom MCP tools 会失败
query({ prompt: "...", options: { mcpServers: { myTools: sdkServer } } })
```

注意：**外部 MCP servers（stdio/HTTP）不受此限制**，可以用纯字符串 prompt。限制仅针对 in-process SDK MCP server。

#### 2.8.5 Golemancy 工具适配

Golemancy 现有工具用 Vercel AI SDK 的 `tool()` 定义，需要适配到 Agent SDK 的 `tool()` 格式：

| 差异 | Golemancy (Vercel AI) | Agent SDK |
|------|----------------------|-----------|
| 导入 | `tool` from `ai` | `tool` from `@anthropic-ai/claude-agent-sdk` |
| API 形式 | `tool({ description, inputSchema, execute })` | `tool(name, desc, zodRawShape, handler)` |
| Schema | `z.object({...})` | ZodRawShape（`z.object()` 里面的对象） |
| 返回值 | 任意对象 | `CallToolResult { content: [...] }` |

适配桥接函数模式：

```typescript
function bridgeToSdkTool(name: string, vercelTool: VercelTool) {
  return sdkTool(
    name,
    vercelTool.description,
    vercelTool.parameters.shape,    // 提取 ZodRawShape
    async (args) => {
      const result = await vercelTool.execute(args);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );
}
```

### 2.9 关键限制

1. ~~**Sub-agents 不能嵌套**~~ → **已突破**：Task 工具被 `iP6` 过滤，但 **MCP Bridge 模式**可绕过（在 MCP tool handler 内调用 `query()` 创建独立会话，运行时验证 Test 8+9）
2. **Skills 不能编程注册**——必须是文件系统上的 SKILL.md 文件
3. **Custom Tools（in-process MCP）需要 streaming input mode**——prompt 必须是 async generator
4. **Extended thinking + streaming 不兼容**——设了 maxThinkingTokens 就没有 StreamEvent
5. **settingSources 默认为空**——不显式设置就不加载任何文件系统配置
6. **bypassPermissions 会传播到所有子 agent**——且不可覆盖
7. **仅支持 Claude 模型**——Anthropic / Bedrock / Vertex / Azure，不支持 OpenAI 等其他 provider
8. **每次 query 需 spawn 子进程**——资源开销比进程内 streamText 大（推荐 1GiB RAM, 5GiB disk, 1 CPU）
9. ~~**Sub-agent 的 AgentDefinition 没有 mcpServers 字段**~~ → **已修正**：AgentDefinition **支持** `mcpServers`、`skills`、`disallowedTools` 字段（官方文档未列出，但源码分析 + 运行时验证 Test 2-5 确认可用）
10. **Windows 长 prompt 限制**——子 agent prompt 超过 8191 字符可能失败

---

## 三、Golemancy 现有能力对比

| 能力 | Golemancy (Vercel AI) | Agent SDK | 对比 |
|------|----------------------|-----------|------|
| 文件读写 | bash + readFile + writeFile（staged atomic writes） | Read/Write/Edit/Glob/Grep | **SDK 更强**（Edit 精确替换） |
| Shell 执行 | bash（三级沙箱：virtual FS / OS-level / native） | Bash | 可比，沙箱模型不同 |
| 浏览器自动化 | 22 个 Playwright 工具（内置） | **无内置**，需 MCP 或 custom tools 接入 | **Golemancy 更强** |
| Skills | Markdown + selector tool（无脚本支持） | SKILL.md + scripts + 渐进加载 | **SDK 更强** |
| Sub-agents | 无限递归嵌套，lazy loading，streaming | agents 配置传入 + Task tool（**单层**） | 各有优势（Golemancy 可嵌套，SDK 更标准化） |
| Tasks/Todo | 4 工具 CRUD，conversation 级，SQLite 持久化 | Tasks API: CRUD + 依赖 + 分配 + 团队 + 磁盘持久化 | **SDK 更强**（团队 + 跨 session） |
| MCP | 连接池 + 指纹缓存 + crash recovery + sandbox 包装 | 直接配置 + in-process custom tools | 各有优势 |
| Permissions | 三级 + 细粒度路径/命令控制 | 四级 + canUseTool 回调 + hooks 联动 | 各有优势 |
| Hooks | **无** | 12 种 hook 事件，可控制行为 | **SDK 独有** |
| Compact | 自建 threshold + summary generation | SDK 自动管理 + PreCompact hook | SDK 更省心 |
| Plugins | **无** | 文件系统插件包 | **SDK 独有** |
| Python 环境 | 每项目 venv + pip 管理 | 通过 Bash（用户自管） | Golemancy 更强 |
| Cron Jobs | 完整调度系统 | **无** | Golemancy 独有 |
| 多模型 | 10+ providers | 仅 Claude | Golemancy 独有 |
| Token 追踪 | 自建 (onStepFinish/onFinish) | Result message (usage + cost_usd) | 可比，SDK 含精确美元 |
| 资源开销 | 进程内（轻量） | 每次 spawn 子进程（较重） | Golemancy 更轻 |

---

## 四、方案评估过程

### 4.1 考虑过的方案

#### 方案 A：双 Runtime 映射
在 Agent 配置层面增加 runtime 选择，每个功能在两个系统之间映射（Skills→SDK Skills, SubAgent→SDK agents, Permissions→canUseTool...）。

**否决原因**：每个功能维护两套逻辑，高耦合，改一处想两处。

#### 方案 B：两种独立 Agent 类型
CustomAgent 和 ClaudeCodeAgent 完全独立，不共享任何 runtime 逻辑。

**否决原因**：同一个逻辑概念需要两个实体，切换执行引擎要删一个建一个，对话历史割裂。

#### 方案 C：Agent SDK 作为 Built-in Tool
在现有 Agent 的工具列表里加一个 `claude_code` tool。

**否决原因**：父 Agent 仍走 Vercel AI SDK + API Key，只有 tool 调用部分走订阅，不能最大化节省成本。

#### 方案 D：入口层切换（Runtime 方案）
Agent 加 `runtime` 字段，chat 路由根据 runtime 分发到完全独立的 handler。

#### 方案 E：不集成 SDK，强化现有 Runtime
改进现有工具质量，升级 Skills 格式，不引入 SDK。

**否决原因**：不能实现核心动机（走订阅省钱）。

### 4.2 初步选择

倾向 **方案 D（Runtime 字段）**，但在深入理解 SDK 的 Hooks、Sub-agents、Tasks 等机制后，架构设计需要重新规划。之前的设计存在以下认知偏差：

1. ~~Sub-agents 用 SDK 内置的~~ → 纠正：SDK 的 agents 定义需要**我们传入**，是 SDK 机制 + Golemancy 定义
2. ~~Tasks/Todo 用 Golemancy 的，注入替代 SDK 的~~ → 纠正：SDK 的 Tasks API 比 Golemancy 更完整（团队+跨session），应该**用 SDK 的，Golemancy 做显示层**
3. ~~stream adapter 处理所有 tool 数据~~ → 纠正：工具数据应通过 **Hooks** 获取（结构化、有 tool_response），Stream 只负责文本流式输出

---

## 五、功能分配决策

### 5.1 SDK Runtime 下各功能使用哪方的实现

| 功能 | 用谁的 | 怎么做 | 理由 |
|------|--------|--------|------|
| **Skills** | SDK | `settingSources` 文件系统发现 | SDK 支持脚本执行，更强 |
| **MCP** | SDK | Golemancy MCP 配置转格式传入 | 子进程隔离，无法共享连接池 |
| **Built-in Tools** | SDK | Read/Write/Edit/Bash/Grep/Glob 等原生工具 | Claude Code 级别，更成熟 |
| **Custom Tools** | **注入** | `createSdkMcpServer` 注入浏览器自动化等 Golemancy 独有工具 | SDK 无内置浏览器工具 |
| **Sub-agents** | SDK 机制 + **Golemancy 定义** | Agent.subAgents[] → 转为 SDK AgentDefinition Record → 传入 query() | SDK 提供 Task tool 调度，定义来自 Golemancy |
| **Tasks/Todo** | SDK | 用 SDK 的 Tasks API（CRUD+依赖+团队），Golemancy 通过 Hook 做显示/查询 | SDK 的更完整 |
| **Compact** | SDK | 自动管理 | 比自建省心 |
| **Permissions** | SDK | permissionMode + canUseTool + PreToolUse hook | SDK 四级模式 + hook 联动 |
| **Token 记录** | **Golemancy** | 从 ResultMessage 提取 usage/cost → 写入 SQLite | 需要持久化到项目数据库 |
| **消息存储** | **Golemancy** | 从 stream + hooks 镜像到 SQLite | 需要持久化供 UI 查询 |

### 5.2 双通道数据流架构

```
SDK query()
  ├── Stream (async iterator)              ← 文本流式输出
  │     ├── stream_event (text_delta)      → SSE text-delta
  │     ├── system (init)                  → 提取 session_id 存储
  │     ├── result (success/error)         → SSE finish / error + usage 记录
  │     └── compact_boundary               → 不转发
  │
  └── Hooks (callback functions)           ← 工具 + 生命周期事件
        ├── PostToolUse                    → tool-call + tool-result → SSE
        ├── PreToolUse                     → 权限控制 / 审计
        ├── PostToolUseFailure             → tool error → SSE
        ├── SubagentStart/Stop             → 子 agent 状态 → WebSocket
        ├── SessionStart/End               → session 管理
        └── PostToolUse (Task*)            → Tasks 数据 → Golemancy UI 显示

两路数据在 stream-adapter 中合并 → 统一输出 UIMessageStream → SSE → UI
```

---

## 六、官方文档索引

| 文档 | URL |
|------|-----|
| Overview | https://platform.claude.com/docs/en/agent-sdk/overview |
| Quickstart | https://platform.claude.com/docs/en/agent-sdk/quickstart |
| TypeScript API | https://platform.claude.com/docs/en/agent-sdk/typescript |
| Streaming Output | https://platform.claude.com/docs/en/agent-sdk/streaming-output |
| Input Modes | https://platform.claude.com/docs/en/agent-sdk/streaming-vs-single-mode |
| Sessions | https://platform.claude.com/docs/en/agent-sdk/sessions |
| MCP | https://platform.claude.com/docs/en/agent-sdk/mcp |
| Custom Tools | https://platform.claude.com/docs/en/agent-sdk/custom-tools |
| Subagents | https://platform.claude.com/docs/en/agent-sdk/subagents |
| Skills | https://platform.claude.com/docs/en/agent-sdk/skills |
| Todo Tracking | https://platform.claude.com/docs/en/agent-sdk/todo-tracking |
| Hooks | https://platform.claude.com/docs/en/agent-sdk/hooks |
| Permissions | https://platform.claude.com/docs/en/agent-sdk/permissions |
| User Input | https://platform.claude.com/docs/en/agent-sdk/user-input |
| System Prompts | https://platform.claude.com/docs/en/agent-sdk/modifying-system-prompts |
| Plugins | https://platform.claude.com/docs/en/agent-sdk/plugins |
| Hosting | https://platform.claude.com/docs/en/agent-sdk/hosting |
| Migration Guide | https://platform.claude.com/docs/en/agent-sdk/migration-guide |
