# Claude Agent SDK 集成评估报告

> 评估时间：2026-02-25
> 状态：**评估完成 — 建议不集成**
> 涉及版本：`@anthropic-ai/claude-agent-sdk` v0.1.18

---

## 目录

- [一、评估背景](#一评估背景)
- [二、Claude Agent SDK 技术调研](#二claude-agent-sdk-技术调研)
- [三、Golemancy 现有架构分析](#三golemancy-现有架构分析)
- [四、设计哲学对比](#四设计哲学对比)
- [五、能力逐项对比](#五能力逐项对比)
- [六、使用场景对比](#六使用场景对比)
- [七、集成方案设计（已完成但搁置）](#七集成方案设计已完成但搁置)
- [八、集成利弊分析](#八集成利弊分析)
- [九、评估结论与建议](#九评估结论与建议)
- [附录 A：完整集成方案](#附录-a完整集成方案)
- [附录 B：SDK 完整能力清单](#附录-b-sdk-完整能力清单)
- [附录 C：讨论过程中的关键决策记录](#附录-c讨论过程中的关键决策记录)

---

## 一、评估背景

### 1.1 动机

Golemancy 当前使用 Vercel AI SDK (`ai` v6) + Hono HTTP Server 作为唯一 agent 执行引擎。用户希望评估集成 Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) 的可行性，核心动机：

1. **成本优化**：用户为 Claude Max 付费订阅用户，Agent SDK spawn Claude Code CLI 子进程可走订阅额度，不走 API Key 按量计费
2. **能力增强**：Agent SDK 内置 Claude Code 级别工具（Read/Write/Edit/Bash/Glob/Grep），比自建工具更成熟

### 1.2 评估范围

- Claude Agent SDK 的完整技术能力与限制
- 与 Golemancy 现有架构的兼容性分析
- 设计哲学层面的冲突评估
- 完整集成方案设计（作为技术可行性验证）
- 不同用户场景下的利弊分析

### 1.3 关于认证方式的验证

官方文档声明 Agent SDK 需要 `ANTHROPIC_API_KEY`，不允许使用 OAuth 订阅认证。但本地实测表明：

- 环境中 `ANTHROPIC_API_KEY=NOT_SET`（未设置）
- Agent SDK v0.1.18 成功通过本地 Claude CLI OAuth 认证执行任务
- init 消息显示 `apiKeySource: 'none'`

**结论**：技术上可行，但存在 ToS 风险（Anthropic 可能随时在服务端加强检测）。

---

## 二、Claude Agent SDK 技术调研

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

### 2.2 SDK 核心能力概览

| 能力 | 详情 |
|------|------|
| **Built-in Tools (14+)** | Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch, Task, Skill, NotebookEdit 等 |
| **Custom Tools** | 通过 `createSdkMcpServer()` 创建 in-process MCP server |
| **Hooks (12 种)** | PreToolUse, PostToolUse, PostToolUseFailure, SubagentStart/Stop, SessionStart/End 等 |
| **Sub-agents** | `agents` 配置传入 + Task tool 调用，**不支持嵌套** |
| **Tasks API** | CRUD + 依赖 + 分配 + 团队 + 磁盘持久化 |
| **Skills** | 文件系统加载 (.claude/skills/SKILL.md)，支持脚本 |
| **MCP Servers** | stdio / SSE / HTTP / in-process SDK 四种传输 |
| **Permissions** | 4 种模式：default / acceptEdits / bypassPermissions / plan |
| **Sessions** | 自动管理，支持 resume / fork / checkpoint，自动 compact |
| **Plugins** | 文件系统插件包 |
| **Structured Output** | JSON Schema，结果在 ResultMessage.structured_output |
| **Token/Cost 追踪** | ResultMessage 包含 usage + total_cost_usd + 按模型 breakdown |

### 2.3 SDK 配置项（Options，38 个关键项）

| 配置 | 类型 | 说明 |
|------|------|------|
| `allowedTools` | `string[]` | 工具白名单 |
| `disallowedTools` | `string[]` | 工具黑名单 |
| `agents` | `Record<string, AgentDefinition>` | 子 agent 定义 |
| `mcpServers` | `Record<string, McpServerConfig>` | MCP 服务器（全局） |
| `permissionMode` | `PermissionMode` | 权限模式 |
| `canUseTool` | `CanUseTool` | 自定义权限回调 |
| `systemPrompt` | `string \| { preset, append }` | 系统提示词 |
| `settingSources` | `('user'\|'project'\|'local')[]` | 设置加载源 |
| `hooks` | `Partial<Record<HookEvent, ...>>` | 钩子回调 |
| `maxTurns` / `maxBudgetUsd` | `number` | 执行限制 |
| `model` | `string` | Claude 模型 |
| `resume` | `string` | 恢复 session ID |
| `includePartialMessages` | `boolean` | 启用 token 级流式 |

### 2.4 AgentDefinition（Sub-Agent 配置）

```typescript
type AgentDefinition = {
  description: string       // 何时调用此 sub-agent 的描述
  prompt: string            // 系统提示词
  tools?: string[]          // 工具白名单（省略则继承全部）
  model?: 'sonnet' | 'opus' | 'haiku' | 'inherit'
}
```

**Sub-agent 不能配置**：MCP servers、Skills、Permissions、嵌套 sub-agents。

### 2.5 关键限制

1. **Sub-agents 不能嵌套** — 官方文档明确禁止
2. **Skills 全局共享** — 文件系统加载，无法 per-agent 隔离
3. **MCP 全局配置** — query 级别，不能 per-agent
4. **Permissions 全局继承** — sub-agent 继承 parent，不可覆盖
5. **仅支持 Claude 模型** — Anthropic 系列，不支持 OpenAI 等
6. **每次 query spawn 子进程** — 资源开销较大（推荐 1GiB RAM）
7. **Custom Tools 需 streaming input mode** — prompt 必须是 async generator
8. **`default` mode 无 `canUseTool` callback 会卡死** — 必须 bypassPermissions 或实现 HiL
9. **`query()` 不接受对话历史** — 只能 `resume: sessionId`，无法传入 messages
10. **Session 内部存储不可替代** — `~/.claude/` 目录由 CLI 自动管理

### 2.6 Hooks 系统

SDK 提供 12 种 hook 事件，是最重要的扩展机制：

| Hook 事件 | 触发时机 | 可控制行为？ |
|-----------|---------|------------|
| `PreToolUse` | 工具执行前 | ✅ 可阻止/修改输入 |
| `PostToolUse` | 工具执行后 | ✅ 可注入上下文 |
| `PostToolUseFailure` | 工具失败后 | ✅ 可注入上下文 |
| `SubagentStart/Stop` | 子 agent 生命周期 | 观察 |
| `SessionStart/End` | Session 生命周期 | ✅ 可注入上下文 |
| `PreCompact` | Compact 前 | ✅ 可注入系统消息 |
| `PermissionRequest` | 权限请求 | 观察 |
| `Notification` | 状态通知 | 观察 |
| `Stop` | Agent 停止 | 观察 |
| `UserPromptSubmit` | Prompt 提交 | ✅ 可注入上下文 |

**Hook 与 Stream 是正交的两个数据通道**：Stream 负责文本流式输出，Hook 提供结构化工具数据 + 行为控制。两者互补，不是替代关系。

### 2.7 流式消息类型

| 类型 | 说明 |
|------|------|
| `SDKSystemMessage` (init) | 会话初始化：session_id, tools, model |
| `SDKAssistantMessage` | Claude 响应：text + tool_use blocks |
| `SDKUserMessage` | 用户消息 / tool_result |
| `SDKPartialAssistantMessage` (stream_event) | token 级流式事件 |
| `SDKResultMessage` | 最终结果：usage + cost + duration |
| `SDKCompactBoundaryMessage` | compact 边界标记 |

---

## 三、Golemancy 现有架构分析

### 3.1 核心设计哲学

Golemancy 以 **Agent 为核心编排单元**。每个 Agent 是完全自包含的：

```typescript
// packages/shared/src/types/agent.ts
export interface Agent extends Timestamped {
  id: AgentId
  projectId: ProjectId
  name: string
  description: string
  systemPrompt: string
  modelConfig: AgentModelConfig       // 独立 model 配置
  skillIds: SkillId[]                 // Per-agent Skills
  tools: ToolCallSchema[]             // Per-agent 自定义工具
  subAgents: SubAgentRef[]            // Per-agent Sub-agents
  mcpServers: string[]                // Per-agent MCP servers
  builtinTools: BuiltinToolConfig     // Per-agent 内置工具开关
  compactThreshold?: number           // Per-agent compact 阈值
}
```

### 3.2 五层工具组合系统

`loadAgentTools()` 将 5 个独立工具源组合为统一 `ToolSet`：

1. **Skills** — Per-agent 选择（`agent.skillIds`），symlink 创建过滤视图
2. **MCP** — Per-agent 服务器引用（`agent.mcpServers`），连接池管理
3. **Built-in Tools** — Per-agent 开关（bash/browser/os_control），三级权限
4. **Sub-Agents** — Per-agent 配置，lazy-load 递归
5. **Task Tools** — 对话级任务管理

每个工具源完全独立，Agent 可以任意组合。

### 3.3 无限层级 Sub-Agent

```typescript
// packages/server/src/agent/sub-agent.ts
export function createSubAgentTool(
  childAgent: Agent,
  allAgents: Agent[],
  loadTools: LoadToolsFn,  // 依赖注入 — loadAgentTools 自身
  // ...
) {
  return tool({
    execute: async function*({ task }, { abortSignal }) {
      // 1. 按需加载子 agent 的完整工具集
      const childToolsResult = await loadTools({
        agent: childAgent, /* ... */
      })
      // 2. 子 agent 拥有完全独立的 model、skills、MCP、工具
      const childModel = await resolveModel(settings, childAgent.modelConfig)
      const result = streamText({ model: childModel, tools: childToolsResult.tools })
      // 3. 实时流式返回
      for await (const chunk of result.fullStream) { yield state }
    },
  })
}
```

**关键特性**：
- 通过 `loadAgentTools` 自注入实现无限递归
- 每层子 agent 拥有**完全独立的配置**（model/skills/MCP/tools/sub-agents）
- Zero upfront cost — 只在实际调用时加载资源
- 每层实时流式返回（SubAgentStreamState）

### 3.4 三级权限系统

```typescript
// packages/shared/src/types/permissions.ts
export interface PermissionsConfig {
  allowWrite: string[]              // 路径白名单（支持模板变量）
  denyRead: string[]                // 读取黑名单
  denyWrite: string[]               // 写入黑名单
  networkRestrictionsEnabled: boolean
  allowedDomains: string[]          // 网络白名单
  deniedDomains: string[]           // 网络黑名单
  deniedCommands: string[]          // 命令黑名单
  applyToMCP: boolean               // 是否包装 MCP
}
```

三种执行模式：
- `restricted` — 虚拟沙箱（just-bash），无真实系统访问
- `sandbox` — OS 级隔离（Anthropic Sandbox Runtime）
- `unrestricted` — 完全系统访问

### 3.5 配置层级

```
Global Settings → Project Config → Agent Config
  (API keys)      (permissions)    (model/tools/skills/MCP/sub-agents)
```

### 3.6 目标用户与场景

Golemancy 是**通用 AI Agent 编排平台**，非仅限编程：

- **内容创作** — 写作、翻译、图片生成
- **信息采集** — 网页抓取、竞品监控、数据收集
- **平台运营** — 发帖、商品上架、消息回复
- **数据分析** — 销售分析、内容表现、报表生成
- **流程自动化** — 定时发布、批量处理、事件驱动

---

## 四、设计哲学对比

| 维度 | Golemancy | Claude Agent SDK |
|------|-----------|------------------|
| **定位** | 通用 AI Agent 编排平台 | 编程助手的可编程接口（Claude Code → SDK） |
| **核心抽象** | Agent 是核心单元，一切挂在 Agent 上 | Query 是核心单元，Agent 只是配置项 |
| **配置粒度** | Per-Agent（每个 agent 独立配置一切） | Per-Query（全局配置，sub-agent 极有限定制） |
| **生命周期** | 长期存活的 Agent + 持久化项目 | 单次 query，用完即走 |
| **嵌套模型** | 无限递归（Agent→Sub-Agent→Sub-Sub-Agent...） | 单层（Main Agent→Sub-Agent，到此为止） |
| **工具归属** | Per-Agent（每个 agent 自己的工具集） | 全局共享（query 级别配置） |
| **技能归属** | Per-Agent（`agent.skillIds`） | 全局（`.claude/skills/` 目录） |
| **MCP 归属** | Per-Agent（`agent.mcpServers`） | 全局（`options.mcpServers`） |
| **权限模型** | Per-Project + 细粒度（路径/网络/命令） | 全局继承，sub-agent 不可覆盖 |
| **Model 选择** | 10+ providers，完全自由 | 仅 Anthropic（sonnet/opus/haiku） |
| **目标用户** | 内容创作者、电商、研究员、自动化工程师 | 开发者、CI/CD、代码审查 |

**核心冲突**：Golemancy 的设计哲学是「Agent 为核心的自治编排」，SDK 的设计哲学是「一次性编程任务的自主执行」。前者强调配置粒度和组合灵活性，后者强调开箱即用和自主决策。

---

## 五、能力逐项对比

| 能力 | Golemancy | Agent SDK | 差距级别 |
|------|-----------|-----------|----------|
| **Skills 归属** | ✅ Per-Agent（`agent.skillIds`，symlink 过滤） | ❌ 全局（`.claude/skills/` 目录共享） | 🔴 根本不同 |
| **MCP 归属** | ✅ Per-Agent（`agent.mcpServers`，连接池） | ❌ 全局（`options.mcpServers`） | 🔴 根本不同 |
| **Sub-Agent 嵌套** | ✅ 无限层级（lazy-load 递归 + DI） | ❌ 仅单层（官方禁止嵌套） | 🔴 根本不同 |
| **Sub-Agent 独立性** | ✅ 完整独立（model/skills/MCP/tools/sub-agents） | ⚠️ 仅 prompt + tools + model | 🔴 根本不同 |
| **Permission 粒度** | ✅ Per-Project + 路径/网络/命令细粒度 | ❌ 全局继承，不可覆盖 | 🔴 根本不同 |
| **Model 选择** | ✅ 10+ providers | ❌ 仅 Anthropic（3 tier） | 🟡 显著受限 |
| **Session 管理** | ✅ 完全控制（SQLite 持久化） | ⚠️ SDK 内部管理，不可替代 | 🟡 显著受限 |
| **内置工具质量** | 自建 Bash/Browser/OS | SDK 内置（Claude Code 级别） | 🟢 SDK 更成熟 |
| **Hooks 扩展** | 无 | 12 种 hook 事件，可控制行为 | 🟢 SDK 独有 |
| **自动 Compact** | 手动阈值 + summary | SDK 自动管理 + PreCompact hook | 🟢 SDK 更省心 |
| **Tasks API** | 4 工具 CRUD，conversation 级 | CRUD + 依赖 + 团队 + 跨 session | 🟢 SDK 更完整 |
| **Cron/自动化** | ✅ 完整调度系统 | ❌ 无 | 🟢 Golemancy 独有 |
| **浏览器自动化** | ✅ 16+ Playwright 工具 | ❌ 需 MCP 接入 | 🟢 Golemancy 更强 |
| **资源开销** | 进程内（轻量） | 每次 spawn 子进程（较重，~1GiB） | 🟢 Golemancy 更轻 |
| **Token 追踪** | onStepFinish/onFinish → SQLite | ResultMessage.usage + cost_usd | 🟡 可比，SDK 含精确美元 |
| **Streaming** | UIMessageStream（Vercel AI） | AsyncGenerator（需桥接转换） | 🟡 可桥接 |
| **Chat SSE 输出** | UIMessageStream | UIMessageStream（通过 stream-adapter） | ✅ 可统一 |
| **Conversation 存储** | SQLite | SQLite（同，但需双层存储） | 🟡 SDK 增加复杂度 |
| **Dashboard/统计** | 统一 storage 查询 | 统一 storage 查询（相同） | ✅ 共享 |

---

## 六、使用场景对比

### 6.1 按场景分析

| 场景 | Golemancy 更适合 | Agent SDK 更适合 | 分析 |
|------|:----------------:|:----------------:|------|
| **多 Agent 协作编排** | ✅ | ❌ | Golemancy 无限嵌套 + per-agent 配置；SDK 单层限制 |
| **电商自动化** | ✅ | ⚠️ | Golemancy 内置浏览器 + 多 Provider；SDK 可行但非设计重点 |
| **内容创作** | ✅ | ❌ | 多 Agent 各司其职需 per-agent Skills/工具；SDK 全局共享无法隔离 |
| **代码开发/审查** | ⚠️ | ✅ | SDK 天生为此设计，内置工具更成熟 |
| **CI/CD 集成** | ⚠️ | ✅ | SDK 直接 query() 调用；Golemancy 需 API 包装 |
| **单次编程任务** | ⚠️ | ✅ | SDK 一次 query 搞定；Golemancy 架构偏重 |
| **细粒度权限控制** | ✅ | ❌ | Golemancy 三层权限 + 路径/网络/命令；SDK 全局 bypass |
| **多 Provider 混用** | ✅ | ❌ | Golemancy 10+ providers；SDK 仅 Anthropic |
| **定时任务/Cron** | ✅ | ❌ | Golemancy 内置调度；SDK 无 |
| **长期运行 Agent** | ✅ | ❌ | Golemancy 持久化 + Cron；SDK 单次 query 模型 |
| **数据分析流水线** | ✅ | ⚠️ | Golemancy multi-agent + 专用工具；SDK 可行但工具链弱 |
| **Web 抓取/监控** | ✅ | ⚠️ | Golemancy 内置 Playwright；SDK 需额外接入 |

### 6.2 按用户类型分析

| 用户类型 | Golemancy 优势 | Agent SDK 优势 |
|---------|---------------|---------------|
| **内容创作者** | 多 Agent 协作、Per-agent Skills 隔离、多 Provider | 无明显优势 |
| **电商运营** | 浏览器自动化、Cron 定时、数据分析 | 无明显优势 |
| **开发者** | 自定义工具链、多 Provider 混用 | 内置 Claude Code 工具、Hooks 扩展 |
| **自动化工程师** | 无限嵌套编排、细粒度权限、Cron | 自动 Compact、Tasks API |
| **研究员** | 多 Agent 数据采集 + 分析流水线 | 无明显优势 |

---

## 七、集成方案设计（已完成但搁置）

在评估过程中，我们完成了一套完整的集成方案设计（**方案 C：独立包 + 动态加载**）。该方案作为技术可行性验证保留，但因设计哲学冲突不建议实施。

### 7.1 方案概述

- `runtime` 作为 Project 固有属性（创建时选定，不可切换）
- 新建 `packages/sdk-runtime/` 独立包，`@golemancy/server` 通过 `await import()` 动态加载
- Chat 路由通过 `project.runtime` 分发到不同 handler
- SDK 消息通过 stream-adapter 转为 UIMessageStream，UI 无需区分 runtime
- 完全可插拔：不安装 sdk-runtime 包 → 零影响

### 7.2 方案代价评估

| 改动范围 | 文件数 | 复杂度 |
|---------|--------|--------|
| 新建 sdk-runtime 包 | 8 新文件 | 高（核心逻辑） |
| Shared 类型扩展 | 3 文件 | 低 |
| Server 改动 | 2 文件（极小） | 低 |
| UI 改动 | 11 文件 | 中-高 |
| **总计** | 24 文件 | 高 |

### 7.3 搁置原因

详见第八节「集成利弊分析」。完整方案详见[附录 A](#附录-a完整集成方案)。

---

## 八、集成利弊分析

### 8.1 集成的好处

| 好处 | 权重 | 分析 |
|------|:----:|------|
| **免费使用 Claude**（走订阅而非 API 按量计费） | ⭐⭐⭐ | 唯一实质性好处。但存在 ToS 风险，Anthropic 可能随时加强检测 |
| **Claude Code 内置工具链** | ⭐⭐ | Read/Write/Edit/Bash/Glob/Grep 久经考验。但 Golemancy 自建工具也在持续改进 |
| **自动 Context Compact** | ⭐ | 省心，但 Golemancy 手动 compact 已可用 |
| **Hooks 扩展机制** | ⭐ | 强大，但只在 SDK runtime 内有效 |

### 8.2 集成的代价

| 代价 | 权重 | 分析 |
|------|:----:|------|
| **架构妥协** | ⭐⭐⭐ | Sub-agent 从无限层级退化到单层；Skills/MCP/Permissions 从 per-agent 退化到全局。SDK 项目的 Agent 变成**阉割版 Agent** |
| **维护成本翻倍** | ⭐⭐⭐ | 双 runtime 分叉贯穿 server（chat handler、cron executor）+ UI（StatusBar、ChatWindow、AgentDetail、Settings）+ 存储（双层持久化）。每个新功能都要想两遍 |
| **能力割裂** | ⭐⭐⭐ | SDK 项目无法使用：多 Provider、无限嵌套、细粒度权限、per-agent Skills/MCP。两种项目体验不一致 |
| **用户心智负担** | ⭐⭐ | 同一平台两套规则。用户需理解「Vercel AI 项目」vs「Agent SDK 项目」的能力差异 |
| **Session 黑箱** | ⭐⭐ | SDK 内部存储不可控（`~/.claude/`），必须双层持久化（SDK internal + Golemancy SQLite） |
| **资源开销** | ⭐⭐ | 每次 query spawn 子进程，推荐 1GiB RAM, 5GiB disk |
| **Model 锁定** | ⭐ | SDK 项目仅 Anthropic 三选一（sonnet/opus/haiku） |
| **ToS 风险** | ⭐ | 走订阅的免费使用可能违反服务条款 |

### 8.3 好处 vs 代价权衡

```
好处总权重：⭐⭐⭐ + ⭐⭐ + ⭐ + ⭐ = 7
代价总权重：⭐⭐⭐×3 + ⭐⭐×3 + ⭐×2 = 17
```

代价显著大于好处。核心问题不是「能不能集成」（技术上完全可行），而是「值不值得集成」。

---

## 九、评估结论与建议

### 9.1 结论：不建议集成

**核心理由**：

1. **设计理念根本冲突**。Golemancy 的核心价值是「Agent 是完全自包含的编排单元」— per-agent Skills、per-agent MCP、无限嵌套。Agent SDK 的设计是「一次性 query + 全局配置」。集成意味着 SDK 项目的 Agent 变成阉割版 Agent，破坏平台一致性。

2. **唯一真正的好处是省钱**。SDK 走 Claude 订阅（Max plan）免费。但：
   - 存在 ToS 风险（Anthropic 可能随时限制）
   - 目标用户（电商/内容创作者）的核心痛点不是 API 费用，而是自动化能力
   - 省钱 ≠ 值得用一个更弱的 runtime

3. **维护成本不划算**。双 runtime 意味着每个功能实现两遍、测两遍。投入相同精力，不如深化 Vercel AI runtime 的能力（更好的 sandbox、更智能的 compact、更多 Provider 支持）。

4. **Golemancy 的设计没有问题**。Per-agent 配置、无限嵌套、细粒度权限 — 这些是通用 Agent 编排平台的**正确设计**。Agent SDK 的限制是因为它本质是 CLI 工具的编程接口，不是编排平台。两者定位不同。

### 9.2 替代建议

| 替代方案 | 说明 |
|---------|------|
| **深化 Vercel AI Runtime** | 改进内置工具质量（学习 SDK 的 Read/Write/Edit 设计），升级 Skills 格式，优化 Compact 策略 |
| **关注 Anthropic API 定价变化** | 等待 Anthropic 推出更灵活的 API 接入方式（subscription-based API access） |
| **借鉴 SDK 的设计优点** | Hooks 机制可引入到 Vercel AI runtime 中（PreToolUse/PostToolUse 模式）；Tasks API 的依赖+团队功能可增强 |
| **保留调研成果** | 本文档和 `_docs/agent-sdk/` 目录作为技术知识库保留，未来如需重新评估可快速启动 |

### 9.3 保留的资产

本次评估产出以下资产，可供未来参考：

| 资产 | 位置 |
|------|------|
| 本评估报告 | `_docs/20260225-agent-sdk-evaluation.md` |
| SDK 技术调研详细文档 | `_docs/agent-sdk-integration-research.md` |
| SDK 官方文档本地副本 | `_docs/agent-sdk/` (17 个 .md 文件) |
| SDK 链接索引 | `_docs/agentsdk.md` |

---

## 附录 A：完整集成方案

> 以下为评估过程中设计的完整方案，已验证技术可行性但决定搁置。保留作为参考。

### A.1 类型系统改动

#### A.1.1 Project 增加 runtime 字段

**文件**: `packages/shared/src/types/project.ts`

```typescript
export type ProjectRuntime = 'vercel-ai' | 'agent-sdk'

export interface Project extends Timestamped {
  id: ProjectId
  name: string
  description: string
  icon: string
  runtime: ProjectRuntime  // 创建时选定，不可变
  config: ProjectConfig
  mainAgentId?: AgentId
  agentCount: number
  activeAgentCount: number
  lastActivityAt: string
}
```

向后兼容：存储层读取时 `runtime ?? 'vercel-ai'`。

#### A.1.2 新增 SDK 配置类型

**新文件**: `packages/shared/src/types/agent-sdk.ts`

```typescript
export type SdkModelTier = 'sonnet' | 'opus' | 'haiku'

export interface AgentSdkConfig {
  model: SdkModelTier
  maxTurns?: number
  maxBudgetUsd?: number
  allowedTools?: string[]
  disallowedTools?: string[]
  includePartialMessages: boolean
  settingSources?: ('user' | 'project' | 'local')[]
}
```

**permissionMode 固定为 `bypassPermissions`**：
- SDK 项目始终 `bypassPermissions` + `allowDangerouslySkipPermissions: true`
- 原因：`default` mode 无 `canUseTool` callback 会卡死（SDK 等待用户审批但无 UI）
- 安全策略通过 SDK Hooks（PreToolUse）实现

#### A.1.3 Agent 增加可选 sdkConfig

**文件**: `packages/shared/src/types/agent.ts`

```typescript
export interface Agent extends Timestamped {
  // ... 现有字段不变 ...
  modelConfig: AgentModelConfig       // Vercel AI 用
  sdkConfig?: AgentSdkConfig          // Agent SDK 用
  compactThreshold?: number           // Vercel AI 用
  builtinTools: BuiltinToolConfig     // Vercel AI 用
  skillIds: SkillId[]                 // 共享
  subAgents: SubAgentRef[]            // 共享
  mcpServers: string[]                // 共享
}
```

#### A.1.4 Conversation 增加 sdkSessionId

```typescript
export interface Conversation extends Timestamped {
  // ... 现有字段 ...
  sdkSessionId?: string  // SDK session ID，仅 SDK 项目使用
}
```

### A.2 可插拔机制（三层）

1. **Layer 1 — 包级别隔离**：`@anthropic-ai/claude-agent-sdk` 只存在于 `packages/sdk-runtime/` 的 dependencies。Server 通过 `optionalDependencies` + `await import()` 加载。
2. **Layer 2 — 运行时检测**：`isSdkRuntimeAvailable()` 检测 SDK 是否可用。Server 暴露 `GET /api/sdk-runtime/status`。
3. **Layer 3 — Project runtime 判断**：`project.runtime === 'agent-sdk'` 时走 SDK 路径。

**完全关闭路径**：不安装 `@golemancy/sdk-runtime` → dynamic import 失败 → UI 隐藏 SDK 选项 → 零影响。

### A.3 新包文件结构

```
packages/sdk-runtime/              @golemancy/sdk-runtime
  ├── package.json
  ├── tsconfig.json
  └── src/
      ├── index.ts                 包入口
      ├── availability.ts          isSdkRuntimeAvailable()
      ├── sdk-chat-handler.ts      核心：请求 → query() → SSE
      ├── sdk-stream-adapter.ts    SDKMessage → UIMessageStream
      ├── sdk-config-builder.ts    Agent 配置 → SDK Options
      ├── sdk-hooks.ts             hooks：task 转发、审计、生命周期
      ├── sdk-session-store.ts     Session 映射
      └── sdk-tools-bridge.ts      Golemancy 工具 → createSdkMcpServer
```

### A.4 Server 端核心实现

#### Chat 路由分发

**文件**: `packages/server/src/routes/chat.ts` — 唯一改动

```typescript
if (project?.runtime === 'agent-sdk') {
  const { handleSdkChat } = await import('@golemancy/sdk-runtime')
  return handleSdkChat(c, {
    agent, project, settings, messages,
    projectId, agentId, conversationId, deps,
  })
}
// 以下 Vercel AI 代码完全不变
```

#### Stream Adapter 转换映射

| SDK 事件 | → UIMessageStream |
|---------|-------------------|
| `content_block_start` (text) | 无操作 |
| `content_block_delta` (text_delta) | `writer.write({ type: 'text-delta', textDelta })` |
| `content_block_start` (tool_use) | 记录 toolName + toolCallId，开始累积 |
| `content_block_delta` (input_json_delta) | 累积 JSON chunks |
| `content_block_stop` (tool_use) | `writer.write({ type: 'tool-call', toolCallId, toolName, args })` |
| `AssistantMessage` (tool results) | `writer.write({ type: 'tool-result', toolCallId, result })` |
| `ResultMessage` | usage → TokenRecordStorage → `writer.write({ type: 'finish' })` |
| `CompactBoundary` | `writer.write({ type: 'data-compact', data: { status, summary } })` |

#### Session 与数据持久化

**双层存储架构**：

```
Layer 1: SDK Internal (~/.claude/)
  └─ 由 Claude Code CLI 自动管理，不可替代
  └─ 用于：resume: sessionId 恢复对话

Layer 2: Golemancy SQLite
  └─ 由 sdk-chat-handler 在流式过程中写入
  └─ 用于：UI 显示、搜索(FTS5)、Dashboard 统计
```

**完整数据流**：

```
SDK query() 开始
  ↓
SystemMessage (init) → 提取 sessionId → 写回 Conversation.sdkSessionId
  ↓
StreamEvent → stream-adapter → UIMessageStream (实时 UI) + 累积 parts/token
  ↓
CompactBoundary → compactRecordStorage.save()
  ↓
ResultMessage →
  ├─ conversationStorage.saveMessage() (助手消息)
  ├─ tokenRecordStorage.save() (token 记录)
  ├─ Conversation.sdkSessionId 更新
  └─ writer.write({ type: 'finish' })
```

#### SDK Hooks

| Hook | 用途 |
|------|------|
| `PostToolUse` (TaskCreate\|TaskUpdate) | Tasks 镜像到 Golemancy SQLite |
| `PostToolUse` (全部) | 审计日志 |
| `SubagentStart/Stop` | WebSocket 事件 → UI 实时显示 |
| `SessionStart/End` | Session 生命周期 |

#### Sub-Agent 约束

SDK 限制：单层，禁止嵌套。

```typescript
// Golemancy Agent → SDK AgentDefinition
{
  [subAgent.name]: {
    description: subAgent.description,
    prompt: subAgent.systemPrompt,
    tools: subAgent.sdkConfig?.allowedTools,  // 不含 'Task'
    model: subAgent.sdkConfig?.model ?? 'inherit',
  }
}
```

### A.5 UI 改动总览

| 页面 | 改动程度 | 说明 |
|------|---------|------|
| **Chat** | 🔴 大改 | 固定 [bypass] badge、隐藏 model 选择、context window 简化 |
| **Agent 详情** | 🔴 大改 | SDK Config tab、Allowed Tools tab、移除 Model Config |
| **项目创建** | 🟡 小改 | runtime 选择 |
| **Dashboard** | 🟡 小改 | RuntimeStatusPanel 适配 |
| **Settings** | 🟡 小改 | 隐藏 Provider/Runtime 配置 |
| **Skills** | 🟡 小改 | 物化提示横幅 |
| **Agent 列表** | 🟢 微改 | model tier 标签 |
| **Automations** | 🟢 无改 | Server 端分发 |
| **Tasks/Memory/Artifacts/MCP** | 🟢 无改 | 数据源统一 |

新增 UI 文件：`useProjectRuntime.ts`、`SdkConfigTab.tsx`、`SdkAllowedToolsTab.tsx`

### A.6 功能逐项对照

| 功能 | Vercel AI 项目 | Agent SDK 项目 | 共享程度 |
|------|---------------|---------------|---------|
| Model | 10+ providers | sonnet/opus/haiku | ❌ |
| Permission | restricted/sandbox/unrestricted | 固定 bypassPermissions | ❌ |
| Bash Tool | Golemancy sandbox pool | SDK 内置 | ❌ |
| Browser | 内置 Playwright | createSdkMcpServer 注入 | ❌ |
| Skills | per-agent skillIds[] | 物化为 SKILL.md | ❌ |
| Sub-agents | 无限递归 | 单层 | ❌ |
| MCP | per-agent 连接池 | 全局 SDK 管理 | ❌ |
| Tasks | Golemancy SQLite | SDK API + hook 镜像 | ✅ UI |
| Token 追踪 | onFinish | ResultMessage.usage | ✅ 统一 |
| Chat SSE | UIMessageStream | UIMessageStream (adapter) | ✅ |
| Conversation | SQLite | SQLite (同) | ✅ |
| Dashboard | 统一 storage | 统一 storage | ✅ |

### A.7 实现阶段（搁置）

- Phase 1: 新包脚手架 + 基础类型
- Phase 2: Server 核心 Handler
- Phase 3: Hooks + 数据同步
- Phase 4: UI 改动
- Phase 5: 测试

---

## 附录 B: SDK 完整能力清单

详见 `_docs/agent-sdk-integration-research.md`，包含：
- 2.1 核心架构
- 2.2 SDK 完整能力清单
- 2.3 SDK 配置项（38 个）
- 2.4 流式消息类型
- 2.5 Hooks 系统（12 种事件 + 行为控制 + Matcher 配置）
- 2.6 Sub-agents 机制
- 2.7 Tasks/Todo 系统（新旧对比 + 团队机制）
- 2.8 Custom Tools 注入
- 2.9 关键限制（10 条）

---

## 附录 C: 讨论过程中的关键决策记录

### C.1 Permission Mode 演变

| 阶段 | 决策 | 原因 |
|------|------|------|
| 初始 | Agent 级别配置 | — |
| 第一次反馈 | 改为 Conversation 级别，UI 可切换 | 用户认为应在对话中灵活切换 |
| 调研发现 | `default` mode 无 `canUseTool` callback → SDK 卡死 | SDK 等待用户审批但 Golemancy 无 HiL UI |
| **最终** | **固定 `bypassPermissions`**，server 硬编码 | 唯一不需要 human-in-the-loop 的模式 |

### C.2 Sub-Agent 嵌套

| 阶段 | 决策 | 原因 |
|------|------|------|
| 初始 | 假设可无限嵌套 | — |
| 调研发现 | SDK 官方禁止嵌套 | "Subagents cannot spawn their own subagents" |
| 替代方案调研 | MCP 递归（createSdkMcpServer + tool()） | 技术可行但代价极高（每层 ~100-300MB，sequential） |
| **最终** | **接受单层限制** | 资源代价不可接受 |

### C.3 Session 存储

| 阶段 | 决策 | 原因 |
|------|------|------|
| 初始 | `sdk-sessions.json` 独立文件 | 映射 ConversationId ↔ sessionId |
| 用户反馈 | 为什么有独立文件？对话不是在 SQLite 里吗？ | — |
| 调研发现 | SDK `query()` 不接受 messages 参数，只能 `resume: sessionId` | 双层存储不可避免 |
| **最终** | **移除 `sdk-sessions.json`**，sessionId 存在 Conversation.sdkSessionId 字段 | 减少冗余 |

### C.4 集成 vs 不集成

| 阶段 | 倾向 | 原因 |
|------|------|------|
| 初始 | 集成 | 省钱 + 能力增强 |
| 方案设计完成 | 仍倾向集成 | 技术可行，方案完整 |
| 深入对比分析 | **不建议集成** | 设计理念根本冲突，代价远大于收益 |
