# Claude Agent SDK 集成计划

## Context

Golemancy 当前使用 Vercel AI SDK 作为唯一 AI 执行引擎。用户希望加入 Claude Agent SDK 作为第二种项目级 runtime，核心动机是成本优化（Claude Max 订阅免费）和 Claude Code 内置工具能力。经过详细调研（`_docs/20260225-agent-sdk-evaluation.md`）、源码分析（SDK v0.2.52）、运行时验证（7/7 测试通过），确认技术可行。本计划在不影响现有 Vercel AI 功能的前提下，增加 Claude 项目类型。

---

## 用户需求要点汇总

### 架构决策
- **Project 级 runtime**：`ProjectConfig.runtime = 'vercel-ai' | 'claude'`，创建时选定
- **目录级分割**（非新包）：`server/src/claude-sdk/` + `ui/src/features/claude-sdk/`
- **存储不分割**：共享现有 SQLite + 文件存储
- **可对现有目录结构适当调整**

### Claude 项目的功能差异
- **Permission Mode**：完全删除（SDK 固定 `bypassPermissions`）
- **Memory**：不使用结构化条目，改用 workspace 根目录下的 `CLAUDE.md` 文件
- **Artifacts**：改名为 **Workspace**
- **Conversation Tasks**：保留（通过 SDK Hook 监听 Task 事件，镜像到 Golemancy storage）
- **MCP Servers**：统一配置（无 sandbox 包装逻辑）
- **Skills**：复用现有 Skills 页面（UI 交互不变，存储位置不变）
- **Automations（Cron）**：无变化
- **Model**：仅 sonnet / opus / haiku 三选一（非多 Provider）
- **Built-in Tools**：UI 提供工具管理面板，支持全部启用 / 全部禁用 / 部分启用三种模式。SDK 内置工具完整列表：
  - **文件操作**：Read, Write, Edit, NotebookEdit
  - **命令与搜索**：Bash, Glob, Grep
  - **Web**：WebSearch, WebFetch
  - **Agent 编排**：Task, TaskCreate, TaskUpdate, TaskGet, TaskList, TaskOutput, TaskStop
  - **交互与规划**：AskUserQuestion, EnterPlanMode, ExitPlanMode
  - 通过 `allowedTools`（白名单）和 `disallowedTools`（黑名单）控制
- **Compact**：SDK 自动管理，UI 不显示手动控制
- **Token 追踪**：SDK ResultMessage 提供完整 token 信息（input_tokens, output_tokens, cache tokens, total_cost_usd），StatusBar 显示每次调用的 token 使用量。Provider 统一显示为 "Claude SDK"。Dashboard 保留 by model / by agent 的 token 统计（与 Vercel AI 一致）

### Chat 页面变化
- **StatusBar 左侧**：不显示 Permission Mode、不显示 Sandbox
- **StatusBar 右侧**：显示当前调用的 Token 使用量（input/output tokens），不显示 Context Window
- **保留**：Sub-Agent 流式显示、Tool-Call 显示、Tasks 显示
- **新增**：Compact 边界通过 SDK Hook 监听并显示
- **新增**：Slash Command 快捷键可定制
- **新增**：Hook 事件实时流（Task 创建/更新、Compact 触发、Agent 状态变化）

### Sub-Agent 层级约束（~~关键差异~~ → 已解决）

> **2026-02-26 更新**：原 SDK 限制（Task 工具被 `iP6` 过滤，最多 2 层）已通过 **MCP Bridge 模式**突破（运行时验证 Test 8+9）。
> 原理：在 `createSdkMcpServer` 的 tool handler 内调用 `query()` 创建独立 CLI 会话，不继承 `iP6` 过滤。归纳可证无限层级。

- ~~SDK 限制：最多 2 层~~ → MCP Bridge 模式可实现无限层级
- ~~Custom Tools 只在第一级 agent 可用~~ → **已修正**：Sub-agent 的 `AgentDefinition` 支持 `mcpServers` 字段，可引用 custom tools（运行时验证 Test 2）
- **同一 Agent 的双重身份**：各层级 agent 均可携带 MCP Bridge 工具，深度不受限
- ~~Topology 可视化需展示 2 层深度约束~~ → 可展示完整无限层级拓扑
- ~~AgentDetailPage 需根据 agent 有效深度显示警告~~ → 无需深度限制警告

### Dashboard 变化
- **Global Dashboard**：支持 by project / by model / by agent 的 Token 统计。Provider 显示 "Claude SDK"（等同于 Vercel AI 中的 Provider 概念）
- **Project Dashboard**：保留 Token Usage 统计面板（by model / by agent），与 Vercel AI 项目一致
- RuntimeStatus 面板适配 SDK 状态

---

## 目录结构设计

> **2026-02-26 更新**：UI 目录结构从独立 `features/` 模式调整为就近放置策略，保持与现有代码组织模式一致。

### 设计原则

UI 采用**两层策略**，避免不必要的页面重复：

- **策略 A**（差异小的页面）：在现有页面内做 runtime 条件渲染（`useProjectRuntime()` 控制）
- **策略 B**（差异大的页面）：新建 `Claude*` 前缀的独立页面

| 页面 | 策略 | 理由 |
|---|---|---|
| ChatPage | B — 新建 | StatusBar 完全不同，token 显示逻辑不同 |
| AgentDetailPage | B — 新建 | Tab 集完全不同（无 Model Provider, 新增 Built-in Tools） |
| MemoryPage | B — 新建 | 完全不同的交互（CLAUDE.md 编辑器 vs 结构化条目列表） |
| AgentListPage | A — 条件渲染 | 仅增加深度标注，80%+ 逻辑共享 |
| DashboardPage | A — 条件渲染 | 仅隐藏 Provider 分布图 |
| SettingsPage | A — 条件渲染 | 仅隐藏 Permissions tab |
| TopologyView | A — 条件渲染 | 仅调整边样式和节点标注 |

### 新增文件

```
packages/shared/src/types/
└── claude.ts                        Claude 专属类型定义

packages/server/src/claude-sdk/      Claude 执行引擎（与 agent/ 平行）
├── index.ts                         统一导出
├── handler.ts                       SDK query() → UIMessageStream
├── stream-adapter.ts                SDKMessage → UIMessageStream 转换
├── config-mapper.ts                 Agent/SubAgent → SDK Options 双轨映射
├── hooks.ts                         Hook 事件处理 → WebSocket 转发
├── session.ts                       Session 管理（resume 支持）
└── cron-executor.ts                 Cron 专用执行器（非流式）

packages/ui/src/pages/
├── chat/
│   └── ClaudeChatPage.tsx           Chat 页面（无 permission 显示，保留 token 显示）
├── agent/
│   └── ClaudeAgentDetailPage.tsx    不同 Tab 集（无 Model Provider、新增 Built-in Tools）
└── memory/
    └── ClaudeMemoryPage.tsx         CLAUDE.md 编辑器（workspace 文件操作）

packages/ui/src/components/claude/   Claude 专属组件
├── ClaudeStatusBar.tsx              显示 Token 使用 + Tasks + Hook 事件
├── ClaudeModelSelect.tsx            sonnet / opus / haiku 三选一
├── BuiltinToolsPanel.tsx            SDK 内置工具管理面板（全部/部分/无启用）
├── HookEventFeed.tsx                Hook 事件实时流
└── CompactIndicator.tsx             SDK Compact 状态显示

packages/ui/src/hooks/
├── useProjectRuntime.ts             判断当前项目 runtime
└── useClaudeHookEvents.ts           Hook 事件流监听（WebSocket）
```

### 修改文件

```
packages/shared/src/types/
├── settings.ts                      ProjectConfig 新增 runtime 字段
└── index.ts                         导出 claude.ts

packages/server/src/
├── routes/chat.ts                   头部加 runtime 分发（~10 行）
├── scheduler/executor.ts            Cron 执行加 runtime 分发
└── package.json                     新增依赖 @anthropic-ai/claude-agent-sdk

packages/ui/src/
├── app/routes.tsx                   加 RuntimeSwitch 分发逻辑
├── app/layouts/ProjectLayout.tsx    加载 runtime 信息
├── components/layout/ProjectSidebar.tsx  根据 runtime 切换导航项（条件渲染）
├── stores/useAppStore.ts            createProject 接受 runtime 参数
├── pages/agent/AgentListPage.tsx    加 runtime 条件渲染（深度标注）
├── pages/dashboard/DashboardPage.tsx 加 runtime 条件渲染（隐藏 Provider 分布）
├── pages/project/ProjectSettingsPage.tsx 加 runtime 条件渲染（隐藏 Permissions）
└── pages/project/ProjectCreateModal.tsx  新增 runtime 选择器
```

### 不动的文件（关键确认）
- `server/src/agent/` 全部文件 — 完全不动
- `server/src/storage/` 全部文件 — 完全不动
- `server/src/db/` 全部文件 — 完全不动
- `server/src/routes/` 除 chat.ts 外 — 完全不动
- `ui/src/components/base/` 全部 Pixel* 组件 — 完全不动

---

## 实施计划

### Phase 1：类型系统 + 项目创建

**目标**：支持创建 Claude runtime 项目

**shared/src/types/settings.ts**：
```typescript
export type ProjectRuntime = 'vercel-ai' | 'claude'

export interface ProjectConfig {
  maxConcurrentAgents: number
  permissionsConfigId?: PermissionsConfigId
  runtime?: ProjectRuntime  // 新增，默认 'vercel-ai'
}
```

**shared/src/types/claude.ts**（新增）：
```typescript
export type ClaudeModelTier = 'sonnet' | 'opus' | 'haiku'

export interface ClaudeConfig {
  model: ClaudeModelTier
  maxTurns?: number
  maxBudgetUsd?: number
  allowedTools?: string[]
  disallowedTools?: string[]
  settingSources?: ('user' | 'project' | 'local')[]
}
```

**server/src/storage/projects.ts**：
- 读取时 `runtime ?? 'vercel-ai'` 向后兼容

**ui/src/stores/useAppStore.ts**：
- `createProject` action 接受可选 `runtime` 参数

**ui/src/pages/project/ProjectCreateModal.tsx**：
- 新增 runtime 选择器（Radio: Vercel AI / Claude）

**验证**：创建 Claude 项目，确认 `project.config.runtime === 'claude'`

### Phase 2：Server 端 Claude 引擎

**目标**：Claude 项目可以发送消息并获得 AI 响应

**server/src/claude-sdk/handler.ts**：
- 入口函数 `handleClaudeChat(c, deps)`
- 调用 SDK `query()`
- 用 stream-adapter 转为 `createUIMessageStreamResponse()`
- 使用 `deps.conversationStorage` 持久化消息
- 使用 `deps.tokenRecordStorage` 记录 token

**server/src/claude-sdk/stream-adapter.ts**：
- `SDKAssistantMessage` → `writer.write({ type: 'text-delta' })`
- `SDKPartialAssistantMessage` (content_block_delta) → text-delta / tool-call 累积
- `SDKResultMessage` → `writer.write({ type: 'finish' })`
- `SDKCompactBoundaryMessage` → `writer.write({ type: 'data', data: { compact: ... } })`
- Sub-agent 事件 → `writer.write({ type: 'data', data: { subAgent: ... } })`

**server/src/claude-sdk/config-mapper.ts**：
- `mapAgentToSdkOptions(agent, allAgents, settings)` → SDK query options
- `mapSubAgentsToDefinitions(mainAgent, allAgents)` → `Record<string, AgentDefinition>`（Level 1 agents）
- `createSubAgentBridgeTools(agent, allAgents)` → MCP Bridge tools（Level 2+ agents，含有状态 sessionId）
- **双轨映射**：Level 1 走 SDK AgentDefinition，Level 2+ 走 MCP Bridge（详见「Sub-Agent 映射详细设计」）
- **Built-in Tools 映射**：将 Agent 配置的 `allowedTools` / `disallowedTools` 传入 SDK options

**server/src/claude-sdk/hooks.ts**：
- 监听 `PostToolUse` → 转发 tool-call 事件到 WebSocket
- 监听 `SubagentStart/Stop` → 转发 sub-agent 状态
- 监听 `PreCompact` → 转发 compact 事件
- 监听 `Notification` → 转发状态通知
- Task 相关 hook → 镜像到 Golemancy taskStorage

**server/src/claude-sdk/session.ts**：
- `getOrCreateSession(conversationId)` → sdkSessionId（从 Conversation.metadata 读取）
- `saveSession(conversationId, sessionId)` → 写入 Conversation.metadata.sdkSessionId
- 利用现有 `metadata` JSON 字段，不需要 schema migration
- Session 丢失处理：resume 失败时返回错误提示，引导用户新建对话
- **注意**：此处仅管理 Main Conversation 的 session。Sub-agent 的 session 由 MCP Bridge tool 内部管理，无需持久化（详见「MCP Bridge Sub-Agent 有状态会话」）

**server/src/routes/chat.ts** 修改：
```typescript
// 在 POST handler 开头加分发
const project = await deps.projectStorage.getById(projectId as ProjectId)
if (project?.config?.runtime === 'claude') {
  const { handleClaudeChat } = await import('../claude-sdk/handler')
  return handleClaudeChat(c, { ...deps, project, agentId, messages, conversationId })
}
// 以下现有代码完全不变
```

**server/src/claude-sdk/cron-executor.ts**：
- 类似 `scheduler/executor.ts`，但调用 SDK `query()` 非流式
- `scheduler/executor.ts` 修改：检查 project runtime 后分发

**验证**：Claude 项目中发送消息，收到 SSE 流式响应，消息持久化到 SQLite

### Phase 3：UI 路由分发 + 侧栏

**目标**：Claude 项目进入后看到不同的页面和导航

**ui/src/features/claude-sdk/hooks/useProjectRuntime.ts**：
```typescript
export function useProjectRuntime(): ProjectRuntime {
  const project = useAppStore(s => {
    const id = s.currentProjectId
    return s.projects.find(p => p.id === id)
  })
  return project?.config?.runtime ?? 'vercel-ai'
}
```

**ui/src/features/claude-sdk/routes.ts**：
```typescript
export const claudeRouteMap: Record<string, React.ComponentType> = {
  '':           ClaudeDashboardPage,    // index
  'chat':       ClaudeChatPage,
  'agents':     ClaudeAgentListPage,
  'agents/:agentId': ClaudeAgentDetailPage,
  'memory':     ClaudeMemoryPage,       // CLAUDE.md 编辑器
  'settings':   ClaudeSettingsPage,
  // skills, mcp-servers, cron, tasks, workspace → 复用现有页面（不需要 Claude 专属版本）
}
```

**ui/src/features/claude-sdk/sidebar.ts**：
```typescript
export const claudeSidebarItems = [
  { label: 'Dashboard',   icon: '[]', path: '' },
  { label: 'Chats',       icon: '>_', path: '/chat' },
  { label: 'Automations', icon: '::', path: '/cron' },
  { label: 'Agents',      icon: '{}', path: '/agents' },
  { label: 'Skills',      icon: '<>', path: '/skills' },
  { label: 'MCP Servers', icon: '~>', path: '/mcp-servers' },
  { label: 'Tasks',       icon: '#',  path: '/tasks' },
  { label: 'Workspace',   icon: '..', path: '/artifacts' },  // Artifacts 改名
  { label: 'Memory',      icon: '()', path: '/memory' },     // CLAUDE.md 编辑器
]
```

**ui/src/app/routes.tsx**：
- 加入 `RuntimeSwitch` 组件，根据 runtime 选择页面组件

**ui/src/components/layout/ProjectSidebar.tsx**：
- `import { claudeSidebarItems } from '../../features/claude-sdk/sidebar'`
- `const items = runtime === 'claude' ? claudeSidebarItems : defaultSidebarItems`

**验证**：进入 Claude 项目，看到不同的侧栏导航项

### Phase 4：Claude Chat 页面

**目标**：Claude 项目的 Chat 页面正确展示

**ui/src/features/claude-sdk/pages/ClaudeChatPage.tsx**：
- 复用现有 `ChatSidebar`, `ChatWindow`, `ChatInput`, `MessageBubble`
- 替换 `StatusBar` 为 `ClaudeStatusBar`
- 不传 compactThreshold 等（SDK 自动管理）
- 保留 Sub-Agent 流式显示 和 Tool-Call 显示
- 保留 CompactBoundary 组件（数据源从 SDK Hook 来）

**ui/src/features/claude-sdk/components/ClaudeStatusBar.tsx**：
- 左侧：不显示 Permission Mode、不显示 Sandbox
- 右侧：显示 Token 使用量（input/output tokens from ResultMessage） + Tasks 计数 + Hook 事件指示器
- 高度保持 `h-6`（与现有 StatusBar 一致）

**ui/src/features/claude-sdk/components/HookEventFeed.tsx**：
- 订阅 WebSocket 的 SDK Hook 事件
- 显示最近的 hook 事件（compact triggered, task created 等）
- 可折叠/展开

**ui/src/features/claude-sdk/components/CompactIndicator.tsx**：
- 当 SDK 触发 compact 时显示指示
- 数据通过 `useClaudeHookEvents` 获取

**验证**：在 Claude 项目中聊天，看到简化的 StatusBar，Sub-Agent 和 Tool-Call 正常显示

### Phase 5：Claude Agent 页面

**目标**：Claude 项目的 Agent 配置页面正确展示

**ui/src/features/claude-sdk/pages/ClaudeAgentDetailPage.tsx**：
Tab 列表（与现有 6 tabs 对比）：
1. **General** — 复用（name, description, systemPrompt）
2. **Model** — 新组件 `ClaudeModelSelect`（sonnet/opus/haiku 三选一，无 Provider 概念）
3. **Tools** — 新组件 `BuiltinToolsPanel`（SDK 内置工具管理，支持全部启用/全部禁用/部分启用）
4. **Skills** — 复用（assign/remove skills）
5. **MCP** — 复用但简化（无 sandbox 警告，无 permission mode 相关逻辑）
6. **Sub-Agents** — 复用但增加 `DepthWarning` 组件

删除的 tab：
- ~~Model Config~~（Provider/model 选择）→ 替换为简化的 Model tab
- ~~原 Tools~~（Vercel AI 的 built-in tool toggles）→ 替换为 Claude SDK 的 `BuiltinToolsPanel`

**ui/src/features/claude-sdk/components/ClaudeModelSelect.tsx**：
```tsx
// 简单的 3 选项 radio/dropdown
<PixelDropdown value={model} options={['sonnet', 'opus', 'haiku']} onChange={...} />
```

**ui/src/features/claude-sdk/components/BuiltinToolsPanel.tsx**：
- 展示 SDK 全部内置工具列表，分组显示：
  - **文件操作**：Read, Write, Edit, NotebookEdit
  - **命令与搜索**：Bash, Glob, Grep
  - **Web**：WebSearch, WebFetch
  - **Agent 编排**：Task, TaskCreate, TaskUpdate, TaskGet, TaskList, TaskOutput, TaskStop
  - **交互与规划**：AskUserQuestion, EnterPlanMode, ExitPlanMode
- 三种模式快捷切换：
  - 「全部启用」— 不设限制（默认）
  - 「全部禁用」— 所有工具加入 `disallowedTools`
  - 「自定义」— 逐个 toggle 开关
- 每个工具显示名称 + 简短描述 + 开关
- 工具 toggle 采用 PixelSwitch 组件，分组用 PixelCard 包裹
- 配置存储到 Agent 的 `allowedTools` / `disallowedTools` 字段

~~**ui/src/features/claude-sdk/components/DepthWarning.tsx**~~：
> **2026-02-26 更新**：MCP Bridge 模式已突破深度限制，DepthWarning 组件不再需要。所有层级的 sub-agent 均可正常工作。

~~**ui/src/features/claude-sdk/hooks/useAgentDepth.ts**~~：
> **2026-02-26 更新**：深度计算仍可保留用于 UI 展示，但不再用于限制功能。

**ui/src/features/claude-sdk/pages/ClaudeAgentListPage.tsx**：
- 复用 AgentListPage 的大部分 UI（card grid, status badges）
- Agent card 增加深度标注（Level 0 / Level 1 / Level 2 / Unused）
- Main Agent 的 card 标注 「Main Agent (Level 0)」

**ui/src/features/claude-sdk/pages/ClaudeTopologyView.tsx**：
- 复用 TopologyView 的 ReactFlow 基础
- 边样式：
  - Level 0→1：实线
  - Level 1→2：实线
  - Level 2→3+：虚线 + 灰色（表示 SDK 不支持）
- 节点标注：显示有效深度
- Level 2 节点如果配置了 sub-agents，显示灰色 badge「Sub-Agents 不可用」

**验证**：Agent 详情页显示正确的 tab 集，深度警告在正确时机出现

### Phase 6：其他 Claude 页面

**ui/src/features/claude-sdk/pages/ClaudeMemoryPage.tsx**：
- 不使用 `IMemoryService`（结构化条目）
- 使用 `IWorkspaceService.readFile(projectId, 'CLAUDE.md')` 读取
- 使用 `IWorkspaceService`（或新增 API）写入
- 展示为代码编辑器（PixelTextArea 或 Monaco-like）
- 保存时写回 workspace 根目录的 `CLAUDE.md`

**ui/src/features/claude-sdk/pages/ClaudeDashboardPage.tsx**：
- 保留：Agent 统计、最近对话、Runtime 状态
- 保留 Token 统计面板：
  - Token Trend Chart（by day/week/month）
  - Token By Model（sonnet/opus/haiku 分布）
  - Token By Agent 分布
  - 总费用 `total_cost_usd`（SDK 原生提供）
- Provider 固定显示为 "Claude SDK"（无 Provider 分布图，因为只有一个 provider）
- 与 Vercel AI Dashboard 的差异仅在于：无多 Provider 切换，其他统计维度一致

**ui/src/features/claude-sdk/pages/ClaudeSettingsPage.tsx**：
- Tab 列表：
  1. **General** — 复用（name, description, icon）
  2. **Agent** — 复用（Main Agent 选择）
  3. ~~Permissions~~ — 删除

**验证**：Memory 页面能读写 CLAUDE.md，Dashboard 显示 Token 统计（by model / by agent）

### Phase 7：Slash Commands + 高级功能

**ui/src/features/claude-sdk/components/SlashCommandPalette.tsx**：
- 在 ChatInput 中输入 `/` 时弹出命令面板
- 命令列表可配置（agent 级或 project 级）
- 发送命令时通过 API 传给 SDK handler

**ui/src/features/claude-sdk/hooks/useSlashCommands.ts**：
- 注册可用的 slash commands
- 提供补全建议

**验证**：Chat 中输入 `/` 弹出命令面板，选择后正确发送

---

## Sub-Agent 映射详细设计

> **2026-02-26 更新**：原「2 层深度映射」方案已废弃。MCP Bridge 模式实现无限层级 + 有状态会话，config-mapper 改为双轨映射策略。

### 双轨映射策略（config-mapper.ts）

Sub-Agent 的映射分为两种路径：

**路径 A：SDK 原生 AgentDefinition（Level 0 → Level 1）**

Level 1 sub-agent 通过 SDK 原生的 `agents` 配置传入，走 Task 工具调用。这些 agent 拥有完整的 per-agent 配置能力。

```
输入：Main Agent + 所有 Agent 列表
输出：Record<string, AgentDefinition>

映射逻辑：
1. 遍历 mainAgent.subAgents → Level 1 agents
2. 每个 Level 1 agent 映射为完整 AgentDefinition：
   - prompt, model, skills, mcpServers, tools, disallowedTools, maxTurns
   - 可引用父级注册的 MCP servers（运行时验证 Test 2）
```

**路径 B：MCP Bridge Tool（Level 1+ → 更深层级）**

Level 2+ 的 sub-agent 通过 MCP Bridge 实现。为每个需要嵌套的 sub-agent 生成一个 MCP tool，在 tool handler 内调用独立的 `query()`，绕过 `iP6` Task 工具过滤。

```
映射逻辑：
1. 对于 Level 1 agent，检查它是否有 subAgents
2. 如有，为每个 Level 2 agent 生成 MCP Bridge tool（见「MCP Bridge Sub-Agent 有状态会话」章节）
3. MCP Bridge tool 接受可选 sessionId 参数，支持有状态多轮对话
4. Level 2 agent 的 sub-agents 同理递归生成（无限层级）
```

**两条路径的对比**：

| 维度 | 路径 A: SDK AgentDefinition | 路径 B: MCP Bridge |
|---|---|---|
| 适用层级 | Level 0 → Level 1 | Level 1+ → 更深 |
| 调用方式 | SDK Task 工具 | MCP tool handler 内 `query()` |
| Per-agent 配置 | ✅ 完整（model/skills/MCP/tools） | ✅ 完整（通过 query options 传入） |
| 有状态会话 | ❌（SDK Task 工具不支持传入 sessionId） | ✅（tool input 含可选 sessionId） |
| 资源开销 | SDK 内部管理（较轻） | 每次调用 spawn 独立 CLI 会话（较重，~1GiB） |
| 嵌套能力 | ❌（iP6 过滤 Task 工具） | ✅（独立 CLI 会话不继承过滤） |

### 映射流程示例

假设 Agent 拓扑：`Main → [researcher, coder]`，`coder → [tester]`

```typescript
// config-mapper.ts 输出

// 路径 A：Level 1 agents 作为 SDK AgentDefinition
const agents: Record<string, AgentDefinition> = {
  researcher: {
    description: "Research agent",
    prompt: researcher.systemPrompt,
    model: 'haiku',
    skills: ['web-research'],
    mcpServers: ['search-engine'],
    tools: researcher.allowedTools,
    disallowedTools: researcher.disallowedTools,
    maxTurns: 20,
  },
  coder: {
    description: "Coding agent",
    prompt: coder.systemPrompt,
    model: 'sonnet',
    skills: ['code-review'],
    // coder 的 MCP servers 中包含 tester 的 MCP Bridge tool
    mcpServers: ['code-tools', 'bridge-tester'],
    tools: coder.allowedTools,
    disallowedTools: coder.disallowedTools,
  },
}

// 路径 B：Level 2 agent (tester) 作为 MCP Bridge tool
const bridgeMcpServers = {
  'bridge-tester': createSdkMcpServer({
    tools: {
      delegate_to_tester: {
        inputSchema: {
          task: { type: 'string' },
          sessionId: { type: 'string', description: '可选，传入则继续之前的对话' }
        },
        handler: async (input) => {
          const opts = { model: 'haiku', systemPrompt: tester.systemPrompt, ... }
          if (input.sessionId) opts.resume = input.sessionId
          const result = query({ prompt: input.task, options: opts })
          // 收集结果 + 返回 sessionId
          return JSON.stringify({ result, sessionId })
        }
      }
    }
  })
}
```

### UI 端深度计算（useAgentDepth.ts）

```
输入：agentId, mainAgentId, agents[]
输出：depth (-1 | 0 | 1 | 2 | 3+)

算法：
1. if agentId === mainAgentId → return 0
2. BFS from mainAgent through subAgents:
   - depth 1: mainAgent.subAgents 中的 agent
   - depth 2+: 继续 BFS
3. if not found → return -1（未被引用的 agent）

用途：仅用于 UI 展示（拓扑图节点标注、agent 列表层级标识），不用于限制功能。
所有层级均可正常工作。
```

### Custom Tools 传递

所有层级的 agent 均可使用 custom tools：

- **Level 0（Main Agent）**：通过 `createSdkMcpServer` 注入 custom tools ✅
- **Level 1（SDK AgentDefinition）**：通过 `mcpServers` 字段引用父级 MCP servers ✅（运行时验证 Test 2）
- **Level 2+（MCP Bridge）**：在 bridge tool handler 的 `query()` 中通过 `mcpServers` option 传入 ✅（运行时验证 Test 8+9）

---

## Session 管理架构

> **2026-02-26 新增**：经详细调研确认，SDK `query()` 不接受 `messages[]` 参数，多轮对话必须通过 `resume: sessionId` 实现。

### 核心约束

SDK `query()` 的签名决定了 session 管理是强制性的：

```typescript
// Claude Agent SDK — 只接受当前消息 + 可选的 session 恢复
query({
  prompt: string | AsyncIterable<SDKUserMessage>,  // 当前这条消息
  options: {
    resume?: string,          // session ID — 多轮对话必须传
    continue?: boolean,       // 继续最近的 session（不适合多对话场景）
    forkSession?: boolean,    // 从某个 session 分叉
    resumeSessionAt?: string, // 恢复到特定消息 UUID
    // ❌ 没有 messages[] 参数
  }
})

// 对比 Vercel AI SDK — 完全掌控消息历史
streamText({ model, messages: [...allHistory, newMessage] })
```

**关键限制**：
- `query()` 不接受对话历史，只能 `resume: sessionId`
- Session 内部存储在 `~/.claude/` 目录，由 CLI 自动管理，不可替代
- 无法从 Golemancy 的 SQLite 消息记录重建 SDK session

### 双层存储架构

```
┌─────────────────────────────────────────┐
│  Layer 1: SDK Internal (~/.claude/)     │
│  管理者：Claude Code CLI（黑箱）          │
│  用途：resume 恢复对话上下文               │
│  我们的职责：仅存储 session_id 引用        │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  Layer 2: Golemancy SQLite              │
│  管理者：stream-adapter（我们完全掌控）    │
│  用途：UI 显示、FTS5 搜索、Dashboard 统计  │
│  数据源：从 SDK stream + hooks 中提取      │
└─────────────────────────────────────────┘
```

两层各司其职，互不干扰。

### Main Conversation Session 流程

**新建对话（第一条消息）**：

```typescript
// 1. 不传 resume，SDK 自动创建新 session
const result = query({ prompt: userMessage })

// 2. 从 stream 中捕获 session_id
for await (const message of result) {
  if (message.type === 'system' && message.subtype === 'init') {
    const sessionId = message.session_id
    // 3. 存到 Conversation metadata
    await conversationStorage.updateMetadata(conversationId, { sdkSessionId: sessionId })
  }
  // 4. 同时通过 stream-adapter 写入 SQLite（用于 UI 显示）
}
```

**继续对话（第二条消息起）**：

```typescript
// 1. 从 Conversation metadata 读取 session_id
const { sdkSessionId } = await conversationStorage.getMetadata(conversationId)

// 2. 传入 resume — SDK 自动加载完整上下文
const result = query({
  prompt: userMessage,
  options: { resume: sdkSessionId }
})
```

### Session 丢失处理

`~/.claude/` 目录可能被删除或损坏，导致 session 无法 resume。处理策略：

- **历史消息不受影响**：已经存在 Golemancy SQLite 中，UI 仍可查看
- **对话无法继续**：`resume` 失败时，handler 捕获错误
- **用户引导**：提示 "Session 已过期，请新建对话继续"
- **不尝试重建**：无法从我们的消息记录重建 SDK session，这是 SDK 的硬限制

### Stream 数据提取

SDK stream 返回的完整消息类型，stream-adapter 逐一提取写入 SQLite：

| Stream 消息类型 | 提取内容 | 写入目标 |
|---|---|---|
| `SDKSystemMessage` (init) | session_id, tools, model | Conversation.metadata |
| `SDKAssistantMessage` | text + tool_use blocks | conversationStorage (助手消息) |
| `SDKUserMessage` | tool_result | conversationStorage (工具结果) |
| `SDKPartialAssistantMessage` | token 级流式 delta | UIMessageStream (实时 SSE) |
| `SDKResultMessage` | usage, cost_usd, duration | tokenRecordStorage |
| `SDKCompactBoundaryMessage` | compact metadata | compactRecordStorage |
| Hooks (PostToolUse) | tool_name + tool_input + tool_response | WebSocket 转发 + 审计 |

---

## MCP Bridge Sub-Agent 有状态会话

> **2026-02-26 新增**：MCP Bridge 模式不仅突破了嵌套深度限制，还可以实现 sub-agent 的有状态多轮对话。

### 设计动机

在 Vercel AI 的 sub-agent 实现中，每次调用 sub-agent 都是无状态的（全新 streamText）。Sub-agent 不记得之前做过什么。

Claude SDK 的 MCP Bridge 可以做得更好：通过在 tool 的 input/output 中传递 `sessionId`，让 main agent 自主管理 sub-agent 的会话状态。

### 实现方式

MCP Bridge tool 定义中增加可选的 `sessionId` 参数：

```typescript
// config-mapper.ts — 为每个 sub-agent 生成 MCP Bridge tool
function createSubAgentBridgeTool(childAgent: Agent) {
  return {
    name: `delegate_to_${childAgent.name}`,
    description: childAgent.description,
    inputSchema: {
      type: "object",
      properties: {
        task: { type: "string", description: "要执行的任务" },
        sessionId: {
          type: "string",
          description: "可选。传入之前返回的 sessionId 可继续上次对话，不传则启动新对话"
        }
      },
      required: ["task"]
    },
    handler: async (input) => {
      const options: QueryOptions = {
        model: childAgent.modelConfig.model,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        // 子 agent 的完整配置
        mcpServers: childAgent.mcpServers,
        allowedTools: childAgent.allowedTools,
        disallowedTools: childAgent.disallowedTools,
        systemPrompt: childAgent.systemPrompt,
      }

      // 有 sessionId → resume 继续对话；没有 → 新对话
      if (input.sessionId) {
        options.resume = input.sessionId
      }

      const result = query({ prompt: input.task, options })

      let sessionId: string
      let resultText = ''

      for await (const message of result) {
        if (message.type === 'system' && message.subtype === 'init') {
          sessionId = message.session_id
        }
        if (message.type === 'assistant') {
          resultText += extractText(message)
        }
      }

      // 返回结果 + sessionId
      return JSON.stringify({ result: resultText, sessionId })
    }
  }
}
```

### Main Agent 使用流程

AI agent 自主决定何时复用 session，何时新建：

```
Main Agent 收到用户消息: "让 researcher 去调查 X 公司"

  → tool call: delegate_to_researcher({ task: "调查 X 公司的背景信息" })
  ← result: { result: "X 公司成立于...", sessionId: "sess_abc" }

Main Agent 继续: "让它再深入看看财务数据"

  → tool call: delegate_to_researcher({
      task: "深入分析 X 公司的财务数据",
      sessionId: "sess_abc"               ← 继续上次对话，researcher 记得之前的上下文
    })
  ← result: { result: "根据之前的调查，X 公司的财务...", sessionId: "sess_abc" }

Main Agent: "另外让 researcher 去查一下 Y 公司"

  → tool call: delegate_to_researcher({ task: "调查 Y 公司" })  ← 不传 sessionId，全新对话
  ← result: { result: "Y 公司是...", sessionId: "sess_def" }    ← 新的 session
```

### Session 生命周期

```
Main Agent Conversation (Session A — 长期管理，存在 Conversation.metadata)
  │
  ├─ calls researcher (Session B — AI 自主管理，存在 main agent 上下文中)
  │   ├─ 第一次调用：无 sessionId → 新建 Session B
  │   ├─ 第二次调用：传入 Session B → resume 继续
  │   └─ Session B 的 ID 存在 main agent 的对话上下文中
  │
  ├─ calls coder (Session C — 同上)
  │   └─ coder 也可以通过 MCP Bridge 调用更深层的 agent (Session D)
  │
  └─ Main agent compact 后：
      └─ 旧的 Session B/C ID 可能被压缩丢失
      └─ 丢失后自动降级为新建对话（无功能损失，仅丢失 sub-agent 上下文）
```

**关键特性**：
- **可选的记忆**：由 AI agent 自主判断何时延续、何时重新开始
- **优雅降级**：session ID 丢失不影响功能正确性，只是 sub-agent 失去上下文
- **无需 Golemancy 管理**：sub-agent 的 session ID 完全由 main agent 在自己的对话上下文中保持
- **优于 Vercel AI**：当前 Vercel AI 实现的 sub-agent 每次调用都是无状态的，此设计让 sub-agent 拥有可选的多轮记忆

---

## 存储设计

### 不变的存储
- `storage/conversations.ts` — 消息格式统一，SDK 消息经 adapter 转换后写入
- `storage/token-records.ts` — 记录 `provider: 'anthropic'` + `model: 'opus'` 等
- `storage/tasks.ts` — Task 结构一致，通过 Hook 镜像写入
- `storage/projects.ts` — 新增读取 `config.runtime` 字段
- `storage/agents.ts` — Agent 结构不变
- `storage/compact-records.ts` — compact 记录格式一致
- `storage/skills.ts` — Claude 项目的 skill 存储在 workspace/.claude/skills/，但 CRUD 接口可复用
- `storage/mcp.ts` — MCP 配置结构不变

### 需要扩展的存储
- **Conversation**：metadata 中存储 `sdkSessionId`（用于 SDK resume）
  - 不需要 schema migration，利用现有 `metadata` JSON 字段

### Memory 的特殊处理
- Claude 项目不使用 `storage/memories.ts`
- 改用 workspace 文件系统读写 `CLAUDE.md`
- 通过现有的 `IWorkspaceService` 接口操作

---

## 测试验证

### 单元测试
- `server/src/claude-sdk/stream-adapter.test.ts` — SDKMessage 到 UIMessageStream 的转换
- `server/src/claude-sdk/config-mapper.test.ts` — Agent → SDK Options 映射，重点测试 2 层深度
- `server/src/claude-sdk/hooks.test.ts` — Hook 事件处理
- `ui/src/features/claude-sdk/hooks/useAgentDepth.test.ts` — 深度计算
- `ui/src/features/claude-sdk/hooks/useProjectRuntime.test.ts` — runtime 判断

### 集成测试
- 创建 Claude 项目 → 确认 `config.runtime === 'claude'`
- Claude 项目中创建 Agent → 确认 model 为 Claude tier
- Claude 项目中发送消息 → 确认 SSE 响应 + 消息持久化
- Claude 项目中触发 Cron → 确认使用 SDK 执行

### Smoke Test（需要 Claude CLI + 订阅）
- `pnpm dev` 启动 → 创建 Claude 项目 → 发消息 → 收到响应
- 配置 Sub-Agent → 验证 2 层深度约束
- 切换 Main Agent → 验证深度重新计算

---

## 实施顺序和依赖

```
Phase 1（类型 + 项目创建）
  ↓
Phase 2（Server Claude 引擎）← 核心工作量
  ↓
Phase 3（UI 路由 + 侧栏）
  ↓
Phase 4（Chat 页面）← 可与 Phase 5 并行
Phase 5（Agent 页面 + 深度系统）← 可与 Phase 4 并行
  ↓
Phase 6（Memory/Dashboard/Settings 页面）
  ↓
Phase 7（Slash Commands + 高级功能）
```

Phase 4 和 Phase 5 可以并行实施，因为它们互不依赖。
Phase 7 是增强功能，可以后续单独实施。
