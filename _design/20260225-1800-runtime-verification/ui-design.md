# UI 设计方案 — Runtime Verification & Fix

## 变更 1: Global Settings — 合并 Runtime + Providers

### 当前状态
```
┌─────────────────────────────────────────────────────┐
│ Global Settings                                      │
│                                                      │
│ [General] [Runtime] [Providers] [Speech]    ← 4 tabs │
└─────────────────────────────────────────────────────┘
```

- Runtime Tab: 双栏选择卡片（Standard / Claude Code）+ Connection Test
- Providers Tab: Default Model + Provider Cards + Add Provider
- 问题：Runtime=claude-code 时 Providers Tab 显示 "not used" 空状态，冗余

### 目标状态
```
┌─────────────────────────────────────────────────────┐
│ Global Settings                                      │
│                                                      │
│ [General] [Runtime] [Speech]                ← 3 tabs │
│                                                      │
│ ┌─────────────────────────────────────────────────┐  │
│ │ PixelCard: AGENT RUNTIME                         │  │
│ │ "Choose how agents execute..."                   │  │
│ │                                                  │  │
│ │  ┌──────────────┐  ┌──────────────┐              │  │
│ │  │  ⬜ Standard  │  │  ⬜ Claude   │              │  │
│ │  │  Use config'd │  │    Code     │              │  │
│ │  │  providers... │  │  Use Agent  │              │  │
│ │  │              │  │  SDK...     │              │  │
│ │  └──────────────┘  └──────────────┘              │  │
│ └─────────────────────────────────────────────────┘  │
│                                                      │
│ ═══════════════════════════════════════════════════   │
│ ↓ 条件渲染区域 (根据选择展示不同内容)                    │
│ ═══════════════════════════════════════════════════   │
│                                                      │
│ 【当 Standard 选中时】                                │
│ ┌─────────────────────────────────────────────────┐  │
│ │ PixelCard: DEFAULT MODEL                         │  │
│ │ Provider: [▼ Anthropic   ] Model: [▼ claude... ] │  │
│ │                                        [Save]    │  │
│ └─────────────────────────────────────────────────┘  │
│                                                      │
│ PROVIDERS                           [+ Add Provider] │
│                                                      │
│ ┌─────────────────────────────────────────────────┐  │
│ │ PixelCard: Anthropic (anthropic) ✅ OK  [Test]   │  │
│ │ API Key: sk-ant•••••••                           │  │
│ │ ▸ Models (3)                                     │  │
│ └─────────────────────────────────────────────────┘  │
│ ┌─────────────────────────────────────────────────┐  │
│ │ PixelCard: OpenAI (openai) ⚪ No Key [Edit][Del] │  │
│ │ ...                                              │  │
│ └─────────────────────────────────────────────────┘  │
│                                                      │
│ 【当 Claude Code 选中时】                             │
│ ┌─────────────────────────────────────────────────┐  │
│ │ PixelCard: CONNECTION TEST                       │  │
│ │ "Verify that the Claude Agent SDK is reachable." │  │
│ │ [Test Connection]  Connected (claude-sonnet) 42ms│  │
│ └─────────────────────────────────────────────────┘  │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### 组件层级结构

```
GlobalSettingsPage
├── PixelTabs (3 tabs: general, runtime, speech)
└── Tab Content
    └── activeTab === 'runtime'
        └── RuntimeTab (改造后)
            ├── PixelCard "AGENT RUNTIME"  (保持不变)
            │   └── grid grid-cols-2 选择卡片
            ├── {current === 'standard' && <ProvidersSection />}  ← 原 ProvidersTab 内容
            │   ├── DefaultModelSection
            │   ├── Provider Header + Add Button
            │   └── ProviderCard[]
            └── {current === 'claude-code' && <ConnectionTestCard />}  ← 保持不变
```

### 设计 Token 使用

| 元素 | Token / Class |
|------|---------------|
| Runtime 选中卡片 | `bg-elevated border-accent-green` |
| Runtime 未选卡片 | `bg-deep border-border-dim hover:border-border-bright` |
| Runtime 选中文字 | `text-accent-green font-pixel text-[10px]` |
| Section 标题 | `font-pixel text-[10px] text-text-secondary` |
| 说明文字 | `text-[11px] text-text-dim` |
| 卡片容器 | `PixelCard` (default variant, bg-surface border-border-dim) |

### 需要修改的文件

**`packages/ui/src/pages/settings/GlobalSettingsPage.tsx`**
1. 删除 `SETTINGS_TABS` 中的 `{ id: 'providers', label: 'Providers' }` 条目
2. 删除 `activeTab === 'providers'` 的条件渲染块（L79-91）
3. 改造 `RuntimeTab` 组件：
   - 接收 `settings` + `onUpdate` 参数（已有）
   - 在 Runtime 选择卡片下方，当 `current === 'standard'` 时渲染 `<ProvidersSection>` （复用原 `ProvidersTab` 全部内容）
   - 当 `current === 'claude-code'` 时渲染 Connection Test 卡片（已有）
4. 将 `ProvidersTab` 重命名为 `ProvidersSection`（仅改名，内容不变）
5. 删除冗余的 claude-code 模式下 Providers Tab 的空状态提示

**改动量估算**：~30 行改动（主要是移动代码块位置 + 删减 Tab/条件渲染）

---

## 变更 2: Project Settings — Runtime 移到 Agent Tab

### 当前状态
```
┌────────────────────────────────────────┐
│ Project Settings                        │
│                                         │
│ [General] [Agent] [Permissions]         │
│                                         │
│ 【General Tab】                         │
│ ┌──────────────────────────────────┐    │
│ │ BASIC INFO                        │    │
│ │ Name / Description / Icon         │    │
│ └──────────────────────────────────┘    │
│ ┌──────────────────────────────────┐    │
│ │ AGENT RUNTIME                     │    │
│ │ [Inherit(Standard)] [Standard]    │    │
│ │ [Claude Code]                     │    │
│ │ ← 三栏，含 Inherit 选项           │    │
│ └──────────────────────────────────┘    │
│ [Save Changes]                          │
│                                         │
│ 【Agent Tab】                           │
│ ┌──────────────────────────────────┐    │
│ │ MAIN AGENT                        │    │
│ │ [▼ Select Agent]                  │    │
│ │ [Configure Agent →]               │    │
│ └──────────────────────────────────┘    │
└────────────────────────────────────────┘
```

### 目标状态
```
┌────────────────────────────────────────┐
│ Project Settings                        │
│                                         │
│ [General] [Agent] [Permissions]         │
│                                         │
│ 【General Tab】                         │
│ ┌──────────────────────────────────┐    │
│ │ BASIC INFO                        │    │
│ │ Name / Description / Icon         │    │
│ └──────────────────────────────────┘    │
│ [Save Changes]                          │
│                                         │
│ 【Agent Tab】                           │
│ ┌──────────────────────────────────┐    │
│ │ AGENT RUNTIME                     │    │
│ │ "Override the global runtime for  │    │
│ │  this project."                   │    │
│ │                                   │    │
│ │  ┌──────────────┐ ┌────────────┐  │    │
│ │  │  Standard    │ │ Claude     │  │    │
│ │  │  Use config'd│ │ Code       │  │    │
│ │  │  providers   │ │ Use Agent  │  │    │
│ │  │              │ │ SDK        │  │    │
│ │  └──────────────┘ └────────────┘  │    │
│ │                                   │    │
│ │ [Test Connection] Connected ✅    │    │
│ └──────────────────────────────────┘    │
│                                         │
│ ┌──────────────────────────────────┐    │
│ │ MAIN AGENT                        │    │
│ │ [▼ Select Agent]                  │    │
│ │ [Configure Agent →]               │    │
│ └──────────────────────────────────┘    │
└────────────────────────────────────────┘
```

### 组件层级结构

```
ProjectSettingsPage
├── PixelTabs (3 tabs: general, agent, permissions) — 不变
└── Tab Content
    ├── activeTab === 'general'
    │   └── GeneralTab
    │       ├── PixelCard "BASIC INFO"  (不变)
    │       ├── ❌ ProjectRuntimeSection  ← 移除
    │       └── Save Button
    ├── activeTab === 'agent'
    │   └── AgentTab (改造后)
    │       ├── ✅ ProjectRuntimeSection (移入此处，改造)  ← 新增
    │       │   └── grid grid-cols-2 (去掉 Inherit，仅 Standard / Claude Code)
    │       └── PixelCard "MAIN AGENT"  (不变)
    └── activeTab === 'permissions'
        └── PermissionsSettings  (不变)
```

### 关键变更：去掉 Inherit 选项

**当前 `ProjectRuntimeSection`** 使用 `grid-cols-3` 展示三个选项：Inherit / Standard / Claude Code

**改造后** 使用 `grid-cols-2` 展示两个选项：Standard / Claude Code

- 去掉 `'inherit'` 类型的 option
- `handleSelect` 函数简化：直接存储 `AgentRuntime` 值，不再处理 `'inherit'` → `undefined` 转换
- 默认值逻辑：如果 `projectConfig.agentRuntime` 为 undefined，从 Global Settings 取值作为初始选中态
- 首次保存时将值写入 project config（替代隐式继承）

### 设计 Token 使用

与 Global Settings Runtime 选择卡片完全一致：

| 元素 | Token / Class |
|------|---------------|
| 选中卡片 | `bg-elevated border-accent-green` |
| 未选卡片 | `bg-deep border-border-dim hover:border-border-bright` |
| 选中文字 | `text-accent-green font-pixel text-[10px]` |
| 卡片布局 | `grid grid-cols-2 gap-3` |
| Connection Test 按钮 | `PixelButton size="sm" variant="primary"` |
| 成功文字 | `text-[11px] text-accent-green` |
| 失败文字 | `text-[11px] text-accent-red` |

### 需要修改的文件

**`packages/ui/src/pages/project/ProjectSettingsPage.tsx`**
1. `GeneralTab` 中移除 `<ProjectRuntimeSection>` 引用（L249）
2. `AgentTab` 中在 MAIN AGENT 卡片之前添加 `<ProjectRuntimeSection>`
3. 改造 `ProjectRuntimeSection`：
   - 移除 `'inherit'` option
   - 将 `grid-cols-3` 改为 `grid-cols-2`
   - 当 `projectConfig.agentRuntime` 为 `undefined` 时，使用 `globalRuntime` 作为初始选中态
   - `handleSelect` 直接存储 `AgentRuntime` 值（不再有 `undefined` 语义）
4. 描述文字从 "Override the global runtime for this project." 保持不变

**`packages/shared/src/types/settings.ts`** — 可能需要确认 `ProjectConfig.agentRuntime` 类型是否仍允许 `undefined`（保留 undefined 作为"尚未设置"的初始值，但 UI 不再展示 Inherit 选项）

**改动量估算**：~25 行改动

---

## 变更 3: Agent Detail Page 条件渲染审查

### 当前实现分析

已审查 `AgentDetailPage.tsx`，以下是各 Tab 的 Claude Code 条件渲染现状：

| Tab | 组件 | 条件渲染 | 状态 |
|-----|------|----------|------|
| **Model Config** | `ModelConfigTab` | ✅ 完整 | `isClaudeCode` 时显示 Claude Code Model 选择器，隐藏 Provider/Model 选择 |
| **Model Config** | Compact Threshold | ✅ 完整 | `!isClaudeCode && <CompactThresholdControl>` — 正确隐藏 |
| **Tools** | `ToolsTab` | ✅ 完整 | 显示蓝色提示 "Claude Code runtime manages its own tools..." |
| **Sub-Agents** | `SubAgentsTab` | ✅ 完整 | 显示蓝色提示 "Claude Code runtime handles sub-agent orchestration internally..." |
| **Skills** | `SkillsTab` | ⚠️ 缺失 | 未做条件渲染——Skills 在 Claude Code 中的行为需确认 |
| **MCP** | `MCPTab` | ⚠️ 需评估 | 有权限相关提示，但未针对 Claude Code 特殊说明 |
| **General** | `GeneralAgentTab` | ✅ 完整 | 通用信息，不需要条件渲染 |

### 建议补充

#### 3a. Skills Tab 提示信息（建议添加）

```
┌─────────────────────────────────────────────────────┐
│ PixelCard variant="outlined" border-accent-blue      │
│ bg-accent-blue/5                                     │
│                                                      │
│ "Claude Code runtime uses prompt injection for       │
│  skills. Skills assigned here will be injected into  │
│  the agent's system prompt."                         │
└─────────────────────────────────────────────────────┘
```

**样式**：与 Tools/Sub-Agents Tab 已有的蓝色提示卡片完全一致
- `PixelCard variant="outlined" className="mb-4 border-accent-blue bg-accent-blue/5"`
- `<p className="text-[11px] text-text-secondary">`

**判断**：Skills 在 Claude Code 模式下仍然有效（通过 prompt injection），所以不需要禁用，只需补充一条说明文字。**优先级低**——如果 Skills 在两种模式下行为一致，可以不加。

#### 3b. MCP Tab（无需改动）

MCP servers 在 Claude Code 模式下也被支持（Claude Agent SDK 支持 MCP）。现有的权限提示已足够。无需额外条件渲染。

### 需要修改的文件

**`packages/ui/src/pages/agent/AgentDetailPage.tsx`**
- 如果决定添加 Skills Tab 提示：在 `SkillsTab` 组件顶部增加 ~7 行代码（蓝色提示卡片）

**改动量估算**：0-7 行（可选）

---

## 总结

| 变更 | 文件 | 改动量 | 难度 |
|------|------|--------|------|
| 1. Global Settings 合并 | `GlobalSettingsPage.tsx` | ~30 行 | 低 |
| 2. Project Settings Runtime 移动 | `ProjectSettingsPage.tsx` | ~25 行 | 低 |
| 3. Agent Detail 条件渲染 | `AgentDetailPage.tsx` | 0-7 行 | 极低 |

### 设计一致性验证

- ✅ 双栏选择卡片样式：Global / Project 两处使用完全相同的 `grid-cols-2` + `bg-elevated/border-accent-green` 样式
- ✅ Connection Test 卡片：两处复用相同的 PixelButton + 状态文字样式
- ✅ PixelTabs：所有页面使用相同的 Tab 组件，只是 Tab 数组不同
- ✅ 蓝色提示卡片：`border-accent-blue bg-accent-blue/5` 在 Agent Detail 中统一使用
- ✅ 无 border-radius（像素风强制规则全局生效）
- ✅ 字体：pixel font 用于标题/标签，mono font 用于内容
