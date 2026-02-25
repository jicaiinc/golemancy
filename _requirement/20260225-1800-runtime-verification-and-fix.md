# 需求清单：Runtime 切换验证与修复
> 创建时间：2026-02-25 18:00
> 状态：已确认

## 功能需求

### A. 功能验证（切换 Runtime 后所有功能是否正常）

1. **Runtime 切换机制验证** — Standard ↔ Claude Code 可以切换，切换后对话正确路由到对应的处理器
2. **Conversation Runtime 锁定** — 对话应该锁定到创建时的 Runtime，不允许在不同 Runtime 间混用同一对话（当前无限制，需要修复）
3. **Compact 功能验证**：
   - 输入 `/compact` 命令在 Claude Code 模式下是否好用
   - SDK 自动 Compact 时，UI 是否正确显示 Compact 状态指示（`CompactBoundary` 组件、StatusBar compacting 状态）
   - Standard 模式的 CompactThreshold 自动 Compact 不受影响
4. **图片上传验证** — 当前 Claude Code 模式下 `extractTextContent()` 只提取文本，丢弃了图片 parts。需要调研 Agent SDK 的 `query()` 是否支持图片输入，如支持则修复
5. **Built-in Tools 验证** — Bash/Browser/Task 工具在两种 Runtime 下是否正常工作。注意 Browser 在 Claude Code 下只有 WebFetch/WebSearch（功能缩减）
6. **Skills 架构变更** — 移除 Agent 级别的 Skill 配置，改为 Project 级别设置 Skills。因为 Agent SDK 的 Skills 是基于文件系统的（`.claude/skills/*/SKILL.md`），需要将 Golemancy 的 Skills 同步/symlink 到 SDK 期望的位置，配置 `settingSources: ["project"]`
7. **MCP Servers 验证** — 在 Claude Code 模式下 MCP Servers 是否正常工作（stdio/sse/http 三种传输类型）
8. **Sub-Agents 验证** — Sub-Agent 映射为 SDK agents、model 规范化（sonnet/opus/haiku）、Task tool 自动启用是否正常
9. **对话存储验证** — 消息持久化（用户消息 + Assistant 消息 + token 计数）、sdkSessionId 持久化和 session resume 是否正常
10. **Token 记录和 Dashboard** — Claude Code 模式缺少 contextTokens，Dashboard 按 provider/model 分组统计时显示是否正常
11. **Agent 状态生命周期** — running/idle 状态在两种 Runtime 下是否正确切换
12. **消息搜索 (FTS)** — 跨 Runtime 的消息搜索是否正常
13. **Cron Job 执行** — Claude Code 模式下 Cron Job 是否正常执行（包括 Skills 处理）
14. **Permissions 映射** — restricted→plan, sandbox→default, unrestricted→bypassPermissions 映射是否合理
15. **Artifact 系统** — 确认 Claude Code 模式下是否支持 Artifact
16. **Memory 系统** — 确认 Claude Code 模式下 Memory 是否正常
17. **WebSocket 事件** — 确认所有 WS 事件在两种 Runtime 下一致

### B. UI 改动需求

18. **Global Settings 页面**：
    - 合并 Runtime Tab 和 Providers Tab 为一个页面
    - 顶部：Standard / Claude Code 切换
    - Standard 选中时→下方展示 Provider 配置（当前 ProvidersTab 的内容）
    - Claude Code 选中时→下方展示 Connection Test
19. **Project Settings 页面**：
    - Agent Runtime 从 General Tab 移到 Agent Tab
    - 去掉 Inherit 选项，只保留 Standard / Claude Code 两个选项
    - 新建 Project 时默认跟随 Global Setting 的值（显式写入，不再用 undefined 表示 inherit）
20. **Agent Detail Page** — 确认 Claude Code 模式下的条件渲染正确（隐藏 CompactThreshold、简化 Model Config、Tools/Sub-Agents 提示信息等）

### C. 技术调研需求

21. **调研 Agent SDK `query()` 是否支持图片/multimodal 输入**
22. **调研 Agent SDK `settingSources` 配置后 Skills 的发现机制**
23. **调研 Agent SDK 对 Artifact 的支持情况**

## 技术约束

1. 所有 claude-code 代码封装在 `packages/server/src/agent/claude-code/` 目录
2. `chat.ts` 只做分流，不引入 SDK 逻辑
3. 遵循项目既有的分层架构和命名约定
4. **不允许动 git** — 可以查看但绝对不允许提交代码

## 流程要求

1. **需求持久化** — 从最开始的需求就写入 `_requirement/` 文件，作为 single source of truth
2. **团队成员文档** — 工作过程中整理文档到 `_design/` 目录
3. **Team Lead 二次校验** — 对成员的实现和检查结果进行亲自阅读代码的二次校验
4. **功能验证点清单** — 列出所有功能验证点、测试点
5. **Code Review** — 对所有变更代码进行质量/安全/性能三维审查
6. **E2E 测试** — 最终跑通 E2E 测试

## 注意事项

1. 对话可能因长度被压缩，因此所有需求、设计、验证结果都必须持久化到文件中，不能仅依赖对话上下文
2. Team Lead 必须亲自阅读代码校验实现，不得仅凭工程师报告就标记任务完成
3. Skills 的变更涉及 Agent → Project 级别的迁移，影响面较大，需要特别注意兼容性
4. Claude Code 模式下 Browser 工具功能缩减（只有 WebFetch/WebSearch，没有 Playwright），需要在 UI 上给用户提示
