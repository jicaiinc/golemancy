# E2E 测试扩展 — 执行进度

> 此文件用于跨 context window 的记忆持久化。所有团队成员和 PM 在开始工作前必须读取此文件。

## 核心规则

1. **不动现有代码逻辑** — 只允许：添加 data-testid、扩展 TestHelper/SELECTORS、写新测试文件
2. **发现问题只记录不修改** — 记录到下方"发现的问题"章节
3. **PM 必须二次验证** — 团队成员完成后 PM 审核代码，确认无误后才标记完成
4. **所有进度实时更新此文件** — 防止 context 丢失

## 需求文档

`_requirement/20260315-1200-e2e-test-expansion.md`

## Phase 0 — 基础设施建设

| # | 任务 | 负责人 | 状态 | 验证 |
|---|------|-------|------|------|
| 0.1 | 添加 data-testid（11 个组件文件） | infra-worker | done | ✅ PM verified |
| 0.2 | 扩展 SELECTORS 常量 | infra-worker | done | ✅ PM verified |
| 0.3 | 扩展 TestHelper（API helpers + SSE + seedWorkspace） | infra-worker | done | ✅ PM verified |
| 0.4 | Onboarding playwright project 配置 | infra-worker | done | ✅ PM verified |

## Phase 1 — 测试编写

### P0 核心模块（12 文件）

| # | 文件 | 层级 | 负责人 | 状态 | PM 验证 |
|---|------|------|-------|------|--------|
| 1 | `smoke/team-page.spec.ts` | smoke | team-memory-writer | done | - |
| 2 | `smoke/team-crud.spec.ts` | smoke | team-memory-writer | done | - |
| 3 | `server/team-api.spec.ts` | server | team-memory-writer | done | - |
| 4 | `ai/team-chat.spec.ts` | ai | team-memory-writer | done | - |
| 5 | `smoke/memory-tab.spec.ts` | smoke | team-memory-writer | done | - |
| 6 | `server/memory-api.spec.ts` | server | team-memory-writer | done | - |
| 7 | `ai/memory-tools.spec.ts` | ai | team-memory-writer | done | - |
| 8 | `server/conversation-advanced.spec.ts` | server | chat-deletion-writer | done | - |
| 9 | `server/chat-navigation.spec.ts` | server | chat-deletion-writer | done | - |
| 10 | `ai/chat-advanced.spec.ts` | ai | chat-deletion-writer | done | - |
| 11 | `ai/auto-compact.spec.ts` | ai | chat-deletion-writer | done | - |
| 12 | `server/deletion-safety.spec.ts` | server | chat-deletion-writer | done | - |

### P1 重要功能（6 文件）

| # | 文件 | 层级 | 负责人 | 状态 | PM 验证 |
|---|------|------|-------|------|--------|
| 13 | `onboarding/onboarding-flow.spec.ts` | onboarding | feature-writer | done | - |
| 14 | `ai/task-tool.spec.ts` | ai | feature-writer | done | - |
| 15 | `server/browser-tool-config.spec.ts` | server | feature-writer | done | - |
| 16 | `smoke/permission-config-ui.spec.ts` | smoke | feature-writer | done | - |
| 17 | `server/sandbox-readiness.spec.ts` | server | feature-writer | done | - |
| 18 | `smoke/agent-config-interaction.spec.ts` | smoke | feature-writer | done | - |

### P2 覆盖扩展（6 文件）

| # | 文件 | 层级 | 负责人 | 状态 | PM 验证 |
|---|------|------|-------|------|--------|
| 19 | `server/template-creation-all.spec.ts` | server | coverage-writer | done | - |
| 20 | `smoke/template-full.spec.ts` | smoke | coverage-writer | done | - |
| 21 | `server/message-uploads.spec.ts` | server | coverage-writer | done | - |
| 22 | `smoke/project-advanced.spec.ts` | smoke | coverage-writer | done | - |
| 23 | `smoke/agent-advanced.spec.ts` | smoke | coverage-writer | done | - |
| 24 | `server/agent-clone.spec.ts` | server | coverage-writer | done | - |

### P3 辅助功能（3 文件）

| # | 文件 | 层级 | 负责人 | 状态 | PM 验证 |
|---|------|------|-------|------|--------|
| 25 | `smoke/workspace-operations.spec.ts` | smoke | coverage-writer | done | - |
| 26 | `smoke/settings-advanced.spec.ts` | smoke | coverage-writer | done | - |
| 27 | `server/runtime-extended.spec.ts` | server | coverage-writer | done | - |

## 发现的问题（只记录不修改）

> 团队成员在实现过程中发现的现有代码问题记录于此。

| # | 文件 | 问题描述 | 发现人 | 日期 |
|---|------|---------|-------|------|
| 1 | `TeamDetailPage.tsx` | 需求文档要求 smoke/team-crud.spec.ts 测试"编辑、删除"，但 TeamDetailPage 只渲染 TeamTopologyView，无 edit/delete 按钮。TeamCreateModal 也无 instruction 字段和成员选择器。team-crud 测试改为覆盖：UI 创建、名称验证、卡片导航、克隆、API 删除验证。 | team-memory-writer | 2026-03-15 |
| 2 | `test-helper.ts` / `conversations.ts` | `createConversationViaApi` helper 传 `{ agentId, title }` 但 conversation POST 路由现要求 `{ targetType, targetId, title }`（缺失 targetType/targetId 时返回 400 TARGET_REQUIRED）。`createTeamChatViaApi` 已正确使用新格式。现有 `conversation-api.spec.ts` 和 `chat-lifecycle.spec.ts` 中直接用 `{ agentId }` 的调用也受影响。新测试（#8-#12）已使用正确的 `{ targetType: 'agent', targetId }` 格式。 | chat-deletion-writer | 2026-03-15 |

## PM 验证记录

| 范围 | 验证结果 | 问题 | 日期 |
|------|---------|------|------|
| Phase 0（testid/SELECTORS/Helper/Onboarding） | ✅ 通过 | 无 | 2026-03-15 |
| #1-#7 Team + Memory（team-memory-writer） | ✅ 通过 | 无 | 2026-03-15 |
| #8-#12 Chat + Deletion（chat-deletion-writer） | ✅ 通过 | 无 | 2026-03-15 |
| #13-#18 P1 Features（feature-writer） | ✅ 通过 | 无 | 2026-03-15 |
| #19-#27 P2+P3 Coverage（coverage-writer） | ✅ 通过 | 无 | 2026-03-15 |
