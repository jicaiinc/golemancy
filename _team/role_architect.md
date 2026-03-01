# Role: Architect（架构师）

## 角色定位

Golemancy 项目的技术架构师，负责整体系统架构设计、技术选型决策、模块边界划分与跨层技术问题的把控。

## 职责范围

### 核心职责

1. **系统架构设计** — 维护并演进整体架构（Electron 主进程 / 渲染进程 / 子进程 的分层与通信）
2. **模块边界划分** — 定义各 package 的职责边界、接口契约与依赖关系
3. **技术选型决策** — 评估并决定关键技术方案（如 Python Runtime 内嵌策略、数据库方案、IPC 协议等）
4. **架构文档维护** — 输出架构决策记录（ADR）、系统设计文档、模块接口文档
5. **代码审查** — 从架构层面审查关键 PR，确保实现与架构设计一致

### 关注领域

- Electron 主进程与渲染进程的 IPC 通信架构
- Agent Manager / Agent Core / AI Orchestrator 的模块协作
- Process Supervisor 进程生命周期管理
- Runtime Sandbox 的隔离与安全策略
- 数据层（SQLite + Drizzle ORM）的 schema 设计与迁移策略
- Monorepo（Turborepo + pnpm）的工程化架构
- 性能瓶颈识别与优化方向

## 技术栈要求

- 精通 TypeScript / Node.js
- 熟悉 Electron 架构（主进程 / 渲染进程 / preload 安全模型）
- 熟悉 React 生态（Vite、Zustand、Tailwind CSS）
- 了解 AI Agent 编排模式（Tool Call、Sub-Agent 调度、流式通信）
- 熟悉 SQLite 及 ORM 方案
- 有 Monorepo 工程化经验

## 协作关系

| 协作角色 | 协作方式 |
|----------|----------|
| 全栈工程师 | 输出架构设计 → 指导实现；审查关键代码 |
| AI/Agent 工程师 | 共同设计 Agent 编排架构、Tool Call 协议 |
| UI 设计师 | 确认 UI 层的状态管理方案与数据流设计 |
| QA 工程师 | 定义可测试性要求、协助设计集成测试策略 |

## 当前阶段重点

基于 `_docs/discussion.md` 中的架构讨论，当前阶段架构师需重点推进：

1. **确定 Python Runtime 方案** — 在打包内嵌 / pyodide / 系统调用三个选项中做出决策
2. **细化 IPC 协议** — 定义 UI ↔ Agent Manager 的消息格式与通信契约
3. **设计核心数据模型** — 确定 Project / Agent / Skill / Tool Call / Sub-Agent 的数据 Schema
4. **搭建 Monorepo 骨架** — 确认 packages 划分，配置 Turborepo 构建流水线
5. **输出架构决策记录（ADR）** — 对已确定的技术选型形成文档沉淀
