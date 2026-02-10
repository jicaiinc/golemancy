# SoloCraft - 产品与技术讨论记录

## 一、产品定位

### 1.1 目标用户

以**微型团队**为核心，服务于以下典型用户画像：

- **Solo Founder** — 一人公司创始人，独立运营全流程
- **Content Creator** — 内容创作者，需要批量生产、分发、管理内容
- **Marketer** — 营销人员，需要自动化营销流程、数据分析、投放优化
- **Researcher** — 研究者，需要信息采集、整理、分析
- **跨境电商卖家** — 多平台运营、选品、客服、物流跟踪

> **共同特征**：团队极小（1-5 人），希望借助 AI Agent 以微薄个人力量撬动更大的杠杆效应。

### 1.2 产品形态

- **桌面客户端**（Electron），跨平台（macOS / Windows / Linux）
- **视觉风格**：Minecraft 风格 / 像素风（Pixel Art）

### 1.3 核心价值

> 为微型团队打造 AI Agent 操作系统——用像素风的直觉化界面，让每个人都能编排、管理、监控自己的 AI Agent 团队，以一人之力完成十人之事。

关键价值点：

1. **降低门槛** — 不需要编程背景，通过可视化界面编排 Agent 工作流
2. **杠杆放大** — 一个人通过 Agent 编排，覆盖内容创作、营销、研究、电商运营等多条业务线
3. **本地优先** — 数据存储在本地，隐私安全，离线可用（AI 调用除外）
4. **可扩展** — Agent 的 Skills、Tool Calls、Sub-Agent 均可自定义与扩展

## 二、技术架构概览

### 2.1 整体架构

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Electron Shell                               │
│                                                                      │
│  ┌────────────────────────┐    IPC Bridge     ┌───────────────────┐  │
│  │    Renderer Process    │◄══════════════════►│   Main Process    │  │
│  │       (UI Module)      │   (双向通信)        │  (Agent Host)     │  │
│  │                        │                    │                   │  │
│  │  ┌──────────────────┐  │                    │  ┌─────────────┐  │  │
│  │  │   Agent Panel    │──┼── 指令/状态同步 ──►│  │ Agent       │  │  │
│  │  │   (操控面板)      │  │                    │  │ Manager     │  │  │
│  │  ├──────────────────┤  │                    │  │             │  │  │
│  │  │   Task Monitor   │◄─┼── 实时状态推送 ────│  │  ┌────────┐ │  │  │
│  │  │   (任务监控)      │  │                    │  │  │Agent A │ │  │  │
│  │  ├──────────────────┤  │                    │  │  ├────────┤ │  │  │
│  │  │   Workflow Editor│  │                    │  │  │Agent B │ │  │  │
│  │  │   (工作流编排)    │  │                    │  │  ├────────┤ │  │  │
│  │  ├──────────────────┤  │                    │  │  │Agent C │ │  │  │
│  │  │   Settings       │  │                    │  │  └────────┘ │  │  │
│  │  │   (配置中心)      │  │                    │  └─────────────┘  │  │
│  │  └──────────────────┘  │                    │                   │  │
│  │                        │                    │  ┌─────────────┐  │  │
│  │  React + Vite          │                    │  │ Process     │  │  │
│  │  TypeScript             │                    │  │ Supervisor  │  │  │
│  │  Zustand               │                    │  │ (进程管理器) │  │  │
│  │  Tailwind CSS          │                    │  └──────┬──────┘  │  │
│  │  Framer Motion         │                    │         │         │  │
│  └────────────────────────┘                    │         ▼         │  │
│                                                │  ┌─────────────┐  │  │
│                                                │  │ Child       │  │  │
│                                                │  │ Processes   │  │  │
│                                                │  │             │  │  │
│                                                │  │ • Node.js   │  │  │
│                                                │  │   Runtime   │  │  │
│                                                │  │ • Python    │  │  │
│                                                │  │   Runtime   │  │  │
│                                                │  │ • Playwright│  │  │
│                                                │  │   Browser   │  │  │
│                                                │  └─────────────┘  │  │
│                                                └───────────────────┘  │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                      Data Layer (数据层)                        │  │
│  │  SQLite (Agent 配置 / 任务记录 / 工作流定义 / 执行日志)          │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

### 2.2 Agent 内部结构

```
┌─────────────────────────────────────┐
│             Agent                    │
│                                     │
│  ┌───────────┐   ┌───────────────┐  │
│  │  Skills   │   │  Tool Calls   │  │
│  │  (能力集)  │   │  (工具调用)    │  │
│  │           │   │               │  │
│  │ • 写文章   │   │ • Schema 定义  │  │
│  │ • 做研究   │   │ • 参数校验     │  │
│  │ • 发帖     │   │ • 执行逻辑     │  │
│  │ • 分析数据 │   │ • 结果返回     │  │
│  └───────────┘   └───────────────┘  │
│                                     │
│  ┌───────────────────────────────┐  │
│  │       Sub-Agent 调度          │  │
│  │                               │  │
│  │  Agent A ──► Agent B          │  │
│  │     │                         │  │
│  │     └──────► Agent C          │  │
│  │                               │  │
│  │  (Agent 可调用其他 Agent       │  │
│  │   实现复杂任务的分解与协作)     │  │
│  └───────────────────────────────┘  │
│                                     │
│  ┌───────────────────────────────┐  │
│  │       Runtime Sandbox         │  │
│  │                               │  │
│  │  • Node.js 代码执行            │  │
│  │  • Python 代码执行             │  │
│  │  • Playwright 浏览器操作       │  │
│  │  • Nut.js 桌面操作 (后续)      │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

### 2.3 UI ↔ Agent 通信机制

```
UI (Renderer)                         Agent (Main Process)
     │                                       │
     │──── 创建 Agent ──────────────────────►│
     │                                       │── 初始化 Agent 实例
     │◄─── Agent 就绪 ─────────────────────  │
     │                                       │
     │──── 下发任务 (Task) ────────────────►│
     │                                       │── 分解任务
     │                                       │── 调用 Tool Calls
     │                                       │── 调度 Sub-Agent
     │◄─── 状态更新 (streaming) ───────────  │
     │◄─── 中间结果 ──────────────────────   │
     │◄─── 任务完成 ──────────────────────   │
     │                                       │
     │──── 终止任务 ──────────────────────►│
     │                                       │── 清理资源
     │◄─── 确认终止 ──────────────────────   │
```

### 2.4 进程管理与生命周期

**核心原则**：主窗口关闭 → 所有后台进程一并退出，保证不残留。

```
Electron Main Process (主进程 / 守护者)
  │
  ├── Process Supervisor (进程管理器)
  │     │
  │     ├── 注册所有 child process (Node.js / Python / Playwright)
  │     ├── 心跳检测 (确保子进程存活)
  │     ├── 优雅退出 (SIGTERM → 等待 → SIGKILL)
  │     └── 崩溃恢复 (子进程异常退出后自动重启或通知用户)
  │
  ├── app.on('before-quit')
  │     └── 遍历所有注册进程 → 发送终止信号 → 等待退出
  │
  └── app.on('window-all-closed')
        └── 触发完整退出流程
```

**线程安全考虑**：

- Agent Runtime 运行在**独立子进程**中（非主进程线程），避免阻塞 UI
- 子进程间通过 **IPC / MessagePort** 通信，避免共享内存竞争
- 数据库操作通过**单一写入进程**（main process）序列化，避免 SQLite 并发写冲突
- 任务队列使用 **FIFO + 优先级** 调度，确保有序执行

## 三、技术栈清单

### 3.1 前端 / 渲染进程

| 分类 | 技术 | 备注 |
|------|------|------|
| 构建工具 | Vite (electron-vite) | 快速 HMR，Electron 适配 |
| UI 框架 | React + TypeScript | - |
| 状态管理 | Zustand | 轻量、灵活，适合 Agent 状态同步 |
| 样式方案 | Tailwind CSS | 实用优先的 CSS 框架 |
| 像素动画 | Framer Motion | 声明式动画库 |

### 3.2 桌面 / 主进程

| 分类 | 技术 | 备注 |
|------|------|------|
| 桌面框架 | Electron | 跨平台桌面应用 |
| 脚手架 | electron-vite | Vite 驱动的 Electron 开发体验 |
| 进程管理 | Node.js child_process / worker_threads | Agent 运行时隔离 |
| Node.js 运行时 | 内嵌于 Electron | Code Agent 执行环境 |
| Python 运行时 | 待确认方案 | Code Agent 执行环境 |

### 3.3 Agent / 自动化

| 分类 | 技术 | 备注 |
|------|------|------|
| AI Agent 编排 | Vercel AI SDK | AI 模型调用、流式响应、Tool Call |
| 浏览器自动化 | Playwright | 网页操作 |
| 桌面自动化 | Nut.js（后续） | 截图、鼠标、键盘操控 |

### 3.4 数据存储

| 分类 | 技术 | 备注 |
|------|------|------|
| 嵌入式数据库 | SQLite (better-sqlite3) | 零配置、单文件、嵌入式 |
| ORM | Drizzle ORM | TypeScript 类型安全，轻量 |
| 文件存储 | 本地文件系统 | Agent 产出物、日志、临时文件 |

**数据库存储内容**：

| 数据类型 | 说明 |
|----------|------|
| Agent 配置 | Agent 定义、Skills、Tool Call Schema |
| 任务记录 | 任务创建时间、状态、执行日志 |
| 工作流定义 | 编排好的 Agent 工作流 DAG |
| 执行日志 | Tool Call 调用记录、耗时、结果 |
| 用户配置 | API Keys、偏好设置 |

### 3.5 工程化

| 分类 | 技术 | 备注 |
|------|------|------|
| Monorepo 管理 | Turborepo | Vercel 生态，增量构建 |
| 测试框架 | Vitest | 与 Vite 深度集成 |
| 包管理 | pnpm (推荐) | workspace 原生支持，磁盘高效 |

## 四、模块划分

| 模块 | 职责 | 所在进程 |
|------|------|----------|
| **UI Module** | 像素风界面、Agent 操控面板、任务监控、工作流编辑器 | Renderer |
| **Agent Manager** | Agent 生命周期管理、创建/销毁/调度 | Main |
| **Agent Core** | 单个 Agent 的 Skills + Tool Calls + Sub-Agent 调度 | Main / Child Process |
| **Process Supervisor** | 子进程注册、心跳、优雅退出、崩溃恢复 | Main |
| **Runtime Sandbox** | Node.js / Python / Playwright 执行沙箱 | Child Process |
| **Data Layer** | SQLite 读写、ORM、数据迁移 | Main |
| **AI Orchestrator** | AI SDK 封装、模型调用、流式通信 | Main |

## 五、项目结构（初步设想）

```
SoloCraft.team/
├── _docs/                          # 文档与讨论记录
│   └── discussion.md
│
├── apps/
│   └── desktop/                    # Electron 桌面应用 (electron-vite)
│       ├── electron.vite.config.ts
│       ├── src/
│       │   ├── main/               # ── Electron 主进程 ──
│       │   │   ├── index.ts        # 入口，窗口管理
│       │   │   ├── ipc/            # IPC 通信处理器
│       │   │   ├── agent-manager/  # Agent 生命周期管理
│       │   │   ├── process/        # 进程管理器 (Supervisor)
│       │   │   └── database/       # 数据库初始化与迁移
│       │   │
│       │   ├── renderer/           # ── React UI (渲染进程) ──
│       │   │   ├── App.tsx
│       │   │   ├── components/     # 像素风 UI 组件
│       │   │   ├── pages/          # 页面
│       │   │   ├── stores/         # Zustand 状态管理
│       │   │   ├── hooks/          # React Hooks
│       │   │   └── styles/         # Tailwind + 像素风主题
│       │   │
│       │   └── preload/            # ── 预加载脚本 ──
│       │       └── index.ts        # 安全暴露 API 给渲染进程
│       │
│       └── resources/              # 像素风静态资源 (图标、字体、精灵图)
│
├── packages/
│   ├── agent-core/                 # Agent 核心逻辑
│   │   ├── src/
│   │   │   ├── agent.ts            # Agent 基类
│   │   │   ├── skills/             # Skill 定义与注册
│   │   │   ├── tools/              # Tool Call Schema 与执行
│   │   │   └── sub-agent/          # Sub-Agent 调度逻辑
│   │   └── package.json
│   │
│   ├── ai-orchestrator/            # AI 编排层
│   │   ├── src/
│   │   │   ├── providers/          # AI 模型 Provider (OpenAI, Claude, etc.)
│   │   │   ├── streaming/          # 流式响应处理
│   │   │   └── tool-registry/      # Tool Call 注册中心
│   │   └── package.json
│   │
│   ├── runtime-sandbox/            # 运行时沙箱
│   │   ├── src/
│   │   │   ├── node-runner/        # Node.js 代码执行
│   │   │   ├── python-runner/      # Python 代码执行
│   │   │   └── browser-runner/     # Playwright 浏览器自动化
│   │   └── package.json
│   │
│   ├── database/                   # 数据库层
│   │   ├── src/
│   │   │   ├── schema/             # Drizzle ORM Schema
│   │   │   ├── migrations/         # 数据库迁移
│   │   │   └── queries/            # 查询封装
│   │   └── package.json
│   │
│   ├── ui-components/              # 像素风 UI 组件库
│   │   ├── src/
│   │   │   ├── pixel-button/
│   │   │   ├── pixel-card/
│   │   │   ├── pixel-dialog/
│   │   │   └── ...
│   │   └── package.json
│   │
│   └── shared/                     # 共享类型与工具
│       ├── src/
│       │   ├── types/              # TypeScript 类型定义
│       │   ├── constants/          # 常量
│       │   └── utils/              # 通用工具函数
│       └── package.json
│
├── turbo.json                      # Turborepo 配置
├── pnpm-workspace.yaml             # pnpm workspace
├── package.json
├── tsconfig.json                   # 根 TypeScript 配置
└── .gitignore
```

## 六、待讨论事项

### 6.1 Python Runtime 内嵌方案

- **选项 A**：打包 Python 解释器（体积较大，~50MB+）
- **选项 B**：使用 pyodide（WASM 版 Python，但库支持有限）
- **选项 C**：检测系统已安装的 Python，按需调用（最轻量，但需用户预装）

### 6.2 后续规划

- Nut.js 桌面自动化集成时机
- Agent Marketplace（Agent 能力市场 / 插件系统）
- 多 Agent 协作通信协议设计
- 数据同步与云端方案（如果需要跨设备）
- Agent 执行的安全沙箱与权限控制
