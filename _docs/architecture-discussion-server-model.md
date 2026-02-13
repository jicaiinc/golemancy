# 架构讨论：单一 Server vs 多 Server 模型

> **日期**：2026-02-11
> **参与角色**：Team Lead、架构师、需求分析师、抽象策略师
> **讨论性质**：纯架构讨论，不涉及代码改动

---

## 一、问题定义

### 背景

Golemancy 当前采用**单一 agent server** 架构：Electron 主进程 fork 一个 server 子进程，所有项目共享这一个 server 实例。

#### 当前数据存储拓扑

```
~/.golemancy/
├── data.db                          ← 共享 SQLite（conversations, messages, task_logs）
├── settings.json                    ← 全局设置
└── projects/
    └── {projectId}/                 ← 项目隔离目录
        ├── project.json
        ├── agents/{agentId}.json
        ├── tasks/{taskId}.json
        ├── artifacts/
        ├── memory/{memoryId}.json
        └── cronjobs/{cronJobId}.json
```

#### 当前进程模型

```
Electron Main Process
  └── fork() → Agent Server (单进程)
                ├── Hono HTTP API (127.0.0.1:PORT)
                ├── SQLite DB (WAL mode, 单文件)
                ├── AI Agent Runtime (streamText)
                └── Cron Job Scheduler
```

### 核心问题

> 是否应该为每个项目启动独立的 server 进程？还是维持当前的单一 server？或者有更合理的方案？

---

## 二、架构师分析

### 方案 A：单一共享 Server（当前方案）

| 维度 | 分析 |
|------|------|
| **进程模型** | 一个 fork，一个端口，一个 token。Electron 生命周期管理简单（启动/关闭只需处理一个子进程） |
| **数据隔离** | 逻辑隔离 — SQLite 通过 `project_id` 列过滤。文件系统通过目录结构物理隔离。已有 `validateId()` 防注入和路径遍历保护 |
| **AI Agent 运行时** | 所有项目的 Agent 共享同一 Node.js 事件循环。由于 AI 调用是网络 IO 密集型，Node.js 的异步模型天然适合。不存在 CPU 密集型竞争 |
| **跨项目功能** | ✅ 天然支持 — Dashboard 聚合、全局消息搜索（FTS5）、全局统计，都可直接查询共享 DB |
| **可维护性** | 开发简单、调试容易 — 只有一个进程需要关注。日志集中，断点调试直观 |
| **扩展性** | 对于桌面应用的典型规模（10-50 个项目，同时活跃 1-2 个）完全足够 |

**优势**：
1. 架构简单，当前代码已经实现且运行良好
2. 跨项目查询零成本
3. 资源占用低（一个 Node.js 进程 ~50-80MB）
4. 单一 SQLite WAL 模式性能优秀

**劣势**：
1. Agent 运行时无进程级隔离 — 理论上一个 Agent 的未捕获异常可能 crash 整个 server
2. 共享 DB 使项目数据生命周期耦合 — 删除项目需要手动清理 DB 中的 conversations/messages
3. 单 DB 文件不利于项目数据的独立导出/迁移

### 方案 B：每项目独立 Server

| 维度 | 分析 |
|------|------|
| **进程模型** | N 个项目 = N 个 fork。每个进程有独立端口和 auth token。Electron 需要维护进程池 |
| **数据隔离** | 物理隔离 — 每个项目有独立的 SQLite 数据库，完全不共享 |
| **AI Agent 运行时** | 完全进程隔离 — 一个项目的 Agent crash 不影响其他项目 |
| **跨项目功能** | ❌ 极其困难 — Dashboard 聚合需要逐个查询每个 server；全局搜索需要分布式查询 |
| **可维护性** | 复杂度显著增加 — 进程管理、健康检查、端口分配、多 IPC 通道 |
| **扩展性** | 每个进程 ~50-80MB，10 个项目就 ~500-800MB 内存 |

**优势**：
1. 完美的进程级隔离
2. 项目数据生命周期完全独立 — 删除项目只需 kill 进程 + rm 目录
3. 理论上可独立扩展（不同项目不同资源）

**劣势**：
1. **内存开销巨大** — 桌面应用不应吃掉用户 GB 级内存
2. **跨项目功能几乎不可能** — 与产品需求（Dashboard、全局搜索）直接冲突
3. **开发复杂度翻倍** — 进程池管理、端口分配、IPC 多路复用
4. **Cron Jobs 问题** — 未打开的项目的 server 不运行，定时任务无法执行
5. **UI 层需要大改** — HttpService 需要知道每个项目的 server 地址，项目切换需要切换连接
6. **对于桌面应用来说是严重过度设计**

### 方案 C：单一 Server + Per-Project SQLite（混合方案）

| 维度 | 分析 |
|------|------|
| **进程模型** | 仍然只有一个 server 进程（与方案 A 相同） |
| **数据隔离** | 每个项目有独立的 SQLite 数据库文件 `projects/{projectId}/data.db`，但由同一个 server 进程管理 |
| **AI Agent 运行时** | 同方案 A（共享事件循环） |
| **跨项目功能** | ⚠️ 可行但需额外工作 — 需要遍历所有项目 DB 或维护一个轻量级索引 DB |
| **可维护性** | 中等 — 需要管理多个 DB 连接，但进程模型不变 |
| **扩展性** | 与方案 A 相同 |

**优势**：
1. 项目数据完全独立 — 删除项目 = rm 整个目录（含 DB）
2. 导出/迁移项目只需打包整个目录
3. 不增加进程复杂度

**劣势**：
1. 跨项目查询变复杂（需要 ATTACH DATABASE 或应用层聚合）
2. 多 DB 连接管理（open/close/pool）
3. 当前代码需要较大重构（所有 SQLite 存储类需要变成多 DB 感知）
4. FTS5 搜索无法跨 DB 运行

### 架构师推荐

**推荐方案 A（维持当前单一 Server）**，理由：

1. **场景匹配** — 桌面应用、单用户、1-2 个活跃项目，完全不需要进程级隔离
2. **AI 调用特性** — AI Agent 执行主要是网络 IO（等待 API 响应），Node.js 异步模型天然高效，不存在 CPU 竞争
3. **跨项目需求真实存在** — Dashboard、全局搜索是已设计的功能，方案 B/C 都会增加其实现难度
4. **Electron 约束** — 桌面应用应尽量精简进程数量，减少内存占用
5. **当前实现成熟** — 已有完善的 projectId 隔离、ID 验证、路径遍历保护

**同时建议的改进**（不改变架构，局部优化）：
- Agent 运行时增加 try-catch 边界和超时机制，防止单个 Agent 执行失败影响 server
- 项目删除时增加 DB 清理逻辑（级联删除已通过外键实现，但需确保覆盖 task_logs）
- 未来如确实需要导出/迁移项目，可实现 export 功能将相关 DB 数据 + 文件目录打包

---

## 三、需求分析师分析

### 用户场景评估

| 场景 | 频率 | 对架构的影响 |
|------|------|------|
| 单项目深度使用 | 最常见 | 无影响，任何方案都支持 |
| 多项目切换 | 较常见 | 共享 server 切换成本为零（只是换 projectId）；多 server 需要切换连接 |
| 并发 Agent 执行 | 偶尔 | 共享 server 更高效（一个事件循环处理多个并发 IO）；多 server 资源浪费 |
| Cron Jobs 跨项目同时触发 | 设计中 | 共享 server 天然支持；多 server 需要所有项目的 server 都启动 |
| 跨项目 Dashboard | 已设计 | 共享 DB 直接查询；多 server/多 DB 需要聚合层 |
| 项目导出/迁移 | 少见 | 多 DB 有天然优势；共享 DB 需要额外 export 逻辑 |
| 项目删除 | 少见 | 当前已通过外键级联删除 conversations→messages |

### 跨项目功能需求

1. **全局 Dashboard** — **需要**。用户打开应用后的首页需要展示所有项目的汇总统计。这要求能跨项目查询
2. **全局搜索** — **很可能需要**。用户可能想搜索"我之前在哪个项目里讨论过 X"
3. **Agent 模板复用** — 当前设计不支持跨项目 Agent，但用户可能需要"从项目 A 复制 Agent 到项目 B"。这不影响 server 架构，是纯应用逻辑

### 故障隔离需求

对于桌面应用，需求分析师认为**故障隔离需求较弱**：

1. **用户预期** — 桌面用户习惯于"整个应用要么工作，要么不工作"。不会期望"项目 A 的 Agent 崩了，但项目 B 不受影响"
2. **类比参考** — VS Code 的 Extension Host 是单进程服务所有工作区；Figma 是单进程处理所有文件
3. **正确的隔离粒度** — 应该是"Agent 执行的错误处理"，而非"进程级隔离"。一个 Agent 的 API 调用超时不应该 crash server，正确的做法是 try-catch + timeout

### 用户感知分析

| 维度 | 单一 Server | 多 Server |
|------|------------|-----------|
| 启动速度 | 快（1 个 fork） | 慢（N 个 fork） |
| 内存占用 | 低（~80MB） | 高（N × 80MB） |
| 电池消耗 | 低 | 高（多进程切换开销） |
| 项目切换 | 即时（换 projectId） | 需要等待 server 启动 |
| 状态栏 | 简单（1 个 server 状态） | 复杂（N 个状态） |

### 需求分析师建议

**强烈建议维持单一 Server**，原因：

1. **产品定位决定** — Golemancy 是"个人开发者的 AI Agent 编排工具"，强调简洁和趣味性。多 server 的复杂性违背产品调性
2. **用户场景决定** — 绝大多数使用场景不需要项目级进程隔离
3. **跨项目功能决定** — Dashboard 和全局搜索是核心功能需求，多 server 架构会让这些功能变得极其困难
4. **桌面应用约束** — 用户对内存和电池消耗敏感

**需要注意的产品方向**：
- 如果未来走向"云端同步"或"团队协作"，架构可能需要调整。但那时的变化不是"多 server"，而是"server 上云"，与本地多 server 是完全不同的方向
- 如果未来需要项目数据可移植（导出/导入），可以在单 server 架构上增加 export/import 功能

---

## 四、抽象策略师审查

### 审查报告

#### 1. 接口抽象兼容性 — PASS ✅

当前 9 个 service 接口都以 `projectId` 作为第一个参数：

```typescript
// 示例：IConversationService
list(projectId: ProjectId, agentId?: AgentId): Promise<Conversation[]>
getById(projectId: ProjectId, id: ConversationId): Promise<Conversation | null>
create(projectId: ProjectId, agentId: AgentId, title: string): Promise<Conversation>
```

这意味着接口本身**不关心底层是一个 server 还是多个 server**。无论数据存在共享 DB 还是 per-project DB，接口签名都不需要变化。

**结论**：接口设计正确，已经为任何存储拓扑做好了准备。

#### 2. 存储分离策略 — PASS（附注意事项）✅⚠️

当前的分离策略：
- **SQLite**：conversations, messages, task_logs — 高频查询、需要索引和 FTS
- **文件系统**：projects, agents, tasks, artifacts, memory, cronjobs, settings — 低频读写、人类可读

**审查结论**：分离策略合理。

**注意事项**：
- 共享 DB 中的 `task_logs` 表通过 `task_id` 关联到文件系统中的 task 文件。如果项目被删除时只删了文件目录但没清理 `task_logs`，会产生孤儿数据。**建议**：项目删除时增加 DB 清理步骤
- 如果未来考虑迁移到 per-project DB，当前接口不需要变化，只需替换 storage 实现类。DI 设计支持这种替换

#### 3. 依赖方向 — PASS ✅

```
desktop → ui → shared ← server
```

- 多 server 方案会要求 desktop 管理进程池，但**不改变依赖方向**（desktop 仍然只依赖 ui 和 shared）
- 单一 server 方案完全不影响依赖链

**当前设计的健壮性**：即使未来改变 server 拓扑，依赖方向也不需要变化，因为变化被隔离在 desktop 的 `startServer()` 和 ui 的 `HttpService` 实现中。

#### 4. 职责分离 — CONCERN ⚠️

当前 server 进程同时承担三个职责：

```
Agent Server 进程
├── HTTP API 服务 (Hono routes)
├── AI Agent 运行时 (streamText, tool calls, sub-agent orchestration)
└── Cron Job 调度器 (定时触发 agent 执行)
```

**关注点**：
- HTTP API 是稳定的请求-响应模式
- AI Agent 运行时涉及长时间运行的流式调用，可能超时或失败
- Cron Job 调度需要持续运行的定时器

这三个职责的稳定性要求不同。**但**，将它们分到不同进程的收益不大（都是 IO 密集，Node.js 事件循环能很好地处理）。

**建议**：不分进程，但在代码层面加强隔离：
- Agent 运行时应有独立的错误边界（try-catch + AbortController + timeout）
- Cron Job 调度器应有独立的错误处理（不应因一个 cron 执行失败而影响其他 cron）
- HTTP API 层的全局错误处理器已经存在（`app.onError`），是正确的

#### 5. DI 容器设计 — PASS ✅

`ServerDependencies` 接口是纯粹的依赖声明，不关心实现细节：

```typescript
interface ServerDependencies {
  projectStorage: IProjectService
  agentStorage: IAgentService
  conversationStorage: IConversationService
  // ...
}
```

无论底层是 File/SQLite/Memory 实现，DI 容器都不需要变化。如果未来需要切换存储实现（如 per-project DB），只需在 `index.ts` 中替换构造逻辑。

#### 6. UI 层适配 — PASS（单一 Server 前提下）✅

UI 的 `HttpService` 通过 `getServerUrl()` 获取 server 地址，所有请求发往同一个 endpoint：

```typescript
// UI 只需知道一个 server 地址
const serverUrl = getServerUrl() // http://127.0.0.1:{port}
```

在单一 server 架构下，UI 层完全不需要变化。如果改为多 server，UI 层需要一个路由层来根据 projectId 选择正确的 server 地址 — 这是**额外复杂度**。

### 抽象策略师总结

| 审查项 | 评价 | 说明 |
|--------|------|------|
| 接口抽象兼容性 | PASS ✅ | 接口设计 server-topology-agnostic |
| 存储分离策略 | PASS ⚠️ | 策略合理，需注意项目删除时的 DB 清理 |
| 依赖方向 | PASS ✅ | 单向依赖不受 server 拓扑影响 |
| 职责分离 | CONCERN ⚠️ | 代码层面需加强 Agent runtime 和 Cron 的错误边界 |
| DI 容器设计 | PASS ✅ | 纯依赖声明，实现可替换 |
| UI 层适配 | PASS ✅ | 单一 server 下无需改动 |

---

## 五、分歧与共识

### 三方共识

| 结论 | 架构师 | 需求分析师 | 抽象策略师 |
|------|--------|-----------|-----------|
| **维持单一 Server** | ✅ 推荐 | ✅ 强烈推荐 | ✅ 支持 |
| **多 Server 过度设计** | ✅ 明确反对 | ✅ 明确反对 | ✅ 增加不必要复杂度 |
| **加强 Agent 运行时错误边界** | ✅ 建议 | ✅ 需要 | ✅ CONCERN |
| **项目删除需清理 DB** | ✅ 提及 | — | ✅ CONCERN |

### 分歧点

**关于 per-project SQLite（方案 C）**：

- **架构师**：承认方案 C 在数据生命周期上有优势，但认为跨项目查询的额外复杂度不值得。不推荐
- **需求分析师**：认为跨项目功能（Dashboard、全局搜索）是核心需求，per-project DB 会严重影响这些功能。反对
- **抽象策略师**：指出接口层不受影响，如果未来确实需要可以平滑迁移。中立，但不建议现在做

**结论**：三方同意**暂不采用 per-project SQLite**，但确认了一个重要事实 — 当前的接口抽象设计是正确的，未来如果需要切换存储拓扑，只需替换实现层，不需要改接口。

---

## 六、最终建议

### 决策：维持单一 Server 架构

**理由汇总**：

1. **桌面应用定位** — 不是云服务，不需要多租户隔离。用户是单人使用，项目间不需要进程级隔离
2. **AI 调用特性** — Agent 执行是网络 IO 密集型，Node.js 异步模型天然高效，一个事件循环足够处理多项目并发
3. **跨项目功能** — Dashboard 和全局搜索是核心产品需求，共享 DB 是最简单高效的实现方式
4. **资源效率** — 桌面用户对内存和电池敏感，多 server 的 N × 80MB 内存开销不可接受
5. **开发成本** — 当前代码已实现且运行良好，无需投入大量开发资源重构
6. **抽象设计支撑** — 接口层是 server-topology-agnostic 的，未来如果确实需要改变，可以只替换实现层

### 需要做的改进（在当前架构基础上）

1. **Agent 运行时错误边界**（优先级高）
   - 每个 Agent 执行应被 try-catch 包裹
   - 添加 AbortController + 超时机制
   - 一个 Agent 的失败不应影响其他 Agent 或 server 稳定性

2. **项目删除 DB 清理**（优先级中）
   - 删除项目时，需要同步清理 SQLite 中该项目的 conversations、messages、task_logs
   - conversations → messages 已有外键级联删除
   - task_logs 需要额外清理逻辑

3. **Cron Job 错误隔离**（优先级中）
   - Cron 触发的 Agent 执行应独立处理错误
   - 一个 cron job 的失败不应影响其他 cron job

4. **项目导出功能**（优先级低，未来）
   - 如果用户需要导出/迁移项目，实现 export 逻辑：打包文件目录 + 提取 DB 中的相关数据
   - 这是应用层功能，不需要改变架构

### 对现有代码的影响

**无架构变更**。以下是局部改进点：

| 文件 | 改进 |
|------|------|
| `packages/server/src/agent/` | 添加错误边界和超时机制 |
| `packages/server/src/storage/projects.ts` | `delete()` 方法中增加 DB 清理 |
| `packages/server/src/storage/conversations.ts` | 添加 `deleteByProject(projectId)` 方法 |
| `packages/server/src/storage/tasks.ts` | 添加 `deleteLogsByProject(projectId)` 方法 |

---

## 七、类比参考

| 应用 | 架构 | 说明 |
|------|------|------|
| VS Code | 单 Extension Host 进程 | 所有工作区共享，与 Golemancy 场景类似 |
| Figma (Desktop) | 单进程 | 所有文件在一个进程中编辑 |
| Obsidian | 单进程 | 多 vault 通过目录隔离，进程共享 |
| Claude Code (Anthropic) | 单进程 | 一个 CLI 进程处理一个会话 |
| Cursor | 单 Extension Host | 基于 VS Code，单进程模型 |

所有主流桌面应用都采用单进程（或少量进程）模型，没有"每项目独立 server"的设计。

---

## 八、结论

**单一 Server 是正确的选择**。这不是偷懒或妥协，而是对桌面应用场景的合理判断。多 Server 模型适用于云服务的多租户隔离，不适用于个人桌面工具。

当前需要关注的不是"是否拆分 server"，而是"如何在单 server 内做好错误隔离和数据生命周期管理"。这些都是代码层面的改进，不需要架构级变更。
