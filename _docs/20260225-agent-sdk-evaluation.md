# Claude Agent SDK 集成评估报告

> 评估时间：2026-02-25（源码分析补充同日）
> 状态：**评估完成 — 结论需修正（见附录 D）**
> 涉及版本：`@anthropic-ai/claude-agent-sdk` v0.1.18（文档调研）→ v0.2.52（源码分析）
> CLI 版本：`@anthropic-ai/claude-code` v2.1.52

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
- [附录 D：SDK 源码深度分析（2026-02-25 补充）](#附录-dsdk-源码深度分析2026-02-25-补充)

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
| **Sub-agents** | `agents` 配置传入 + Task tool 调用，Task 工具单层限制（`iP6` 过滤），但可通过 **MCP Bridge 模式**实现无限嵌套（运行时验证 Test 8+9） |
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

> **⚠️ 重要修正（2026-02-25 源码分析后）**：以下为基于 SDK v0.2.52 源码验证后的完整定义，比官方文档描述更完整。详见附录 D。

```typescript
// sdk.d.ts v0.2.52 — 完整 AgentDefinition
type AgentDefinition = {
  description: string                    // 何时调用此 sub-agent 的描述
  prompt: string                         // 系统提示词
  tools?: string[]                       // 工具白名单（省略则继承全部）
  disallowedTools?: string[]             // 🆕 工具黑名单
  model?: 'sonnet' | 'opus' | 'haiku' | 'inherit'
  mcpServers?: AgentMcpServerSpec[]      // 🆕 Per-agent MCP servers
  skills?: string[]                      // 🆕 Per-agent Skills（预加载到 prompt）
  maxTurns?: number                      // 🆕 最大执行轮次
  criticalSystemReminder_EXPERIMENTAL?: string  // 🆕 关键系统提示

}

// MCP server 可以按名引用，也可以内联定义
type AgentMcpServerSpec = string | Record<string, McpServerConfigForProcessTransport>
```

**Sub-agent 能配置**：Tools（白名单+黑名单）、MCP servers（引用+内联）、Skills（预加载）、Model、maxTurns。
**Sub-agent 不能配置**：嵌套 sub-agents（CLI 硬编码限制，见附录 D.5）。

### 2.5 关键限制

1. **Sub-agents 不能嵌套** — CLI 运行时 `iP6` 硬编码过滤 Task 工具，无法绕过
2. ~~Skills 全局共享~~ → **已修正**：Sub-agent 可通过 `skills` 字段预加载独立 Skills（源码验证）
3. ~~MCP 全局配置~~ → **已修正**：Sub-agent 可通过 `mcpServers` 字段配置独立 MCP（源码验证）
4. **Permissions 部分继承** — sub-agent 有 `permissionMode` 字段但受限于 parent context
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
| **配置粒度** | Per-Agent（每个 agent 独立配置一切） | ~~Per-Query 全局~~ → **已修正**：Per-Agent（tools/skills/MCP/model） |
| **生命周期** | 长期存活的 Agent + 持久化项目 | 单次 query，用完即走 |
| **嵌套模型** | 无限递归（Agent→Sub-Agent→Sub-Sub-Agent...） | 单层（Main Agent→Sub-Agent，到此为止） |
| **工具归属** | Per-Agent（每个 agent 自己的工具集） | ~~全局~~ → **已修正**：Per-Agent（`tools` + `disallowedTools`） |
| **技能归属** | Per-Agent（`agent.skillIds`） | ~~全局~~ → **已修正**：Per-Agent（`skills` 字段） |
| **MCP 归属** | Per-Agent（`agent.mcpServers`） | ~~全局~~ → **已修正**：Per-Agent（`mcpServers` 字段） |
| **权限模型** | Per-Project + 细粒度（路径/网络/命令） | 部分继承，sub-agent 有 `permissionMode` |
| **Model 选择** | 10+ providers，完全自由 | 仅 Anthropic（sonnet/opus/haiku） |
| **目标用户** | 内容创作者、电商、研究员、自动化工程师 | 开发者、CI/CD、代码审查 |

**核心差异（MCP Bridge 验证后再修正）**：两者在 per-agent 配置粒度上已趋近一致（SDK v0.2.52 支持 per-agent Skills/MCP/Tools）。~~唯一根本冲突是嵌套模型~~ → **嵌套限制已通过 MCP Bridge 模式突破**（运行时验证 Test 8+9：在 MCP tool handler 内调用 `query()` 创建独立 CLI 会话，绕过 `iP6` Task 工具过滤，实现 L0→L1→L2→L3 三层嵌套，归纳可证无限层级）。剩余差异仅为 Model Provider 锁定（仅 Anthropic）和生命周期模型差异，均为可接受的架构约束。

---

## 五、能力逐项对比

| 能力 | Golemancy | Agent SDK | 差距级别 |
|------|-----------|-----------|----------|
| **Skills 归属** | ✅ Per-Agent（`agent.skillIds`，symlink 过滤） | ~~❌ 全局~~ → ✅ Per-Agent（`skills` 字段，源码验证） | ~~🔴~~ → ✅ **一致** |
| **MCP 归属** | ✅ Per-Agent（`agent.mcpServers`，连接池） | ~~❌ 全局~~ → ✅ Per-Agent（`mcpServers` 字段，源码验证） | ~~🔴~~ → ✅ **一致** |
| **Sub-Agent 嵌套** | ✅ 无限层级（lazy-load 递归 + DI） | ~~❌ 仅单层~~ → ✅ **MCP Bridge 模式**实现无限层级（Test 8+9 验证） | ~~🔴~~ → ✅ **已解决** |
| **Sub-Agent 独立性** | ✅ 完整独立（model/skills/MCP/tools/sub-agents） | ~~⚠️ 仅 prompt+tools+model~~ → ✅ 完整独立（含 per-agent MCP/Skills/Tools + MCP Bridge 嵌套） | ~~🔴~~ → ✅ **一致** |
| **Permission 粒度** | ✅ Per-Project + 路径/网络/命令细粒度 | ⚠️ 有 permissionMode 但粒度有限 | 🟡 部分差异 |
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
| **内容创作** | ✅ | ⚠️ | ~~SDK 全局共享无法隔离~~ → SDK 已支持 per-agent Skills/MCP；但无嵌套限制单层协作 |
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
| 源码分析后 | **结论需修正** | SDK v0.2.52 已支持 per-agent MCP/Skills，差距显著缩小 |

---

## 附录 D：SDK 源码深度分析（2026-02-25 补充）

### D.1 分析动机

此前评估报告基于 SDK 文档得出结论：Sub-Agent 不能配置独立的 Skills、MCP、Tools。用户要求深入 SDK 源码验证这些限制的真实原因，并评估能否"强行实现"突破。

### D.2 分析对象

| 文件 | 版本 | 说明 |
|------|------|------|
| `sdk.d.ts` | v0.2.52 (2082行) | TypeScript 类型定义 — 权威 API 接口 |
| `sdk.mjs` | v0.2.52 (56行) | SDK 入口，纯 re-export |
| `cli.js` | v2.1.52 (12611行, minified) | Claude Code CLI 实现 — 实际运行时 |

### D.3 重大发现：AgentDefinition 已扩展

**SDK v0.2.52 的 `AgentDefinition` 比文档描述的要强大得多：**

```typescript
// sdk.d.ts lines 33-67
export declare type AgentDefinition = {
    description: string;
    tools?: string[];
    disallowedTools?: string[];       // 🆕 Per-agent 工具黑名单
    prompt: string;
    model?: 'sonnet' | 'opus' | 'haiku' | 'inherit';
    mcpServers?: AgentMcpServerSpec[];  // 🆕 Per-agent MCP 服务器!
    criticalSystemReminder_EXPERIMENTAL?: string;  // 🆕 关键系统提示
    skills?: string[];                  // 🆕 Per-agent Skills!
    maxTurns?: number;                  // 🆕 Per-agent 最大轮次限制
};

export declare type AgentMcpServerSpec =
    string |                             // 引用已有 MCP server 名
    Record<string, McpServerConfigForProcessTransport>;  // 内联定义新 MCP server
```

**与此前文档对比：**

| 能力 | 此前文档说 | 源码实际 | 差异 |
|------|-----------|---------|------|
| Per-agent Tools | ✅ | ✅ `tools` + `disallowedTools` | 更强（新增黑名单） |
| Per-agent MCP | ❌ | ✅ `mcpServers` | **重大变化** |
| Per-agent Skills | ❌ | ✅ `skills` | **重大变化** |
| Per-agent Model | ✅ | ✅ `model` | 一致 |
| Per-agent Prompt | ✅ | ✅ `prompt` | 一致 |
| Per-agent maxTurns | ❌ | ✅ `maxTurns` | 新增 |
| Sub-agent 嵌套 | ❌ | ❌ | 一致（见 D.5） |

### D.4 源码验证：SDK 层完整传递

SDK → CLI 通信协议中，`AgentDefinition` **不做任何字段裁剪**：

```typescript
// sdk.d.ts SDKControlInitializeRequest
declare type SDKControlInitializeRequest = {
    subtype: 'initialize';
    agents?: Record<string, coreTypes.AgentDefinition>;  // 完整传递
    // ...其他字段
};
```

`sdk.mjs` 只是 re-export，不做任何转换。Agent 定义原样传给 CLI 子进程。

### D.5 CLI 运行时分析：各能力如何生效

#### Per-agent Skills — ✅ 完全生效

CLI `SR()` 函数（agent 执行核心）中：

```javascript
// cli.js SR() function (line ~82267)
let l = A.skills ?? [];
if (l.length > 0) {
    let skillDirs = await Dk(getSkillSources());
    for (let skillName of l) {
        let resolved = qhY(skillName, skillDirs, A);  // 解析 skill
        if (!resolved) { continue; }
        let skillDef = tI(resolved, skillDirs);
        if (skillDef.type !== "prompt") { continue; }
        // 加载 skill 内容到 agent prompt messages
        let content = await skillDef.getPromptForCommand("", K);
        T.push(A8({content: [{type: "text", text: content}]}));
    }
}
```

Skills 在 agent 启动时被预加载到 prompt messages 中。

#### Per-agent MCP — ✅ 完全生效

```javascript
// cli.js tSY() function (line ~82234)
async function tSY(A, parentMcpClients) {
    if (!A.mcpServers?.length) return { clients: parentMcpClients, tools: [], cleanup: async () => {} };

    for (let serverSpec of A.mcpServers) {
        if (typeof serverSpec === "string") {
            // 引用已有 MCP server
            client = lookupExistingServer(serverSpec);
        } else {
            // 内联定义新 MCP server（动态启动）
            let [name, config] = Object.entries(serverSpec)[0];
            client = await connectToServer(name, {...config, scope: "dynamic"});
        }
        // 连接并获取 tools
        let tools = await getServerTools(client);
    }
    // 返回 合并后的 clients 和 tools，agent 结束后自动 cleanup
}
```

Sub-agent 可以：
- 引用父级已连接的 MCP server（by name）
- **内联定义新的 MCP server**（启动新进程，agent 结束自动清理）

#### Per-agent Tools — ✅ 完全生效

```javascript
// cli.js wc() function (line ~64168)
function wc(agentDef, availableTools, isAsync, skipFilter) {
    let { tools, disallowedTools, source, permissionMode } = agentDef;

    // Step 1: 基础过滤（移除 UI-only 工具）
    let filtered = skipFilter ? availableTools : yT8({tools: availableTools, ...});

    // Step 2: 应用 disallowedTools 黑名单
    let blockedSet = new Set(disallowedTools?.map(t => extractToolName(t)));
    filtered = filtered.filter(t => !blockedSet.has(t.name));

    // Step 3: 如果指定了 tools 白名单，只保留白名单中的
    if (tools !== undefined && !(tools.length === 1 && tools[0] === "*")) {
        // 精确匹配 + 解析 Task(agentType) 语法
        for (let toolSpec of tools) {
            let { toolName, ruleContent } = parseToolSpec(toolSpec);
            if (toolName === "Task" && ruleContent) {
                // Task(agent1,agent2) → 限制可用的 agent types
                allowedAgentTypes = ruleContent.split(",").map(s => s.trim());
            }
        }
    }
    return { resolvedTools, allowedAgentTypes };
}
```

特别注意 `tools: ["Task(my-agent1,my-agent2)"]` 语法可以精确控制 sub-agent 能调用哪些 agent types。

#### Sub-agent 嵌套 — ❌ 仍被限制

**限制机制**在 `yT8()` 函数中：

```javascript
// cli.js yT8() function (line ~64163)
function yT8({tools, isBuiltIn, isAsync, permissionMode}) {
    return tools.filter(tool => {
        if (tool.name.startsWith("mcp__")) return true;  // MCP 工具始终保留

        if (iP6.has(tool.name)) return false;  // 🚫 关键过滤集

        if (!isBuiltIn && sV8.has(tool.name)) return false;

        if (isAsync && !lX1.has(tool.name)) {
            // async agent (sub-agent) 只允许白名单工具
            if (isTeamsEnabled() && isInProcessRunner()) {
                if (isTaskTool(tool)) return true;  // Teams 模式例外
            }
            return false;
        }
        return true;
    });
}

// 被过滤的工具集 (line ~63061)
iP6 = new Set([
    "TaskOutput",      // dQ
    "ExitPlanMode",    // eW (也包含 ps)
    "EnterPlanMode",   // UX1
    "Task",            // WK  ← 🚫 Task 工具被过滤！
    "AskUserQuestion", // x_
    "TaskStop"         // UQ
]);
```

**核心发现**：`iP6` 集合硬编码了永远被过滤的工具，其中 **`Task` 工具在此列表中**。这意味着：

- Sub-agent 执行时，`yT8()` 会在基础过滤阶段就移除 `Task` 工具
- Sub-agent 永远看不到 `Task` 工具 → 无法 spawn 下一级 sub-agent
- 这是在 `wc()` 的第一步就被移除的，`tools` 白名单无法覆盖

**唯一例外**：当 Teams 功能启用 (`j7()`) 且处于 in-process runner 模式 (`t0()`) 时，`Task` 工具会被保留。但这是 Teams 模式的特殊逻辑，普通 sub-agent 不适用。

#### agentDefinitions 传递 — ✅ 完整继承

```javascript
// cli.js SR() function (line ~82267)
let j6 = {
    // ...
    agentDefinitions: K.options.agentDefinitions,  // 完整继承父级的所有 agent 定义
};
let W6 = hU6(K, { options: j6, ... });
```

Sub-agent 知道所有 agent 定义的存在（知道有哪些 agent types），但由于 `Task` 工具被过滤，无法使用它们。

### D.6 "强行实现"可行性分析

| 绕过方式 | 可行性 | 分析 |
|---------|--------|------|
| **通过 `tools` 白名单保留 Task** | ❌ 不可行 | `iP6` 过滤在 `wc()` 的 `yT8()` 阶段执行，优先于 `tools` 白名单 |
| **通过 `disallowedTools` 反向操作** | ❌ 不可行 | `disallowedTools` 只能进一步移除，不能添加已被 `iP6` 过滤的工具 |
| **Fork CLI 源码修改** | ⚠️ 理论可行但不切实际 | CLI 是 minified 的 12000+ 行文件，无法维护。且 Anthropic 随时更新 CLI binary |
| **使用 Teams 模式** | ⚠️ 有限可行 | Teams 模式下 `Task` 工具保留，但 Teams 是独立的协作模型，不等价于无限嵌套 |
| **SDK 层包装** | ❌ 不可行 | SDK 只是 CLI 的 thin wrapper，运行时逻辑全在 CLI 中 |
| **等待官方支持** | ✅ 最佳策略 | AgentDefinition 已扩展到支持 MCP/Skills，嵌套支持可能是下一步 |

### D.7 修正后的能力对比

基于源码分析，修正此前的能力对比表：

| 能力维度 | Golemancy | Agent SDK (v0.2.52 实际) | 差异程度 |
|---------|-----------|------------------------|---------|
| Per-agent Tools | ✅ 完整 | ✅ 完整 (tools + disallowedTools) | **一致** |
| Per-agent Skills | ✅ 完整 | ✅ 支持 (skills 字段) | **一致** |
| Per-agent MCP | ✅ 完整 | ✅ 支持 (mcpServers 字段，含内联定义) | **一致** |
| Per-agent Model | ✅ 完整 | ✅ 支持 | **一致** |
| Per-agent Prompt | ✅ 完整 | ✅ 支持 | **一致** |
| Sub-agent 嵌套 | ✅ 无限 | ❌ 单层 (iP6 硬编码限制) | **根本不同** |
| Per-agent Permissions | ✅ 三级 | ⚠️ 有限 (permissionMode 字段存在但受限) | **部分差异** |
| 动态 MCP 生命周期管理 | ✅ 独立 pool | ✅ agent 粒度 cleanup | **一致** |

### D.8 对此前结论的影响

源码分析显示，此前报告中的 **"5 个根本不同"减少为 1-2 个**：

- ~~Per-agent Skills~~ → **已支持** ✅
- ~~Per-agent MCP~~ → **已支持** ✅
- ~~Per-agent Tools~~ → **已支持**（且更强，有 disallowedTools）✅
- ~~**Sub-agent 嵌套** → **仍不支持** ❌~~ → ✅ **MCP Bridge 模式突破**（运行时验证 Test 8+9，2026-02-26）
- **Per-agent Permissions** → **部分支持** ⚠️

~~剩余的核心差异只有 Sub-agent 嵌套限制。这是 CLI 运行时层面的硬编码决策（`iP6` 集合），无法通过 SDK 配置或 AgentDefinition 绕过。~~

**2026-02-26 更新**：Sub-agent 嵌套限制已通过 **MCP Bridge 模式**突破。原理：在 `createSdkMcpServer` 的 tool handler 内调用 `query()` 创建独立 CLI 会话，该会话不继承父级 `iP6` 过滤。运行时验证：
- Test 8：L0→L1(Task)→L2(MCP Bridge) ✅
- Test 9：L0→L1(Task)→L2(MCP Bridge)→L3(MCP Bridge) ✅，归纳可证无限层级

至此，SDK 与 Golemancy 在 sub-agent 能力上的所有重大差异均已消除。剩余差异仅为 Model Provider 锁定（仅 Anthropic）、Per-agent Permissions 粒度、和生命周期模型差异。

### D.9 修正后的建议（二次修正 2026-02-26）

鉴于 MCP Bridge 模式已验证突破嵌套限制，建议最终修正为：

1. ~~**结论需要修正**：设计理念差异从 "根本冲突" 降级为 "局部差异"（仅嵌套限制）~~ → **嵌套限制已解决，设计理念差异完全消除**
2. **建议集成**：SDK 在 per-agent 粒度（Skills/MCP/Tools）和嵌套能力（MCP Bridge）上均已与 Golemancy 对齐，加上 Claude Max 免费调用的成本优势，集成价值显著
3. ~~**持续关注 SDK 演进**~~ → SDK 已满足全部需求，无需等待
4. ~~**建议进行实际功能验证**~~ → ✅ 已完成（Test 1-9，9/9 通过）
