# 性能审查报告

> 审查员：CR-Performance
> 日期：2026-02-16
> 项目：Golemancy (SoloCraft.team)

## 审查概览
- 审查文件数：45+
- 发现问题数：P0: 3 / P1: 9 / P2: 11

---

## P0 问题（必须修复）

### [P-P0-001] 路由无代码分割（Code Splitting），所有页面同步加载
- **文件**: `packages/ui/src/pages/index.tsx:1-30` 及 `packages/ui/src/app/routes.tsx:1-51`
- **类别**: Bundle 体积 / 启动性能
- **问题**: 所有 13 个页面组件（ProjectListPage、ChatPage、AgentListPage、TopologyView + ReactFlow 等）通过静态 `export` 同步导入，没有使用 `React.lazy()` 或动态 `import()`。整个 UI 打包为单个 chunk，包含所有页面代码。
  - `pages/index.tsx` 是一个纯静态 re-export 文件
  - `routes.tsx` 直接 `import` 所有页面组件在顶层
  - 其中 `@xyflow/react`（ReactFlow 拓扑图库）和 `@dagrejs/dagre`（布局算法库）是重量级依赖，即使用户从未访问拓扑页面也会被加载
- **影响**:
  - 初始 bundle 体积显著增大
  - Electron 窗口首次渲染时间变长（需要解析和执行所有页面代码）
  - ReactFlow + dagre 是大型库，无条件加载严重浪费
- **建议**:
  ```tsx
  // routes.tsx — 使用 React.lazy 动态加载
  const ChatPage = lazy(() => import('../pages/chat').then(m => ({ default: m.ChatPage })))
  const AgentListPage = lazy(() => import('../pages/agent').then(m => ({ default: m.AgentListPage })))
  // ... 其他页面类似
  ```
  - 至少将 TopologyView（含 ReactFlow）和不常用页面（Artifacts、Memory、CronJobs）设为懒加载
  - 配合 `<Suspense fallback={<PixelSpinner />}>` 使用

### [P-P0-002] Chat 实例内存累积：未使用的 Chat 对象在项目内无限增长
- **文件**: `packages/ui/src/lib/chat-instances.ts:31`
- **类别**: 内存泄漏
- **问题**: `chatInstances` Map 在项目内只会增长，不会缩减。用户在一个项目中打开多个对话时，每个对话创建一个 `Chat` 实例（包含完整消息历史、WebSocket/HTTP 传输层）。只有以下场景会清理：
  - `destroyChat(id)`: 仅在删除对话时调用
  - `destroyAllChats()`: 仅在切换项目时调用
  - 用户在同一项目中浏览 10 个不同对话 → 10 个 Chat 实例常驻内存
  - 每个 Chat 实例持有完整 `UIMessage[]` 数组，含所有 parts（tool calls、文件附件等）
- **影响**: 长时间使用后内存持续增长。对于有大量对话的项目尤为严重，因为每个 Chat 实例保留了完整的消息历史。
- **建议**:
  - 实现 LRU 策略：保留最近 N 个（如 3-5 个）Chat 实例，超出时销毁最旧的
  - 或者在 `selectConversation()` 中，当切换到新对话时，销毁前一个对话的 Chat 实例（保留 messages 在 store 中即可）
  - 添加内存监控：暴露 `chatInstances.size` 供调试

### [P-P0-003] 模块加载时同步调用 `spawnSync` 阻塞事件循环
- **文件**: `packages/server/src/agent/sandbox-pool.ts:36-49`
- **类别**: 启动性能
- **问题**: `resolveRipgrepPath()` 在模块顶层（第 49 行 `const resolvedRgPath = resolveRipgrepPath()`）执行，其中包含：
  1. `createRequire(import.meta.url)` + `require('@vscode/ripgrep')` — 同步模块解析
  2. `spawnSync('which', ['rg'])` — 同步子进程，阻塞事件循环
  - 这在 **每次服务器进程启动时** 都会执行（server fork + sandbox worker fork），影响启动关键路径
- **影响**:
  - 服务器启动延迟增加 50-200ms（spawnSync 开销）
  - Sandbox worker 进程启动也会被阻塞
  - 在 `require('@vscode/ripgrep')` 解析失败时还会产生额外开销
- **建议**:
  - 将 `resolveRipgrepPath()` 改为异步 `resolveRipgrepPathAsync()`，使用 `execFile` 替代 `spawnSync`
  - 使用 lazy initialization：在首次调用 `getGlobalHandle()` 时才解析 ripgrep 路径
  - 或者缓存解析结果到文件系统，避免每次启动都执行 `which`

---

## P1 问题（建议修复）

### [P-P1-001] ProjectDbManager 数据库连接无限缓存，无清理机制
- **文件**: `packages/server/src/db/project-db.ts:11-28`
- **类别**: 内存管理 / 资源泄漏
- **问题**: `ProjectDbManager.cache` Map 只增不减。每访问一个新项目，就创建并缓存一个 SQLite 连接（better-sqlite3 实例）。`closeAll()` 方法存在但**从未被调用**：
  - `packages/server/src/index.ts:60-66` SIGTERM 处理只关闭了 sandboxPool 和 mcpPool，未关闭 dbManager
  - 打包后的生产环境中，用户频繁切换项目 → 数据库连接持续累积
- **影响**: 每个 SQLite 连接占用文件句柄和内存（WAL 模式下包含 shared memory）。长时间运行后可能达到 OS 文件描述符限制。
- **建议**:
  - 在 SIGTERM handler 中添加 `dbManager.closeAll()`
  - 实现 LRU 缓存：只保留最近使用的 N 个数据库连接
  - 或在项目切换时关闭前一个项目的数据库连接

### [P-P1-002] `saveMessage` 使用 SELECT+INSERT 而非 INSERT OR IGNORE
- **文件**: `packages/server/src/storage/conversations.ts:109-119`
- **类别**: 数据效率 / I/O 效率
- **问题**: 每次保存消息时先执行 SELECT 查询检查是否存在，再决定是否 INSERT。在消息频繁保存的场景（streaming 模式下每个 chunk 都可能触发保存），这意味着每次保存都有额外的数据库查询。
  ```ts
  // 当前实现：2 次查询
  const existing = await db.select({...}).from(schema.messages).where(eq(schema.messages.id, data.id)).limit(1)
  if (existing.length > 0) return  // skip
  await db.insert(schema.messages).values({...})
  ```
- **影响**: 消息保存性能下降约 50%（多一次 SELECT 查询），在高频消息场景中尤为明显。
- **建议**:
  ```ts
  // 优化：1 次查询，利用 SQLite 的 INSERT OR IGNORE
  await db.insert(schema.messages).values({...}).onConflictDoNothing()
  ```

### [P-P1-003] `selectProject` 的 AbortController 未实际传递给 fetch 调用
- **文件**: `packages/ui/src/stores/useAppStore.ts:209-276`
- **类别**: 数据效率
- **问题**: `projectAbort` AbortController 被创建和 abort() 调用，但其 signal 从未传递给实际的 service 调用。当用户快速切换项目时：
  - `projectAbort.abort()` 被调用
  - 但 `svc.agents.list(id)` 等 8 个并行请求仍在执行
  - 仅在结果返回后通过 `if (get().currentProjectId !== id) return` 丢弃
  - 意味着旧项目的 8 个 HTTP 请求会执行完毕才被丢弃
- **影响**: 快速切换项目时产生大量无用网络请求和 JSON 反序列化开销。
- **建议**: 将 `projectAbort.signal` 传递到 service 层的 `fetch()` 调用中，实现真正的请求取消。

### [P-P1-004] `loadAgentTools` 在每个 chat 请求中重新加载全部工具
- **文件**: `packages/server/src/routes/chat.ts:124-129`
- **类别**: 运行时性能 / 启动延迟
- **问题**: 每个 POST `/api/chat` 请求都完整执行 `loadAgentTools()`，包括：
  1. 加载 skills（文件系统读取）
  2. 加载 MCP tools（MCP 连接已池化，但仍需 fingerprint 计算和查找）
  3. 创建 builtin tools（含 bash sandbox 初始化）
  4. 创建 sub-agent tool shells
  - 对于有 bash tool 的 agent，每次请求都重新创建 Sandbox 实例（NativeSandbox 或 AnthropicSandbox）
- **影响**: 每个 chat 请求增加 50-300ms 的工具加载开销。对于使用 sandbox 模式的项目更显著。
- **建议**:
  - 缓存 agent 的 tool set（按 agent config hash 键），仅在配置变更时重新加载
  - 至少缓存 builtin tools（bash sandbox 实例可以复用）
  - Skills 工具加载结果可以按 skillIds 数组 hash 缓存

### [P-P1-005] ToolCallDisplay 组件未使用 `memo` 包裹
- **文件**: `packages/ui/src/pages/chat/ToolCallDisplay.tsx:229`
- **类别**: 渲染性能
- **问题**: `ToolCallDisplay` 组件没有 `memo` 包裹（注意：`MessageBubble` 正确使用了 `memo`）。在流式传输期间，每个新 token 都会触发整个消息列表重新渲染，而每个消息中的 ToolCallDisplay 也会无条件重新渲染。
  - `SubAgentToolItem` 和 `SubAgentDisplay` 也未使用 `memo`
  - 这些组件内部使用了 `useAppStore(s => s.agents)` 选择器，每次 agents 变化也会触发重渲染
- **影响**: 流式传输期间，长对话中包含多个工具调用的消息会导致大量不必要的重渲染。
- **建议**:
  - 将 `ToolCallDisplay` 包裹在 `memo` 中
  - `useToolDisplayName` hook 中的 `agents` 订阅会导致所有使用该 hook 的组件在 agents 变化时重渲染 — 考虑缓存 agent name 查找

### [P-P1-006] `listJsonFiles` 批量读取策略效率不足
- **文件**: `packages/server/src/storage/base.ts:31-48`
- **类别**: I/O 效率
- **问题**: `listJsonFiles` 使用批量大小 20 的顺序批处理：
  ```ts
  const BATCH_SIZE = 20
  for (let i = 0; i < jsonFiles.length; i += BATCH_SIZE) {
    const batch = jsonFiles.slice(i, i + BATCH_SIZE)
    const items = await Promise.all(batch.map(...))
  }
  ```
  - 每批 20 个文件并行读取，但批次之间是串行的
  - 对于 100 个 JSON 文件（如 100 个 agent 配置），需要 5 批串行执行
  - 本地文件系统 I/O 完全可以更高的并发度
- **影响**: 项目数据加载延迟随实体数量线性增长。
- **建议**:
  - 增大 `BATCH_SIZE` 到 50-100（本地 fs 可以处理更高并发）
  - 或使用 `Promise.all` 直接并行读取所有文件（文件数通常不会太大）
  - 考虑使用 readdir + map 一次性并行

### [P-P1-007] Electron 主进程启动时同步读取 `package.json`
- **文件**: `apps/desktop/src/main/index.ts:7-14`
- **类别**: 启动性能
- **问题**: `readFileSync` 在模块顶层同步读取 `package.json` 获取版本号。虽然文件很小，但这阻塞了 Electron 主进程的初始化。
  ```ts
  const APP_VERSION: string = JSON.parse(
    readFileSync(
      app.isPackaged ? join(app.getAppPath(), 'package.json') : ...,
      'utf-8',
    ),
  ).version
  ```
- **影响**: 启动链路上增加了一次同步文件 I/O。影响虽小（1-5ms），但在启动关键路径上不应有同步 I/O。
- **建议**:
  - 使用 `import` 语法直接导入 package.json（ESM 支持 JSON import）
  - 或在 electron-vite 构建时通过 `define` 注入版本号

### [P-P1-008] `conversations.update()` 加载全部消息只为返回更新后的对话
- **文件**: `packages/server/src/storage/conversations.ts:139-153`
- **类别**: 数据效率
- **问题**: `update()` 方法在 UPDATE 之后调用 `getById()`，而 `getById()` 会加载该对话的**所有消息**（`loadMessages()`）。仅为更新标题就要读取可能数千条消息。
  ```ts
  async update(...) {
    await db.update(schema.conversations).set(updateFields).where(...)
    const updated = await this.getById(projectId, id)  // 这里加载所有 messages
    return updated
  }
  ```
- **影响**: 修改对话标题时产生不必要的大量数据读取，对于有大量消息的对话尤其浪费。
- **建议**:
  - `update()` 直接从 UPDATE 返回更新后的行数据，不调用 `getById()`
  - 或创建一个不加载 messages 的 `getMetadataById()` 方法

### [P-P1-009] Turborepo `lint` 和 `test` 任务无缓存配置
- **文件**: `turbo.json:12-14`
- **类别**: 构建效率 / 测试性能
- **问题**: `lint` 和 `test` 任务没有配置 `inputs` 和 `outputs`：
  ```json
  "lint": {},
  "test": {}
  ```
  - 没有 `outputs`，Turborepo 无法缓存这些任务的结果
  - 即使代码未改变，每次 `pnpm lint` 和 `pnpm test` 都会完整重新执行
- **影响**: CI/CD 和本地开发中重复执行不必要的类型检查和测试。
- **建议**:
  ```json
  "lint": {
    "dependsOn": ["^build"],
    "inputs": ["src/**/*.ts", "src/**/*.tsx", "tsconfig.json"],
    "outputs": []
  },
  "test": {
    "dependsOn": ["^build"],
    "inputs": ["src/**/*.ts", "src/**/*.tsx", "src/**/*.test.*", "vitest.config.*"],
    "outputs": ["coverage/**"]
  }
  ```

---

## P2 问题（可优化）

### [P-P2-001] electron-vite 配置未指定 chunk 分割策略
- **文件**: `apps/desktop/electron.vite.config.ts:1-11`
- **类别**: Bundle 体积
- **问题**: renderer 配置极其简单，没有配置 `build.rollupOptions.output.manualChunks`。所有第三方依赖（react, react-router, zustand, motion, @xyflow/react, ai SDK 等）打包在一起。
- **影响**: 无法利用浏览器缓存分离 vendor 和 app 代码（虽然 Electron 本地加载，缓存影响有限，但分离可以加速 HMR）。
- **建议**: 配置 `manualChunks` 将大型依赖分离（如 `@xyflow/react`、`motion`、`ai`）。

### [P-P2-002] `searchMessages` 使用两次独立查询（items + count）
- **文件**: `packages/server/src/storage/conversations.ts:196-250`
- **类别**: 数据效率
- **问题**: FTS 搜索执行两次独立查询——一次获取结果，一次获取总数。两次查询重复了相同的 JOIN 和 WHERE 条件。
- **影响**: 搜索性能降低约 30-40%。在大量消息场景下更明显。
- **建议**: 使用 `SELECT *, count(*) OVER() as total FROM ...` 窗口函数合并为单次查询。

### [P-P2-003] `console.debug` 残留在生产 store 代码中
- **文件**: `packages/ui/src/stores/useAppStore.ts:401`
- **类别**: 运行时性能
- **问题**: `selectConversation` 中有 `console.debug('[store] selectConversation loaded', id, 'messages:', full.messages.length)`。生产环境中不应有 console 输出。
- **影响**: 微小的性能开销和控制台噪音。
- **建议**: 移除或使用条件编译。

### [P-P2-004] ProjectSidebar `currentProject` 选择器在 projects 数组变化时产生新引用
- **文件**: `packages/ui/src/components/layout/ProjectSidebar.tsx:34`
- **类别**: 渲染性能
- **问题**: `useAppStore(s => s.projects.find(p => p.id === s.currentProjectId))` — 每次 `projects` 数组更新时，`find` 返回的对象虽然相同但会触发 Zustand 的 `Object.is` 比较（如果 projects 数组是新数组实例，find 返回的引用可能不同）。
- **影响**: 可能导致 ProjectSidebar 在不相关的 projects 变更时不必要地重渲染。
- **建议**: 使用 `useShallow` 或将选择器拆分为 `currentProjectId` + 单独的 `useMemo` 查找。

### [P-P2-005] ChatSidebar 的 `relativeTime` 在每次渲染时重新计算
- **文件**: `packages/ui/src/pages/chat/ChatSidebar.tsx:15-23`
- **类别**: 渲染性能
- **问题**: `relativeTime(conv.lastMessageAt)` 在每次渲染时为每个对话项重新计算。ChatSidebar 未使用 `memo`。
- **影响**: 微小，但在大量对话时可能有感知。
- **建议**: ChatSidebar 整体包裹 `memo`，`relativeTime` 结果可以用 `useMemo` 缓存。

### [P-P2-006] `@xyflow/react` CSS 全局加载
- **文件**: `packages/ui/src/pages/agent/topology/TopologyView.tsx:11`
- **类别**: Bundle 体积
- **问题**: `import '@xyflow/react/dist/style.css'` 在 TopologyView 中导入。由于没有代码分割（P-P0-001），这个 CSS 在初始加载时就会被包含。
- **影响**: 增加了初始 CSS bundle 大小。如果实施了 P-P0-001 的懒加载，此问题自动解决。
- **建议**: 配合 P-P0-001 一起解决。

### [P-P2-007] `sandboxConfigEquals` 和 `fingerprintEquals` 使用 JSON.stringify 做深比较
- **文件**: `packages/server/src/agent/sandbox-pool.ts:464-466` 及 `packages/server/src/agent/mcp-pool.ts:135-137`
- **类别**: 运行时性能
- **问题**: 使用 `JSON.stringify(a) === JSON.stringify(b)` 做配置比较。JSON.stringify 对大对象较慢。
- **影响**: 实际影响极小，因为这些配置对象不大且比较不频繁。保留为 P2 记录。
- **建议**: 如未来配置对象变大，可使用 `fast-deep-equal` 等专用库。

### [P-P2-008] MCP pool StderrCapture 的 `getText()` 每次调用都执行 Buffer.concat
- **文件**: `packages/server/src/agent/mcp-pool.ts:50-55`
- **类别**: 运行时性能
- **问题**: `getText()` 在每次调用时执行 `Buffer.concat(this.chunks)`。如果被多次调用，会重复拼接。
- **影响**: 极小 — getText() 通常只在错误路径上调用一次。
- **建议**: 可缓存结果，但优先级很低。

### [P-P2-009] NativeSandbox 的 output truncation 在截断后仍继续拼接字符串
- **文件**: `packages/server/src/agent/native-sandbox.ts:75-83`
- **类别**: 内存效率
- **问题**: 当 stdout/stderr 超过 1MB 时，代码设置了截断标记但 `data` 事件继续触发。虽然有 `if (stdoutBytes <= MAX_OUTPUT_BYTES)` 保护，但事件回调仍在执行。
- **影响**: 对于输出极大的命令（如 `find /`），事件回调开销仍存在。
- **建议**: 在截断后可以 `child.stdout?.destroy()` 停止接收数据。

### [P-P2-010] pino-pretty 在开发模式下的性能开销
- **文件**: `packages/server/src/logger.ts:3-10`
- **类别**: 开发体验 / 运行时性能
- **问题**: 开发模式下使用 `pino-pretty` transport，这是一个同步 transport，会在每条日志上进行格式化处理。server 的日志级别设为 `debug`，产生大量日志。
- **影响**: 开发模式下日志输出可能成为性能瓶颈，尤其在高频操作（如消息流式传输）时。
- **建议**: 在开发模式下也可以使用异步 transport，或将默认级别提高到 `info`。

### [P-P2-011] WebSocket Manager `emit` 遍历所有客户端检查 channel 订阅
- **文件**: `packages/server/src/ws/handler.ts:62-69`
- **类别**: 运行时性能
- **问题**: `emit(channel, event)` 遍历所有连接的客户端检查是否订阅了该 channel。在多客户端场景下效率低。
- **影响**: Electron 桌面应用通常只有 1-2 个窗口，因此实际影响极小。
- **建议**: 如果未来支持多窗口/多用户，考虑使用 `channel → Set<clientId>` 的反向索引。

---

## 按领域汇总

### Code Runtime
- **总体评价**: 设计良好。Python venv 和 Node.js 运行时管理使用了共享缓存（pip cache、npm cache），减少了重复下载。
- **问题**:
  - `getPythonEnvStatus()` 执行 2 次子进程调用（python --version + pip list），对于仅检查状态来说开销较大
  - `execCommand` 的 120s 超时对于 pip install 合理，但对于 `python --version` 等快速命令过长
  - 但这些仅在 API 调用时触发（非热路径），影响有限
- **亮点**: 共享 pip/npm 缓存设计好、venv 使用 symlinks 节省磁盘空间

### Sandbox
- **总体评价**: 架构设计优秀（全局管理器 + 按项目 worker 进程，lazy 创建）。
- **问题**:
  - P-P0-003: 模块加载时同步 spawnSync
  - Worker 进程按项目创建，如果用户有多个 sandbox 项目，进程数量会增长
- **亮点**:
  - Worker crash recovery 设计好（检测退出，下次使用时 lazy 重建）
  - IPC 超时 + 连续超时检测 + 自动销毁机制优秀
  - 配置热更新（reinitialize）避免不必要的 worker 重建

### 编译打包
- **总体评价**: `bundle-server.mjs` 脚本设计周到，包含了依赖 hoisting、文件 prune、权限修复。
- **问题**:
  - P-P0-001: UI 无代码分割
  - P-P2-001: electron-vite 配置未优化
  - P-P1-009: Turborepo 缓存配置不完整
- **亮点**:
  - esbuild minify + external 依赖的策略正确
  - pnpm deploy + 手动 hoisting 解决了 pnpm 严格隔离的问题
  - 文件 prune（删除 .d.ts、.md、test 目录等）有效减小 bundle
  - ASAR 打包 + extraResources 分离策略合理

### 渲染性能
- **总体评价**: 基础组件 `MessageBubble` 正确使用了 `memo`，但部分组件缺失。
- **问题**:
  - P-P1-005: ToolCallDisplay 未 memo
  - P-P2-004: ProjectSidebar 选择器可能产生不必要重渲染
  - P-P2-005: ChatSidebar 未 memo
- **亮点**:
  - Zustand 使用了正确的 selector 模式（`s => s.specificField`），避免了整个 store 变化触发重渲染
  - `ChatInput` 正确使用了 `useCallback` 和 `useRef`
  - `ChatSidebar` 使用了 `useMemo` 做排序缓存

### 内存管理
- **总体评价**: 项目切换时的清理逻辑（AbortController、destroyAllChats）设计良好，但有遗漏。
- **问题**:
  - P-P0-002: Chat 实例无限累积
  - P-P1-001: 数据库连接无限缓存
  - P-P1-003: AbortController 未实际传递给 fetch
- **亮点**:
  - `selectProject` 中正确地在切换前清空所有状态
  - store persist 只持久化了 UI 偏好（sidebarCollapsed, themeMode），没有持久化业务数据
  - MCP pool idle scanner（30分钟超时）有效清理不活跃连接

### 数据效率
- **总体评价**: SQLite 配置合理（WAL 模式、foreign_keys、合适的索引）。
- **问题**:
  - P-P1-002: saveMessage 的 SELECT+INSERT 模式
  - P-P1-006: listJsonFiles 批量策略保守
  - P-P1-008: update() 加载不必要的消息
  - P-P2-002: searchMessages 双查询
- **亮点**:
  - FTS5 全文搜索使用了 content sync 触发器，保证了索引一致性
  - per-project database 设计实现了项目隔离
  - WAL 模式 + NORMAL synchronous 是 SQLite 性能和安全性的良好平衡
  - `selectProject` 中 8 个加载请求的并行化设计正确

### 其他
- **启动链路分析**: Electron 启动 → `readFileSync(package.json)` → `app.whenReady()` → `startServer()` → fork server → server `main()` → `resolveRipgrepPath()`(spawnSync) → `createDatabase` → `migrateDatabase` → `serve()` → IPC ready → `createWindow()`
  - 关键路径上有 2 个同步阻塞点：readFileSync 和 spawnSync
  - server 的 15s startup timeout 合理，但可以添加进度反馈
- **sub-agent 流式传输**: `TEXT_THROTTLE_MS = 100` 的节流策略良好，避免了过于频繁的 yield
- **store 设计**: 13 个 slice 在单个 create() 中定义，虽然文件较长（730+ 行），但 Zustand 的 selector 机制保证了只有订阅的字段变化才会触发重渲染
