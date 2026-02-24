# Claude Agent SDK 集成调研与架构设计

> 调研时间：2026-02-24
> 状态：调研完成，方案已确定

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
| **Built-in Tools (11+)** | Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch, AskUserQuestion, TodoWrite, NotebookEdit, Task (sub-agents), Skill |
| **Custom Tools** | 通过 `createSdkMcpServer()` 创建 in-process MCP server，需 streaming input mode |
| **Hooks (12 种)** | PreToolUse, PostToolUse, PostToolUseFailure, UserPromptSubmit, Stop, SubagentStart, SubagentStop, PreCompact, PermissionRequest, SessionStart, SessionEnd, Notification |
| **Sub-agents** | 通过 `agents` 配置定义 + Task tool 调用，**不支持嵌套**（子 agent 不能再有子 agent） |
| **Skills** | 文件系统加载 (.claude/skills/SKILL.md)，支持脚本（Python/Bash/JS），渐进加载 |
| **MCP Servers** | 支持 stdio / SSE / HTTP / in-process SDK 四种传输 |
| **Permissions** | 4 种模式：default / acceptEdits / bypassPermissions / plan + canUseTool 回调 + hooks |
| **Sessions** | 自动管理，支持 resume / fork / checkpoint，自动 compact |
| **Plugins** | 文件系统插件包，可包含 commands / agents / skills / hooks / MCP servers |
| **Sandbox** | 内置沙箱配置（enabled, network, excludedCommands 等） |
| **Structured Output** | JSON Schema 支持，结果在 ResultMessage.structured_output |
| **Token/Cost 追踪** | ResultMessage 包含 usage (input/output/cache tokens) + total_cost_usd + 按模型分breakdown |

### 2.3 SDK 配置项（Options，共 38 个）

关键配置：

| 配置 | 类型 | 说明 |
|------|------|------|
| `allowedTools` | `string[]` | 工具白名单 |
| `disallowedTools` | `string[]` | 工具黑名单 |
| `agents` | `Record<string, AgentDefinition>` | 子 agent 定义 |
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

### 2.5 关键限制

1. **Sub-agents 不能嵌套**——文档明确说 "do not include Task in a subagent's tools array"
2. **Skills 不能编程注册**——必须是文件系统上的 SKILL.md 文件
3. **Custom Tools 需要 streaming input mode**——prompt 必须是 async generator，不能是纯字符串
4. **Extended thinking + streaming 不兼容**——设了 maxThinkingTokens 就没有 StreamEvent
5. **settingSources 默认为空**——不显式设置就不加载任何文件系统配置
6. **bypassPermissions 会传播到所有子 agent**——且不可覆盖
7. **仅支持 Claude 模型**——Anthropic / Bedrock / Vertex / Azure，不支持 OpenAI 等其他 provider
8. **每次 query 需 spawn 子进程**——资源开销比进程内 streamText 大（推荐 1GiB RAM, 5GiB disk, 1 CPU）
9. **TodoWrite 功能有限**——扁平列表，无依赖/分配/持久化，model 自驱动

---

## 三、Golemancy 现有能力对比

| 能力 | Golemancy (Vercel AI) | Agent SDK | 对比 |
|------|----------------------|-----------|------|
| 文件读写 | bash + readFile + writeFile（staged atomic writes） | Read/Write/Edit/Glob/Grep | **SDK 更强**（Edit 精确替换） |
| Shell 执行 | bash（三级沙箱：virtual FS / OS-level / native） | Bash | 可比，沙箱模型不同 |
| 浏览器自动化 | 22 个 Playwright 工具（内置） | **无内置**，需 MCP 接入 | **Golemancy 更强** |
| Skills | Markdown + selector tool（无脚本支持） | SKILL.md + scripts + 渐进加载 | **SDK 更强** |
| Sub-agents | 无限递归嵌套，lazy loading，streaming | Task tool + agents config（**单层**） | **Golemancy 更强**（嵌套） |
| MCP | 连接池 + 指纹缓存 + crash recovery + sandbox 包装 | 直接配置 + in-process custom tools | 各有优势 |
| Permissions | 三级 + 细粒度路径/命令控制 | 四级 + canUseTool 回调 + hooks | 各有优势 |
| Compact | 自建 threshold + summary generation | SDK 自动管理 + PreCompact hook | SDK 更省心 |
| Hooks | **无** | 12 种 hook 事件 | **SDK 独有** |
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

#### 方案 D：入口层切换（最终采纳，优化为 Runtime 方案）
Agent 加 `runtime` 字段，chat 路由根据 runtime 分发到完全独立的 handler。SDK Runtime 下 Golemancy 只做薄壳。

#### 方案 E：不集成 SDK，强化现有 Runtime
改进现有工具质量，升级 Skills 格式，不引入 SDK。

**否决原因**：不能实现核心动机（走订阅省钱）。

### 4.2 最终选择理由

选择 **方案 D（Runtime 字段）** 的关键理由：

1. **成本最大化**——整个 Agent 执行全走 SDK → 全走订阅 → 零 API 成本
2. **Agent 身份统一**——同一个 Agent 切 runtime 不丢配置、不断对话
3. **Sub-agent 跨 runtime**——Vercel AI 父可以调 SDK 子，dispatch 在 sub-agent tool 内部判断
4. **Cron Job 兼容**——executor 检查 runtime 走不同分支，零改动
5. **现有代码零改动**——SDK 相关代码在独立目录，不 import 现有 agent runtime
6. **改动量小**——约 1000 行新代码，现有代码改动 < 100 行

---

## 五、最终架构设计

### 5.1 全局架构

```
┌─────────────────────────────────────────────────────┐
│                 UI (React + Zustand)                  │
│          统一消费 UIMessageStream，不感知 runtime       │
└────────────────────────┬────────────────────────────┘
                         │ SSE (UIMessageStream)
                         ▼
┌─────────────────────────────────────────────────────┐
│               Hono HTTP Server                        │
│                 POST /api/chat                         │
│                                                       │
│  ┌── agent.runtime 判断 ───────────────────────┐     │
│  │                                              │     │
│  ▼                                              ▼     │
│  ┌─────────────────────┐  ┌────────────────────┐     │
│  │  Vercel AI Runtime  │  │  Agent SDK Runtime │     │
│  │  (现有，不动)        │  │  (新增)            │     │
│  │                     │  │                    │     │
│  │  loadAgentTools()   │  │  buildSdkOptions() │     │
│  │  resolveModel()     │  │  query() → IPC     │     │
│  │  streamText()       │  │  SDKMsg → Adapter  │     │
│  │  → UIMessageStream  │  │  → UIMessageStream │     │
│  └─────────────────────┘  └────────────────────┘     │
│                                                       │
│  ┌── 共享基础设施 ───────────────────────────────┐   │
│  │ HTTP API · 消息存储(SQLite) · Token 记录       │   │
│  │ WebSocket 事件 · Agent 状态管理                │   │
│  └───────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### 5.2 Agent 配置模型

```typescript
interface Agent {
  // ---- 共享字段（两种 runtime 都生效）----
  id: AgentId
  projectId: ProjectId
  name: string
  description: string
  status: AgentStatus
  runtime: 'vercel-ai' | 'claude-agent-sdk'   // 新增
  systemPrompt: string
  mcpServers: string[]          // MCP 是通用协议，两者都支持

  // ---- Vercel AI 专属（runtime='vercel-ai' 时生效）----
  modelConfig: AgentModelConfig       // 任意 provider + model
  skillIds: SkillId[]                 // Golemancy skills
  builtinTools: BuiltinToolConfig     // bash / browser / os_control / task
  subAgents: SubAgentRef[]            // 递归子 agent 引用
  compactThreshold?: number           // 自建 compact 阈值

  // ---- Agent SDK 专属（runtime='claude-agent-sdk' 时生效）----
  sdkConfig?: AgentSdkConfig
}

interface AgentSdkConfig {
  // 模型
  model: 'sonnet' | 'opus' | 'haiku'

  // 权限
  permissionMode: 'plan' | 'default' | 'acceptEdits' | 'bypassPermissions'

  // 工具
  allowedTools: string[]              // SDK tool 白名单
  disallowedTools?: string[]          // SDK tool 黑名单

  // 系统提示
  useClaudeCodePreset: boolean        // 是否用 Claude Code 默认 system prompt
  settingSources: ('user' | 'project')[]   // 文件系统设置加载（Skills, CLAUDE.md）

  // 限制
  maxTurns: number                    // 默认 25
  maxBudgetUsd?: number               // 单次对话预算上限

  // 工作目录
  cwd?: string
  additionalDirectories?: string[]

  // 子 Agent
  agents?: Record<string, {
    description: string
    prompt: string
    tools?: string[]
    model?: 'sonnet' | 'opus' | 'haiku'
  }>

  // 高级配置
  hooks?: Record<string, HookConfig[]>
  sandbox?: SandboxConfig
  plugins?: { type: 'local'; path: string }[]
  enableFileCheckpointing?: boolean
  includePartialMessages?: boolean    // token 级流式
}
```

### 5.3 存储与 Session 策略

| 维度 | Vercel AI Runtime | Agent SDK Runtime |
|------|------------------|-------------------|
| 消息存储 | SQLite 是唯一 source of truth | SDK session 管 context + 镜像到 SQLite |
| Compact | 自建 compactConversation() | SDK 自动管理，不触发自建 compact |
| Session 恢复 | 从 SQLite 加载 messages | `resume: sessionId`（存 conversation 元数据） |
| Token 记录 | onStepFinish/onFinish 累计 | SDK ResultMessage 提取 → TokenRecordStorage |

### 5.4 流式协议适配

SDKMessage → UIMessageStream 映射：

| SDKMessage | UIMessageStream |
|------------|----------------|
| `system` (init) | 不转发，提取 session_id 存储 |
| `stream_event` (content_block_delta, text_delta) | `text-delta` |
| `stream_event` (content_block_start, tool_use) | `tool-call-streaming-start` |
| `stream_event` (content_block_delta, input_json_delta) | `tool-call-delta` |
| `stream_event` (content_block_stop) | `tool-call` (完整) |
| `assistant` (complete) | 不转发（stream_event 已覆盖） |
| `user` (tool_result) | `tool-result` |
| `result` (success) | `finish` + `data-usage` |
| `result` (error) | `error` |

### 5.5 Sub-agent 跨 Runtime

```typescript
// packages/server/src/agent/sub-agent.ts 内部增加分支
createSubAgentTool(childAgent) {
  return tool({
    execute: async function*({ task }) {
      if (childAgent.runtime === 'vercel-ai') {
        // 现有逻辑：loadAgentTools() + streamText()
      }
      if (childAgent.runtime === 'claude-agent-sdk') {
        // 新逻辑：query({ prompt: task, options: buildSdkOptions(childAgent) })
        // 适配 SDKMessage → SubAgentStreamState
      }
      // 对外 yield 同样结构的 SubAgentStreamState
    }
  })
}
```

反向（SDK 父 → Vercel AI 子）不支持——SDK 的 Task tool 只能调 SDK agents。

### 5.6 Golemancy 特有工具注入

SDK 的 TodoWrite 太弱（扁平列表、无依赖/分配），通过 `createSdkMcpServer` 注入 Golemancy 的 Task tools：

```typescript
const golemancyTaskServer = createSdkMcpServer({
  name: 'golemancy-tasks',
  tools: [
    tool('TaskCreate', '...', schema, handler),
    tool('TaskGet', '...', schema, handler),
    tool('TaskList', '...', schema, handler),
    tool('TaskUpdate', '...', schema, handler),
  ]
})

// 注入到 SDK query options
mcpServers: {
  'golemancy-tasks': golemancyTaskServer,
  ...userConfiguredMcpServers
}
```

### 5.7 UI 变化

| 页面/组件 | 改动 |
|-----------|------|
| **AgentDetailPage** | 顶部增加 runtime 下拉，选 SDK 时下方面板切换为 sdkConfig 表单 |
| **StatusBar** | SDK 时显示 Turns/Budget/Cost 替代 Context%/Compact |
| **ToolCallDisplay** | 兼容 SDK 工具名（Read vs readFile、Edit vs writeFile） |
| **AgentListPage** | agent 卡片增加 runtime 类型 badge |
| 其他页面 | 不变 |

---

## 六、新增文件清单

```
packages/shared/src/types/agent.ts            +AgentSdkConfig 类型        ~60 行

packages/server/src/agent/claude-code/
  ├── handler.ts            SDK chat handler（POST /api/chat 分支） ~250 行
  ├── options-builder.ts    Agent.sdkConfig → query() Options      ~100 行
  ├── stream-adapter.ts     SDKMessage → UIMessageStream           ~200 行
  ├── mcp-mapper.ts         Golemancy MCP config → SDK 格式        ~50 行
  ├── custom-tools.ts       注入 TaskCreate/Get/List/Update         ~100 行
  └── cron-executor.ts      Cron Job 的 SDK 执行分支               ~100 行

修改文件：
  packages/server/src/routes/chat.ts           +runtime 分发         ~10 行
  packages/server/src/agent/sub-agent.ts       +SDK 子 agent 分支    ~40 行
  packages/server/src/routes/cron-jobs.ts      +SDK 执行分支         ~20 行
  packages/ui/src/pages/agent/AgentDetailPage  +runtime 切换器       ~30 行

新增 UI 组件：
  packages/ui/src/pages/agent/SdkConfigPanel.tsx  SDK 配置面板      ~300 行

总计：约 1000 行新代码，现有代码改动 < 100 行
```

---

## 七、官方文档索引

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
