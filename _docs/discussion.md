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

## 二、核心抽象模型

系统仅包含两个核心抽象：**Project** 和 **Agent**。不引入 Company、Team 等额外层级。

### 2.1 设计原则

- **极简** — 只做最少的抽象，避免过度设计
- **可组合** — 复杂能力通过 Agent 之间的组合涌现，而非依赖专用抽象

### 2.2 Project（项目 / 工作空间）

Project 是用户工作的顶层容器，等同于一个 Workspace。

- 一个用户可以创建多个 Project
- 所有 Agent、对话、记忆、产出物都归属于 Project
- Project 之间完全隔离

**Project 包含**：

- Agent（多个）
- 对话记录（Conversations）
- 项目级记忆（Memory）
- 产出物（Artifacts）
- 项目级配置（Provider 覆盖等）

### 2.3 Agent

Agent 是系统的核心执行单元。每个 Agent 可配置三种能力：

```
Agent
├── Tools      — 工具调用（API 调用、文件操作、浏览器操作等）
├── Skills     — 能力集（写文章、做研究、数据分析等）
└── Sub-Agents — 引用同 Project 内的其他 Agent
```

**关键设计**：Team 不是独立抽象，而是 Agent 组合的涌现模式。一个 Agent 挂载了多个 Sub-Agent，它天然就是一个 Team Leader。不需要额外的 Team 概念。

### 2.4 抽象层级总览

```
User
└── Project (Workspace)
    ├── Agent A (Main Loop / Team Leader)
    │   ├── Tools
    │   ├── Skills
    │   └── Sub-Agents → [Agent B, Agent C]
    ├── Agent B
    │   ├── Tools
    │   └── Skills
    ├── Agent C
    │   ├── Tools
    │   └── Skills
    ├── Conversations
    ├── Memory
    └── Artifacts
```

**明确不引入的抽象**：

- ~~Company~~ — 用户即公司，Project 已足够表达
- ~~Team~~ — 通过 Agent + Sub-Agent 组合实现，无需单独建模
- ~~Agent Template~~ — v1 不做跨 Project 复用，后续按需引入

### 2.5 配置层级

全局配置与项目配置采用分层覆盖：

```
全局 Settings（主题、默认 Provider、API Keys）
└── Project 级配置（可覆盖 Provider 等）
    └── Agent 级配置（可覆盖模型选择等）
```

层层继承，就近覆盖。

## 三、技术架构概览

### 3.1 整体架构

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

### 3.2 Agent 内部结构

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
│  │  (Agent 可调用同 Project 内    │  │
│  │   的其他 Agent，实现任务分解    │  │
│  │   与协作——即"隐式 Team"模式)   │  │
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

### 3.3 UI ↔ Agent Server 通信机制

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

### 3.4 进程管理与生命周期

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

## 四、技术栈清单

### 4.1 前端 / 渲染进程

| 分类 | 技术 | 备注 |
|------|------|------|
| 构建工具 | Vite (electron-vite) | 快速 HMR，Electron 适配 |
| UI 框架 | React + TypeScript | - |
| 状态管理 | Zustand | 轻量、灵活，适合 Agent 状态同步 |
| 样式方案 | Tailwind CSS | 实用优先的 CSS 框架 |
| 像素动画 | Framer Motion | 声明式动画库 |

### 4.2 桌面 / 主进程

| 分类 | 技术 | 备注 |
|------|------|------|
| 桌面框架 | Electron | 跨平台桌面应用 |
| 脚手架 | electron-vite | Vite 驱动的 Electron 开发体验 |
| 进程管理 | Node.js child_process / worker_threads | Agent 运行时隔离 |
| Node.js 运行时 | 内嵌于 Electron | Code Agent 执行环境 |
| Python 运行时 | 待确认方案 | Code Agent 执行环境 |

### 4.3 Agent / 自动化

| 分类 | 技术 | 备注 |
|------|------|------|
| AI Agent 编排 | Vercel AI SDK | AI 模型调用、流式响应、Tool Call |
| 浏览器自动化 | Playwright | 网页操作 |
| 桌面自动化 | Nut.js（后续） | 截图、鼠标、键盘操控 |

### 4.4 数据存储

| 分类 | 技术 | 备注 |
|------|------|------|
| 嵌入式数据库 | SQLite (better-sqlite3) | 零配置、单文件、嵌入式 |
| ORM | Drizzle ORM | TypeScript 类型安全，轻量 |
| 文件存储 | 本地文件系统 | Agent 产出物、日志、临时文件 |

**数据库存储内容**：

| 数据类型 | 说明 | 归属 |
|----------|------|------|
| Project | 项目定义、项目级配置 | 全局 |
| Agent 配置 | Agent 定义、Skills、Tool Call Schema、Sub-Agent 引用 | Project |
| 对话记录 | Session、消息历史 | Project |
| 项目记忆 | 项目级知识沉淀 | Project |
| 任务记录 | 任务创建时间、状态、执行日志 | Project |
| 执行日志 | Tool Call 调用记录、耗时、结果 | Project |
| 产出物 | Agent 生成的内容与文件 | Project |
| 用户配置 | API Keys、主题偏好等 | 全局 |

### 4.5 工程化

| 分类 | 技术 | 备注 |
|------|------|------|
| Monorepo 管理 | Turborepo | Vercel 生态，增量构建 |
| 测试框架 | Vitest | 与 Vite 深度集成 |
| 包管理 | pnpm (推荐) | workspace 原生支持，磁盘高效 |

## 五、业务模块划分

三个业务模块：**UI**（用户交互）、**Agent**（核心业务）、**Platform**（基础设施）。

### 5.1 模块总览

| 模块 | 职责 | 所在进程 |
|------|------|----------|
| **UI** | 用户看到的、操作的一切 | Renderer |
| **Agent** | Agent 本身的一切能力与执行 | Agent Server / Child Process |
| **Platform** | 支撑 UI 和 Agent 运行的底座 | Electron Main / Agent Server |

### 5.2 各模块包含项

**UI 模块**：

- 像素风组件库
- 聊天界面（Chat）
- Agent 操控面板
- 任务监控
- 设置页（API Key 配置界面）
- Project 管理（创建、切换、配置）
- 产出物（Artifact）浏览与导出
- Token 用量面板

**Agent 模块**：

- Agent 定义与生命周期
- Skills（能力注册）
- Tool Calls（Schema 定义 + 执行）
- Sub-Agent 调度（同 Project 内 Agent 间协作）
- Session 与对话管理（归属于 Project）
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
- Project 数据隔离与存储管理

### 5.3 目录结构

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

## 六、数据存储架构设计

### 6.1 核心决策：混合存储方案

不采用纯文件或纯数据库的单一方案，而是 **SQLite 做结构化索引 + 文件系统做内容存储** 的混合模式。这也是 VS Code、Obsidian、Cursor 等成熟桌面应用的通用做法。

### 6.2 存储分层

#### 文件系统层（适合的数据）

| 数据类型 | 理由 |
|---------|------|
| **Artifacts（代码/图片/PDF 等）** | 二进制文件、大文本天然适合文件系统；用户可能想用外部工具打开 |
| **项目配置** (`project.json`) | 人类可读、可版本控制（git）、可手动编辑 |
| **全局设置** (`settings.json`) | 同上，少量结构化数据 |
| **Skills 定义**（模板/prompt） | 本质是文本文件，方便用户导入/导出/分享 |
| **导出/备份包** | 整个项目打包为 zip/folder |

文件系统优势：
- 透明、可调试（用户能直接看到文件）
- 与操作系统生态集成（Finder/Explorer 直接打开）
- 天然支持大文件和二进制
- Git 友好，方便版本控制

#### SQLite 层（适合的数据）

| 数据类型 | 理由 |
|---------|------|
| **聊天消息（Conversations/Messages）** | 量大、需要分页查询、需要全文搜索 |
| **任务记录（Tasks/TaskLogs）** | 需要按状态筛选、排序、统计 |
| **Memory 条目** | 需要按 tag 搜索、模糊匹配 |
| **Artifact 元数据索引** | 文件本身在文件系统，但元数据（名称、类型、关联关系）在 DB |
| **Agent 配置** | 数量多、需要查询、有关联关系 |

SQLite 优势：
- ACID 事务保证一致性
- 复杂查询（筛选、排序、分页、聚合）
- 全文搜索（FTS5）对聊天记录/Memory 极有价值
- 单文件，依然便于备份和迁移

### 6.3 为什么不全用文件？

聊天消息如果存 JSON 文件，会遇到严重问题：

1. **一个对话几百条消息** → 每次追加都要读取整个文件、反序列化、修改、重新写入
2. **并发写入不安全** → 两个 Agent 同时往同一个文件写，数据会丢失
3. **搜索功能** → "找出包含关键词 X 的所有历史对话"，需要遍历所有 JSON 文件
4. **分页** → 无法高效实现"加载最近 50 条消息"

### 6.4 为什么不全用 SQLite？

1. **图片/PDF/代码文件**存入 BLOB → 数据库体积膨胀，备份缓慢
2. **用户无法直接用外部工具打开**数据库中的文件
3. **项目配置**放在 DB 里，用户想手动改个参数还得用 SQL 工具

### 6.5 推荐目录结构

```
~/.solocraft/                          # 或用 Electron app.getPath('userData')
├── settings.json                      # 全局设置
├── data.db                            # SQLite（所有结构化数据）
└── projects/
    └── {project-id}/
        ├── project.json               # 项目配置（人类可读）
        ├── artifacts/
        │   ├── {artifact-id}.py       # 生成的代码
        │   ├── {artifact-id}.png      # 生成的图片
        │   └── {artifact-id}.csv      # 生成的数据
        └── skills/
            └── {skill-name}.md        # Skill 定义文件
```

**关键设计：SQLite 是单个 `data.db` 文件**，不是每个项目一个 DB。原因：

- 跨项目查询更简单（搜索所有项目的消息）
- 单文件备份更方便
- `projectId` 字段已经做了数据隔离

### 6.6 混合存储的实现模式

以 Artifact 为例，元数据/内容分离对服务层完全透明：

```typescript
class SqliteArtifactService implements IArtifactService {
  // 创建：文件 + 元数据分开存储
  async create(projectId, data) {
    const id = generateId()
    // 1. 写文件到 artifacts/{id}.ext
    await fs.writeFile(artifactPath, data.content)
    // 2. 元数据插入 SQLite（包含 filePath）
    db.insert(artifacts).values({ id, projectId, filePath, type, ... })
    return artifact
  }

  // 查询：走 SQLite
  async list(projectId) {
    return db.select().from(artifacts).where(eq(projectId, ...))
  }
}
```

现有 `IXxxService` 接口无需变更，`configureServices()` 注入新实现即可。

### 6.7 设计原则总结

| 原则 | 说明 |
|-----|------|
| **配置 → JSON 文件** | 人类可读、可手编辑、可 git 跟踪 |
| **文件类资产 → 文件系统** | 代码、图片、PDF 等放磁盘，自然且高效 |
| **结构化数据 → SQLite** | 消息、任务、索引等需要查询和事务 |
| **元数据/内容分离** | DB 存索引和关联关系，文件系统存实际内容 |

## 七、待讨论事项

### 7.1 Python Runtime 内嵌方案

- **选项 A**：打包 Python 解释器（体积较大，~50MB+）
- **选项 B**：使用 pyodide（WASM 版 Python，但库支持有限）
- **选项 C**：检测系统已安装的 Python，按需调用（最轻量，但需用户预装）

### 7.2 后续规划

- Nut.js 桌面自动化集成时机
- Sub-Agent 调度协议细节（消息格式、上下文传递、结果回收）
- 数据同步与云端方案（如果需要跨设备）
- Agent 执行的安全沙箱与权限控制
- 跨 Project 复用 Agent（Agent Template 机制，按需引入）
