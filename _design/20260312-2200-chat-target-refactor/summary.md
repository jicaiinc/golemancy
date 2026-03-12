# ChatTarget 重构 — Team Lead 汇总 & 实现计划

> 创建时间：2026-03-12
> 角色：Team Lead
> 输入：架构设计、事实验证报告、抽象策略审查报告

---

## 设计决策汇总

### 采纳的架构设计

1. **ChatTarget 类型** — `{ kind: 'agent'; agentId: AgentId } | { kind: 'team'; teamId: TeamId }` discriminated union，定义在 `common.ts`
2. **三个实体变更** — Conversation/CronJob 的 `agentId + teamId?` → `target: ChatTarget`；Project 的 `defaultAgentId? + defaultTeamId?` → `defaultTarget?: ChatTarget`
3. **迁移兼容策略** — SQLite: migration v10 新增 `target_kind + target_id`，数据自动回填；File-based: normalize() 懒迁移

### 基于审查的修正（4 项）

| # | 原架构方案 | 修正后 | 理由 |
|---|-----------|--------|------|
| 1 | 保留 SQLite `agent_id` 冗余列做索引 | **不保留冗余列**，migration 完成后 DROP `agent_id` 和 `team_id` | 抽象策略师发现 list() 的 agentId 过滤功能无实际消费者；冗余列引入 team leader 变更时的一致性风险 |
| 2 | Chat transport body 传 `target` | **仅传 `{ projectId, conversationId }`**，server 从 DB 读 target | conversationId 总是存在（代码审查确认）；消除了引发本次重构的 client 缓存 stale 数据的根源 |
| 3 | 5 个工具函数全部保留 | **删除 `resolveTargetTeamId`**（内联更清晰）；**`getTargetDisplayName` 移到 UI 层** | resolveTargetTeamId 仅一行代码；getTargetDisplayName 依赖展示逻辑，不属于 shared 包 |
| 4 | useMemo deps 用 `JSON.stringify(target)` | **用 `encodeChatTarget(target)` 派生稳定字符串** | JSON.stringify 是 React anti-pattern；encodeChatTarget 已存在可复用 |

### 最终工具函数清单（shared 包 3 个 + UI 包 3 个）

**`packages/shared/src/utils/chat-target.ts`**:
- `resolveTargetAgentId(target, teams)` — 从 target 解析实际 agentId
- `chatTargetFromLegacy(agentId, teamId?)` — 兼容工厂，migration 用
- `chatTargetEquals(a, b)` — 值相等比较

**`packages/ui/src/lib/chat-target.ts`**（替代旧 `team-select.ts`）:
- `encodeChatTarget(target)` — 序列化为 select value 字符串
- `decodeChatTarget(value)` — 反序列化
- `getTargetDisplayName(target, agents, teams)` — 展示名称

### 最终 SQLite Migration v10

```sql
-- 1. Add new columns
ALTER TABLE conversations ADD COLUMN target_kind TEXT NOT NULL DEFAULT 'agent';
ALTER TABLE conversations ADD COLUMN target_id TEXT NOT NULL DEFAULT '';

-- 2. Populate from existing data
UPDATE conversations
SET target_kind = CASE WHEN team_id IS NOT NULL AND team_id != '' THEN 'team' ELSE 'agent' END,
    target_id   = CASE WHEN team_id IS NOT NULL AND team_id != '' THEN team_id ELSE agent_id END;

-- 3. Index
CREATE INDEX IF NOT EXISTS idx_conversations_target ON conversations(target_kind, target_id);

-- 4. Drop old columns and index
DROP INDEX IF EXISTS idx_conversations_agent;
ALTER TABLE conversations DROP COLUMN team_id;
ALTER TABLE conversations DROP COLUMN agent_id;
```

### 最终 Chat Transport Body

```typescript
// chat-instances.ts — body 只传 projectId + conversationId
body: {
  projectId: config.projectId,
  conversationId: config.conversationId,
}

// ChatInstanceConfig — 移除 target/agentId 字段
interface ChatInstanceConfig {
  conversationId: ConversationId
  projectId: ProjectId
  initialMessages: Message[]
  serverConfig: { baseUrl: string; token: string } | null
}
```

Server chat route 统一从 conversation DB 读 target：
```typescript
// 不再信任 body 中的 agentId/target
const conv = await deps.conversationStorage.getById(projectId, conversationId)
if (!conv) return c.json({ error: 'CONVERSATION_NOT_FOUND' }, 404)
const target = conv.target
```

---

## 实现计划

### Phase 1: shared 包类型 + 工具函数

**一次性完成，不可拆分。shared 是 zero runtime 包，自身编译不会失败。**

| 文件 | 改动 |
|------|------|
| `shared/src/types/common.ts` | 新增 `ChatTarget` 类型 |
| `shared/src/utils/chat-target.ts` | 新建，3 个工具函数 |
| `shared/src/index.ts` | 导出新增内容 |
| `shared/src/types/conversation.ts` | `agentId + teamId?` → `target: ChatTarget` |
| `shared/src/types/cronjob.ts` | `agentId + teamId?` → `target: ChatTarget` |
| `shared/src/types/project.ts` | `defaultAgentId? + defaultTeamId?` → `defaultTarget?: ChatTarget` |
| `shared/src/services/interfaces.ts` | 更新 3 个 service 签名 |

### Phase 2: Server 包

**顺序执行，每步完成后目标是 server 包可编译。**

| 步骤 | 文件 | 改动 |
|------|------|------|
| 2.1 | `server/src/db/schema.ts` | 用 `targetKind + targetId` 替换 `agentId + teamId` |
| 2.2 | `server/src/db/migrate.ts` | 新增 v10 migration（add columns → populate → index → drop old） |
| 2.3 | `server/src/storage/conversations.ts` | 更新 create/update/list/rowToConversation |
| 2.4 | `server/src/storage/projects.ts` | 更新 normalize/update，处理 defaultTarget |
| 2.5 | `server/src/storage/cronjobs.ts` | 新增 normalizeCronJob，更新 CRUD |
| 2.6 | `server/src/storage/clone-project.ts` | 更新克隆逻辑中的字段 |
| 2.7 | `server/src/routes/conversations.ts` | POST/PATCH 参数变更 |
| 2.8 | `server/src/routes/chat.ts` | 统一从 conversation DB 读 target，删除双段 agentId/teamId 解析 |
| 2.9 | `server/src/scheduler/executor.ts` | 从 cronJob.target 解析 agentId 和 team |
| 2.10 | `server/src/agent/sub-agent.ts` | create conversation 传 target |
| 2.11 | `server/src/storage/dashboard.ts` | 检查是否有 agentId/teamId 引用需要适配 |
| 2.12 | `server/src/ws/events.ts` | 检查事件中的字段 |

### Phase 3: UI 包

| 步骤 | 文件 | 改动 |
|------|------|------|
| 3.1 | `ui/src/lib/chat-target.ts` | 新建，encodeChatTarget/decodeChatTarget/getTargetDisplayName |
| 3.2 | `ui/src/lib/chat-instances.ts` | 移除 agentId/target，body 只传 projectId + conversationId |
| 3.3 | `ui/src/services/http/services.ts` | conversation/cronJob/project 请求体变更 |
| 3.4 | `ui/src/services/mock/data.ts` | seed data 适配 |
| 3.5 | `ui/src/services/mock/services.ts` | mock service 签名适配 |
| 3.6 | `ui/src/stores/useAppStore.ts` | createConversation/updateConversation/createCronJob/updateProject 签名变更 |
| 3.7 | `ui/src/pages/chat/ChatWindow.tsx` | target select + useMemo deps(encodeChatTarget) + onSwitchTarget |
| 3.8 | `ui/src/pages/chat/ChatPage.tsx` | handleNewChat/handleSwitchTarget 简化 |
| 3.9 | `ui/src/pages/chat/ChatSidebar.tsx` | 从 target 读取展示信息 |
| 3.10 | `ui/src/pages/chat/ChatEmptyState.tsx` | defaultTarget 适配 |
| 3.11 | `ui/src/pages/cron/CronJobFormModal.tsx` | 单 target state 替代双 state |
| 3.12 | `ui/src/pages/cron/CronJobsPage.tsx` | 列表展示适配 |
| 3.13 | `ui/src/pages/project/ProjectSettingsPage.tsx` | defaultTarget select |
| 3.14 | `ui/src/app/layouts/ProjectLayout.tsx` | defaultTarget 检查 |
| 3.15 | `ui/src/components/layout/StatusBar.tsx` | 检查 agentId 引用 |
| 3.16 | `ui/src/pages/team/TeamListPage.tsx` | 检查引用 |
| 3.17 | `ui/src/pages/dashboard/components/OverviewPanel.tsx` | 检查引用 |
| 3.18 | 删除 `ui/src/lib/team-select.ts` | 不再需要 |

### Phase 4: 测试更新

**可并行，按 server / UI / E2E 三组分配。**

Server 测试:
- `server/src/storage/conversations.test.ts`
- `server/src/storage/cronjobs.test.ts`
- `server/src/storage/projects.test.ts`
- `server/src/routes/chat.test.ts`
- `server/src/routes/conversations.test.ts`（如有）
- `server/src/routes/agents.test.ts`（defaultAgentId 相关）
- `server/src/agent/sub-agent.test.ts`
- `server/src/db/migrate-v2.test.ts`（migration 测试）

UI 测试:
- `ui/src/lib/chat-instances.test.ts`
- `ui/src/services/mock/services.test.ts`
- `ui/src/services/http/services.test.ts`
- `ui/src/services/mock/dashboard-types.test.ts`
- `ui/src/stores/useAppStore.test.ts`
- `ui/src/pages/project/ProjectSettingsPage.test.tsx`
- `ui/src/pages/chat/ChatWindow.test.tsx`
- `ui/src/pages/onboarding/OnboardingPage.test.tsx`

E2E 测试:
- `apps/desktop/e2e/server/conversation-api.spec.ts`
- `apps/desktop/e2e/server/cronjob-api.spec.ts`
- `apps/desktop/e2e/smoke/chat-sidebar.spec.ts`
- `apps/desktop/e2e/ai/chat-lifecycle.spec.ts`
- `apps/desktop/e2e/ai/cronjob-execution.spec.ts`
- `apps/desktop/e2e/ai/token-accuracy.spec.ts`
- `apps/desktop/e2e/fixtures/test-helper.ts`

### Phase 5: 验证 & 清理

1. `pnpm lint` — 全包类型检查通过
2. `pnpm test` — 单元测试全通过
3. 全局搜索残留：`\.agentId` + `\.teamId` 在 Conversation/CronJob/Project 上下文中
4. 全局搜索：`defaultAgentId`、`defaultTeamId`、`encodeTeamValue`、`decodeSelectValue`
5. `pnpm dev` 冒烟测试

---

## 实现分工建议

Phase 1-3 建议线性执行（降低复杂度），由全栈工程师独立完成。Phase 4 可拆分为 server 测试组和 UI 测试组并行。

预估改动文件数：~45 个（与需求文档一致）。
