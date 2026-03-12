# ChatTarget 统一抽象重构 — 架构设计

> 创建时间：2026-03-12
> 需求文档：`_requirement/20260312-2200-chat-target-refactor.md`

---

## 1. ChatTarget 类型设计

### 1.1 核心类型定义

在 `packages/shared/src/types/common.ts` 中新增：

```typescript
// --- ChatTarget discriminated union ---
export type ChatTarget =
  | { kind: 'agent'; agentId: AgentId }
  | { kind: 'team';  teamId: TeamId }
```

设计说明：

- **为什么不用 `targetId: AgentId | TeamId`？** — 因为 branded ID 系统下 `AgentId` 和 `TeamId` 是不同品牌，直接联合后赋值反而需要类型断言。用 discriminated union + 各自字段名更安全。
- **为什么字段名不统一为 `id`？** — 保留 `agentId` / `teamId` 便于解构后直接使用，避免到处出现 `target.id as AgentId` 这种断言。
- `ChatTarget` 是纯值类型（plain object），可直接 JSON 序列化，满足 SQLite 和 file-based 存储需求。

### 1.2 辅助工具函数

在 `packages/shared/src/types/common.ts`（或新建 `packages/shared/src/utils/chat-target.ts`，然后从 index 导出）中提供：

```typescript
import type { AgentId, TeamId, Team } from '../types'

/**
 * 从 ChatTarget 解析出实际处理 agent 的 ID。
 * - kind='agent' → 直接返回 agentId
 * - kind='team'  → 查找 team 的 leader（parentAgentId === undefined 的 member），返回其 agentId
 *
 * 如果 team 未找到或无 leader，返回 undefined。
 */
export function resolveTargetAgentId(
  target: ChatTarget,
  teams: Team[],
): AgentId | undefined {
  switch (target.kind) {
    case 'agent':
      return target.agentId
    case 'team': {
      const team = teams.find(t => t.id === target.teamId)
      const leader = team?.members.find(m => !m.parentAgentId)
      return leader?.agentId
    }
  }
}

/**
 * 从 ChatTarget 解析出 teamId（仅 kind='team' 时有值）。
 */
export function resolveTargetTeamId(target: ChatTarget): TeamId | undefined {
  return target.kind === 'team' ? target.teamId : undefined
}

/**
 * 从 ChatTarget 获取显示名称。
 */
export function getTargetDisplayName(
  target: ChatTarget,
  agents: Array<{ id: AgentId; name: string }>,
  teams: Array<{ id: TeamId; name: string }>,
): string {
  switch (target.kind) {
    case 'agent': {
      const agent = agents.find(a => a.id === target.agentId)
      return agent ? `@${agent.name}` : target.agentId
    }
    case 'team': {
      const team = teams.find(t => t.id === target.teamId)
      return team?.name ?? target.teamId
    }
  }
}

/**
 * 兼容工厂：从旧的 agentId + teamId? 构造 ChatTarget。
 * 用于 migration 和过渡期。
 */
export function chatTargetFromLegacy(agentId: AgentId, teamId?: TeamId): ChatTarget {
  if (teamId) return { kind: 'team', teamId }
  return { kind: 'agent', agentId }
}

/**
 * 比较两个 ChatTarget 是否相等。
 */
export function chatTargetEquals(a: ChatTarget, b: ChatTarget): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'agent' && b.kind === 'agent') return a.agentId === b.agentId
  if (a.kind === 'team' && b.kind === 'team') return a.teamId === b.teamId
  return false
}
```

### 1.3 导出

从 `packages/shared/src/index.ts` 导出 `ChatTarget` 类型和所有工具函数。

---

## 2. 实体变更方案

### 2.1 Conversation

**Before:**
```typescript
interface Conversation extends Timestamped {
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
interface Conversation extends Timestamped {
  id: ConversationId
  projectId: ProjectId
  target: ChatTarget
  title: string
  messages: Message[]
  lastMessageAt: string
  compactRecords?: CompactRecord[]
}
```

移除 `agentId` 和 `teamId`，新增 `target`。

### 2.2 CronJob

**Before:**
```typescript
interface CronJob extends Timestamped {
  id: CronJobId
  projectId: ProjectId
  agentId: AgentId
  teamId?: TeamId
  name: string
  // ... other fields
}
```

**After:**
```typescript
interface CronJob extends Timestamped {
  id: CronJobId
  projectId: ProjectId
  target: ChatTarget
  name: string
  // ... other fields
}
```

移除 `agentId` 和 `teamId`，新增 `target`。

**注意**：`CronJobRun.agentId` 保留不变 — 这是"实际执行了哪个 agent"的事实记录。

### 2.3 Project

**Before:**
```typescript
interface Project extends Timestamped {
  id: ProjectId
  name: string
  description: string
  icon: string
  config: ProjectConfig
  defaultAgentId?: AgentId
  defaultTeamId?: TeamId
  agentCount: number
  activeAgentCount: number
  lastActivityAt: string
}
```

**After:**
```typescript
interface Project extends Timestamped {
  id: ProjectId
  name: string
  description: string
  icon: string
  config: ProjectConfig
  defaultTarget?: ChatTarget
  agentCount: number
  activeAgentCount: number
  lastActivityAt: string
}
```

移除 `defaultAgentId` 和 `defaultTeamId`，新增 `defaultTarget?`。

### 2.4 Service 接口签名变更

#### IConversationService

```typescript
// Before
create(projectId: ProjectId, agentId: AgentId, title: string, teamId?: TeamId): Promise<Conversation>
update(projectId: ProjectId, id: ConversationId, data: { title?: string; agentId?: AgentId; teamId?: TeamId | null }): Promise<Conversation>

// After
create(projectId: ProjectId, target: ChatTarget, title: string): Promise<Conversation>
update(projectId: ProjectId, id: ConversationId, data: { title?: string; target?: ChatTarget }): Promise<Conversation>
```

`list()` 签名中的 `agentId?` 过滤参数**保留** — 它用于按 agent 过滤 conversation 列表，与 target 概念不同。但内部实现需要改为从 `target` 中提取 agentId 比对（当 kind='agent' 时直接匹配，kind='team' 时需查 leader）。考虑到 list 的 agentId 筛选在 SQLite 层执行，为保持查询简单，conversations 表保留 `agent_id` 列作为**冗余索引字段**（见 3.1 节）。

#### IProjectService

```typescript
// Before
update(id: ProjectId, data: Partial<Pick<Project, 'name' | 'description' | 'icon' | 'config' | 'defaultAgentId' | 'defaultTeamId'>>): Promise<Project>

// After
update(id: ProjectId, data: Partial<Pick<Project, 'name' | 'description' | 'icon' | 'config' | 'defaultTarget'>>): Promise<Project>
```

#### ICronJobService

```typescript
// Before
create(projectId: ProjectId, data: Pick<CronJob, 'agentId' | 'name' | 'cronExpression' | 'enabled' | 'instruction' | 'scheduleType' | 'scheduledAt'> & { teamId?: TeamId }): Promise<CronJob>
update(projectId: ProjectId, id: CronJobId, data: Partial<Pick<CronJob, 'agentId' | 'name' | 'cronExpression' | 'enabled' | 'instruction' | 'scheduleType' | 'scheduledAt'> & { teamId?: TeamId }>): Promise<CronJob>

// After
create(projectId: ProjectId, data: Pick<CronJob, 'target' | 'name' | 'cronExpression' | 'enabled' | 'instruction' | 'scheduleType' | 'scheduledAt'>): Promise<CronJob>
update(projectId: ProjectId, id: CronJobId, data: Partial<Pick<CronJob, 'target' | 'name' | 'cronExpression' | 'enabled' | 'instruction' | 'scheduleType' | 'scheduledAt'>>): Promise<CronJob>
```

---

## 3. 存储层迁移方案

### 3.1 SQLite: conversations 表

#### Column 策略

conversations 表当前有：`id, agent_id, team_id, title, last_message_at, created_at, updated_at`

**方案：新增 `target_kind` + `target_id` 两列，弃用（但保留） `agent_id` 和 `team_id`**

为什么不用 JSON 列存 target？
- 需要对 `target_kind` 和 `target_id` 做 WHERE 过滤和索引
- JSON 列无法高效索引

为什么保留 `agent_id`？
- `list()` 有 `agentId?` 过滤参数，SQL 中 `WHERE agent_id = ?` 是高频查询
- `agent_id` 作为冗余字段保留，值始终等于 `resolveTargetAgentId(target)` 的结果
- 即 kind='agent' 时直接等于 target_id，kind='team' 时等于 team leader 的 agentId
- 旧数据天然已有 agent_id，所以向后兼容也没问题

#### Migration SQL（在 migrate.ts 中新增 v10）

```typescript
// --- Migration v10: ChatTarget columns on conversations ---
const convColsV10 = db.all<{ name: string }>(sql`PRAGMA table_info(conversations)`)
if (!convColsV10.some(c => c.name === 'target_kind')) {
  log.debug('migrating conversations: adding target_kind, target_id columns')

  // 1. Add new columns
  db.run(sql`ALTER TABLE conversations ADD COLUMN target_kind TEXT NOT NULL DEFAULT 'agent'`)
  db.run(sql`ALTER TABLE conversations ADD COLUMN target_id TEXT NOT NULL DEFAULT ''`)

  // 2. Populate from existing data:
  //    - If team_id is set → kind='team', target_id=team_id
  //    - Otherwise         → kind='agent', target_id=agent_id
  db.run(sql`
    UPDATE conversations
    SET target_kind = CASE WHEN team_id IS NOT NULL AND team_id != '' THEN 'team' ELSE 'agent' END,
        target_id   = CASE WHEN team_id IS NOT NULL AND team_id != '' THEN team_id ELSE agent_id END
  `)

  // 3. Index on new columns
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_conversations_target ON conversations(target_kind, target_id)`)
}
```

**不删除旧列**：SQLite 的 `DROP COLUMN` 在旧版本（< 3.35.0）不支持，且保留 `agent_id` 作为冗余索引字段，`team_id` 保留避免数据丢失。未来版本可清理。

#### Schema 更新

`packages/server/src/db/schema.ts` — conversations table 新增两列：

```typescript
export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull(),       // 保留：冗余索引字段
  teamId: text('team_id'),                   // 保留：向后兼容
  targetKind: text('target_kind').notNull().default('agent'),  // 新增
  targetId: text('target_id').notNull().default(''),           // 新增
  title: text('title').notNull(),
  lastMessageAt: text('last_message_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})
```

#### Storage 实现变更

`SqliteConversationStorage`:

- `create()` 签名从 `(projectId, agentId, title, teamId?)` 改为 `(projectId, target, title)`。写入时同时设置 `target_kind`、`target_id`、`agent_id`（冗余）。
- `update()` 当 `data.target` 存在时，同步更新 `target_kind`、`target_id`、`agent_id`。
- `rowToConversation()` 从 `target_kind` + `target_id` 构造 `ChatTarget`：

```typescript
private rowToConversation(row: ..., projectId: ProjectId, messages: Message[] = []): Conversation {
  const target: ChatTarget = row.targetKind === 'team'
    ? { kind: 'team', teamId: row.targetId as TeamId }
    : { kind: 'agent', agentId: row.targetId as AgentId }

  return {
    id: row.id as ConversationId,
    projectId,
    target,
    title: row.title,
    messages,
    lastMessageAt: row.lastMessageAt ?? row.createdAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
```

### 3.2 File-based: projects JSON

`FileProjectStorage`:

- `normalize()` 中增加 `defaultTarget` 兼容逻辑：
  - 如果 JSON 中有旧字段 `defaultAgentId` / `defaultTeamId`，自动转换为 `defaultTarget`
  - 转换后写回磁盘（写时迁移）

```typescript
private normalize(project: Project): Project {
  const raw = project as any

  // Legacy: mainAgentId → defaultAgentId (已有)
  const legacyAgentId = project.defaultTarget === undefined
    ? (raw.defaultAgentId ?? raw.mainAgentId)
    : undefined
  const legacyTeamId = project.defaultTarget === undefined
    ? raw.defaultTeamId
    : undefined

  if (legacyAgentId || legacyTeamId) {
    const defaultTarget = legacyTeamId
      ? { kind: 'team' as const, teamId: legacyTeamId as TeamId }
      : legacyAgentId
        ? { kind: 'agent' as const, agentId: legacyAgentId as AgentId }
        : undefined
    return {
      ...project,
      defaultTarget,
      defaultAgentId: undefined,   // 类型中已删除，但 raw 可能有
      defaultTeamId: undefined,
    } as Project
  }

  return project
}
```

- `update()` 中原本互斥清除 `defaultAgentId` / `defaultTeamId` 的逻辑删除，改为直接接收 `defaultTarget`。
- `normalizeDefaultTarget()` 方法删除（不再需要）。

### 3.3 File-based: cronjobs JSON

`FileCronJobStorage`:

- `list()` 和 `getById()` 读取时兼容旧格式：

```typescript
private normalizeCronJob(raw: any, projectId: ProjectId): CronJob {
  if (raw.target) {
    return { ...raw, projectId }
  }
  // Legacy: agentId + teamId? → target
  const target: ChatTarget = raw.teamId
    ? { kind: 'team', teamId: raw.teamId as TeamId }
    : { kind: 'agent', agentId: raw.agentId as AgentId }
  const { agentId: _a, teamId: _t, ...rest } = raw
  return { ...rest, target, projectId }
}
```

- `create()` 和 `update()` 签名更新，写入时直接写 `target`。

---

## 4. 路由层变更方案

### 4.1 Chat Route (`packages/server/src/routes/chat.ts`)

#### POST body 格式变更

```typescript
// Before
const body = await c.req.json<{
  messages: UIMessage[]
  projectId: string
  agentId?: string
  conversationId?: string
  teamId?: string
}>()

// After
const body = await c.req.json<{
  messages: UIMessage[]
  projectId: string
  target?: ChatTarget
  conversationId?: string
}>()
```

#### agentId/teamId 解析逻辑简化

当前逻辑（lines 64-117）：
1. 从 body 取 agentId，取不到则从 conversation 取
2. 从 body 取 teamId，取不到则从 conversation 取

重构后：
1. 从 body 取 `target`，取不到则从 `conversation.target` 取
2. 用 `resolveTargetAgentId(target, teams)` 解析出实际的 agentId
3. 用 `resolveTargetTeamId(target)` 解析出 teamId

```typescript
// Resolve target — from body or from conversation
let target = body.target
if (!target && conversationId) {
  const conv = await deps.conversationStorage.getById(projectId as ProjectId, conversationId as ConversationId)
  if (conv) target = conv.target
}
if (!target) return c.json({ error: 'TARGET_REQUIRED' }, 400)

// Resolve actual agentId from target
const teams = await deps.teamStorage.list(projectId as ProjectId)
const agentId = resolveTargetAgentId(target, teams)
if (!agentId) return c.json({ error: 'AGENT_NOT_FOUND' }, 404)

// Look up agent config
const agent = await deps.agentStorage.getById(projectId as ProjectId, agentId)
if (!agent) return c.json({ error: 'AGENT_NOT_FOUND' }, 404)

// Resolve team members if target is a team
let teamMembers: TeamMember[] | undefined
let teamInstruction: string | undefined
if (target.kind === 'team') {
  const team = teams.find(t => t.id === target.teamId)
  if (team) {
    teamMembers = team.members
    teamInstruction = team.instruction
  }
}
```

这比原来的两段独立 if-else 清晰得多。

### 4.2 Conversations Route (`packages/server/src/routes/conversations.ts`)

#### POST / (create)

```typescript
// Before
const { agentId, title, teamId } = await c.req.json()
const conv = await storage.create(projectId, agentId, title, teamId)

// After
const { target, title } = await c.req.json()
const conv = await storage.create(projectId, target, title)
```

#### PATCH /:id (update)

```typescript
// Before
const data = await c.req.json<{ title?: string; agentId?: AgentId; teamId?: TeamId | null }>()

// After
const data = await c.req.json<{ title?: string; target?: ChatTarget }>()
```

### 4.3 CronJobs Route (`packages/server/src/routes/cronjobs.ts`)

POST / 和 PATCH /:id 无显式 agentId/teamId 解析（透传给 storage），但 storage 接口签名变更后自然适配。

### 4.4 Scheduler Executor (`packages/server/src/scheduler/executor.ts`)

```typescript
// Before
const run = await this.deps.cronJobRunStorage.create(projectId, {
  cronJobId: cronJob.id,
  projectId,
  agentId: cronJob.agentId,  // 从 cronJob 直接取
  ...
})

// After — 需要先从 target 解析 agentId
const teams = await this.deps.teamStorage.list(projectId)
const agentId = resolveTargetAgentId(cronJob.target, teams)
if (!agentId) throw new Error(`Cannot resolve agent for cron job ${cronJob.id}`)

const run = await this.deps.cronJobRunStorage.create(projectId, {
  cronJobId: cronJob.id,
  projectId,
  agentId,  // 解析后的实际 agentId
  ...
})
```

team 解析同样简化：

```typescript
// Before
if (cronJob.teamId) {
  const team = await this.deps.teamStorage.getById(projectId, cronJob.teamId as TeamId)
  ...
}

// After
if (cronJob.target.kind === 'team') {
  const team = await this.deps.teamStorage.getById(projectId, cronJob.target.teamId)
  ...
}
```

conversation 创建：

```typescript
// Before
const conv = await this.deps.conversationStorage.create(
  projectId, cronJob.agentId, title, cronJob.teamId as TeamId | undefined
)

// After
const conv = await this.deps.conversationStorage.create(
  projectId, cronJob.target, title
)
```

### 4.5 Sub-Agent (`packages/server/src/agent/sub-agent.ts`)

`createSubAgentTool` 中创建子 conversation：

```typescript
// Before
const conv = await conversationStorage.create(
  projectId as ProjectId,
  childAgent.id as AgentId,
  `[Sub-agent] ${childAgent.name}`,
)

// After
const conv = await conversationStorage.create(
  projectId as ProjectId,
  { kind: 'agent', agentId: childAgent.id },
  `[Sub-agent] ${childAgent.name}`,
)
```

子 agent 始终是 `kind: 'agent'`，不会是 team。

---

## 5. UI 层变更方案

### 5.1 chat-instances.ts

Transport body 变更：

```typescript
// Before
body: {
  projectId: config.projectId,
  agentId: config.agentId,
  conversationId: config.conversationId,
}

// After — 不再需要传 agentId/teamId，server 从 conversation 取 target
body: {
  projectId: config.projectId,
  conversationId: config.conversationId,
}
```

`ChatInstanceConfig` 接口移除 `agentId` 字段。

注意：首次消息（无 conversationId）的场景。查看代码发现 `ChatPage.handleNewChat` 会先 `createConversation` 再渲染 `ChatWindow`，所以 chat-instances 使用时总是有 conversationId 的。server 端可以从 conversationId 查到 target，因此 transport body 不需要 target 字段。

但等等 — 当前 `chat.ts` route 允许 `agentId` 在 body 中传入（即使有 conversationId）。重构后：
- 如果有 `conversationId`，server 从 DB 取 `target`
- 如果无 `conversationId`（目前不应发生，但防御性保留），body 需要传 `target`

保守方案：transport body 中传 `target`（从 `conversation.target` 取），server 优先用 body.target，fallback 到 conversation.target。

```typescript
// ChatInstanceConfig
export interface ChatInstanceConfig {
  conversationId: ConversationId
  projectId: ProjectId
  target: ChatTarget           // 替代 agentId
  initialMessages: Message[]
  serverConfig: { baseUrl: string; token: string } | null
}

// Transport body
body: {
  projectId: config.projectId,
  target: config.target,
  conversationId: config.conversationId,
}
```

### 5.2 team-select.ts — 删除

`encodeTeamValue` / `decodeSelectValue` 是为了将 agent 和 team 编码到同一个 `<select>` value 中的 hack。重构后，UI select 直接产出 `ChatTarget` 对象，不再需要字符串编码。

**替代方案**：在 select onChange 中直接构造 `ChatTarget`：

```typescript
// 新的 select value 编码方式（纯内联，不需要单独模块）
// value format: "agent:{agentId}" 或 "team:{teamId}"

function encodeChatTarget(target: ChatTarget): string {
  return target.kind === 'agent' ? `agent:${target.agentId}` : `team:${target.teamId}`
}

function decodeChatTarget(value: string): ChatTarget | null {
  if (!value) return null
  if (value.startsWith('agent:')) return { kind: 'agent', agentId: value.slice(6) as AgentId }
  if (value.startsWith('team:')) return { kind: 'team', teamId: value.slice(5) as TeamId }
  return null
}
```

或者更好：**将这两个函数放在 `packages/shared/src/utils/chat-target.ts` 中**，因为它们是 ChatTarget 的序列化逻辑，可以在 UI 和 server 共享。但考虑到 server 不需要 select value 编码，放在 UI 层 `packages/ui/src/lib/chat-target.ts` 更合适。

最终决定：
- **删除** `packages/ui/src/lib/team-select.ts`
- **新建** `packages/ui/src/lib/chat-target-select.ts`，提供 `encodeChatTarget` / `decodeChatTarget`（仅 UI 用的 select value 编解码）

### 5.3 ChatPage.tsx

```typescript
// Before
const defaultAgentId = currentProject?.defaultAgentId ?? null
const defaultTeamId = currentProject?.defaultTeamId ?? null
const canNewChat = !!defaultAgentId || !!defaultTeamId

// After
const defaultTarget = currentProject?.defaultTarget ?? null
const canNewChat = !!defaultTarget
```

```typescript
// Before: handleNewChat
if (defaultTeamId) {
  const team = teams.find(t => t.id === defaultTeamId)
  const leader = team?.members.find(m => !m.parentAgentId)
  const agentId = leader?.agentId ?? defaultAgentId
  if (agentId) {
    await createConversation(agentId, t('newChatTitle'), defaultTeamId)
    return
  }
}
if (!defaultAgentId) return
await createConversation(defaultAgentId, t('newChatTitle'))

// After: handleNewChat — 大幅简化
if (!defaultTarget) return
await createConversation(defaultTarget, t('newChatTitle'))
```

```typescript
// Before: handleSwitchAgent
const handleSwitchAgent = useCallback(async (agentId: AgentId, teamId?: TeamId) => {
  ...
  await updateConversation(currentConversation.id, { agentId, teamId: teamId ?? null })
  ...
  await createConversation(agentId, t('newChatTitle'), teamId)
}, ...)

// After: handleSwitchTarget
const handleSwitchTarget = useCallback(async (target: ChatTarget) => {
  if (!currentProject) return
  if (currentConversation && currentConversation.messages.length === 0) {
    await updateConversation(currentConversation.id, { target })
  } else {
    await createConversation(target, t('newChatTitle'))
  }
}, [currentProject, currentConversation, updateConversation, createConversation])
```

### 5.4 ChatWindow.tsx

Props 变更：

```typescript
// Before
onSwitchAgent: (agentId: AgentId, teamId?: TeamId) => void

// After
onSwitchTarget: (target: ChatTarget) => void
```

Agent/Team select (lines 310-338)：

```typescript
// Before
value={conversation.teamId ? encodeTeamValue(conversation.teamId) : conversation.agentId}
onChange={e => {
  const parsed = decodeSelectValue(e.target.value)
  if (!parsed) return
  if ('teamId' in parsed) {
    const team = teams.find(t => t.id === parsed.teamId)
    const leader = team?.members.find(m => !m.parentAgentId)
    if (leader) onSwitchAgent(leader.agentId, parsed.teamId)
  } else {
    onSwitchAgent(parsed.agentId)
  }
}}

// After — 大幅简化
value={encodeChatTarget(conversation.target)}
onChange={e => {
  const target = decodeChatTarget(e.target.value)
  if (target) onSwitchTarget(target)
}}
```

Agent/Team option values 也统一用 `encodeChatTarget`：

```typescript
{teams.map(tm => (
  <option key={tm.id} value={encodeChatTarget({ kind: 'team', teamId: tm.id })}>{tm.name}</option>
))}
{agents.map(a => (
  <option key={a.id} value={encodeChatTarget({ kind: 'agent', agentId: a.id })}>@{a.name}</option>
))}
```

`getOrCreateChat` 调用变更：

```typescript
// Before
return getOrCreateChat({
  conversationId: conversation.id,
  projectId: currentProjectId,
  agentId: conversation.agentId,
  initialMessages: conversation.messages,
  serverConfig,
})

// After
return getOrCreateChat({
  conversationId: conversation.id,
  projectId: currentProjectId,
  target: conversation.target,
  initialMessages: conversation.messages,
  serverConfig,
})
```

`useMemo` 依赖也从 `[conversation.agentId, conversation.teamId]` 变为 `[conversation.target]`。注意对象引用稳定性 — 需要用 `JSON.stringify(conversation.target)` 或在 store 中确保 target 引用稳定。

### 5.5 CronJobFormModal.tsx

```typescript
// Before: 两个 state
const [agentId, setAgentId] = useState<AgentId | ''>('')
const [teamId, setTeamId] = useState<TeamId | ''>('')
const selectValue = teamId ? encodeTeamValue(teamId) : (agentId as string)

// After: 一个 state
const [target, setTarget] = useState<ChatTarget | null>(null)
const selectValue = target ? encodeChatTarget(target) : ''
```

初始化：

```typescript
// Before
setAgentId(editJob.agentId)
setTeamId(editJob.teamId ?? '')

// After
setTarget(editJob.target)
```

提交：

```typescript
// Before
await createCronJob({
  agentId: agentId as AgentId,
  teamId: resolvedTeamId as TeamId | undefined,
  ...
})

// After
await createCronJob({
  target: target!,
  ...
})
```

Validation：

```typescript
// Before
const isValid = ... && agentId

// After
const isValid = ... && target !== null
```

### 5.6 ProjectSettingsPage.tsx

```typescript
// Before
value={project.defaultTeamId ? encodeTeamValue(project.defaultTeamId) : project.defaultAgentId ?? ''}
onChange={e => onDefaultChange(e.target.value)}

// handleDefaultChange:
if (!parsed) {
  await updateProject(project.id, { defaultAgentId: undefined, defaultTeamId: undefined })
} else if ('teamId' in parsed) {
  await updateProject(project.id, { defaultAgentId: undefined, defaultTeamId: parsed.teamId })
} else {
  await updateProject(project.id, { defaultAgentId: parsed.agentId, defaultTeamId: undefined })
}

// After
value={project.defaultTarget ? encodeChatTarget(project.defaultTarget) : ''}
onChange={e => onDefaultChange(e.target.value)}

// handleDefaultChange — 大幅简化:
const target = decodeChatTarget(value)
await updateProject(project.id, { defaultTarget: target ?? undefined })
```

### 5.7 Store Actions

```typescript
// Before
interface ConversationActions {
  createConversation(agentId: AgentId, title: string, teamId?: TeamId): Promise<Conversation>
  updateConversation(id: ConversationId, data: { title?: string; agentId?: AgentId; teamId?: TeamId | null }): Promise<Conversation>
}

// After
interface ConversationActions {
  createConversation(target: ChatTarget, title: string): Promise<Conversation>
  updateConversation(id: ConversationId, data: { title?: string; target?: ChatTarget }): Promise<Conversation>
}
```

```typescript
// Before
interface ProjectActions {
  updateProject(id: ProjectId, data: Partial<Pick<Project, 'name' | 'description' | 'icon' | 'config' | 'defaultAgentId' | 'defaultTeamId'>>): Promise<void>
}

// After
interface ProjectActions {
  updateProject(id: ProjectId, data: Partial<Pick<Project, 'name' | 'description' | 'icon' | 'config' | 'defaultTarget'>>): Promise<void>
}
```

```typescript
// Before
interface CronJobActions {
  createCronJob(data: Pick<CronJob, 'agentId' | 'name' | ...> & { teamId?: TeamId }): Promise<CronJob>
  updateCronJob(id: CronJobId, data: Partial<Pick<CronJob, 'agentId' | 'name' | ...> & { teamId?: TeamId }>): Promise<void>
}

// After
interface CronJobActions {
  createCronJob(data: Pick<CronJob, 'target' | 'name' | ...>): Promise<CronJob>
  updateCronJob(id: CronJobId, data: Partial<Pick<CronJob, 'target' | 'name' | ...>>): Promise<void>
}
```

Store 实现中：

```typescript
// Before: createAgent 自动设 defaultAgentId
const updated = await svc.projects.update(project.id, { defaultAgentId: agent.id })

// After
const updated = await svc.projects.update(project.id, { defaultTarget: { kind: 'agent', agentId: agent.id } })
```

```typescript
// Before: deleteAgent 清除 defaultAgentId
if (project?.defaultAgentId === id) {
  await get().updateProject(projectId, { defaultAgentId: undefined })
}

// After
if (project?.defaultTarget?.kind === 'agent' && project.defaultTarget.agentId === id) {
  await get().updateProject(projectId, { defaultTarget: undefined })
}
```

```typescript
// Before: deleteTeam 清除 defaultTeamId
if (project?.defaultTeamId === id) {
  await get().updateProject(project.id, { defaultTeamId: undefined })
}

// After
if (project?.defaultTarget?.kind === 'team' && project.defaultTarget.teamId === id) {
  await get().updateProject(project.id, { defaultTarget: undefined })
}
```

### 5.8 ChatSidebar.tsx

```typescript
// Before
const team = conv.teamId ? teams.find(tm => tm.id === conv.teamId) : undefined
const agent = agents.find(a => a.id === conv.agentId)

// After
const team = conv.target.kind === 'team' ? teams.find(tm => tm.id === conv.target.teamId) : undefined
const agent = conv.target.kind === 'agent'
  ? agents.find(a => a.id === conv.target.agentId)
  : undefined  // team 模式下可能需要显示 leader agent，视 UI 需求而定
```

### 5.9 Mock Services 和 Seed Data

- `MockConversationService.create()` 签名改为 `(projectId, target, title)`
- `MockCronJobService.create()` 签名改为 `(projectId, data)` 其中 data 含 `target`
- `MockProjectService.update()` 签名移除 `defaultAgentId/defaultTeamId`，改为 `defaultTarget`
- `SEED_CONVERSATIONS` 中 `agentId: 'agent-1'` 改为 `target: { kind: 'agent', agentId: 'agent-1' as AgentId }`
- `SEED_CRON_JOBS` 中同理

### 5.10 HTTP Services

`packages/ui/src/services/http/services.ts`:

```typescript
// Before
create(projectId: ProjectId, agentId: AgentId, title: string, teamId?: TeamId) {
  return fetchJson(..., {
    method: 'POST', body: JSON.stringify({ agentId, title, ...(teamId ? { teamId } : {}) }),
  })
}

// After
create(projectId: ProjectId, target: ChatTarget, title: string) {
  return fetchJson(..., {
    method: 'POST', body: JSON.stringify({ target, title }),
  })
}
```

---

## 6. 实现顺序

### 原则

- 从底层到上层，每一步完成后整体可编译
- shared 类型变更是最大的 breaking change，需要一次性完成类型 + 所有消费者的适配

### Phase 1: shared 包类型 + 工具函数（基础层）

**并行：不可拆分，一次提交**

1. `packages/shared/src/types/common.ts` — 新增 `ChatTarget` 类型
2. `packages/shared/src/utils/chat-target.ts`（新建） — 工具函数 `resolveTargetAgentId`, `resolveTargetTeamId`, `chatTargetFromLegacy`, `chatTargetEquals`, `getTargetDisplayName`
3. `packages/shared/src/index.ts` — 导出新增内容
4. `packages/shared/src/types/conversation.ts` — `agentId + teamId?` → `target: ChatTarget`
5. `packages/shared/src/types/cronjob.ts` — `agentId + teamId?` → `target: ChatTarget`
6. `packages/shared/src/types/project.ts` — `defaultAgentId? + defaultTeamId?` → `defaultTarget?: ChatTarget`
7. `packages/shared/src/services/interfaces.ts` — 更新 `IConversationService`, `IProjectService`, `ICronJobService` 签名

此步完成后 `pnpm lint` 会报大量错误，因为消费者还没更新。但 shared 包本身是纯类型包（zero runtime），自身编译不会失败。

### Phase 2: Server 包（存储 + 路由 + 调度器）

**顺序执行，每步完成后 server 包可编译：**

1. **db/schema.ts** — 新增 `targetKind` + `targetId` 列定义
2. **db/migrate.ts** — 新增 v10 migration
3. **storage/conversations.ts** — 更新 `create`, `update`, `rowToConversation`, `list`
4. **storage/projects.ts** — 更新 `normalize`, `update`
5. **storage/cronjobs.ts** — 新增 `normalizeCronJob`, 更新 `create`, `update`, `list`, `getById`
6. **routes/conversations.ts** — 更新 POST / 和 PATCH /:id
7. **routes/chat.ts** — 更新 POST body 解析和 agent/team 解析逻辑
8. **routes/cronjobs.ts** — 透传变更（无显式 agentId/teamId 解析，但类型会自动适配）
9. **scheduler/executor.ts** — 更新 target 解析和 conversation 创建逻辑
10. **agent/sub-agent.ts** — 更新 `conversationStorage.create()` 调用

### Phase 3: UI 包

**顺序执行：**

1. **lib/chat-target-select.ts**（新建） — `encodeChatTarget` / `decodeChatTarget`
2. **lib/chat-instances.ts** — `ChatInstanceConfig` 移除 agentId，新增 target；transport body 变更
3. **services/http/services.ts** — 更新 conversation create/update、cronJob create/update、project update 的请求体
4. **services/mock/data.ts** — 更新 seed data
5. **services/mock/services.ts** — 更新 mock service 签名
6. **stores/useAppStore.ts** — 更新 action 签名和实现
7. **pages/chat/ChatWindow.tsx** — 更新 props、select、getOrCreateChat
8. **pages/chat/ChatPage.tsx** — 更新 handleNewChat、handleSwitchAgent→handleSwitchTarget
9. **pages/chat/ChatSidebar.tsx** — 更新 conversation.agentId/teamId 访问
10. **pages/cron/CronJobFormModal.tsx** — 更新 form state 和提交逻辑
11. **pages/project/ProjectSettingsPage.tsx** — 更新 default select
12. **lib/team-select.ts** — 删除此文件

### Phase 4: 测试更新

**可并行：**

- `packages/server/src/storage/conversations.test.ts`
- `packages/server/src/storage/cronjobs.test.ts`
- `packages/server/src/routes/conversations.test.ts`
- `packages/server/src/routes/cronjobs.test.ts`
- `packages/server/src/scheduler/executor.test.ts`
- `packages/server/src/agent/sub-agent.test.ts`
- `packages/ui/src/lib/chat-instances.test.ts`
- `packages/ui/src/services/mock/services.test.ts`
- `packages/ui/src/services/http/services.test.ts`
- `packages/ui/src/pages/cron/CronJobsPage.test.tsx`
- E2E tests:
  - `apps/desktop/e2e/server/conversation-api.spec.ts`
  - `apps/desktop/e2e/server/cronjob-api.spec.ts`
  - `apps/desktop/e2e/ai/chat-lifecycle.spec.ts`
  - `apps/desktop/e2e/ai/cronjob-execution.spec.ts`
  - `apps/desktop/e2e/fixtures/test-helper.ts`

### Phase 5: 清理

1. 确认所有 `encodeTeamValue` / `decodeSelectValue` 引用已移除
2. 确认所有 `agentId + teamId?` 双字段模式已替换（全局搜索 `teamId?` 在 Conversation/CronJob/Project 上下文中）
3. `pnpm lint && pnpm test` 全通过
4. `pnpm dev` 冒烟测试：创建 conversation（agent/team 模式）、创建 cronJob、修改 project default

### 并行可能性总结

| 可并行的部分 | 依赖 |
|-------------|------|
| Phase 2 步骤 3-5（三个 storage） | 依赖步骤 1-2（schema + migration） |
| Phase 2 步骤 6-10（routes + scheduler + sub-agent） | 依赖步骤 3-5（storage） |
| Phase 3 步骤 1-5（lib + services） | 仅依赖 Phase 1（shared 类型） |
| Phase 3 步骤 6-12（store + pages） | 依赖步骤 1-5 |
| Phase 4 所有测试 | 依赖 Phase 2 + 3 全部完成 |

实际上 Phase 2 和 Phase 3 的步骤 1-5 可以并行开发，因为 server 和 UI 只共享 shared 包类型。但考虑到这是一个人的工作，建议按 Phase 顺序线性执行，减少心智负担。
