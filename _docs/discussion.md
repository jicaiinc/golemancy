# SoloCraft - 产品与技术讨论记录

## 一、产品定位

1. **目标用户**：一人公司、小团队，以及未来面向 AI Agent 编排的小型团队
2. **产品形态**：桌面客户端（Electron）
3. **视觉风格**：Minecraft 风格 / 像素风（Pixel Art）
4. **核心价值**：AI Agent 管理与编排平台，通过友好的 UI 操作 Agent 执行各种动作

## 二、技术架构概览

### 2.1 整体架构

```
┌─────────────────────────────────────────────────┐
│                  Electron Shell                  │
├──────────────────┬──────────────────────────────┤
│   Renderer       │        Main Process          │
│   (UI Module)    │     (Agent Runtime Module)    │
│                  │                              │
│  React + Vite    │  Code Agent (Node.js Runtime)│
│  TypeScript      │  Code Agent (Python Runtime) │
│  Zustand         │  AI Agent 编排 (AI SDK)       │
│  Tailwind CSS    │  Playwright (浏览器自动化)     │
│  Framer Motion   │  Nut.js (桌面自动化，后续)     │
└──────────────────┴──────────────────────────────┘
```

### 2.2 模块划分

| 模块 | 职责 | 关键技术 |
|------|------|----------|
| **UI 模块** | 渲染层，像素风界面与交互 | React, Vite, Tailwind CSS, Framer Motion |
| **Agent Runtime 模块** | 主进程，Agent 生命周期管理 | Electron Main Process, Node.js |
| **Code Agent** | 代码执行能力 | Node.js Runtime, Python Runtime（内嵌于 Electron） |
| **AI 编排层** | AI Agent 调度与编排 | Vercel AI SDK |
| **浏览器自动化** | 网页操作与数据采集 | Playwright |
| **桌面自动化**（后续） | 桌面应用操控、截图、鼠标键盘 | Nut.js |

## 三、技术栈清单

### 3.1 前端 / 渲染进程

| 分类 | 技术 | 备注 |
|------|------|------|
| 构建工具 | Vite (electron-vite) | 快速 HMR，Electron 适配 |
| UI 框架 | React + TypeScript | - |
| 状态管理 | Zustand | 轻量、灵活 |
| 样式方案 | Tailwind CSS | 实用优先的 CSS 框架 |
| 像素动画 | Framer Motion | 声明式动画库 |

### 3.2 桌面 / 主进程

| 分类 | 技术 | 备注 |
|------|------|------|
| 桌面框架 | Electron | 跨平台桌面应用 |
| 脚手架 | electron-vite | Vite 驱动的 Electron 开发体验 |
| Node.js 运行时 | 内嵌于 Electron | Code Agent 执行环境 |
| Python 运行时 | 内嵌于 Electron（待确认方案） | Code Agent 执行环境 |

### 3.3 Agent / 自动化

| 分类 | 技术 | 备注 |
|------|------|------|
| AI Agent 编排 | Vercel AI SDK | AI 模型调用与流式响应 |
| 浏览器自动化 | Playwright | 网页操作 |
| 桌面自动化 | Nut.js（后续） | 截图、鼠标、键盘操控 |

### 3.4 工程化

| 分类 | 技术 | 备注 |
|------|------|------|
| Monorepo 管理 | Turborepo | Vercel 生态，增量构建 |
| 测试框架 | Vitest | 与 Vite 深度集成 |
| 数据库 | **待讨论** | 见下方讨论 |

## 四、待讨论事项

### 4.1 数据库选型

桌面客户端场景下的候选方案：

| 方案 | 特点 | 适用场景 |
|------|------|----------|
| **SQLite** (via better-sqlite3) | 嵌入式、零配置、单文件 | Agent 配置、任务记录、本地持久化 |
| **LevelDB / RocksDB** | KV 存储、高性能写入 | 简单键值数据、缓存 |
| **PouchDB / RxDB** | 响应式、支持同步 | 需要数据同步场景 |
| **Drizzle ORM + SQLite** | 类型安全 ORM + SQLite | TypeScript 项目首选 |

> **初步建议**：SQLite（通过 better-sqlite3 或 Drizzle ORM）最适合 Electron 桌面客户端场景——零配置、嵌入式、性能好、生态成熟。

### 4.2 Python Runtime 内嵌方案

- 选项 A：打包 Python 解释器（体积较大）
- 选项 B：使用 pyodide（WASM 版 Python，浏览器/Node.js 均可运行）
- 选项 C：检测系统已安装的 Python，按需调用

### 4.3 后续规划

- Nut.js 桌面自动化集成时机
- 多 Agent 协作与通信协议设计
- 插件 / 扩展系统架构
- 数据同步与云端方案（如果需要）

## 五、项目结构（初步设想）

```
SoloCraft.team/
├── _docs/                    # 文档与讨论记录
├── apps/
│   └── desktop/              # Electron 桌面应用
│       ├── src/
│       │   ├── main/         # Electron 主进程
│       │   ├── renderer/     # React UI（渲染进程）
│       │   └── preload/      # 预加载脚本
│       └── ...
├── packages/
│   ├── agent-runtime/        # Agent 运行时核心
│   ├── ai-orchestrator/      # AI 编排层
│   ├── browser-automation/   # Playwright 浏览器自动化
│   ├── ui-components/        # 像素风 UI 组件库
│   └── shared/               # 共享类型与工具
├── turbo.json                # Turborepo 配置
├── package.json
└── ...
```
