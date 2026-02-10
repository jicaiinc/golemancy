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

1. **降低门槛** — 不需要编程背景，通过可视化界面管理和操控 AI Agent
2. **杠杆放大** — 一个人通过 Agent 编排，覆盖内容创作、营销、研究、电商运营等多条业务线
3. **本地优先** — 数据存储在本地，隐私安全，离线可用（AI 调用除外）
4. **可扩展** — Agent 的 Skills、Tool Calls、Sub-Agent 均可自定义与扩展

## 二、技术架构概览

### 2.1 整体架构

```
┌──────────────────────────────────────────────────────────────────────────┐
│                            Electron Shell                                │
│                                                                          │
│  ┌──────────────────────┐          ┌──────────────────────────────────┐  │
│  │   Electron Main      │  fork()  │        Agent Server              │  │
│  │   (薄层)              │────────►│        (独立 Node.js 进程)        │  │
│  │                      │          │                                  │  │
│  │  • 创建窗口           │          │  HTTP API (:port)               │  │
│  │  • 启动 Agent Server  │          │  WebSocket (:port/ws)           │  │
│  │  • 传递端口号给 UI    │          │                                  │  │
│  │  • 进程生命周期管理    │          │  ┌────────────┐ ┌────────────┐  │  │
│  │  • 原生系统操作       │          │  │ Agent      │ │ Agent      │  │  │
│  └──────────┬───────────┘          │  │ Manager    │ │ Scheduler  │  │  │
│             │                      │  └────────────┘ └─────┬──────┘  │  │
│        IPC (仅用于)                │                       │         │  │
│        • 传递端口号                 │              fork()   │         │  │
│        • 文件对话框                 │                       ▼         │  │
│        • 系统通知                   │  ┌──────────────────────────┐  │  │
│        • 窗口管理                   │  │    Child Processes       │  │  │
│             │                      │  │                          │  │  │
│  ┌──────────▼───────────┐          │  │  • Agent A (Node.js)     │  │  │
│  │   Renderer Process   │          │  │  • Agent B (Node.js)     │  │  │
│  │   (UI)               │          │  │  • Python Runtime        │  │  │
│  │                      │  HTTP    │  │  • Playwright Browser    │  │  │
│  │  React + Vite        │─────────►│  └──────────────────────────┘  │  │
│  │  TypeScript          │  REST    │                                  │  │
│  │  Zustand             │◄─────────│  ┌──────────────────────────┐  │  │
│  │  Tailwind CSS        │ WebSocket│  │      Data Layer          │  │  │
│  │  Framer Motion       │◄─────────│  │      SQLite + Drizzle    │  │  │
│  │                      │  (推送)   │  └──────────────────────────┘  │  │
│  └──────────────────────┘          └──────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

**通信方式决策**：

| 通信路径 | 方式 | 用途 |
|----------|------|------|
| UI ↔ Agent Server | HTTP REST | Agent 管理、任务下发、配置读写 |
| Agent Server → UI | WebSocket | 实时状态推送、AI 流式输出 |
| UI ↔ Electron Main | Electron IPC | 仅系统级操作（传递端口号、文件对话框、窗口管理、系统通知） |
| Agent Server → Child Process | child_process.fork() | Agent 执行隔离，每个 Agent 独立进程 |

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

### 2.3 UI ↔ Agent Server 通信机制

```
UI (Renderer)                              Agent Server (独立进程)
     │                                            │
     │── POST /api/agents ───────────────────────►│
     │                                            │── 创建 Agent 实例
     │◄── HTTP 201 { agentId } ──────────────────│
     │                                            │
     │── POST /api/tasks ───────────────────────►│
     │                                            │── fork 子进程执行
     │◄── HTTP 201 { taskId } ──────────────────│
     │                                            │
     │── WebSocket subscribe(task:{taskId}) ────►│
     │                                            │── Agent 开始执行
     │◄── WS event: task:stream { delta } ──────│   (AI 流式输出)
     │◄── WS event: task:log { tool_call } ─────│   (Tool Call 日志)
     │◄── WS event: task:completed { result } ──│   (任务完成)
     │                                            │
     │── POST /api/tasks/:id/cancel ────────────►│
     │                                            │── 终止子进程、清理资源
     │◄── HTTP 200 ────────────────────────────  │
```

### 2.4 进程管理与生命周期

**核心原则**：主窗口关闭 → 所有后台进程一并退出，保证不残留。

```
Electron Main Process (守护者)
  │
  ├── fork() ──► Agent Server 进程
  │                  │
  │                  ├── fork() ──► Agent A 子进程
  │                  ├── fork() ──► Agent B 子进程
  │                  ├── fork() ──► Python Runtime
  │                  └── fork() ──► Playwright Browser
  │
  ├── app.on('before-quit')
  │     └── 通知 Agent Server 关闭 → Server 清理所有子进程 → 退出
  │
  └── app.on('window-all-closed')
        └── 触发完整退出流程
```

**并发模型**：

- 每个 Agent 任务在**独立子进程**（child_process.fork）中执行，互不影响
- Agent Server 内置调度器，管理并发上限（如最多同时运行 N 个 Agent）
- 数据库操作通过 **Agent Server 单进程**序列化写入，避免 SQLite 并发写冲突

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
| 执行日志 | Tool Call 调用记录、耗时、结果 |
| 用户配置 | API Keys、偏好设置 |

### 3.5 工程化

| 分类 | 技术 | 备注 |
|------|------|------|
| Monorepo 管理 | Turborepo | Vercel 生态，增量构建 |
| 测试框架 | Vitest | 与 Vite 深度集成 |
| 包管理 | pnpm (推荐) | workspace 原生支持，磁盘高效 |

## 四、业务模块划分

三个业务模块：**UI**（用户交互）、**Agent**（核心业务）、**Platform**（基础设施）。

### 4.1 模块总览

| 模块 | 职责 | 所在进程 |
|------|------|----------|
| **UI** | 用户看到的、操作的一切 | Renderer |
| **Agent** | Agent 本身的一切能力与执行 | Agent Server / Child Process |
| **Platform** | 支撑 UI 和 Agent 运行的底座 | Electron Main / Agent Server |

### 4.2 各模块包含项

**UI 模块**：

- 像素风组件库
- 聊天界面（Chat）
- Agent 操控面板
- 任务监控
- 设置页（API Key 配置界面）
- 产出物（Artifact）浏览与导出
- Token 用量面板

**Agent 模块**：

- Agent 定义与生命周期
- Skills（能力注册）
- Tool Calls（Schema 定义 + 执行）
- Sub-Agent 调度
- Session 与对话管理
- AI 上下文管理（截断、摘要）
- AI Provider 与模型调用与流式响应
- API Key 校验与加密
- Token 用量记录
- Task 创建、执行、状态管理
- Artifact 定义与关联
- Runtime 沙箱（Node.js / Python / Playwright）

**Platform 模块**：

- Electron 外壳（窗口管理、fork Server、IPC 桥接）
- HTTP Server + WebSocket
- 数据库（Schema、存储、迁移）
- 进程管理（调度、并发控制、生命周期）

### 4.3 目录结构

```
SoloCraft.team/
├── _docs/                      # 文档与讨论记录
├── apps/
│   └── desktop/                # Electron 外壳（Platform 的入口）
│       ├── main/               # 窗口管理、fork server、IPC 桥接
│       ├── renderer/           # 挂载 UI 模块的入口
│       └── preload/
├── packages/
│   ├── ui/                     # UI 模块
│   ├── agent/                  # Agent 模块
│   └── platform/               # Platform 模块
└── turbo.json
```

## 五、待讨论事项

### 5.1 Python Runtime 内嵌方案

- **选项 A**：打包 Python 解释器（体积较大，~50MB+）
- **选项 B**：使用 pyodide（WASM 版 Python，但库支持有限）
- **选项 C**：检测系统已安装的 Python，按需调用（最轻量，但需用户预装）

### 5.2 后续规划

- Nut.js 桌面自动化集成时机
- 多 Agent 协作通信协议设计
- 数据同步与云端方案（如果需要跨设备）
- Agent 执行的安全沙箱与权限控制
