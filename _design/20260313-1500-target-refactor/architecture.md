# Architecture Design: targetType + targetId 统一方案

> 创建时间：2026-03-13
> 状态：Draft
> 需求基准：`_requirement/20260313-1500-target-refactor.md`

---

## 1. 命名方案

### 推荐：`targetType` + `targetId` (扁平双字段)

**对比分析：**

| 方案 | 优点 | 缺点 |
|------|------|------|
| `targetType` + `targetId` | 扁平结构，DB 列直接映射；JSON 序列化简单；与现有 `id: ConversationId` 无冲突 | 两个字段需要同步维护 |
| `target: { type, id }` | 语义聚合为单对象 | SQLite 无嵌套列，需 JSON 序列化存储或拆成两列；TypeScript 嵌套类型解构冗余 |
| `target: TargetRef` (branded) | 强类型封装 | 过度抽象，增加理解成本 |

**选择理由：**
1. SQLite 天然支持扁平列 → `target_type TEXT` + `target_id TEXT`，无需 JSON 序列化
2. Drizzle ORM schema 直接映射，无需自定义 serializer
3. 与现有代码风格一致（`agentId`, `projectId` 等均为扁平字段）
4. `targetType` 与 `targetId` 在 Conversation（有 `id: ConversationId`）、CronJob（有 `id: CronJobId`）、Project 类型中均无命名冲突

---

## 2. 类型定义变更

### 2.1 新增通用类型 (`packages/shared/src/types/common.ts`)

```typescript
/** The kind of entity a conversation / cron job / project targets */
export type TargetType = 'agent' | 'team'
```

### 2.2 Conversation (`packages/shared/src/types/conversation.ts`)

**Before:**
```typescript
export interface Conversation extends Timestamped {
  id: ConversationId
  projectId: ProjectId
  agentId: AgentId
  teamId?: TeamId
  title: string
  messages: Message[]
  lastMessageAt: string
  compactRecords?: CompactRecord[]
}
```

**After:**
```typescript
import type { AgentId, ConversationId, MessageId, ProjectId, TeamId, TargetType, Timestamped } from './common'

export interface Conversation extends Timestamped {
  id: ConversationId
  projectId: ProjectId
  targetType: TargetType
  targetId: AgentId | TeamId
  title: string
  messages: Message[]
  lastMessageAt: string
  compactRecords?: CompactRecord[]
}
```

### 2.3 CronJob (`packages/shared/src/types/cronjob.ts`)

**Before:**
```typescript
export interface CronJob extends Timestamped {
  id: CronJobId
  projectId: ProjectId
  agentId: AgentId
  teamId?: TeamId
  name: string
  // ...
}
```

**After:**
```typescript
import type { CronJobId, ProjectId, AgentId, TeamId, ConversationId, TargetType, Timestamped } from './common'

export interface CronJob extends Timestamped {
  id: CronJobId
  projectId: ProjectId
  targetType: TargetType
  targetId: AgentId | TeamId
  name: string
  cronExpression: string
  enabled: boolean
  instruction?: string
  scheduleType: 'cron' | 'once'
  scheduledAt?: string
  lastRunAt?: string
  nextRunAt?: string
  lastRunStatus?: CronJobRunStatus
  lastRunId?: string
}
```

**CronJobRun — 保留 `agentId`：**
```typescript
export interface CronJobRun extends Timestamped {
  id: string
  cronJobId: CronJobId
  projectId: ProjectId
  agentId: AgentId          // 保留：这是实际执行的 agent，不是 target 概念
  conversationId?: ConversationId
  status: CronJobRunStatus
  durationMs?: number
  error?: string
  triggeredBy: 'schedule' | 'manual'
}
```

> **注**：`CronJobRun.agentId` 保留不变。它记录的是「实际执行此次运行的 agent」，即使 CronJob target 是 team，最终执行的仍然是从 team 解析出来的 leader agent。这是运行记录的事实字段，不属于 target 双字段问题。`token_records.agent_id` 同理。

### 2.4 Project (`packages/shared/src/types/project.ts`)

**Before:**
```typescript
export interface Project extends Timestamped {
  id: ProjectId
  name: string
  description: string
  icon: string
  config: ProjectConfig
  defaultAgentId?: AgentId
  defaultTeamId?: TeamId
  // ...
}
```

**After:**
```typescript
import type { ProjectId, AgentId, TeamId, TargetType, Timestamped } from './common'
import type { ProjectConfig } from './settings'

export interface Project extends Timestamped {
  id: ProjectId
  name: string
  description: string
  icon: string
  config: ProjectConfig
  defaultTargetType?: TargetType
  defaultTargetId?: AgentId | TeamId
  agentCount: number
  activeAgentCount: number
  lastActivityAt: string
}
```

> **注**：Project 的 default target 允许两个都为 `undefined`（即未配置默认目标），所以仍然用 `?` 可选。两个字段要么同时有值，要么同时为 `undefined`。

---

## 3. Branded Type 处理

`targetId` 类型为 `AgentId | TeamId`。这是联合类型，不新增 branded type。

使用方需通过 `targetType` 判断具体类型：

```typescript
function narrowTargetId(targetType: TargetType, targetId: AgentId | TeamId): { agentId: AgentId } | { teamId: TeamId } {
  if (targetType === 'agent') return { agentId: targetId as AgentId }
  return { teamId: targetId as TeamId }
}
```

---

## 4. DB Schema 变更 (`packages/server/src/db/schema.ts`)

### 4.1 conversations 表

**Before:**
```typescript
export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull(),
  teamId: text('team_id'),
  title: text('title').notNull(),
  lastMessageAt: text('last_message_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})
```

**After:**
```typescript
export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  targetType: text('target_type').notNull(),   // 'agent' | 'team'
  targetId: text('target_id').notNull(),       // AgentId | TeamId
  title: text('title').notNull(),
  lastMessageAt: text('last_message_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})
```

### 4.2 cron_job_runs 表 — 不变

`cron_job_runs.agent_id` 保留。理由同 2.3 节。

### 4.3 索引变更

旧索引 `idx_conversations_agent ON conversations(agent_id)` 删除，新增：
```sql
CREATE INDEX idx_conversations_target ON conversations(target_type, target_id)
```

---

## 5. 迁移脚本设计 (`packages/server/src/db/migrate.ts`)

在 `migrateDatabase()` 末尾添加 Migration v10：

```typescript
// --- Migration v10: unify agentId + teamId → targetType + targetId ---
const convColsV10 = db.all<{ name: string }>(sql`PRAGMA table_info(conversations)`)
const hasAgentId = convColsV10.some(c => c.name === 'agent_id')
const hasTargetType = convColsV10.some(c => c.name === 'target_type')

if (hasAgentId && !hasTargetType) {
  log.info('migrating conversations: unifying agent_id + team_id → target_type + target_id')

  // Step 1: Add new columns with safe defaults
  // SQLite ADD COLUMN 不支持 NOT NULL 无 DEFAULT，所以给 DEFAULT 值防止中间状态崩溃
  db.run(sql`ALTER TABLE conversations ADD COLUMN target_type TEXT DEFAULT 'agent'`)
  db.run(sql`ALTER TABLE conversations ADD COLUMN target_id TEXT DEFAULT ''`)

  // Step 2: Migrate data — if team_id is set, target is team; otherwise agent
  db.run(sql`
    UPDATE conversations
    SET target_type = CASE WHEN team_id IS NOT NULL THEN 'team' ELSE 'agent' END,
        target_id   = CASE WHEN team_id IS NOT NULL THEN team_id ELSE agent_id END
  `)

  // Step 3: Drop old columns
  // SQLite 3.35+ supports ALTER TABLE ... DROP COLUMN, which we already use elsewhere.
  db.run(sql`ALTER TABLE conversations DROP COLUMN agent_id`)
  db.run(sql`ALTER TABLE conversations DROP COLUMN team_id`)

  // Step 4: Update index
  db.run(sql`DROP INDEX IF EXISTS idx_conversations_agent`)
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_conversations_target ON conversations(target_type, target_id)`)

  log.info('migration v10 complete: conversations unified')
} else if (!hasAgentId && !hasTargetType) {
  // 全新数据库（CREATE TABLE IF NOT EXISTS 已建新 schema），确保索引存在
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_conversations_target ON conversations(target_type, target_id)`)
}
```

**中间状态防护说明：**
- `ADD COLUMN ... DEFAULT 'agent'` / `DEFAULT ''` 确保即使迁移在 Step 1 和 Step 2 之间崩溃，已有行也有合法默认值，不会导致 Drizzle ORM `.notNull()` 约束报错
- `hasAgentId && !hasTargetType` 双条件检查确保：已迁移过的数据库不会重复执行；全新数据库直接跳过
- `else if` 分支处理全新安装场景（CREATE TABLE 已用新 schema，只需补索引）

### CronJob 迁移（文件系统）

CronJob 存储在文件系统 JSON 中，无需 SQL 迁移。在 `FileCronJobStorage` 读取时做 normalize：

```typescript
private normalize(job: CronJob): CronJob {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = job as any
  if (raw.agentId && !raw.targetType) {
    return {
      ...job,
      targetType: raw.teamId ? 'team' : 'agent',
      targetId: raw.teamId ?? raw.agentId,
    }
  }
  return job
}
```

> normalize 仅在过渡期使用。后续可以通过批量写入工具一次性转换所有 JSON 文件后删除。

### Project 迁移（文件系统）

同理，在 `FileProjectStorage.normalize()` 中处理旧字段：

```typescript
private normalize(project: Project): Project {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = project as any

  let result = { ...project }

  // Migrate legacy mainAgentId → defaultAgentId (existing migration)
  const legacyDefaultAgentId = raw.defaultAgentId ?? raw.mainAgentId

  // Migrate defaultAgentId + defaultTeamId → defaultTargetType + defaultTargetId
  if (!raw.defaultTargetType) {
    const defaultTeamId = raw.defaultTeamId
    if (defaultTeamId) {
      result.defaultTargetType = 'team'
      result.defaultTargetId = defaultTeamId
    } else if (legacyDefaultAgentId) {
      result.defaultTargetType = 'agent'
      result.defaultTargetId = legacyDefaultAgentId
    }
    // else: no default target, both remain undefined
  }

  return result
}
```

### 5.4 Dashboard SQL 改造 (`dashboard.ts` + `global-dashboard.ts`)

conversations 表 drop `agent_id` 列后，两个 dashboard 文件中共 **9 处**原始 SQL 引用 `c.agent_id` 会崩溃，必须同步改造。

#### 分类处理策略

**A. WHERE 过滤（按 agent 过滤对话）→ 改为 `c.target_id`**

不加 `AND c.target_type = 'agent'` 条件，因为：
- AgentId 前缀 `agent-`，TeamId 前缀 `team-`，不会交叉匹配
- 简化查询，避免遗漏 team 场景下 agent 作为 leader 的情况

**B. SELECT 选取（取出 agent_id 用于显示）→ 改为 `c.target_type, c.target_id`**

结果映射代码需要同步更新，根据 `target_type` 解析为 agent name 或 team name。

#### 逐条改造清单

**`packages/server/src/storage/dashboard.ts`:**

| # | 方法 | 行号 | 当前 SQL | 改造 | 类型 |
|---|------|------|---------|------|------|
| 1 | `getAgentStats` | L138-139 | `WHERE agent_id = ${agent.id}` | `WHERE target_id = ${agent.id}` | WHERE |
| 2 | `getAgentStats` | L150 | `WHERE c.agent_id = ${agent.id}` (token fallback, with date) | `WHERE c.target_id = ${agent.id}` | WHERE |
| 3 | `getAgentStats` | L158 | `WHERE c.agent_id = ${agent.id}` (token fallback, no date) | `WHERE c.target_id = ${agent.id}` | WHERE |
| 4 | `getAgentStats` | L172 | `WHERE c.agent_id = ${agent.id}` (task count) | `WHERE c.target_id = ${agent.id}` | WHERE |
| 5 | `getAgentStats` | L183 | `WHERE c.agent_id = ${agent.id}` (last active) | `WHERE c.target_id = ${agent.id}` | WHERE |
| 6 | `getRecentChats` | L221-227 | `SELECT c.id, c.agent_id, c.title, ...` | `SELECT c.id, c.target_type, c.target_id, c.title, ...` | SELECT |
| 7 | `getTokenByAgent` | L399-404 | `SELECT c.agent_id, ...` (fallback UNION) | `SELECT c.target_id as agent_id, ...` | SELECT |
| 8 | `getRuntimeStatus` | L548-549 | `SELECT c.id, c.agent_id, c.title, ...` (recent completed) | `SELECT c.id, c.target_type, c.target_id, c.title, ...` | SELECT |

**`packages/server/src/storage/global-dashboard.ts`:**

| # | 方法 | 行号 | 当前 SQL | 改造 | 类型 |
|---|------|------|---------|------|------|
| 9 | `getTokenByAgent` | L153-154 | `SELECT c.agent_id, ...` (fallback UNION) | `SELECT c.target_id as agent_id, ...` | SELECT |
| 10 | `getRuntimeStatus` | L456-457 | `SELECT c.id, c.agent_id, c.title, ...` (recent completed) | `SELECT c.id, c.target_type, c.target_id, c.title, ...` | SELECT |

#### 结果映射代码变更

**`getRecentChats` (dashboard.ts L219-257):**
```typescript
// Before: row type
{ id: string; agent_id: string; title: string; ... }
// After: row type
{ id: string; target_type: string; target_id: string; title: string; ... }

// Before: mapping
agentId: row.agent_id as AgentId,
agentName: agentMap.get(row.agent_id as AgentId) ?? 'Unknown',

// After: mapping — resolve to agent name or team name
agentId: (row.target_type === 'agent' ? row.target_id : null) as AgentId,
agentName: row.target_type === 'agent'
  ? (agentMap.get(row.target_id as AgentId) ?? 'Unknown')
  : (teamMap.get(row.target_id as TeamId) ?? 'Unknown'),
```

> 注：需要在方法开头加载 `teamMap`（`new Map(teams.map(t => [t.id, t.name]))`）供 team target 解析。或者更简单的做法是用一个统一的 `nameMap` 合并 agent + team。

**`getRuntimeStatus` recent completed chats (dashboard.ts L548-572, global-dashboard.ts L456-481):**
同上模式——映射 `row.agent_id` → `row.target_type` + `row.target_id`，按类型查找名称。

**`getTokenByAgent` fallback (dashboard.ts L399, global-dashboard.ts L153):**
```sql
-- Before:
SELECT c.agent_id, m.input_tokens as inp, m.output_tokens as out
FROM messages m JOIN conversations c ON c.id = m.conversation_id
WHERE c.agent_id = ${agent.id} ...

-- After:
SELECT c.target_id as agent_id, m.input_tokens as inp, m.output_tokens as out
FROM messages m JOIN conversations c ON c.id = m.conversation_id
WHERE c.target_id = ${agent.id} ...
```
> 这里用 `as agent_id` alias 保持 UNION 列名一致（`token_records.agent_id` 在上半部分）。对于 team-targeted 对话，`c.target_id` 是 TeamId，不会匹配任何 AgentId（前缀不同），所以不会错误计入。

#### CronJob `agentId` 属性引用（非 SQL）

dashboard.ts L504 和 global-dashboard.ts L407-408 中：
```typescript
// Before:
agentId: job.agentId,
agentName: agentMap.get(job.agentId as string) ?? 'Unknown',

// After — 需要用 resolveAgentId() 解析:
// 方案 A（简单）: 在上游循环中预解析
const resolvedAgentId = job.targetType === 'agent'
  ? job.targetId as AgentId
  : teamLeaderMap.get(job.targetId as TeamId) ?? (job.targetId as AgentId)

agentId: resolvedAgentId,
agentName: agentMap.get(resolvedAgentId as string) ?? 'Unknown',
```
> 需要提前构建 `teamLeaderMap: Map<TeamId, AgentId>`，从已加载的 teams 中提取每个 team 的 leader agentId。

---

## 6. `resolveAgentId()` 工具函数

### 位置：`packages/shared/src/utils/target.ts`（新文件）

放在 `shared` 而非 `server`，因为 UI 端也需要（如 ChatPage 创建新对话时需要从 team 解析 leader agent）。

### 签名与实现

```typescript
import type { AgentId, TeamId, TargetType } from '../types/common'
import type { Team } from '../types/team'

/**
 * Resolve the effective agent ID from a target.
 *
 * - If targetType is 'agent', returns targetId directly.
 * - If targetType is 'team', finds the leader agent (member without parentAgentId).
 *
 * @throws if targetType is 'team' but team is not provided or has no leader
 */
export function resolveAgentId(
  targetType: TargetType,
  targetId: AgentId | TeamId,
  team?: Team,
): AgentId {
  if (targetType === 'agent') {
    return targetId as AgentId
  }

  // targetType === 'team'
  if (!team) {
    throw new Error(`Cannot resolve agent from team target ${targetId}: team not provided`)
  }
  const leader = team.members.find(m => !m.parentAgentId)
  if (!leader) {
    throw new Error(`Team ${team.id} has no leader agent`)
  }
  return leader.agentId
}
```

### Export

`packages/shared/src/utils/index.ts` (新建或追加):
```typescript
export { resolveAgentId } from './target'
```

`packages/shared/src/index.ts` 追加:
```typescript
export * from './utils'
```

---

## 7. 需要删除的代码

### 7.1 `normalizeDefaultTarget()` — 完全删除

- **文件**: `packages/server/src/storage/projects.ts:13-28`
- **原因**: 该函数的存在就是为了处理 `defaultAgentId` 和 `defaultTeamId` 互斥问题，新方案从根本上消除了这个问题

### 7.2 Project.update() 互斥逻辑 — 完全删除

- **文件**: `packages/server/src/storage/projects.ts:115-127`
- **代码**: `if (hasOwnProperty('defaultTeamId') ...) updated.defaultAgentId = undefined` 及反向
- **原因**: 新方案只有 `defaultTargetType` + `defaultTargetId`，不存在互斥

### 7.3 Project.normalize() 中的 mainAgentId 迁移 — 替换

- **文件**: `packages/server/src/storage/projects.ts:31-38`
- **替换为**: 新 normalize 逻辑（见第 5 节）

### 7.4 Chat 路由中的双字段解析逻辑

- **文件**: `packages/server/src/routes/chat.ts:59-61` — 请求体中 `agentId?` + `teamId?`
- **文件**: `packages/server/src/routes/chat.ts:84-117` — 分别从 body/conv 解析 agentId、teamId
- **替换为**: 请求体传 `targetType` + `targetId`（或 `conversationId`），用 `resolveAgentId()` 统一解析

### 7.5 UI team-select.ts `decodeSelectValue` 返回值

- **文件**: `packages/ui/src/lib/team-select.ts`
- **现在返回**: `{ teamId: TeamId } | { agentId: AgentId }`
- **改为返回**: `{ targetType: TargetType, targetId: AgentId | TeamId }`

### 7.6 ChatPage 中的 defaultAgentId / defaultTeamId 分支

- **文件**: `packages/ui/src/pages/chat/ChatPage.tsx:158-179`
- **现在**: 分别检查 `defaultTeamId` 和 `defaultAgentId`，手动查找 leader
- **替换为**: 使用 `project.defaultTargetType` + `project.defaultTargetId` + `resolveAgentId()`

### 7.7 ProjectSettingsPage 中的互斥更新

- **文件**: `packages/ui/src/pages/project/ProjectSettingsPage.tsx:55-64`
- **现在**: `updateProject(id, { defaultAgentId: undefined, defaultTeamId: parsed.teamId })`
- **替换为**: `updateProject(id, { defaultTargetType: 'team', defaultTargetId: parsed.teamId })`

### 7.8 Agent/Team 删除时的 cascade 逻辑

- **文件**: `packages/server/src/routes/agents.ts:75-80` — `if (project.defaultAgentId === agentId)`
- **文件**: `packages/server/src/routes/teams.ts:91-96` — `if (project.defaultTeamId === teamId)`
- **替换为**: 统一为 `if (project.defaultTargetId === deletedId)` 清除 `defaultTargetType` 和 `defaultTargetId`

---

## 8. 完整影响清单

### `packages/shared/`

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/types/common.ts` | 新增 | 添加 `TargetType` 类型 |
| `src/types/conversation.ts` | 修改 | `agentId` + `teamId?` → `targetType` + `targetId` |
| `src/types/cronjob.ts` | 修改 | `CronJob`: `agentId` + `teamId?` → `targetType` + `targetId`。`CronJobRun.agentId` 不变 |
| `src/types/project.ts` | 修改 | `defaultAgentId?` + `defaultTeamId?` → `defaultTargetType?` + `defaultTargetId?` |
| `src/services/interfaces.ts` | 修改 | `IConversationService.create/update`, `IProjectService.update`, `ICronJobService.create/update` 签名更新 |
| `src/utils/target.ts` | 新建 | `resolveAgentId()` 函数 |
| `src/index.ts` | 修改 | 导出新工具函数 |

### `packages/server/`

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/db/schema.ts` | 修改 | conversations 表: `agentId`+`teamId` → `targetType`+`targetId` |
| `src/db/migrate.ts` | 修改 | 新增 Migration v10 |
| `src/storage/conversations.ts` | 修改 | 全面更新 CRUD、rowToConversation、list filter、create/update 签名 |
| `src/storage/projects.ts` | 修改 | 删除 `normalizeDefaultTarget()`，重写 `normalize()`，更新 `update()` 签名 |
| `src/storage/cronjobs.ts` | 修改 | create/update 签名中的 `agentId` → `targetType`+`targetId`，添加 normalize |
| `src/storage/clone-project.ts` | 修改 | CronJob/Project clone 中的字段 remap |
| `src/storage/cron-job-runs.ts` | 不变 | `agentId` 保留（执行记录字段） |
| `src/storage/dashboard.ts` | 修改 | 8 处 `c.agent_id` SQL → `c.target_type`/`c.target_id`，结果映射适配 |
| `src/storage/global-dashboard.ts` | 修改 | 2 处 `c.agent_id` SQL → `c.target_type`/`c.target_id`，结果映射适配 |
| `src/routes/chat.ts` | 修改 | 请求体解析改用 targetType/targetId，用 `resolveAgentId()` 解析 agent |
| `src/routes/conversations.ts` | 修改 | create/update API 参数 |
| `src/routes/cronjobs.ts` | 不变 | 透传数据到 storage，storage 签名变即可 |
| `src/routes/agents.ts` | 修改 | 删除 cascade 中 `defaultAgentId` → 改为 `defaultTargetId` |
| `src/routes/teams.ts` | 修改 | 删除 cascade 中 `defaultTeamId` → 改为 `defaultTargetId` |
| `src/scheduler/executor.ts` | 修改 | 使用 `resolveAgentId()` 解析 CronJob target |

### `packages/ui/`

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/lib/team-select.ts` | 修改 | `decodeSelectValue` 返回 `{ targetType, targetId }` |
| `src/lib/chat-instances.ts` | 修改 | `getOrCreateChat` 参数从 `agentId` 可能需要适配 |
| `src/stores/useAppStore.ts` | 修改 | `createConversation`, `updateConversation`, `createCronJob`, `updateCronJob`, `deleteAgent`(cascade), `deleteTeam`(cascade), `updateProject` 签名和实现 |
| `src/pages/chat/ChatPage.tsx` | 修改 | `defaultAgentId/defaultTeamId` → `defaultTargetType/defaultTargetId`，使用 `resolveAgentId()` |
| `src/pages/chat/ChatWindow.tsx` | 修改 | `conversation.agentId/teamId` → `conversation.targetType/targetId` |
| `src/pages/chat/ChatEmptyState.tsx` | 修改 | props 从 `defaultAgentId` → `defaultTargetId`（或按需调整） |
| `src/pages/cron/CronJobFormModal.tsx` | 修改 | `agentId/teamId` state → `targetType/targetId` |
| `src/pages/project/ProjectSettingsPage.tsx` | 修改 | `defaultAgentId/defaultTeamId` → `defaultTargetType/defaultTargetId` |
| `src/services/http/services.ts` | 修改 | Conversation create/update, CronJob create/update, Project update 参数 |
| `src/services/mock/services.ts` | 修改 | 同上 mock 实现 |
| `src/services/mock/data.ts` | 修改 | seed 数据 `defaultAgentId` → `defaultTargetType/defaultTargetId` |

### 测试文件

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `packages/server/src/storage/projects.test.ts` | 修改 | normalizeDefaultTarget 测试 → 新 normalize 测试 |
| `packages/server/src/routes/agents.test.ts` | 修改 | cascade `defaultAgentId` → `defaultTargetId` |
| `packages/server/src/routes/teams.test.ts` | 修改 | cascade `defaultTeamId` → `defaultTargetId` |
| `packages/server/src/scheduler/executor.test.ts` | 修改 | CronJob mock 数据 |
| `packages/ui/src/stores/useAppStore.test.ts` | 修改 | conversation/project mock 数据 |
| `packages/ui/src/pages/project/ProjectSettingsPage.test.tsx` | 修改 | project mock 数据 |
| `packages/ui/src/pages/onboarding/OnboardingPage.test.tsx` | 修改 | `defaultAgentId` → `defaultTargetType/defaultTargetId` |
| `packages/ui/src/lib/chat-instances.test.ts` | 可能修改 | 如果 `getOrCreateChat` 参数变更 |

---

## 9. chat.ts 请求解析重构方案

当前 `chat.ts` 请求体：
```typescript
{ messages, projectId, agentId?, conversationId?, teamId? }
```

新方案请求体：
```typescript
{ messages, projectId, targetType?, targetId?, conversationId? }
```

解析逻辑重构：
```typescript
// 1. 从 body 或已有 conversation 获取 target
let targetType = body.targetType as TargetType | undefined
let targetId = body.targetId as (AgentId | TeamId) | undefined

if (!targetType && conversationId) {
  const conv = await deps.conversationStorage.getById(projectId, conversationId)
  if (conv) {
    targetType = conv.targetType
    targetId = conv.targetId
  }
}

if (!targetType || !targetId) {
  return c.json({ error: 'TARGET_REQUIRED' }, 400)
}

// 2. 解析实际执行的 agentId
let team: Team | undefined
if (targetType === 'team') {
  team = await deps.teamStorage.getById(projectId, targetId as TeamId) ?? undefined
}

const agentId = resolveAgentId(targetType, targetId, team)
const agent = await deps.agentStorage.getById(projectId, agentId)
if (!agent) {
  return c.json({ error: 'AGENT_NOT_FOUND' }, 404)
}

// 3. 解析 team members（仅当 target 是 team 时）
const teamMembers = team?.members
const teamInstruction = team?.instruction
```

这比当前的「先解析 agentId，再独立解析 teamId」简洁得多，且不存在互斥判断。

---

## 10. CronJob Executor 重构方案

```typescript
// Before:
const agent = await this.deps.agentStorage.getById(projectId, cronJob.agentId)
if (cronJob.teamId) {
  const team = await this.deps.teamStorage.getById(projectId, cronJob.teamId as TeamId)
  // ...
}
const conv = await this.deps.conversationStorage.create(
  projectId, cronJob.agentId, title, cronJob.teamId as TeamId | undefined,
)

// After:
let team: Team | undefined
if (cronJob.targetType === 'team') {
  team = await this.deps.teamStorage.getById(projectId, cronJob.targetId as TeamId) ?? undefined
}
const agentId = resolveAgentId(cronJob.targetType, cronJob.targetId, team)
const agent = await this.deps.agentStorage.getById(projectId, agentId)
const conv = await this.deps.conversationStorage.create(
  projectId, cronJob.targetType, cronJob.targetId, title,
)
```

---

## 11. Conversation.create 签名变更

**Before:**
```typescript
create(projectId: ProjectId, agentId: AgentId, title: string, teamId?: TeamId): Promise<Conversation>
```

**After:**
```typescript
create(projectId: ProjectId, targetType: TargetType, targetId: AgentId | TeamId, title: string): Promise<Conversation>
```

> `targetType` 和 `targetId` 前移至第 2、3 参数，保证必填参数在前。

---

## 12. `chat-instances.ts` 适配

当前 `getOrCreateChat` 接受 `agentId: AgentId`，用于构造请求 body 发送给 server。

改造后 server 请求体需要 `targetType` + `targetId`，因此：

```typescript
// Before:
interface ChatConfig {
  conversationId: ConversationId
  projectId: ProjectId
  agentId: AgentId
  // ...
}

// After:
interface ChatConfig {
  conversationId: ConversationId
  projectId: ProjectId
  targetType: TargetType
  targetId: AgentId | TeamId
  // ...
}
```

ChatWindow 调用处：
```typescript
// Before:
getOrCreateChat({
  conversationId: conversation.id,
  projectId: currentProjectId,
  agentId: conversation.agentId,
  // ...
})

// After:
getOrCreateChat({
  conversationId: conversation.id,
  projectId: currentProjectId,
  targetType: conversation.targetType,
  targetId: conversation.targetId,
  // ...
})
```

---

## 13. team-select.ts 重构

```typescript
// Before:
export function decodeSelectValue(value: string): { teamId: TeamId } | { agentId: AgentId } | null

// After:
import type { AgentId, TeamId, TargetType } from '@golemancy/shared'

export function decodeSelectValue(value: string): { targetType: TargetType; targetId: AgentId | TeamId } | null {
  if (!value) return null
  if (value.startsWith(TEAM_PREFIX)) {
    return { targetType: 'team', targetId: value.slice(TEAM_PREFIX.length) as TeamId }
  }
  return { targetType: 'agent', targetId: value as AgentId }
}
```

---

## 14. 实施顺序建议

1. **Phase 1 — Types & Shared** (无运行时影响)
   - `shared/types/common.ts` 添加 `TargetType`
   - `shared/utils/target.ts` 添加 `resolveAgentId()`
   - 修改 `Conversation`, `CronJob`, `Project` 类型定义
   - 更新 `IConversationService`, `ICronJobService`, `IProjectService` 接口

2. **Phase 2 — Server Storage & DB**
   - 修改 `db/schema.ts`
   - 添加 migration v10 到 `db/migrate.ts`
   - 更新 `storage/conversations.ts`
   - 更新 `storage/projects.ts`（删除 `normalizeDefaultTarget`，重写 `normalize`）
   - 更新 `storage/cronjobs.ts`（添加 normalize）
   - 更新 `storage/clone-project.ts`
   - 更新 `storage/dashboard.ts`（8 处 `c.agent_id` SQL + 结果映射）
   - 更新 `storage/global-dashboard.ts`（2 处 `c.agent_id` SQL + 结果映射）

3. **Phase 3 — Server Routes**
   - 更新 `routes/chat.ts`
   - 更新 `routes/conversations.ts`
   - 更新 `routes/agents.ts`（cascade）
   - 更新 `routes/teams.ts`（cascade）
   - 更新 `scheduler/executor.ts`

4. **Phase 4 — UI**
   - 更新 `lib/team-select.ts`
   - 更新 `lib/chat-instances.ts`
   - 更新 `stores/useAppStore.ts`
   - 更新 `services/http/services.ts`
   - 更新 `services/mock/services.ts` + `mock/data.ts`
   - 更新 pages: `ChatPage`, `ChatWindow`, `ChatEmptyState`, `CronJobFormModal`, `ProjectSettingsPage`

5. **Phase 5 — Tests**
   - 更新所有测试文件中的 mock 数据和断言

---

## 15. 设计检查清单

- [x] 命名无冲突（`targetType`/`targetId` 与现有 `id` 字段不冲突）
- [x] DB 迁移可逆（旧数据→新数据为确定性映射）
- [x] `CronJobRun.agentId` 和 `token_records.agent_id` 保留（运行时事实字段）
- [x] 文件系统 JSON 通过 normalize 兼容旧格式
- [x] `resolveAgentId()` 放在 shared 供 server + UI 共用
- [x] 不保留任何旧字段（`agentId`, `teamId`, `defaultAgentId`, `defaultTeamId`）
- [x] `normalizeDefaultTarget()` 完全删除
- [x] Project.update() 互斥逻辑完全删除
- [x] Dashboard SQL 全部适配（dashboard.ts 8 处 + global-dashboard.ts 2 处）
- [x] 迁移脚本中间状态防护（ADD COLUMN 带 DEFAULT + 列存在检查）
