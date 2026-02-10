# SoloCraft UI 实现总结

> **阶段**: UI-First（纯前端，Mock 数据）
> **状态**: Phase 1（基础 UI）+ Phase 2（全局功能扩展）全部完成
> **验证**: TypeScript 0 错误 · 233 测试通过 · 构建产物 34.9 KB CSS + 357.3 KB JS

---

## 一、项目概述

SoloCraft 是一个 **AI Agent 编排平台**（Electron 桌面端），像素艺术 / Minecraft 视觉风格。用户可以创建多个 **Project（工作空间）**，每个 Project 内配置多个 **Agent**，Agent 之间可以编排为 Sub-Agent 层级，通过 Chat 交互并自动执行 Task，产出 Artifact，积累 Memory。

当前为 **UI-First** 阶段——全部业务逻辑通过 Service 接口抽象，现阶段使用 Mock 实现（内存 Map 存储），后端就绪后只需替换为 HTTP 实现，**UI 层零改动**。

### 两个实现阶段

| 阶段 | 内容 | 关键产出 |
|------|------|---------|
| **Phase 1** | 基础 UI 框架 + 10 个页面 + 13 个像素组件 + 7 个 Service | 完整的项目/Agent/Chat/Task 工作流 |
| **Phase 2** | 全局 Dashboard + 主题切换 + 项目工作目录 + 用户设置扩展 | 跨项目视图、Light/Dark/System 主题、用户档案 |

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
| 状态管理 | **Zustand** | 5 | Slices 模式 + `persist` 中间件，`create<T>()(...)` |
| 路由 | **react-router** | 7 | HashRouter（桌面端无需服务端路由） |
| 样式 | **Tailwind CSS** | 4.1 | CSS-first config + `@custom-variant dark` 主题切换 |
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
│   └── ui-implementation-summary.md     #   ← 本文档
│
├── _team/                               # 团队角色定义
│   └── team.md                          #   6 角色（PM/策略师/验证师/设计师/全栈/测试）
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
│       ├── settings.ts                  #   三层配置 + ThemeMode + UserProfile
│       ├── project.ts                   #   Project（含 workingDirectory）
│       ├── dashboard.ts                 #   ★ Dashboard 跨项目汇总类型
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
│       │   ├── routes.tsx               #   HashRouter + 全部路由（含 /dashboard）
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
│       │   │   ├── PixelSpinner.tsx     #     三点交错动画 + 可选 label
│       │   │   ├── PixelProgress.tsx    #     0-100 值，CSS width transition
│       │   │   ├── PixelTooltip.tsx     #     hover 显隐，上/下定位
│       │   │   └── PixelToggle.tsx      #     Switch role，aria-checked
│       │   ├── layout/                  #   4 个布局组件
│       │   │   ├── AppShell.tsx         #     Sidebar + TopBar + main + StatusBar 组合
│       │   │   ├── ProjectSidebar.tsx   #     可折叠侧栏 + 项目切换 + Dashboard/Settings 快捷入口
│       │   │   ├── TopBar.tsx           #     左/右 slot 组合
│       │   │   └── StatusBar.tsx        #     Token 用量 + 活跃 Agent 数
│       │   └── ErrorBoundary.tsx        #   Creeper 像素风错误页面
│       │
│       ├── pages/                       # 页面组件（按功能域分子目录）
│       │   ├── dashboard/               #   ★ 全局 Dashboard（Phase 2 新增）
│       │   │   └── DashboardPage.tsx    #     跨项目命令中心（396 行）
│       │   ├── project/                 #   项目管理
│       │   │   ├── ProjectListPage.tsx  #     项目大厅 + Dashboard/Settings 导航按钮
│       │   │   ├── ProjectCreateModal.tsx #   创建项目（含工作目录自动生成）
│       │   │   ├── ProjectDashboardPage.tsx  # 项目概览
│       │   │   └── ProjectSettingsPage.tsx   # 项目设置
│       │   ├── agent/                   #   Agent 管理
│       │   │   ├── AgentListPage.tsx    #     Agent 卡片网格 + 状态指示条
│       │   │   ├── AgentDetailPage.tsx  #     5 Tab 详情
│       │   │   └── AgentCreateModal.tsx #     创建 Agent 表单
│       │   ├── chat/                    #   聊天界面（8 个子组件）
│       │   │   ├── ChatPage.tsx         #     URL 参数同步 + Agent 选择 + 对话管理
│       │   │   ├── ChatSidebar.tsx      #     Agent 过滤 + 对话列表
│       │   │   ├── ChatWindow.tsx       #     消息区 + 自动滚动 + 流式检测
│       │   │   ├── ChatInput.tsx        #     自适应高度 textarea
│       │   │   ├── MessageBubble.tsx    #     角色样式
│       │   │   ├── StreamingMessage.tsx #     Mock 逐字打字效果
│       │   │   ├── ToolCallDisplay.tsx  #     可展开的 Tool Call 卡片
│       │   │   └── ChatEmptyState.tsx   #     像素对话气泡 + 快速开始
│       │   ├── task/                    #   任务监控
│       │   │   ├── TaskListPage.tsx     #     Agent/状态筛选 + 可展开任务卡片
│       │   │   └── TaskLogViewer.tsx    #     日志条目
│       │   ├── artifact/                #   产出物
│       │   │   └── ArtifactsPage.tsx    #     类型图标网格 + 内联预览
│       │   ├── memory/                  #   记忆
│       │   │   └── MemoryPage.tsx       #     搜索 + 标签过滤 + CRUD Modal
│       │   └── settings/               #   全局设置
│       │       └── GlobalSettingsPage.tsx  # ★ 5 Tab 设置（368 行，Phase 2 扩展）
│       │
│       ├── services/                    # Service 抽象层
│       │   ├── interfaces.ts            #   8 个 Service 接口定义（含 IDashboardService）
│       │   ├── container.ts             #   DI 容器（module-level singleton）
│       │   ├── ServiceProvider.tsx       #   React Context 包装
│       │   └── mock/                    #   Mock 实现
│       │       ├── services.ts          #     8 个 Mock*Service 类（含 MockDashboardService）
│       │       ├── data.ts              #     集中式种子数据（含 SEED_ACTIVITIES）
│       │       └── index.ts             #     createMockServices() 工厂
│       │
│       ├── stores/                      # 状态管理
│       │   └── useAppStore.ts           #   Zustand Store（10 Slice + persist 中间件，466 行）
│       │
│       ├── hooks/                       # 自定义 Hooks
│       │   └── index.ts                 #   useCurrentProject / useResolvedConfig / useServices
│       │
│       ├── lib/                         # 工具库
│       │   └── motion.ts               #   动画预设
│       │
│       └── styles/                      # 样式
│           └── global.css               #   ★ Tailwind 主题 + Light/Dark 双主题（241 行）
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
```

### 5.2 核心实体关系

```
Project（工作空间）
 ├── workingDirectory     项目工作目录（OS 感知，自动生成）
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
         ├── providers[]                  所有已配置的 AI Provider
         ├── defaultProvider              默认 Provider
         ├── theme                        ★ ThemeMode: 'light' | 'dark' | 'system'
         ├── userProfile                  ★ { name, email, avatarUrl? }
         └── defaultWorkingDirectoryBase  ★ 新项目默认工作目录基础路径
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

### 5.4 Dashboard 跨项目类型（Phase 2 新增）

```typescript
// packages/shared/src/types/dashboard.ts

DashboardSummary          // 全局统计：totalProjects, totalAgents, activeAgents, runningTasks, completedTasksToday, totalTokenUsageToday
DashboardAgentSummary     // 轻量 Agent 概要：agentId, projectId, projectName, agentName, status, currentTaskTitle?
DashboardTaskSummary      // 轻量 Task 概要：taskId, projectId, projectName, agentId, agentName, title, status, progress, updatedAt
ActivityType              // 7 种活动类型：agent_started | agent_stopped | task_created | task_completed | task_failed | message_sent | artifact_created
ActivityEntry             // 活动条目：id, type, projectId, projectName, agentId?, agentName?, description, timestamp
```

---

## 六、Service 接口抽象

### 6.1 设计原则

- **接口驱动**：UI 只依赖接口，不依赖具体实现
- **projectId 作用域**：除 Settings 和 Dashboard 外，所有方法第一个参数都是 `projectId`，保证 Project 隔离
- **DI 容器**：使用 module-level singleton（不是 React Context），因为 Zustand action 无法访问 React Context

### 6.2 八个 Service 接口

```typescript
// packages/ui/src/services/interfaces.ts

IProjectService         // 项目 CRUD（含 workingDirectory）
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

★ IDashboardService     // 全局 Dashboard（无 projectId，跨项目汇总）
  getSummary()  getActiveAgents()  getRecentTasks(limit?)  getActivityFeed(limit?)
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
  dashboard:     IDashboardService      // ★ Phase 2 新增
}
```

### 6.4 Mock 实现

```typescript
// packages/ui/src/services/mock/services.ts — 8 个 Mock Service 类
MockProjectService          // Map 存储 + workingDirectory 自动生成
MockAgentService
MockConversationService     // 发送消息后自动追加 AI 回复
MockTaskService
MockArtifactService
MockMemoryService
MockSettingsService
★ MockDashboardService      // 从 seed data 计算汇总统计

// packages/ui/src/services/mock/data.ts — 集中式种子数据
SEED_PROJECTS    (2 项目，含 workingDirectory)
SEED_AGENTS      (5 Agent)
SEED_CONVERSATIONS + SEED_MESSAGES
SEED_TASKS       (4 任务)
SEED_ARTIFACTS   (4 产出物)
SEED_MEMORIES    (4 记忆)
SEED_SETTINGS    (含 theme, userProfile, defaultWorkingDirectoryBase)
★ SEED_ACTIVITIES (7 活动条目)
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
useAppStore = create<AppState>()(
  persist(                                      ★ Phase 2: persist 中间件包装
    (set, get) => ({ ... }),
    {
      name: 'solocraft-prefs',
      partialize: (s) => ({                     仅持久化用户偏好
        sidebarCollapsed: s.sidebarCollapsed,
        themeMode: s.themeMode,
      }),
      onRehydrateStorage: () => (state) => {    重启时恢复主题
        if (state?.themeMode) applyThemeToDOM(state.themeMode)
      }
    }
  )
)

AppState = ProjectSlice      ← projects[], currentProjectId, projectsLoading
         & AgentSlice        ← agents[], agentsLoading
         & ConversationSlice ← conversations[], currentConversationId, conversationsLoading
         & TaskSlice         ← tasks[], tasksLoading
         & ArtifactSlice     ← artifacts[], artifactsLoading
         & MemorySlice       ← memories[], memoriesLoading
         & SettingsSlice     ← settings (GlobalSettings)
         & UISlice           ← sidebarCollapsed, themeMode
       ★ & DashboardSlice    ← dashboardSummary, dashboardActiveAgents, dashboardRecentTasks, dashboardActivityFeed, dashboardLoading
         & 全部 Actions
```

### 7.2 主题切换机制（Phase 2 新增）

```typescript
function applyThemeToDOM(mode: ThemeMode) {
  const root = document.documentElement
  root.classList.remove('light', 'dark')
  if (mode !== 'system') {
    root.classList.add(mode)
  }
  // 'system' → 无 class → CSS @media (prefers-color-scheme) 接管
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
| UI | `toggleSidebar` · ★ `setTheme` |
| ★ Dashboard | `loadDashboard` · `loadDashboardActiveAgents` · `loadDashboardRecentTasks` · `loadDashboardActivityFeed` |

---

## 八、路由设计

```
/                                       → ProjectListPage      项目大厅（首页）
★ /dashboard                            → DashboardPage        全局命令中心
/settings                               → GlobalSettingsPage   全局设置（5 Tab）

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

**导航入口**（Phase 2 新增）：
- **项目大厅顶部**：`Dashboard` 和 `Settings` 按钮
- **Dashboard 页面**：`← Projects` 返回首页，`Settings` 按钮
- **Settings 页面**：`← Back` 返回首页
- **项目内侧栏**：项目切换下拉菜单包含 `◉ Dashboard` 和 `⚙ Settings` 快捷入口

---

## 九、已实现的核心功能

### 9.1 十一个页面

| 页面 | 核心功能 |
|------|---------|
| **项目大厅** | 像素卡片网格 · 创建项目 Modal · Dashboard/Settings 导航 · stagger 动画 |
| ★ **全局 Dashboard** | 6 统计卡片 · 活跃 Agent（按项目分组）· 运行任务（进度条）· 活动时间线 · 全 Agent 表（筛选/过滤）|
| **项目概览** | 4 个统计卡片 · Agent 状态列表 · 最近任务进度条 |
| **项目设置** | 编辑名称/描述/图标 · Provider 覆盖 · maxConcurrentAgents |
| **Agent 列表** | 卡片网格 · 4px 状态指示条 |
| **Agent 详情** | 5 Tab 详情：基础/Skills/Tools/Sub-Agents/模型配置 |
| **聊天** | 侧栏 + 消息气泡 + Mock 流式打字 + Tool Call + URL 同步 |
| **任务监控** | Agent/状态筛选 · 执行日志 · 进度条 · Token 用量 · 取消 |
| **产出物** | 类型图标网格 · 内联预览（text/code/image/data） |
| **记忆** | 搜索 · 标签过滤 · CRUD Modal |
| ★ **全局设置** | 5 Tab：Providers / Appearance / Profile / Paths / General |

### 9.2 Phase 2 新增功能详解

#### 项目工作目录

创建项目时自动生成基于项目名的工作目录：

```
默认基础路径（GlobalSettings.defaultWorkingDirectoryBase）
├── macOS / Linux:  ~/.solocraft/projects
└── Windows:        C:\Users\<user>\.solocraft\projects

项目工作目录 = 基础路径 / slugify(项目名)
例如: ~/.solocraft/projects/my-awesome-project
```

- 项目名变化时自动更新路径（slugify 处理）
- 用户可手动编辑路径，一旦编辑则停止自动生成
- 基础路径可在 Settings → Paths 中全局配置

#### 主题切换（Light / Dark / System）

```
@custom-variant dark {
  // 1. 显式 .dark 类 → 深色模式
  &:where(.dark, .dark *) { @slot; }
  // 2. 无显式类 + 系统偏好深色 → 深色模式
  @media (prefers-color-scheme: dark) {
    &:where(:not(.light, .light *)) { @slot; }
  }
}
```

- 选择 `'dark'` → `<html class="dark">` → 深色
- 选择 `'light'` → `<html class="light">` → 亮色
- 选择 `'system'` → 无 class → CSS `prefers-color-scheme` 接管
- 主题偏好通过 Zustand `persist` 中间件存储到 `localStorage`
- 应用启动时 `onRehydrateStorage` 自动恢复上次主题

#### 全局设置页面（5 Tab）

| Tab | 内容 |
|-----|------|
| **Providers** | 默认 Provider 选择（4 大 Provider 按钮）· 已配置 Provider 列表 · API Key 编辑（masking） |
| ★ **Appearance** | 主题切换器（Light/Dark/System 三卡片，含迷你预览）|
| ★ **Profile** | 用户名、邮箱、头像 URL |
| ★ **Paths** | 默认项目工作目录基础路径 |
| **General** | 关于 SoloCraft v0.1.0 |

#### 全局 Dashboard

```
┌─────────────────────────────────────────────────────┐
│  ← Projects   DASHBOARD            [Settings]       │
├─────────────────────────────────────────────────────┤
│  [Quick Stats: 6 cards]                              │
│  [Overview | All Agents]                             │
├─────────────────────────────────────────────────────┤
│  Active Agents  │  Recent Tasks    │  Activity Feed  │
│  (by project)   │  (progress bars) │  (timeline)     │
└─────────────────────────────────────────────────────┘
```

- **Overview Tab**: 三列布局（Active Agents / Recent Tasks / Activity Feed）
- **All Agents Tab**: 可按项目和状态筛选的 Agent 表格

### 9.3 像素风组件库（13 个基础组件）

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

### 9.4 布局系统（4 个布局组件）

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
│ │ ─────────││                                        ││
│ │◉Dashboard││ StatusBar          Token: 3,024 │ ◉ 1  ││
│ │⚙Settings ││                                        ││
│ └──────────┘└────────────────────────────────────────┘│
└──────────────────────────────────────────────────────┘
```

---

## 十、像素风设计系统

### 10.1 双主题色板

**深色主题（Dark）— 默认**：

```
背景层级      void #0B0E14 → deep #141820 → surface #1E2430 → elevated #2A3242
边框          dim #2E3A4E → bright #4A5568
文字          primary #E8ECF1 → secondary #8B95A5 → dim #505A6A
强调色        green #4ADE80 · blue #60A5FA · amber #FBBF24 · red #F87171 · purple #A78BFA · cyan #22D3EE
Minecraft     stone #7F7F7F · dirt #8B6B4A · grass #5B8C3E · diamond #4AEDD9 · gold #FCDB05
```

★ **亮色主题（Light）— 暖羊皮纸风格**：

```
背景层级      void #F5F3EE → deep #EBE8E1 → surface #DEDBD4 → elevated #D1CEC7
边框          dim #C4C0B8 → bright #9E9A91
文字          primary #1A1612 → secondary #6B6560 → dim #A09A92
强调色        green #2D7A4F · blue #2563EB · amber #B8860B · red #DC2626 · purple #7C3AED · cyan #0891B2
Minecraft     stone #8C8C8C · dirt #7A5C3A · grass #4A7A2E · diamond #0E9384 · gold #C8A800
```

### 10.2 核心视觉规则

- **零圆角**：`* { border-radius: 0 !important; }`
- **2px 像素边框**：所有卡片、输入框、按钮
- **Beveled 阴影**：`raised`（凸起）和 `sunken`（凹陷），深/浅主题各有适配
- **4px 网格对齐**：间距、尺寸都是 4 的倍数
- **离散动画**：`pixel-pulse`（脉冲）/ `pixel-shake`（抖动）/ `pixel-blink`（闪烁）

### 10.3 主题切换 CSS 实现

```css
/* 亮色主题变量（默认） */
:root {
  --color-void: #F5F3EE;
  --color-deep: #EBE8E1;
  /* ... */
}

/* 深色主题变量 */
.dark {
  --color-void: #0B0E14;
  --color-deep: #141820;
  /* ... */
}

/* 系统偏好回退 */
@media (prefers-color-scheme: dark) {
  :root:not(.light) {
    --color-void: #0B0E14;
    --color-deep: #141820;
    /* ... */
  }
}

/* Tailwind 引用 CSS 变量 */
@theme {
  --color-void: var(--color-void);
  --color-deep: var(--color-deep);
  /* ... */
}
```

---

## 十一、Mock 清单

| 什么被 Mock 了 | 实现方式 | 说明 |
|----------------|---------|------|
| 8 个 Service | `Map<Id, Entity>` 内存存储 | CRUD + 模拟延迟 |
| 种子数据 | 集中在 `services/mock/data.ts` | 2 项目 · 5 Agent · 对话 · 4 任务 · 4 产出物 · 4 记忆 · ★ 7 活动条目 |
| Chat 流式响应 | `StreamingMessage` 组件 | `setInterval` + 随机 20-50ms 逐字显示 + 闪烁光标 |
| 助手回复 | `MockConversationService.sendMessage` | 发送消息后自动追加一条固定助手回复 |
| ★ Dashboard 汇总 | `MockDashboardService` | 从 seed data 实时计算统计 |
| 网络延迟 | `delay()` 函数 | 每个 Service 方法开头 `await delay()` |
| ★ 用户偏好持久化 | Zustand `persist` → localStorage | `solocraft-prefs` key，持久化 theme + sidebar |

**没有 Mock 的**（等后端阶段实现）：
- 真实 AI 模型调用（OpenAI / Anthropic / Google）
- Agent 任务执行引擎
- 数据持久化（SQLite）
- 文件系统操作（目录选择器、文件读写）
- 浏览器 / 桌面自动化
- 进程间通信（Electron IPC）
- 用户认证 / 登录

---

## 十二、工作流程图

### 12.1 应用启动流程

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
    │           ├── ★ Zustand persist rehydrate (theme, sidebar)
    │           │
    │           └── <HashRouter>
    │               │
    │               ├── / ──────────────── ProjectListPage
    │               ├── ★ /dashboard ───── DashboardPage
    │               ├── /settings ──────── GlobalSettingsPage
    │               └── /projects/:id ──── ProjectLayout → <AppShell> → <Outlet/>
```

### 12.2 主题切换流程（Phase 2 新增）

```
用户在 Settings → Appearance 点击主题选项
│
▼
ThemeSwitcher onClick → store.setTheme(mode)
│
├── 1. set({ themeMode: mode })          Zustand 更新状态
│
├── 2. applyThemeToDOM(mode)             更新 DOM
│      ├── 'light' → <html class="light">
│      ├── 'dark'  → <html class="dark">
│      └── 'system' → <html> (no class)
│
├── 3. persist 中间件自动写入 localStorage
│      └── localStorage['solocraft-prefs'] = { themeMode, sidebarCollapsed }
│
└── 4. CSS 变量生效 → 全部组件自动更新颜色
```

### 12.3 项目创建流程（Phase 2 增强）

```
用户在 ProjectListPage 点击 "+ New Project"
│
▼
ProjectCreateModal 打开
│
├── 用户输入 name → slugify(name) → 自动生成 workingDirectory
│      └── workingDirectory = settings.defaultWorkingDirectoryBase + '/' + slug
│
├── 用户可选：手动编辑路径（设置 customPath 标志，停止自动生成）
│
├── 用户选择 icon、填写 description
│
└── 点击 "Create Project"
    │
    ├── store.createProject({ name, description, icon, workingDirectory })
    │   └── svc.projects.create(data) → 返回 Project
    │
    └── navigate(`/projects/${newProject.id}`)
```

---

## 十三、测试覆盖

| 测试文件 | 测试数 | 覆盖内容 |
|---------|--------|---------|
| 13 × `components/base/*.test.tsx` | 125 | 全部基础组件的渲染、变体、交互、无障碍 |
| `stores/useAppStore.test.ts` | 24 | 初始状态、CRUD、竞态保护、★ theme、★ dashboard |
| `services/mock/services.test.ts` | 39 | 全部 8 个 Service 的 CRUD + projectId 隔离 + ★ dashboard |
| `hooks/hooks.test.ts` | 6 | 三层配置合并逻辑 |
| `app/App.test.tsx` | 1 | 根页面渲染 |
| ★ `pages/dashboard/DashboardPage.test.tsx` | 8 | Dashboard 渲染、统计、Agent/Task 列表、Tab 切换 |
| ★ `pages/project/ProjectCreateModal.test.tsx` | 11 | 创建表单、工作目录自动生成、图标选择 |
| ★ `pages/settings/GlobalSettingsPage.test.tsx` | 14 | 5 Tab 渲染、主题切换、Profile 编辑 |
| ★ `services/mock/dashboard-types.test.ts` | 5 | Dashboard 类型编译检查 |
| **合计** | **233** | |

---

## 十四、构建产物

```
pnpm build

@solocraft/shared  → TypeScript 编译 ✓
@solocraft/ui      → 475 modules → 34.93 KB CSS + 357.26 KB JS
@solocraft/desktop → 504 modules → renderer + main + preload (1,116.53 KB total)
```

**Phase 1 → Phase 2 增长**：

| 指标 | Phase 1 | Phase 2 | 增长 |
|------|---------|---------|------|
| 测试数 | 181 | 233 | +52（+29%） |
| CSS | 28.5 KB | 34.9 KB | +6.4 KB（双主题色板） |
| JS | 327.8 KB | 357.3 KB | +29.5 KB（Dashboard + Settings） |
| Service 接口 | 7 | 8 | +1（IDashboardService） |
| Store 行数 | 365 | 466 | +101（DashboardSlice + persist） |
| 页面数 | 10 | 11 | +1（DashboardPage） |
| 类型文件 | 7 | 8 | +1（dashboard.ts） |
| 测试文件 | 17 | 21 | +4 |

---

## 十五、Phase 2 变更清单

### 新增文件

| 文件 | 行数 | 说明 |
|------|------|------|
| `shared/types/dashboard.ts` | 53 | Dashboard 跨项目汇总类型 |
| `ui/pages/dashboard/DashboardPage.tsx` | 396 | 全局命令中心页面 |
| `ui/pages/dashboard/index.ts` | 3 | 导出 |
| `ui/pages/dashboard/DashboardPage.test.tsx` | 236 | Dashboard 测试 |
| `ui/pages/project/ProjectCreateModal.test.tsx` | 144 | 项目创建测试 |
| `ui/pages/settings/GlobalSettingsPage.test.tsx` | 104 | 设置页测试 |
| `ui/services/mock/dashboard-types.test.ts` | 80 | 类型检查测试 |

### 修改文件

| 文件 | 变更 |
|------|------|
| `shared/types/settings.ts` | 新增 `ThemeMode`、`UserProfile`，扩展 `GlobalSettings` |
| `shared/types/project.ts` | 新增 `workingDirectory` 字段 |
| `shared/types/index.ts` | 新增 `export * from './dashboard'` |
| `ui/services/interfaces.ts` | 新增 `IDashboardService`，更新 `IProjectService` 签名 |
| `ui/services/container.ts` | 容器新增 `dashboard` |
| `ui/services/mock/services.ts` | 新增 `MockDashboardService` |
| `ui/services/mock/data.ts` | 新增 `SEED_ACTIVITIES`，种子数据增加新字段 |
| `ui/services/mock/index.ts` | 工厂函数新增 dashboard |
| `ui/stores/useAppStore.ts` | 新增 `DashboardSlice` + `persist` 中间件 + `setTheme` |
| `ui/styles/global.css` | `@custom-variant dark` + Light/Dark 双主题 CSS 变量 |
| `ui/app/routes.tsx` | 新增 `/dashboard` 路由 |
| `ui/pages/index.tsx` | 导出 `DashboardPage` |
| `ui/pages/project/ProjectListPage.tsx` | 顶部新增 Dashboard/Settings 导航按钮 |
| `ui/pages/project/ProjectCreateModal.tsx` | 新增工作目录字段（自动生成 + 手动编辑） |
| `ui/pages/settings/GlobalSettingsPage.tsx` | 从 2 Tab 扩展为 5 Tab |
| `ui/components/layout/ProjectSidebar.tsx` | 项目切换器新增 Dashboard/Settings 入口 |

---

## 十六、后续阶段路线图

| 阶段 | 内容 | 涉及技术 |
|------|------|---------|
| **后端基础** | SQLite + Drizzle ORM 数据持久化 · HTTP Service 实现替换 Mock | better-sqlite3, Drizzle |
| **AI 集成** | Vercel AI SDK 接入 · 真实模型调用 · 流式响应 | @ai-sdk/openai, @ai-sdk/anthropic |
| **Agent 运行时** | child_process 进程隔离 · Task 执行引擎 · Agent 生命周期管理 | Node.js child_process |
| **Electron IPC** | main ↔ renderer 安全通信 · 文件系统访问 · 目录选择器 · nativeTheme | contextBridge, ipcMain/ipcRenderer |
| **浏览器自动化** | Playwright 网页操作 · 截图 · 数据采集 | Playwright |
| **用户认证** | 登录 / 注册 · API Key 加密存储 · 用户身份管理 | 待定 |
| **桌面自动化** | Nut.js 鼠标/键盘操控（远期） | Nut.js |
