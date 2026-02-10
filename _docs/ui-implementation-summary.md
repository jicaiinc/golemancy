# SoloCraft UI 实现总结

> **阶段**: UI-First（纯前端，Mock 数据）
> **状态**: Phase 0-6 全部完成
> **验证**: TypeScript 0 错误 · 181 测试通过 · 构建产物 28.5 KB CSS + 327.8 KB JS

---

## 一、项目概述

SoloCraft 是一个 **AI Agent 编排平台**（Electron 桌面端），像素艺术 / Minecraft 视觉风格。用户可以创建多个 **Project（工作空间）**，每个 Project 内配置多个 **Agent**，Agent 之间可以编排为 Sub-Agent 层级，通过 Chat 交互并自动执行 Task，产出 Artifact，积累 Memory。

当前为 **UI-First** 阶段——全部业务逻辑通过 Service 接口抽象，现阶段使用 Mock 实现（内存 Map 存储），后端就绪后只需替换为 HTTP 实现，**UI 层零改动**。

---

## 二、技术栈

| 分类 | 技术 | 版本 | 用在哪里 |
|------|------|------|---------|
| 包管理 | **pnpm** | 10 | Monorepo workspace |
| 构建编排 | **Turborepo** | 2.8 | `build` / `dev` / `test` pipeline |
| 桌面框架 | **Electron** | 40 | BrowserWindow 窗口壳子 |
| 构建工具 | **electron-vite** | 5 | main / preload / renderer 三入口 |
| UI 框架 | **React** | 19 | 全部 UI |
| 语言 | **TypeScript** | 5.8 | strict 模式，Branded ID 类型安全 |
| 状态管理 | **Zustand** | 5 | Slices 模式，`create<T>()(...)` |
| 路由 | **react-router** | 7 | HashRouter（桌面端无需服务端路由） |
| 样式 | **Tailwind CSS** | 4.1 | CSS-first config，`@theme {}` |
| PostCSS | **@tailwindcss/postcss** | 4.1 | 不用 @tailwindcss/vite（electron-vite 有兼容问题） |
| 动画 | **motion** | 12 | `import from 'motion/react'`（不是 framer-motion） |
| 测试 | **Vitest** | 4 | jsdom + @testing-library/react |
| 像素字体 | **Press Start 2P** | — | 标题、标签 |
| 代码字体 | **JetBrains Mono** | — | 正文、代码 |

**明确不引入（等后端阶段）**：SQLite、Drizzle ORM、Vercel AI SDK、Playwright、child_process。

---

## 三、Monorepo 分包策略

```
SoloCraft.team/
├── apps/desktop/        @solocraft/desktop    Electron 壳子（极薄）
├── packages/shared/     @solocraft/shared     共享类型定义（零运行时依赖）
└── packages/ui/         @solocraft/ui         全部 UI（组件 + 页面 + 状态 + 服务层）
```

**依赖方向**严格单向：

```
desktop ──依赖──→ ui ──依赖──→ shared
                  ↑              ↑
            React/Zustand/motion  纯 TypeScript 类型
```

- `shared`：**纯类型包**，不含任何运行时代码，被 `ui` 和 `desktop` 同时引用
- `ui`：**UI 主战场**，包含全部业务逻辑（页面、组件、Store、Service），输出为 React 组件库
- `desktop`：**极薄 Electron 壳**，仅负责创建窗口 + 加载 renderer，renderer 直接挂载 `@solocraft/ui` 的 `<App/>`

---

## 四、目录结构

```
SoloCraft.team/
│
├── _golden-memory/                      # 架构决策记录
│   ├── business.md                      #   业务场景 & 用户画像
│   └── tech-stack.md                    #   技术选型表
│
├── _docs/                               # 设计文档
│   ├── discussion.md                    #   架构讨论记录
│   ├── ui-design-system.md              #   像素风设计系统规范
│   └── implementation-summary.md        #   ← 本文档
│
├── apps/desktop/                        # Electron 桌面应用
│   └── src/
│       ├── main/index.ts                #   Electron 主进程：创建 BrowserWindow
│       ├── preload/index.ts             #   contextBridge（预留，暂无 API）
│       └── renderer/src/main.tsx        #   渲染进程入口：挂载 <App/>
│
├── packages/shared/                     # 共享类型
│   └── src/types/
│       ├── common.ts                    #   Branded ID 类型 + 分页 + 时间戳
│       ├── settings.ts                  #   三层配置：GlobalSettings → ProjectConfig → AgentModelConfig
│       ├── project.ts                   #   Project 类型定义
│       ├── agent.ts                     #   Agent + Skill + ToolCallSchema + SubAgentRef
│       ├── conversation.ts              #   Conversation + Message + ToolCallResult
│       ├── task.ts                      #   Task + TaskLogEntry + TaskStatus
│       ├── artifact.ts                  #   Artifact + ArtifactType
│       └── memory.ts                    #   MemoryEntry
│
├── packages/ui/                         # UI 主包
│   └── src/
│       ├── app/                         # 应用入口层
│       │   ├── App.tsx                  #   ErrorBoundary → Providers → Routes
│       │   ├── routes.tsx               #   HashRouter + 全部路由定义
│       │   ├── providers.tsx            #   ServiceProvider + DataLoader
│       │   └── layouts/
│       │       └── ProjectLayout.tsx    #   项目内布局（同步 URL → Store，AppShell + Outlet）
│       │
│       ├── components/                  # 可复用组件库
│       │   ├── base/                    #   13 个 Pixel 基础组件（+ 13 个测试文件）
│       │   │   ├── PixelButton.tsx      #     5 变体 × 3 尺寸，beveled shadow
│       │   │   ├── PixelCard.tsx        #     4 变体（default/elevated/interactive/outlined）
│       │   │   ├── PixelInput.tsx       #     label + error + helper，sunken shadow
│       │   │   ├── PixelTextArea.tsx    #     多行文本输入
│       │   │   ├── PixelBadge.tsx       #     6 状态变体 + 动态指示点
│       │   │   ├── PixelAvatar.tsx      #     5 尺寸，initials / src，状态指示器
│       │   │   ├── PixelModal.tsx       #     AnimatePresence + Esc 关闭 + 背景点击
│       │   │   ├── PixelDropdown.tsx    #     点击外部关闭，分隔线，选中标记
│       │   │   ├── PixelTabs.tsx        #     底部高亮条，active/inactive 切换
│       │   │   ├── PixelSpinner.tsx     #     三点动画 + 交错延迟
│       │   │   ├── PixelProgress.tsx    #     0-100 值，CSS width transition
│       │   │   ├── PixelTooltip.tsx     #     hover 显隐，上/下定位
│       │   │   └── PixelToggle.tsx      #     Switch role，aria-checked
│       │   ├── layout/                  #   4 个布局组件
│       │   │   ├── AppShell.tsx         #     Sidebar + TopBar + main + StatusBar 组合
│       │   │   ├── ProjectSidebar.tsx   #     可折叠侧栏 + 项目切换器 + 导航菜单
│       │   │   ├── TopBar.tsx           #     左/右 slot 组合
│       │   │   └── StatusBar.tsx        #     Token 用量 + 活跃 Agent 数
│       │   └── ErrorBoundary.tsx        #   Creeper 像素风错误页面
│       │
│       ├── pages/                       # 页面组件（按功能域分子目录）
│       │   ├── project/                 #   项目管理
│       │   │   ├── ProjectListPage.tsx  #     项目大厅：卡片网格 + 创建 Modal
│       │   │   ├── ProjectDashboardPage.tsx  # 项目概览：统计卡片 + Agent 列表 + 最近动态
│       │   │   └── ProjectSettingsPage.tsx   # 项目设置：名称/描述/图标 + Provider 覆盖
│       │   ├── agent/                   #   Agent 管理
│       │   │   ├── AgentListPage.tsx    #     Agent 卡片网格 + 状态指示条
│       │   │   ├── AgentDetailPage.tsx  #     5 Tab 详情：基础/Skills/Tools/Sub-Agents/模型配置
│       │   │   └── AgentCreateModal.tsx #     创建 Agent 表单
│       │   ├── chat/                    #   聊天界面（8 个子组件）
│       │   │   ├── ChatPage.tsx         #     URL 参数同步 + Agent 选择 + 对话管理
│       │   │   ├── ChatSidebar.tsx      #     Agent 过滤 + 对话列表（按时间排序）
│       │   │   ├── ChatWindow.tsx       #     消息区 + 自动滚动 + 流式检测
│       │   │   ├── ChatInput.tsx        #     自适应高度 textarea，Enter 发送 / Shift+Enter 换行
│       │   │   ├── MessageBubble.tsx    #     角色样式：user 蓝色右对齐 / assistant 灰色左对齐
│       │   │   ├── StreamingMessage.tsx #     Mock 逐字打字效果（20-50ms 随机延迟）
│       │   │   ├── ToolCallDisplay.tsx  #     可展开的 Tool Call 卡片
│       │   │   └── ChatEmptyState.tsx   #     像素对话气泡 + Agent 快速开始卡片
│       │   ├── task/                    #   任务监控
│       │   │   ├── TaskListPage.tsx     #     Agent/状态筛选 + 可展开任务卡片 + 取消按钮
│       │   │   └── TaskLogViewer.tsx    #     日志条目：时间戳 + 类型徽章 + 内容
│       │   ├── artifact/                #   产出物
│       │   │   └── ArtifactsPage.tsx    #     类型图标网格 + 内联预览（text/code/image/data）
│       │   ├── memory/                  #   记忆
│       │   │   └── MemoryPage.tsx       #     搜索 + 标签过滤 + CRUD Modal
│       │   └── settings/               #   全局设置
│       │       └── GlobalSettingsPage.tsx  # Provider 管理 + API Key 配置
│       │
│       ├── services/                    # Service 抽象层
│       │   ├── interfaces.ts            #   7 个 Service 接口定义
│       │   ├── container.ts             #   DI 容器（module-level singleton）
│       │   ├── ServiceProvider.tsx       #   React Context 包装
│       │   └── mock/                    #   Mock 实现
│       │       ├── services.ts          #     7 个 Mock*Service 类（Map 存储 + 模拟延迟）
│       │       ├── data.ts              #     集中式种子数据（2 项目 / 5 Agent / 对话 / 任务...）
│       │       └── services.test.ts     #     32 个 Service 测试
│       │
│       ├── stores/                      # 状态管理
│       │   └── useAppStore.ts           #   Zustand 合并 Store（8 Slice + Actions，365 行）
│       │
│       ├── hooks/                       # 自定义 Hooks
│       │   └── index.ts                 #   useCurrentProject / useResolvedConfig / useServices
│       │
│       ├── lib/                         # 工具库
│       │   └── motion.ts               #   动画预设：fadeInUp / stagger / page / modal / dropdown
│       │
│       └── styles/                      # 样式
│           └── global.css               #   Tailwind 主题 + 像素风 design tokens（19 色 + 像素阴影）
│
├── package.json                         # 根 workspace 配置
├── pnpm-workspace.yaml                  # pnpm workspace 声明
├── tsconfig.base.json                   # 共享 TS 配置（target: ES2022, strict）
└── turbo.json                           # Turborepo pipeline
```

---

## 五、核心抽象与数据模型

### 5.1 Branded ID 类型

所有 ID 使用 **Branded Type** 实现编译时类型安全，防止不同实体 ID 混用：

```typescript
// packages/shared/src/types/common.ts
type Brand<T, B extends string> = T & { readonly __brand: B }

export type ProjectId      = Brand<string, 'ProjectId'>
export type AgentId        = Brand<string, 'AgentId'>
export type ConversationId = Brand<string, 'ConversationId'>
export type TaskId         = Brand<string, 'TaskId'>
export type ArtifactId     = Brand<string, 'ArtifactId'>
export type MemoryId       = Brand<string, 'MemoryId'>
// ...
```

### 5.2 核心实体关系

```
Project（工作空间）
 ├── Agent[]              一个项目有多个 Agent
 │   ├── skills[]         Agent 拥有的技能
 │   ├── tools[]          Agent 可调用的工具
 │   ├── subAgents[]      Sub-Agent 引用（只能引用同 Project 内的 Agent）
 │   └── modelConfig      Agent 级别的模型配置
 ├── Conversation[]       对话归属于 Project + Agent
 │   └── Message[]        消息（user/assistant/system/tool）
 │       └── toolCalls[]  Tool Call 执行记录
 ├── Task[]               任务归属于 Project + Agent
 │   └── log[]            执行日志条目
 ├── Artifact[]           产出物归属于 Project + Agent（可选 Task）
 ├── MemoryEntry[]        记忆条目归属于 Project
 └── config               项目级配置（继承全局 + 可覆盖）
```

### 5.3 配置三层继承

```
Layer 1: GlobalSettings
         ├── providers[]          所有已配置的 AI Provider
         ├── defaultProvider       默认 Provider
         └── theme                主题（仅 dark）
              │
              ▼ 覆盖
Layer 2: ProjectConfig
         ├── providerOverride?    项目级 Provider 覆盖
         └── maxConcurrentAgents  最大并发 Agent 数
              │
              ▼ 覆盖
Layer 3: AgentModelConfig
         ├── provider?            Agent 级 Provider
         ├── model?               Agent 级模型
         ├── temperature?         温度
         └── maxTokens?           最大 Token 数
```

通过 `useResolvedConfig(projectConfig?, agentConfig?)` Hook 合并三层，返回最终生效的配置。

---

## 六、Service 接口抽象

### 6.1 设计原则

- **接口驱动**：UI 只依赖接口，不依赖具体实现
- **projectId 作用域**：除 Settings 外，所有方法第一个参数都是 `projectId`，保证 Project 隔离
- **DI 容器**：使用 module-level singleton（不是 React Context），因为 Zustand action 无法访问 React Context

### 6.2 七个 Service 接口

```typescript
// packages/ui/src/services/interfaces.ts

IProjectService         // 项目 CRUD
  list()  getById(id)  create(data)  update(id, data)  delete(id)

IAgentService           // Agent CRUD（项目作用域）
  list(projectId)  getById(projectId, id)  create(projectId, data)  update(projectId, id, data)  delete(projectId, id)

IConversationService    // 对话 + 消息（项目作用域）
  list(projectId, agentId?)  getById(projectId, id)  create(projectId, agentId, title)
  sendMessage(projectId, conversationId, content)  delete(projectId, id)

ITaskService            // 任务监控（项目作用域）
  list(projectId, agentId?)  getById(projectId, id)  cancel(projectId, id)

IArtifactService        // 产出物（项目作用域）
  list(projectId, agentId?)  getById(projectId, id)  delete(projectId, id)

IMemoryService          // 记忆 CRUD（项目作用域）
  list(projectId)  create(projectId, data)  update(projectId, id, data)  delete(projectId, id)

ISettingsService        // 全局设置（无 projectId）
  get()  update(data)
```

### 6.3 DI 容器

```typescript
// packages/ui/src/services/container.ts
interface ServiceContainer {
  projects:      IProjectService
  agents:        IAgentService
  conversations: IConversationService
  tasks:         ITaskService
  artifacts:     IArtifactService
  memory:        IMemoryService
  settings:      ISettingsService
}

let services: ServiceContainer | null = null
export function getServices(): ServiceContainer { ... }      // Store action 中调用
export function configureServices(container: ServiceContainer): void { ... }  // 启动时初始化
```

### 6.4 Mock 实现

```typescript
// packages/ui/src/services/mock/services.ts
class MockProjectService implements IProjectService {
  private data = new Map<ProjectId, Project>(SEED_PROJECTS.map(p => [p.id, { ...p }]))

  async list(): Promise<Project[]> {
    await delay()                          // 模拟网络延迟
    return [...this.data.values()]
  }
  async create(input): Promise<Project> {
    const project = { id: genId('proj'), ...input, ... }
    this.data.set(project.id, project)
    return project
  }
  // ... update, delete 同理
}
```

**切换到真实后端只需：**

```typescript
// ServiceProvider.tsx 改一行：
- const container = createMockServices()
+ const container = createHttpServices(baseUrl)
  configureServices(container)
```

---

## 七、状态管理（Zustand Store）

### 7.1 Slice 架构

```
useAppStore = create<AppState>()(...)

AppState = ProjectSlice  ← projects[], currentProjectId, projectsLoading
         & AgentSlice    ← agents[], agentsLoading
         & ConversationSlice ← conversations[], currentConversationId, conversationsLoading
         & TaskSlice     ← tasks[], tasksLoading
         & ArtifactSlice ← artifacts[], artifactsLoading
         & MemorySlice   ← memories[], memoriesLoading
         & SettingsSlice ← settings (GlobalSettings)
         & UISlice       ← sidebarCollapsed
         & 全部 Actions
```

### 7.2 Project 切换（核心流程）

```typescript
async selectProject(id: ProjectId) {
  // 1. 取消上一个项目的请求
  projectAbort?.abort()
  projectAbort = new AbortController()

  // 2. 清空旧数据 + 显示 Loading
  set({
    currentProjectId: id,
    agents: [], conversations: [], tasks: [], artifacts: [], memories: [],
    agentsLoading: true, conversationsLoading: true, tasksLoading: true, ...
  })

  // 3. 并行加载新项目的全部数据
  const [agents, conversations, tasks, artifacts, memories] = await Promise.all([
    svc.agents.list(id),
    svc.conversations.list(id),
    svc.tasks.list(id),
    svc.artifacts.list(id),
    svc.memory.list(id),
  ])

  // 4. 竞态保护：只有当前项目没变才更新
  if (get().currentProjectId !== id) return

  set({ agents, conversations, tasks, artifacts, memories, ...Loading: false })
}
```

### 7.3 全部 Store Actions

| 领域 | Actions |
|------|---------|
| Project | `loadProjects` · `selectProject` · `clearProject` · `createProject` · `updateProject` · `deleteProject` |
| Agent | `loadAgents` · `createAgent` · `updateAgent` · `deleteAgent` |
| Conversation | `loadConversations` · `selectConversation` · `createConversation` · `sendMessage` · `deleteConversation` |
| Task | `loadTasks` · `cancelTask` |
| Artifact | `loadArtifacts` · `deleteArtifact` |
| Memory | `loadMemories` · `createMemory` · `updateMemory` · `deleteMemory` |
| Settings | `loadSettings` · `updateSettings` |
| UI | `toggleSidebar` |

---

## 八、路由设计

```
/                                       → ProjectListPage      项目大厅（首页）
/settings                               → GlobalSettingsPage   全局设置

/projects/:projectId                    → ProjectLayout (AppShell + Outlet)
  ├── (index)                           → ProjectDashboardPage 项目概览
  ├── agents                            → AgentListPage        Agent 列表
  ├── agents/:agentId                   → AgentDetailPage      Agent 详情
  ├── chat                              → ChatPage             聊天界面
  ├── tasks                             → TaskListPage         任务监控
  ├── artifacts                         → ArtifactsPage        产出物浏览
  ├── memory                            → MemoryPage           记忆管理
  └── settings                          → ProjectSettingsPage  项目设置
```

使用 **HashRouter**（`/#/projects/...`），适合 Electron 桌面端，不需要服务端路由支持。

`ProjectLayout` 负责：
- 从 URL 读取 `projectId` → 调用 `selectProject()` 同步 Store
- 渲染 `AppShell`（Sidebar + TopBar + Outlet + StatusBar）
- 项目不存在时自动跳转回首页

---

## 九、已实现的核心功能

### 9.1 十个页面

| 页面 | 核心功能 |
|------|---------|
| **项目大厅** | 像素卡片网格 · 创建项目 Modal（名称/描述/图标选择） · stagger 入场动画 |
| **项目概览** | 4 个统计卡片（Agent 数/任务数/对话数/最近活动） · Agent 状态列表 · 最近任务进度条 |
| **项目设置** | 编辑名称/描述/图标 · Provider 覆盖配置 · maxConcurrentAgents |
| **Agent 列表** | 卡片网格 · 4px 状态指示条（idle 灰/running 绿+脉冲/error 红+抖动/paused 黄+闪烁） |
| **Agent 详情** | 5 Tab 式详情：基础信息 / Skills / Tools / Sub-Agents / 模型配置（显示继承来源） |
| **聊天** | 侧栏（Agent 选择 + 对话列表） · 消息气泡 · Mock 流式打字 · Tool Call 展示 · URL 参数同步 |
| **任务监控** | Agent/状态下拉筛选 · 可展开执行日志 · 进度条 · Token 用量 · 取消任务 |
| **产出物** | 类型图标网格 · 内联预览（text/code/image/data） · 删除 |
| **记忆** | 搜索 · 标签过滤 · CRUD Modal |
| **全局设置** | Provider 列表管理 · API Key 配置 |

### 9.2 像素风组件库（13 个基础组件）

| 组件 | 特性 |
|------|------|
| `PixelButton` | 5 变体（primary/secondary/danger/ghost/link）× 3 尺寸 · forwardRef · beveled 阴影 |
| `PixelCard` | 4 变体（default/elevated/interactive/outlined）· selected 高亮 |
| `PixelInput` | label · error · helper · sunken 阴影 · focus ring |
| `PixelTextArea` | 同 PixelInput 模式的多行文本 |
| `PixelBadge` | 6 变体（idle/running/error/paused/success/info）· 动态指示点 |
| `PixelAvatar` | 5 尺寸（xs-xl）· initials 或图片 · 在线/离线状态指示 |
| `PixelModal` | motion AnimatePresence · Esc 关闭 · 背景点击关闭 |
| `PixelDropdown` | 点击外部关闭 · 分隔线 · 选中标记 |
| `PixelTabs` | active 底部高亮条 · inactive 灰色 |
| `PixelSpinner` | 三点交错动画 · 可选 label |
| `PixelProgress` | 0-100 值 · CSS width transition |
| `PixelTooltip` | hover 显隐 · 上/下定位 |
| `PixelToggle` | Switch role · aria-checked · disabled |

### 9.3 布局系统（4 个布局组件）

```
┌──────────────────────────────────────────────────────┐
│ AppShell                                              │
│ ┌──────────┐┌────────────────────────────────────────┐│
│ │ Project  ││ TopBar                      [操作按钮] ││
│ │ Sidebar  ││────────────────────────────────────────││
│ │          ││                                        ││
│ │ 项目切换  ││              main                      ││
│ │ Dashboard ││            (Outlet)                    ││
│ │ Agents   ││                                        ││
│ │ Chat     ││                                        ││
│ │ Tasks    ││                                        ││
│ │ Artifacts││                                        ││
│ │ Memory   ││                                        ││
│ │ Settings ││────────────────────────────────────────││
│ │          ││ StatusBar          Token: 3,024 │ ◉ 1  ││
│ └──────────┘└────────────────────────────────────────┘│
└──────────────────────────────────────────────────────┘
```

---

## 十、Mock 清单

| 什么被 Mock 了 | 实现方式 | 说明 |
|----------------|---------|------|
| 7 个 Service | `Map<Id, Entity>` 内存存储 | CRUD + 模拟延迟 |
| 种子数据 | 集中在 `services/mock/data.ts` | 2 项目 · 5 Agent · 对话 · 4 任务 · 4 产出物 · 4 记忆 |
| Chat 流式响应 | `StreamingMessage` 组件 | `setInterval` + 随机 20-50ms 逐字显示 + 闪烁光标 |
| 助手回复 | `MockConversationService.sendMessage` | 发送消息后自动追加一条固定助手回复 |
| 网络延迟 | `delay()` 函数 | 每个 Service 方法开头 `await delay()` |

**没有 Mock 的**（等后端阶段实现）：
- 真实 AI 模型调用（OpenAI / Anthropic / Google）
- Agent 任务执行引擎
- 数据持久化（SQLite）
- 文件系统操作
- 浏览器 / 桌面自动化
- 进程间通信（Electron IPC）

---

## 十一、工作流程图

### 11.1 应用启动流程

```
Electron main process
│
├── app.whenReady()
│   └── createWindow(1280×800, bg: #0B0E14)
│       └── loadURL(renderer) 或 loadFile(renderer/index.html)
│
▼
renderer/main.tsx
│
└── ReactDOM.createRoot().render(<App/>)
    │
    ├── <ErrorBoundary>                    全局错误捕获
    │   │
    │   └── <Providers>
    │       │
    │       ├── <ServiceProvider>           初始化 Mock Services
    │       │   └── configureServices(createMockServices())
    │       │
    │       └── <DataLoader>               加载初始数据
    │           ├── loadProjects()
    │           ├── loadSettings()
    │           │
    │           └── <HashRouter>
    │               │
    │               ├── / ──────────────── ProjectListPage（项目大厅）
    │               ├── /settings ──────── GlobalSettingsPage
    │               └── /projects/:id ──── ProjectLayout
    │                   │
    │                   ├── useEffect: selectProject(id)
    │                   │   └── 并行加载 agents/conversations/tasks/artifacts/memories
    │                   │
    │                   └── <AppShell>
    │                       ├── ProjectSidebar
    │                       ├── TopBar
    │                       ├── <Outlet/> ← 子路由页面
    │                       └── StatusBar
```

### 11.2 用户操作数据流

```
用户操作（点击/输入/选择）
│
▼
Page 组件
│ const action = useAppStore(s => s.someAction)
│ const data   = useAppStore(s => s.someData)
│
├── 调用 action (如 createAgent)
│   │
│   ▼
│   Store Action
│   │
│   ├── 1. 调用 getServices().agents.create(projectId, data)
│   │       │
│   │       ▼
│   │     Service 实现（Mock: Map 操作 / HTTP: fetch）
│   │       │
│   │       ▼
│   │     返回新建的 Agent
│   │
│   ├── 2. set(s => ({ agents: [...s.agents, newAgent] }))
│   │       │
│   │       ▼
│   │     Zustand 通知所有订阅者
│   │
│   ▼
│   Page 组件自动 re-render（显示新 Agent）
│
└── UI 更新完成
```

### 11.3 Project 切换流程

```
用户选择新 Project
│
▼
ProjectLayout.useEffect → selectProject(newId)
│
├── 1. projectAbort?.abort()            取消上一个项目的进行中请求
├── 2. projectAbort = new AbortController()
├── 3. set({ currentProjectId: newId })
├── 4. 清空旧数据 + 显示 Loading
│      set({ agents:[], tasks:[], ...Loading: true })
│
├── 5. Promise.all([                    并行加载 5 种数据
│      │  agents.list(newId),
│      │  conversations.list(newId),
│      │  tasks.list(newId),
│      │  artifacts.list(newId),
│      │  memory.list(newId),
│      ])
│
├── 6. if (currentProjectId !== newId) return   竞态保护
│
└── 7. set({ agents, tasks, ...Loading: false })
       │
       ▼
     全部子页面 re-render（显示新项目数据）
```

### 11.4 Chat 发送消息流程

```
用户在 ChatInput 输入消息 → 按 Enter
│
▼
ChatInput.onSend(content)
│
▼
ChatWindow.handleSend(content)
│
├── setSending(true)                    显示 "Thinking..." 动画
│
├── store.sendMessage(conversationId, content)
│   │
│   ├── svc.conversations.sendMessage(projectId, convId, content)
│   │   │
│   │   └── [Mock] 追加 user message + 自动生成 assistant 回复
│   │
│   └── svc.conversations.getById(projectId, convId)
│       │
│       └── 返回更新后的 conversation（含新消息）
│
├── Store 更新 conversations[]
│
├── ChatWindow 检测到新 assistant 消息
│   │
│   └── setStreamingContent(lastMsg.content)
│       │
│       └── <StreamingMessage> 逐字打字效果
│           └── onComplete → setStreamingContent(null) → 显示完整消息
│
└── setSending(false)
```

### 11.5 配置继承解析流程

```
useResolvedConfig(projectConfig?, agentConfig?)
│
├── 读取 GlobalSettings
│   └── providers: [{ provider: 'openai', defaultModel: 'gpt-4o' }]
│       defaultProvider: 'openai'
│
├── Layer 1: 全局默认
│   provider = 'openai'
│   model    = 'gpt-4o'
│
├── Layer 2: Project 覆盖（如果有）
│   projectConfig.providerOverride?.provider → 覆盖 provider
│   projectConfig.providerOverride?.defaultModel → 覆盖 model
│
├── Layer 3: Agent 覆盖（如果有）
│   agentConfig.model → 覆盖 model
│   agentConfig.temperature → 覆盖 temperature
│   agentConfig.maxTokens → 覆盖 maxTokens
│
└── 返回最终生效配置
    { provider, model, temperature, maxTokens }
```

---

## 十二、像素风设计系统

### 12.1 色板（19 色，仅深色主题）

```
背景层级      void #0B0E14 → deep #141820 → surface #1E2430 → elevated #2A3242
边框          dim #2E3A4E → bright #4A5568
文字          primary #E8ECF1 → secondary #8B95A5 → dim #505A6A
强调色        green #4ADE80 · blue #60A5FA · amber #FBBF24 · red #F87171 · purple #A78BFA · cyan #22D3EE
Minecraft     stone #7F7F7F · dirt #8B6B4A · grass #5B8C3E · diamond #4AEDD9 · gold #FCDB05
```

### 12.2 核心视觉规则

- **零圆角**：`* { border-radius: 0 !important; }`
- **2px 像素边框**：所有卡片、输入框、按钮
- **Beveled 阴影**：`raised`（凸起）和 `sunken`（凹陷）两种
- **4px 网格对齐**：间距、尺寸都是 4 的倍数
- **离散动画**：`pixel-pulse`（脉冲）/ `pixel-shake`（抖动）/ `pixel-blink`（闪烁）

### 12.3 动画预设

```typescript
// packages/ui/src/lib/motion.ts
pixelTransition   = { type: 'tween', duration: 0.15 }   // 像素风快速过渡
pixelSpring       = { type: 'spring', stiffness: 500 }   // 弹性
fadeInUp          = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } }
staggerContainer  = { variants: { animate: { transition: { staggerChildren: 0.04 } } } }
staggerItem       = { variants: { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } } }
pageTransition    = { ... }
modalTransition   = { ... }
dropdownTransition = { ... }
```

---

## 十三、测试覆盖

| 测试文件 | 测试数 | 覆盖内容 |
|---------|--------|---------|
| 13 × `components/base/*.test.tsx` | 125 | 全部基础组件的渲染、变体、交互、无障碍 |
| `stores/useAppStore.test.ts` | 18 | 初始状态、CRUD 操作、竞态保护、UI toggle |
| `services/mock/services.test.ts` | 32 | 全部 7 个 Service 的 CRUD + projectId 隔离 |
| `hooks/hooks.test.ts` | 6 | 三层配置合并逻辑 |
| `app/App.test.tsx` | 1 | 根页面渲染 |
| **合计** | **181** | |

---

## 十四、构建产物

```
pnpm build

@solocraft/shared  → TypeScript 编译 ✓
@solocraft/ui      → 472 modules → 28.52 KB CSS + 327.82 KB JS
@solocraft/desktop → 501 modules → renderer + main + preload
```

---

## 十五、后续阶段路线图

| 阶段 | 内容 | 涉及技术 |
|------|------|---------|
| **后端基础** | SQLite + Drizzle ORM 数据持久化 · HTTP Service 实现替换 Mock | better-sqlite3, Drizzle |
| **AI 集成** | Vercel AI SDK 接入 · 真实模型调用 · 流式响应 | @ai-sdk/openai, @ai-sdk/anthropic |
| **Agent 运行时** | child_process 进程隔离 · Task 执行引擎 · Agent 生命周期管理 | Node.js child_process |
| **浏览器自动化** | Playwright 网页操作 · 截图 · 数据采集 | Playwright |
| **Electron IPC** | main ↔ renderer 安全通信 · 文件系统访问 | contextBridge, ipcMain/ipcRenderer |
| **桌面自动化** | Nut.js 鼠标/键盘操控（远期） | Nut.js |
