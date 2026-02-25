# Agent Runtime: Claude Code 模式集成

## 需求概述

Golemancy 目前所有 Agent 通过 Vercel AI SDK `streamText()` 执行（Standard 模式）。新增 Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) 作为第二种 Agent Runtime（Claude Code 模式），让 Agent 能以 Claude Code CLI 子进程方式执行。

## 核心需求

### 1. 类型基础 (packages/shared/)
- 新增 `AgentRuntime` 类型 (`'standard' | 'claude-code'`)
- 新增 `ClaudeCodeModel` 类型 (`'sonnet' | 'opus' | 'haiku'`)
- 新增 `ClaudeCodeTestResult` 接口
- `GlobalSettings` 增加可选 `agentRuntime` 字段
- `ProjectConfig` 增加可选 `agentRuntime` 字段
- `Conversation` 增加可选 `sdkSessionId` 字段
- `ISettingsService` 增加 `testClaudeCode()` 方法
- 新增 `CLAUDE_CODE_MODELS` 常量和 `DEFAULT_CLAUDE_CODE_MODEL`

### 2. 数据库迁移
- `conversations` 表增加 `sdk_session_id TEXT` 列
- `schema.ts` 增加对应 drizzle 字段
- `conversations.ts` 存储层映射 sdkSessionId、新增 `updateSdkSessionId()` 方法

### 3. SDK Runtime 核心 (packages/server/src/agent/claude-code/)
- `handler.ts` — SDK 主处理器（query + streaming + session resume）
- `config-mapper.ts` — Agent 配置 → SDK Options 转换
- `sse-adapter.ts` — SDK 消息 → UIMessageStream SSE 适配
- `mcp-adapter.ts` — MCP 配置格式转换

### 4. 路由集成
- `resolve-runtime.ts` — Agent Runtime 三层级联解析
- `chat-claude-code.ts` — Claude Code chat handler
- `chat.ts` — 加入 runtime 分流
- `settings.ts` — 新增 `/api/settings/claude-code/test` 连通性测试端点
- `executor.ts` — Cron Job 执行器分流

### 5. 服务层
- `HttpSettingsService` 增加 `testClaudeCode()` 方法
- Mock 服务返回 `{ ok: true, model: 'sonnet' }`

### 6. UI 变更
- `useAgentRuntime()` hook
- Global Settings 新增 Agent Runtime tab
- Project Settings 新增 Agent Runtime 覆盖选项
- Agent Create Modal 条件渲染（claude-code 模式简化 model 选择）
- Agent Detail Page 条件渲染（隐藏 compact threshold 等）
- Chat UI Sub-Agent 折叠面板（SSE 事件处理 + UI 组件）
- Chat UI Compact 状态指示

### 7. 兼容性
- 所有新字段可选，默认 'standard'，零迁移
- 现有功能不受影响
- 模式切换容错

## 技术约束
- 所有 claude-code 代码封装在 `packages/server/src/agent/claude-code/` 目录
- `chat.ts` 只做分流，不引入 SDK 逻辑
- 第一版权限用 `dontAsk`，不做 canUseTool 桥接
- SDK 的 auto compact 自管理，Agent 的 `compactThreshold` 在此模式下不生效
