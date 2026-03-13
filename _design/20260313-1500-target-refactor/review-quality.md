# Code Quality Review — targetType + targetId Refactor

审查者: Code Reviewer-Quality
日期: 2026-03-13
审查范围: 全部非测试文件改动 + 测试文件 mock 数据一致性校验

---

## 总体评价

重构整体思路清晰，命名一致，迁移路径覆盖了 fresh DB / 已有 v9 / 已有 pre-v9 三种情况。以下按严重度列出具体问题。

---

## P1 — 重要问题（需修复）

### 1. `dashboard.ts:501-506` + `global-dashboard.ts:402-407` — 死代码：resolvedAgentId 两个分支完全相同

```ts
// dashboard.ts (相同逻辑在 global-dashboard.ts 同样存在)
const resolvedAgentId = job.targetType === 'agent'
  ? job.targetId as AgentId
  : job.targetId as AgentId // team target — best-effort lookup by targetId
```

两个分支做的事情完全一样。对 `targetType === 'team'` 的 cron job，`targetId` 实际上是 `TeamId`，被强转为 `AgentId` 后 `agentMap.get(resolvedAgentId)` 必然返回 `'Unknown'`。注释说 "best-effort lookup" 但并没有真正 resolve team leader。

**应使用 `resolveAgentId()` utility**（已在 `@golemancy/shared` 导出），与 `executor.ts` 和 `chat.ts` 的做法保持一致。由于 dashboard 上下文没有 team 对象可传，应在查询前先 load team，或在不需要精确 agentId 时至少消除重复分支。

---

### 2. `dashboard.ts:249-252` — `DashboardRecentChat.agentId` 对 team 会话设为空字符串

```ts
agentId: (row.target_type === 'agent' ? row.target_id : '') as AgentId,
agentName: agentMap.get(row.target_id as AgentId) ?? 'Unknown',
```

`DashboardRecentChat.agentId` 类型声明为 `AgentId`（非 optional）。对 team 目标会话，此处将其设为 `''`（空字符串），破坏了类型契约。更重要的是，`agentId` 和 `agentName` 使用了不同的键（`''` vs `row.target_id`），逻辑不一致。

如果 dashboard 类型暂不改动，至少应保持两者一致：
```ts
const displayId = row.target_type === 'agent' ? row.target_id : ''
agentId: displayId as AgentId,
agentName: agentMap.get(displayId) ?? 'Unknown',
```

---

### 3. `storage/conversations.ts:22` — `list()` 过滤 agentId 时未同时过滤 `target_type = 'agent'`

```ts
if (agentId) conditions.push(eq(schema.conversations.targetId, agentId))
```

方法签名是 `list(projectId, agentId?: AgentId)`，语义是"过滤该 agent 的会话"，但现在实际查询的是 `target_id = agentId`，不区分 agent 还是 team。虽然当前 ID 生成前缀不同（`agent-` vs `team-`）不会冲突，但语义上不完整。

建议同时添加 `target_type = 'agent'` 条件：
```ts
if (agentId) {
  conditions.push(eq(schema.conversations.targetId, agentId))
  conditions.push(eq(schema.conversations.targetType, 'agent'))
}
```

---

### 4. `storage/cronjobs.ts:normalize()` — spread 保留了旧字段 agentId / teamId

```ts
private normalize(job: CronJob): CronJob {
  const raw = job as any
  if (raw.agentId && !raw.targetType) {
    return {
      ...job,   // ← 包含了旧的 agentId / teamId
      targetType: raw.teamId ? 'team' : 'agent',
      targetId: (raw.teamId ?? raw.agentId) as AgentId | TeamId,
    }
  }
  return job
}
```

`...job` 展开时会保留 `agentId` / `teamId` 等 TypeScript 类型中已不存在但运行时对象上仍有的字段。建议显式排除：

```ts
const { agentId: _a, teamId: _t, ...rest } = raw as any
return { ...rest, targetType: ..., targetId: ... }
```

---

## P2 — 次要问题（建议修复）

### 5. `routes/agents.ts:77` + `routes/teams.ts:93` — cascade 检查未验证 targetType

```ts
if (project && project.defaultTargetId === agentId) {
  await projectStorage.update(projectId, { defaultTargetType: undefined, defaultTargetId: undefined })
}
```

比较 `defaultTargetId === agentId` 时没有同时检查 `defaultTargetType === 'agent'`（teams.ts 同理）。当前 ID 命名空间不同所以安全，但若未来 ID 生成规则变化则是隐患。建议加上类型检查：

```ts
if (project && project.defaultTargetType === 'agent' && project.defaultTargetId === agentId) {
```

---

### 6. `scheduler/executor.ts:markAgentIdle` — 参数类型使用 `CronJob['id']` 而非 `CronJobId`

```ts
private async markAgentIdle(projectId: ProjectId, agentId: AgentId, cronJobId: CronJob['id'], ...)
```

`CronJob['id']` 等价于 `CronJobId`，但不直观。直接使用 `CronJobId` 更清晰：
```ts
private async markAgentIdle(projectId: ProjectId, agentId: AgentId, cronJobId: CronJobId, ...)
```

---

### 7. `routes/conversations.ts:162` — 多余的 `?? undefined`

```ts
compactTeam = (await deps.teamStorage.getById(projectId, conv.targetId as TeamId)) ?? undefined
// ...
const convAgentId = resolveAgentId(conv.targetType, conv.targetId, compactTeam ?? undefined)
```

第二个 `?? undefined` 是多余的（`compactTeam` 已经是 `Team | undefined`，不是 `Team | null`）。可简化为 `compactTeam`。

---

### 8. `routes/chat.ts` — 错误码从 `AGENT_ID_REQUIRED` 改为 `TARGET_REQUIRED`

这是 API 错误码的破坏性变更。需确认：
- UI 所有 error 处理中对旧错误码的检查已全部更新
- 已更新 chat.test.ts（已确认更新），其他测试文件无遗留

---

### 9. `storage/clone-project.ts:241` — 嵌套三元可读性差

```ts
defaultTargetId: sourceProject.defaultTargetId
  ? (sourceProject.defaultTargetType === 'agent'
      ? remap.agents.get(sourceProject.defaultTargetId as AgentId) ?? sourceProject.defaultTargetId
      : remap.teams.get(sourceProject.defaultTargetId as TeamId) ?? sourceProject.defaultTargetId)
  : undefined,
```

建议提取为辅助变量：
```ts
const remappedTargetId = sourceProject.defaultTargetId
  ? remapId(sourceProject.defaultTargetType, sourceProject.defaultTargetId, remap)
  : undefined
```

---

### 10. `pages/chat/ChatPage.tsx` — useCallback 依赖数组缺少 `t`

```ts
const handleNewChat = useCallback(async () => {
  // ...
  await createConversation(defaultTargetType, defaultTargetId, t('newChatTitle'))
}, [defaultTargetType, defaultTargetId, createConversation]) // ← t 未包含
```

`handleSwitchAgent` 中同样缺少 `t`。虽然 react-i18next 的 `t` 引用稳定不会导致 bug，但 `react-hooks/exhaustive-deps` lint 规则会报告，且行为依赖于实现细节。

---

## P3 — 可选优化

### 11. `db/migrate.ts` — `DEFAULT ''` 语义不明确

CREATE TABLE 中 `target_id TEXT NOT NULL DEFAULT ''`：空字符串不是有效 ID，但作为迁移 ADD COLUMN 时的默认值是必须的。建议加注释说明：
```sql
target_id TEXT NOT NULL DEFAULT '', -- empty only during v10 migration ADD COLUMN; always set before use
```

---

## 测试文件 Mock 数据一致性

| 文件 | 状态 |
|------|------|
| `storage/conversations.test.ts` | ✅ 全部调用已更新 `create(projId, 'agent', agentId1, ...)` |
| `storage/dashboard.test.ts` | ✅ `insertConversation` 改为 `target_type + target_id` |
| `storage/global-dashboard.test.ts` | ✅ 同上 |
| `routes/chat.test.ts` | ✅ `validBody` 改用 `targetType/targetId`，error code 断言已更新 |
| `routes/agents.test.ts` | ✅ mock project 使用新字段，断言已更新 |
| `scheduler/executor.test.ts` | ✅ `makeCronJob` 使用新字段，`teamStorage` mock 已添加 |
| `services/mock/data.ts` | ✅ 所有 seed 数据已迁移 |
| `services/mock/services.ts` | ✅ 接口签名全部更新 |

---

## 命名一致性检查

| 概念 | 使用情况 |
|------|---------|
| `targetType` | 全部文件统一使用 ✅ |
| `targetId` | 全部文件统一使用 ✅ |
| `defaultTargetType` / `defaultTargetId` | Project 类型统一 ✅ |
| SQL 列名 `target_type` / `target_id` | schema、migrate、raw SQL 全部一致 ✅ |

命名规范良好，无混用情况。

---

## 汇总

| 严重度 | 数量 | 描述 |
|--------|------|------|
| P1 | 4 | 死代码/逻辑错误、类型契约破坏、语义不完整过滤、旧字段泄漏 |
| P2 | 6 | 类型检查遗漏、参数命名、API 破坏性变更、可读性、冗余代码、lint 警告 |
| P3 | 1 | 注释补全 |

最需要优先修复的是 **P1.1**（dashboard/global-dashboard 的 resolvedAgentId 死代码）和 **P1.2**（agentId 空字符串违反类型契约），这两处会导致 dashboard 上 team 目标的 cron job 和会话永远显示 "Unknown"。
