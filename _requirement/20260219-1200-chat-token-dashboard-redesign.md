# 需求清单：Chat Token 追踪 + Dashboard 全面重设计
> 创建时间：2026-02-19 12:00
> 状态：已确认

## 功能需求

### Part 0: Sub-Agent Token 汇总
1. 修复子 agent token 丢失问题：`sub-agent.ts` 中每个子 agent 调用独立的 `streamText`，其 `totalUsage` 没有被捕获
2. 在 `createSubAgentTool` 的 execute 函数中，`for await` 循环结束后捕获 `childUsage = await result.totalUsage`
3. `SubAgentStreamState` 增加可选 `usage` 字段：`{ inputTokens: number; outputTokens: number; totalTokens: number }`

### Part 1: 消息级 Token 追踪（基础设施）
4. DB schema: messages 表新增 `input_tokens INTEGER NOT NULL DEFAULT 0` 和 `output_tokens INTEGER NOT NULL DEFAULT 0`
5. v3 migration：幂等（检测列是否已存在），使用 `PRAGMA table_info` 模式
6. `Message` 类型增加 `inputTokens: number` 和 `outputTokens: number` 字段
7. `saveMessage` 接口参数增加可选 `inputTokens?: number` 和 `outputTokens?: number`
8. `saveMessage` 实现写入 token 列，`rowToMessage` 读取
9. `chat.ts` 中：
   - `onFinish` 回调中 `await result.totalUsage` 并附带 token 数据保存 assistant 消息
   - 流结束后发送 `data-usage` chunk 到客户端（type: `'data-usage'`, data 含 inputTokens/outputTokens/totalTokens）

### Part 2: StatusBar 实时 Token 显示
10. StatusBar 移除 `activeAgents` prop 和相关 JSX
11. Token 显示改为 `Tokens: 1,234 in / 567 out` 或 `Tokens: --`
12. ChatWindow 新增 `onUsageUpdate` callback prop，处理 `data-usage` 事件
13. ChatPage 维护 `conversationUsage` state，`currentConversationId` 变化时 reset，格式化传给 StatusBar

### Part 3: Dashboard 类型重设计
14. 完全替换 `packages/shared/src/types/dashboard.ts` 中的类型定义：
    - `DashboardSummary`：todayTokens(total/input/output), totalAgents, activeChats, totalChats
    - `DashboardAgentStats`：agentId, projectId, projectName, agentName, model, status, totalTokens, conversationCount, taskCount, completedTasks, failedTasks, lastActiveAt
    - `DashboardRecentChat`：conversationId, projectId, projectName, agentId, agentName, title, messageCount, totalTokens, lastMessageAt
    - `DashboardTokenTrend`：date(YYYY-MM-DD), inputTokens, outputTokens
15. `IDashboardService` 替换为 4 个方法：getSummary(), getAgentStats(), getRecentChats(limit?), getTokenTrend(days?)

### Part 4: Dashboard Server 实现
16. 新建 `packages/server/src/storage/dashboard.ts` — 跨 project 聚合 service
17. 注入依赖：projectStorage, getProjectDb, agentStorage, taskStorage
18. `getSummary()` 实现：遍历所有 project，聚合 token、agent 数、chat 数
19. `getAgentStats()` 实现：遍历所有 project+agents，统计 tasks + conversations + tokens
20. `getRecentChats(limit)` 实现：跨 project DB 查最近对话，JOIN messages 计算 token
21. `getTokenTrend(days=14)` 实现：按天分桶聚合，补齐无数据天数
22. `routes/dashboard.ts` 替换为 4 个新 endpoint
23. `index.ts` 用真实 DashboardService 替换 stub

### Part 5: Dashboard UI 重设计
24. 启用 `/dashboard` 路由（不再 redirect 到 `/`）
25. Store slice 替换：dashboardSummary, dashboardAgentStats, dashboardRecentChats, dashboardTokenTrend, dashboardLoading
26. `loadDashboard()` 并行调 4 个接口
27. HttpDashboardService 对接新 endpoints
28. MockDashboardService 返回合理 seed 数据
29. DashboardPage 全面重写，单页布局：
    - **SummaryCards**：4 张 PixelCard（Today Tokens, Agents, Active Chats, Total Chats）
    - **TokenTrendChart**：像素风柱状图（纯 div + Tailwind，无外部图表库），input/output 两色堆叠，7d/30d 切换，hover 显示数字
    - **AgentRanking**：agent 排行表，按 totalTokens 降序，点击导航到 agent 详情
    - **RecentChats**：最近活跃对话列表，点击导航到 chat 页面

### Part 6: 联动更新
30. mock data (`data.ts`) 适配新 Dashboard 类型
31. 确保 DashboardPage export 在 pages/index.ts 中

## 技术约束
1. 使用 Vercel AI SDK v6 的 `streamText` / `toUIMessageStream` / `totalUsage`
2. 使用 Drizzle ORM + better-sqlite3
3. Zustand v5 双括号模式 `create<T>()(…)`
4. Tailwind CSS v4 CSS-first + 像素风格（无 border-radius）
5. 无外部图表库，纯 div + Tailwind 实现柱状图
6. Press Start 2P / JetBrains Mono 字体
7. 严格单向依赖：`desktop → ui → shared ← server ← tools`

## 风格要求
1. Minecraft 像素艺术风格，暗色主题 only
2. `Pixel*` 前缀 base 组件
3. shadow-pixel-raised / shadow-pixel-sunken / shadow-pixel-drop 阴影系统
4. 设计 token 定义在 `@theme {}` block（global.css）

## 注意事项
1. Team Lead 必须亲自阅读实际代码校验实现，不得仅凭工程师报告标记完成
2. Migration 必须幂等（检测列是否已存在）
3. Chat 路由中 `result.totalUsage` 只含父级自身消耗，需额外处理子 agent token
4. Dashboard 是唯一需要跨 project 聚合的 service
5. 英文代码，中文讨论/文档
