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

### 新增文件

```
packages/shared/src/types/
└── claude.ts                        Claude 专属类型定义

packages/server/src/claude-sdk/      Claude 执行引擎（与 agent/ 平行）
├── index.ts                         统一导出
├── handler.ts                       SDK query() → UIMessageStream
├── stream-adapter.ts                SDKMessage → UIMessageStream 转换
├── config-mapper.ts                 Agent/SubAgent → SDK Options 映射（含 2 层深度逻辑）
├── hooks.ts                         Hook 事件处理 → WebSocket 转发
├── session.ts                       Session 管理（resume 支持）
└── cron-executor.ts                 Cron 专用执行器（非流式）

packages/ui/src/features/claude-sdk/ Claude 专属 UI 模块
├── index.ts                         模块导出
├── routes.ts                        Claude 项目路由映射表
├── sidebar.ts                       Claude 项目侧栏导航项
├── pages/
│   ├── ClaudeChatPage.tsx           Chat 页面（无 permission 显示，保留 token 显示）
│   ├── ClaudeAgentDetailPage.tsx    不同 Tab 集（无 Model Provider、无 Permissions、新增 Built-in Tools 管理）
│   ├── ClaudeAgentListPage.tsx      Agent 列表（含深度约束标注）
│   ├── ClaudeMemoryPage.tsx         CLAUDE.md 编辑器（workspace 文件操作）
│   ├── ClaudeDashboardPage.tsx      Dashboard（保留 Token 统计，provider 显示 "Claude SDK"）
│   ├── ClaudeSettingsPage.tsx       简化版项目设置（无 Permissions tab）
│   └── ClaudeTopologyView.tsx       2 层深度约束可视化
├── components/
│   ├── ClaudeStatusBar.tsx          显示 Token 使用 + Tasks + Hook 事件
│   ├── ClaudeModelSelect.tsx        sonnet / opus / haiku 三选一
│   ├── BuiltinToolsPanel.tsx        SDK 内置工具管理面板（全部/部分/无启用）
│   ├── HookEventFeed.tsx            Hook 事件实时流
│   ├── SlashCommandPalette.tsx      斜杠命令面板
│   ├── DepthWarning.tsx             Sub-Agent 深度警告组件
│   └── CompactIndicator.tsx         SDK Compact 状态显示
└── hooks/
    ├── useProjectRuntime.ts         判断当前项目 runtime
    ├── useClaudeHookEvents.ts       Hook 事件流监听（WebSocket）
    ├── useAgentDepth.ts             计算 Agent 在当前 Main Agent 下的有效深度
    └── useSlashCommands.ts          斜杠命令注册
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
├── components/layout/ProjectSidebar.tsx  根据 runtime 切换导航项
└── stores/useAppStore.ts            createProject 接受 runtime 参数
```

### 不动的文件（关键确认）
- `server/src/agent/` 全部 22 个文件 — 完全不动
- `server/src/storage/` 全部 15 个文件 — 完全不动
- `server/src/db/` 全部文件 — 完全不动
- `server/src/routes/` 除 chat.ts 外 — 完全不动
- `ui/src/pages/` 全部现有页面 — 完全不动
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
- `mapSubAgentsToDefinitions(mainAgent, allAgents)` → `Record<string, AgentDefinition>`
- **Built-in Tools 映射**：将 Agent 配置的 `allowedTools` / `disallowedTools` 传入 SDK options
- **2 层深度映射**：
  - Level 1 agents: 传入 skills, mcpServers, tools, disallowedTools, model
  - Level 2 agents: 传入 prompt, model（仅基础配置）
  - Level 3+: 不映射

**server/src/claude-sdk/hooks.ts**：
- 监听 `PostToolUse` → 转发 tool-call 事件到 WebSocket
- 监听 `SubagentStart/Stop` → 转发 sub-agent 状态
- 监听 `PreCompact` → 转发 compact 事件
- 监听 `Notification` → 转发状态通知
- Task 相关 hook → 镜像到 Golemancy taskStorage

**server/src/claude-sdk/session.ts**：
- `getOrCreateSession(conversationId)` → sdkSessionId
- `saveSession(conversationId, sessionId)`
- Conversation 表新增可选字段 `sdkSessionId`（或存在 metadata 中）

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

## Sub-Agent 深度映射详细设计

### Server 端映射规则（config-mapper.ts）

```
输入：Main Agent（Current Selected Agent）+ 所有 Agent 列表
输出：SDK AgentDefinition 字典（扁平，2 层）

映射逻辑：
1. 遍历 mainAgent.subAgents → Level 1 agents
2. 每个 Level 1 agent 映射为完整 AgentDefinition：
   - prompt, model, skills, mcpServers, tools, disallowedTools, maxTurns
   - 注意：custom tools（via MCP）只在 Level 0 有效，Level 1 只有内置工具 + 引用的 MCP
3. 遍历每个 Level 1 agent 的 subAgents → Level 2 agents
4. 每个 Level 2 agent 映射为简化 AgentDefinition：
   - prompt, model（仅基础配置）
   - 不传 skills, mcpServers（叶子节点，SDK 会过滤 Task 工具阻止再嵌套）
5. Level 3+ agents：不映射，忽略
```

### UI 端深度计算（useAgentDepth.ts）

```
输入：agentId, mainAgentId, agents[]
输出：depth (-1 | 0 | 1 | 2 | 3+)

算法：
1. if agentId === mainAgentId → return 0
2. BFS from mainAgent through subAgents:
   - depth 1: mainAgent.subAgents 中的 agent
   - depth 2: depth-1 agents 的 subAgents
   - depth 3+: 继续 BFS（但标记为不可用）
3. if not found → return -1
```

### Custom Tools 限制说明（~~限制~~ → 已修正）

> **2026-02-26 更新**：以下 "限制" 已被运行时验证推翻。

~~根据用户纠正：~~
- **Level 0（Main Agent）**：可以使用 custom tools（通过 `createSdkMcpServer` 注入的 in-process MCP 工具）✅
- ~~**Level 1（Sub-Agent）**：只能使用 SDK 内置工具，custom tools 不可用~~ → **已修正**：Sub-agent 的 `AgentDefinition` 支持 `mcpServers` 字段（如 `mcpServers: ['calculator']`），可引用父级注册的 custom MCP tools（运行时验证 Test 2：sub-agent 成功调用 `mcp__calculator__add_numbers(17, 25) = 42`）
- ~~**Level 2（Sub-Sub-Agent）**：同 Level 1，且无法再嵌套~~ → **已修正**：MCP Bridge 模式实现无限嵌套（运行时验证 Test 8+9），且 bridged agent 也可携带 custom MCP tools

Golemancy 的 Agent 上配置的 custom tools 可通过 `createSdkMcpServer()` 注入，并通过 `mcpServers` 字段传递给任意层级的 sub-agent。

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
