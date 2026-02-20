# 需求清单：Dashboard 重设计 + WebSocket 接入 + Agent 状态激活
> 创建时间：2026-02-20 16:00
> 状态：已确认

## 功能需求

### 1. Project Dashboard 重设计
1. **Section 1: Token Usage**（最显眼的位置）
   - 时间维度选择器：Today / 7 Days / 30 Days / All Time，全局生效（影响所有子视图）
   - Summary Cards: 4 张卡片 — Total Tokens / Input Tokens / Output Tokens / API Calls
   - 多维度视图切换：[By Agent] [By Model] Tab
   - 每个视图显示 breakdown 表格 + 比例条
   - Token Trend 柱状图：受时间范围影响，Today 时按小时分布（24 根柱子 0:00-23:00），7d/30d 按天分布
2. **Section 2: Runtime Status**
   - Tab：[Running] [Upcoming] [Recent]
   - Running：当前正在运行的 Chat、Cron Job、Automation
   - Upcoming：即将触发的 Cron Job、Schedule 等
   - Recent：最近完成的 Chat、Automation、Tasks
3. **Section 3: Overview**
   - Agent 状态列表（实时状态）
   - Recent Chats 列表
   - 导航链接到详细页面

### 2. Global Dashboard（App 级别，非 Project 级别）
1. 统计所有项目的 Token 消耗量
2. 维度：By Project / By Model / By Agent + 时间维度（Today / 7d / 30d / All Time）
3. Runtime Status：跨项目的 Running / Upcoming / Recent
4. 布局和样式与 Project Dashboard 保持一致

### 3. WebSocket 实时推送
1. 接入已有的 WebSocketManager（ws/handler.ts）到 Hono app
2. 同端口方案：/ws 路径，与 HTTP /api/* 共用端口
3. 认证方式：query param ws://localhost:{port}/ws?token={authToken}
4. Channel 订阅：'global'、'project:{projectId}'
5. 事件类型：agent:status_changed、runtime:chat_started/ended、runtime:cron_started/ended、token:recorded
6. UI 端：useWebSocket hook + WebSocketProvider，自动重连（exponential backoff）

### 4. Agent 状态激活
1. Chat 执行时：agent status 从 idle → running，结束后恢复 idle
2. Cron Job 执行时：同上
3. 并发管理：引用计数——per-agent 活跃 chat 计数器，>0 时 running，=0 时 idle
4. 通过 WebSocket 推送状态变化
5. AgentListPage 不需要改 UI（样式映射已就绪），只需 server 端发射事件 + UI 端监听
6. 启动时安全清理：扫描所有 agent JSON，将残留的 running 重置为 idle

### 5. Sub-agent Abort Token 修复
1. sub-agent.ts 的 streamText() 缺少 onAbort 回调
2. 中断时 token 不会被记录——需要补上 onAbort，累加 steps usage，保存 aborted:true 的 token_record
3. 逻辑与 chat.ts 已有的 onAbort 保持一致

## 技术约束
1. WebSocket 使用 @hono/node-ws（已安装），createNodeWebSocket 方式接入
2. WS 与 HTTP 共用同一个 serve() 端口，不新增端口
3. wsManager 通过 ServerDependencies 依赖注入，不直接 import 业务模块
4. 遵循项目既有模式：Pixel 组件前缀、PixelCard/PixelButton/PixelBadge 等
5. Tailwind CSS v4、motion/react、Zustand v5 双括号模式
6. Mock 数据集中在 data.ts

## 流程要求
1. 按 Phase 0-8 的顺序实施，尊重依赖关系
2. 可并行的 Phase 尽量并行
3. 每个 Phase 完成后 pnpm lint + pnpm test 验证

## 风格要求
1. 像素风格（Minecraft 美学）、暗色主题
2. 与现有 Dashboard 组件风格一致
3. 代码用英文，讨论用中文

## 已确认决策
1. Summary Cards: 4 张（Total / Input / Output / API Calls）
2. Today Trend: 按小时分布（24 根柱子）
3. Global Dashboard: 包含 Runtime Status
4. 并发 Agent 状态: 引用计数
