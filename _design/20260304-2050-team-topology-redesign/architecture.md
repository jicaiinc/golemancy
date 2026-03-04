# Team Topology 重设计 — 架构设计文档

> Architect 输出 | 2026-03-04
> 基于需求文档、调研报告、Server 端源码分析

---

## 一、Server 端兼容性分析

### 1.1 `sub-agent.ts` 对 leader / parentAgentId 的依赖

**核心发现：Server 端不存在 "leader" 概念。**

源码分析：

- **`tools.ts:145-146`**: `directChildren = params.teamMembers?.filter(m => m.parentAgentId === agent.id)`
  - Server 仅使用 `parentAgentId` 来确定"谁是当前 agent 的直接子节点"
  - 它不关心谁是 leader，不寻找 `parentAgentId === undefined` 的节点

- **`chat.ts:118-124`**: 对话路由获取 `team.members` 和 `team.instruction`，原样传给 `loadAgentTools`
  - `teamInstruction` 注入给**当前对话的 agent**，而非显式的 "leader"
  - 哪个 agent 处理对话由 `conversation.agentId` 决定，与 Team 的 leader 无关

- **`sub-agent.ts:139-153`**: 子 agent 递归调用 `loadTools` 时，传递 `teamMembers` 但**不传 `teamInstruction`**
  - 即 team instruction 只注入顶层 agent，不会传递给子 agent

- **`createSubAgentToolSet`**: 接收 `directChildren` 数组，为每个子节点创建 `delegate_to_{agentId}` 工具
  - 完全基于 `parentAgentId === agent.id` 的过滤结果，不依赖任何 leader 标记

### 1.2 兼容性结论

| 变更 | Server 影响 | 结论 |
|------|------------|------|
| 允许删除任何节点（含当前 root） | 无影响。Server 只读 members 数组，不验证拓扑结构 | ✅ 安全 |
| 允许多个无 parentAgentId 的节点 | 无影响。Server 用 `parentAgentId === agent.id` 过滤，不假设单根 | ✅ 安全 |
| 删除节点时子节点变为根节点 | 无影响。子节点 `parentAgentId` 变 undefined 后，它们不再是任何人的 child | ✅ 安全 |
| Team 可以有 0 个成员 | 无影响。`teamMembers` 为空数组时，不创建任何 delegate 工具 | ✅ 安全 |
| 保持 `TeamMember` 数据模型不变 | 无影响。模型本身已支持这些场景 | ✅ 安全 |

**结论：所有 UI 层面的 leader 机制变更均不影响 server 端运行时行为。改动完全限定在 UI 层。**

---

## 二、数据模型设计

### 2.1 不变更 `TeamMember` 数据模型

```typescript
// packages/shared/src/types/team.ts — 保持不变
interface TeamMember {
  agentId: AgentId
  role: string
  parentAgentId?: AgentId  // undefined = 根节点（root），不再等价于 "leader"
}

interface Team extends Timestamped {
  id: TeamId
  projectId: ProjectId
  name: string
  description: string
  instruction?: string
  members: TeamMember[]
}
```

**理由**：
1. 当前模型已天然支持多根节点（多个 `parentAgentId === undefined` 的成员）
2. Server 端不依赖单根约束
3. `ITeamService` 接口无需变更
4. 已有数据无需迁移

### 2.2 语义变更（仅 UI 层）

| 之前 | 之后 |
|------|------|
| `parentAgentId === undefined` = leader（唯一、不可删除） | `parentAgentId === undefined` = 根节点（可以有多个、可删除） |
| Leader 是特殊角色，有结构约束 | 根节点仅是视觉区分，无结构约束 |
| 第一个添加的成员自动成为 leader | 第一个添加的成员是根节点，后续添加的也可以是根节点 |

### 2.3 Layout 存储

保持现有方案不变：

```typescript
// ITeamService — 已有
getLayout(projectId, teamId): Promise<Record<string, { x: number; y: number }>>
saveLayout(projectId, teamId, layout: Record<string, { x: number; y: number }>): Promise<void>
```

---

## 三、页面架构设计

### 3.1 整体布局

```
┌──────────────────────────────────────────────────────────────┐
│  Header                                                       │
│  Team Name (inline-edit)    [Reset Layout] [Delete Team]      │
├────────────────────────────────────┬─────────────────────────┤
│                                    │                          │
│           Canvas Area              │     Sidebar Panel        │
│        (ReactFlow viewport)        │      w-[320px]           │
│                                    │                          │
│                                    │  ┌──────────────────┐   │
│    ┌─────┐  ┌─────┐  ┌─────┐     │  │ Team Settings    │   │
│    │Node │  │Node │  │Node │     │  │ OR               │   │
│    └──┬──┘  └──┬──┘  └─────┘     │  │ Node Detail      │   │
│       │        │                   │  └──────────────────┘   │
│    ┌──┴──┐  ┌──┴──┐              │                          │
│    │Node │  │Node │              │                          │
│    └─────┘  └─────┘              │                          │
│                                    │                          │
│  ┌─────────────────────────┐      │                          │
│  │ + Add Agent  ⟲ Reset    │      │                          │
│  │ 🔍 Fit View             │      │                          │
│  └─────────────────────────┘      │                          │
│                                    │                          │
├────────────────────────────────────┴─────────────────────────┤
│                    Empty State (when 0 members)               │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 关键布局决策

| 决策 | 方案 | 理由 |
|------|------|------|
| Canvas vs Sidebar | flex 布局，Sidebar 不遮挡 Canvas | 解决当前 absolute 覆盖问题（AC-6.1） |
| Sidebar 打开/关闭 | 选中节点时打开 NodeDetail，点击空白区域切换回 TeamSettings | 参考 n8n 设计 |
| Canvas Controls 位置 | ReactFlow `<Panel position="bottom-left">` | 不遮挡拓扑图主要区域 |
| Team Settings 位置 | 移入 Sidebar（取代当前 toolbar 的 toggle 面板） | 解决 AC-3.1/3.2/3.3 |
| Header 简化 | 仅保留 Team Name + 全局操作按钮 | 解决 AC-10.1/10.2 |

### 3.3 组件树

```
TeamTopologyPage
├── TeamTopologyHeader
│   ├── InlineEditableText (team name)
│   └── ActionButtons (reset layout, delete team)
│
├── TeamTopologyContent (flex row, flex-1)
│   ├── TeamTopologyCanvas (flex-1, min-w-0)
│   │   ├── ReactFlowProvider
│   │   │   ├── ReactFlow
│   │   │   │   ├── TeamNode (custom node)
│   │   │   │   └── TeamEdge (custom edge)
│   │   │   ├── Panel position="bottom-left"
│   │   │   │   └── CanvasToolbar
│   │   │   │       ├── AddAgentButton (opens agent picker popover)
│   │   │   │       ├── ResetLayoutButton
│   │   │   │       └── FitViewButton
│   │   │   └── Background
│   │   └── EmptyState (conditional, when members.length === 0)
│   │
│   └── TeamTopologySidebar (w-[320px], border-l, overflow-y-auto)
│       ├── SidebarHeader (tab/mode indicator)
│       ├── TeamSettingsPanel (when no node selected)
│       │   ├── TeamDescription (textarea, auto-save on blur)
│       │   └── TeamInstruction (textarea, auto-save on blur, resizable)
│       └── NodeDetailPanel (when node selected)
│           ├── AgentHeader (name, status dot, model)
│           ├── RoleEditor (input field)
│           ├── CapabilitiesOverview (read-only list: skills, tools, MCP, memory)
│           ├── ParentSelector (dropdown to change parent / set as root)
│           └── RemoveButton (removes from team, always enabled)
```

### 3.4 Sidebar 状态机

```
Sidebar Mode:
  - "team-settings" (默认) — 显示 Team 级配置
  - "node-detail"         — 显示选中节点详情

状态切换规则：
  - 选中节点 → mode = "node-detail"
  - 取消选中（点击空白/按 Escape） → mode = "team-settings"
  - 删除选中节点 → mode = "team-settings"
  - Sidebar 始终可见，不折叠
```

---

## 四、自动布局策略

### 4.1 核心原则

1. **结构变更 → 自动布局**：添加/删除节点、连接/断开边时自动运行 dagre
2. **手动拖拽 → 不触发布局**：用户拖拽后仅保存位置
3. **Reset Layout → 全量重算**：忽略所有已保存位置

### 4.2 触发矩阵

| 操作 | 清除 savedLayout | 运行 dagre | fitView |
|------|-----------------|-----------|---------|
| addMember | 新节点 only | ✅ 全量 | ✅ `{ duration: 300, padding: 0.2 }` |
| removeMember | 移除节点 | ✅ 全量 | ✅ |
| onConnect | 不清除 | ✅ 全量 | ✅ |
| onEdgeDelete | 不清除 | ✅ 全量 | ✅ |
| resetLayout | 全部清除 | ✅ 全量 | ✅ |
| onNodeDragStop | 不清除（保存新位置） | ❌ | ❌ |
| 初始加载 | N/A | 仅对无 savedPosition 的节点 | 仅首次 |

### 4.3 dagre 配置

保持当前配置，微调间距：

```typescript
g.setGraph({
  rankdir: 'TB',      // 上到下
  nodesep: 80,         // 同层节点间距（从 60 → 80，留更多空间）
  ranksep: 120,        // 层级间距（从 100 → 120）
})
```

### 4.4 布局算法改进

**当前问题**：`savedLayoutRef` 导致 dagre 跳过已有 savedPosition 的节点，新节点和旧节点位置不协调。

**新策略**：

```
结构变更时（add/remove/connect/disconnect）：
  1. 忽略所有 savedLayout（不传给 dagre）
  2. dagre 对所有节点重新布局
  3. 更新 savedLayout 为 dagre 输出
  4. fitView({ duration: 300, padding: 0.2 })

手动拖拽时：
  1. 仅更新拖拽节点的 savedLayout
  2. 不触发 dagre
```

这意味着：**每次结构变更后，所有节点位置由 dagre 重新计算**。用户的手动拖拽位置会在下次结构变更时被 dagre 覆盖。这是合理的 trade-off：

- 优点：消除重叠问题；布局始终整洁
- 缺点：用户手动拖拽后的位置可能在下次添加节点时被重置
- 缓解：节点数通常 < 10，手动调整成本低；且 dagre 的 tree 布局本身就很合理

### 4.5 fitView 使用

ReactFlow 12.5.0+ 支持 `fitView()` 在 `setNodes()` 后直接调用（无需 setTimeout）：

```typescript
const { fitView } = useReactFlow()

// 布局后
setNodes(layoutedNodes)
fitView({ duration: 300, padding: 0.2 })
```

### 4.6 孤立节点处理

当前实现将孤立节点（无边连接）堆叠在 x=600。

**新策略**：dagre 在全量重算时，将连接的节点和孤立节点统一处理：
- 连接节点：dagre tree 布局
- 孤立节点：排列在树的右侧，垂直间隔均匀

---

## 五、Leader 机制设计

### 5.1 设计原则

**Leader 从"结构约束"变为"视觉标签"。**

- 根节点（`parentAgentId === undefined`）获得特殊视觉样式（金色边框/★ 图标）
- 任何节点都可以删除，包括根节点
- 允许多个根节点（多棵子树 / 森林结构）
- 允许零个节点（空 team）

### 5.2 节点删除逻辑

```typescript
removeMember(agentId: AgentId): void {
  // 1. 找到被删除节点
  const member = team.members.find(m => m.agentId === agentId)
  if (!member) return

  // 2. 删除该节点
  let updatedMembers = team.members.filter(m => m.agentId !== agentId)

  // 3. 子节点处理：parentAgentId → undefined（变为根节点）
  updatedMembers = updatedMembers.map(m =>
    m.parentAgentId === agentId ? { ...m, parentAgentId: undefined } : m
  )

  // 4. 更新 team
  updateTeam(team.id, { members: updatedMembers })

  // 5. 自动重布局
  // → 由自动布局策略处理
}
```

### 5.3 UI 变更清单

| 当前行为 | 新行为 |
|---------|--------|
| `removeMember` 拒绝删除 `!parentAgentId` 的节点 | 允许删除任何节点 |
| `TeamNodeDetailPanel` 隐藏 leader 的删除按钮 | 所有节点都显示删除按钮 |
| TeamNode 对 leader 不显示 target Handle | 所有节点都显示 target Handle（根节点的 handle 可以作为连接目标） |
| 隐式单 leader 假设 | 允许多个根节点，所有根节点都有 ★ 标记和金色边框 |

---

## 六、数据流设计

### 6.1 整体数据流

```
Store (teams[]) ──────────────┐
Store (agents[]) ─────────────┤
Store (skills[]) ─────────────┼──→ useTeamTopologyData(team, agents, skills, projectId)
                               │           │
                               │           ├── nodes: Node<TeamNodeData>[]
                               │           ├── edges: Edge<TeamEdgeData>[]
                               │           ├── addMember() ──→ store.updateTeam() ──→ API ──→ store sync
                               │           ├── removeMember() ──→ store.updateTeam() ──→ API ──→ store sync
                               │           ├── onConnect() ──→ store.updateTeam()
                               │           ├── onEdgeDelete() ──→ store.updateTeam()
                               │           ├── resetLayout() ──→ dagre ──→ saveLayout API
                               │           └── onNodeDragStop() ──→ saveLayout API
                               │
                               └──→ ReactFlow <nodes, edges, handlers>
                                          │
                                   ┌──────┴──────┐
                                   │  TeamNode   │ ←── click ──→ Sidebar: NodeDetailPanel
                                   │  TeamEdge   │
                                   └─────────────┘
```

### 6.2 Sidebar 与 Canvas 的交互

```
Canvas (ReactFlow)                    Sidebar
─────────────────                    ──────────
  click node ─────── selectedAgentId ───→ show NodeDetailPanel
  click blank ────── selectedAgentId=null → show TeamSettingsPanel
  Escape key ─────── selectedAgentId=null → show TeamSettingsPanel

  NodeDetailPanel:
    edit role ──────→ store.updateTeam(members with updated role)
    remove node ────→ removeMember(agentId) → selectedAgentId=null
    change parent ──→ store.updateTeam(members with updated parentAgentId)

  TeamSettingsPanel:
    edit description → store.updateTeam({ description })
    edit instruction → store.updateTeam({ instruction })
```

### 6.3 Agent 选择器（Add Agent）

```
CanvasToolbar: [+ Add Agent] button
  │ click
  ▼
AgentPickerPopover
  │ 展示项目内所有 agent（排除已在 team 中的）
  │ 支持搜索过滤
  │ 显示每个 agent 的 model 和描述
  │ select agent
  ▼
addMember(agentId, undefined, parentAgentId?)
  │ parentAgentId: 如果当前有选中节点，新节点作为选中节点的子节点
  │              如果没有选中节点，新节点作为根节点
  ▼
自动布局 → fitView
```

---

## 七、关键技术决策汇总

| # | 决策 | 方案 | 理由 |
|---|------|------|------|
| 1 | 布局算法 | 保持 dagre，不迁移 | 已集成；对 ≤20 节点的 tree 结构足够；elkjs 过于复杂 |
| 2 | 数据模型 | 不变更 `TeamMember` | 已支持多根节点；Server 无 leader 约束；无需迁移 |
| 3 | Leader 概念 | 纯 UI 视觉标签 | Server 不依赖 leader；允许删除/多根解决核心痛点 |
| 4 | 配置面板 | 右侧 Sidebar（flex 布局） | 不遮挡 canvas；参考 n8n/LangFlow 行业标准 |
| 5 | Team Instruction | 移入 Sidebar 的 TeamSettings | 解决 toggle 折叠的 UX 问题 |
| 6 | 自动布局触发 | 结构变更时全量 dagre | 消除重叠问题；简单可靠 |
| 7 | 拖拽后位置 | 保存但可能被下次结构变更覆盖 | 合理 trade-off，节点数少手动成本低 |
| 8 | Sidebar 永远可见 | 是 | 避免打开/关闭的复杂状态管理；320px 对大多数屏幕合理 |
| 9 | Node 添加方式 | Canvas 底部 toolbar 的 `+` 按钮 + popover | 简洁直观；节点上的 `+` 按钮可保留作为快速添加子节点 |
| 10 | 空状态 | Canvas 区域显示引导 + 添加按钮 | 解决当前简陋问题 |

---

## 八、实现注意事项

### 8.1 不涉及的变更

- `packages/shared/src/types/team.ts` — 不变
- `packages/shared/src/services/interfaces.ts` — 不变
- `packages/server/` — 不变
- `packages/ui/src/stores/` — team slice 不变（`updateTeam` 已支持 members 更新）

### 8.2 需要变更的文件

| 文件 | 变更 |
|------|------|
| `useTeamTopologyData.ts` | 移除 leader 删除限制；改进自动布局触发逻辑 |
| `useTeamTopologyLayout.ts` | 调整 dagre 配置；优化孤立节点布局 |
| `TeamNode.tsx` | 简化节点内容（P1-1）；所有节点显示 target Handle |
| `TeamTopologyView.tsx` | 重构为新的页面布局（header + canvas + sidebar） |
| `TeamTopologyToolbar.tsx` | 拆分为 Header + CanvasToolbar；移除 instruction toggle |
| `TeamNodeDetailPanel.tsx` | 重设计为 Sidebar 内的面板；移除 leader 删除限制 |
| 新增 `TeamSettingsPanel.tsx` | Sidebar 的 Team Settings 面板 |
| 新增 `TeamTopologySidebar.tsx` | Sidebar 容器，管理两种模式 |
| 新增 `AgentPickerPopover.tsx` | Agent 选择器 popover（搜索+过滤） |
| 新增 `TeamEmptyState.tsx` | 空状态引导组件 |

### 8.3 i18n

所有新增 UI 文本使用 `t()` 函数，namespace 为 `team`。仅实现英文翻译。

### 8.4 动画

- Sidebar 打开/关闭：`motion/react` 动画（参考 `packages/ui/src/lib/motion.ts` 中的 preset）
- fitView：`{ duration: 300 }` 平滑过渡
- 节点 hover/select：CSS transition（当前已有）
