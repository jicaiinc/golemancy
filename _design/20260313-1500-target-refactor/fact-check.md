# 事实验证报告：DB 迁移方案

> 验证时间：2026-03-13
> 验证人：Fact Checker

## 1. 项目迁移机制

### 结论：手写 SQL，非 drizzle-kit generate

- `packages/server/src/db/migrate.ts` 中所有迁移均为**手写 SQL**
- 使用 `CREATE TABLE IF NOT EXISTS` 创建表 + `PRAGMA table_info()` 检查列是否存在 + `ALTER TABLE ADD/DROP COLUMN` 增量迁移
- 无 `drizzle.config.*` 配置文件，无生成的 `.sql` 迁移文件目录
- `drizzle-kit` 虽在 devDependencies 中（`^0.30`），但仅用于开发工具，未用于迁移生成
- `drizzle-orm`（`^0.45`）用作查询构建器和 schema 定义（`schema.ts`），但迁移完全手动

**验证来源**：直接阅读 `migrate.ts`（219 行）、`schema.ts`、`client.ts`；Glob 搜索确认无 `drizzle.config.*` 和 `drizzle/**/*.sql`

## 2. SQLite DROP COLUMN 支持

### 结论：完全支持，已有成功先例

| 事实 | 详情 |
|------|------|
| DROP COLUMN 最低版本 | SQLite 3.35.0（2021-03-12 发布） |
| 项目实际 SQLite 版本 | **3.49.2**（通过 `SELECT sqlite_version()` 实测确认） |
| better-sqlite3 版本 | **v11.10.0**（`^11`，实际安装 11.10.0） |
| 是否满足要求 | **是**，3.49.2 >> 3.35.0 |

**已有先例**（`migrate.ts` 中已成功使用 DROP COLUMN）：
- L75: `ALTER TABLE messages DROP COLUMN tool_calls`
- L81: `ALTER TABLE messages DROP COLUMN token_usage`
- L184: `ALTER TABLE conversations DROP COLUMN project_id`
- L191: `ALTER TABLE cron_job_runs DROP COLUMN project_id`

**验证来源**：
- SQLite 官方文档 https://www.sqlite.org/lang_altertable.html 确认 3.35.0 起支持
- 实测 `node -e "...SELECT sqlite_version()..."` 返回 3.49.2
- `migrate.ts` 源码中已有 4 处 DROP COLUMN 成功使用

### SQLite DROP COLUMN 的限制条件

SQLite DROP COLUMN 有以下限制（来自官方文档）：
1. 不能删除 PRIMARY KEY 中的列
2. 不能删除有 UNIQUE 约束的列（除非该列是该约束的唯一列）
3. 不能删除被 INDEX 引用的列（需先 DROP INDEX）
4. 不能删除被 FOREIGN KEY 引用的列

对本次需求：`conversations.agent_id` 上有索引 `idx_conversations_agent`，**需先 DROP INDEX 再 DROP COLUMN**（项目已有此模式，见 L182-185 的 project_id 删除）。

## 3. 各实体存储方式

| 实体 | 存储方式 | 是否需要 DB 迁移 | 涉及字段 |
|------|---------|-----------------|---------|
| **Conversation** | SQLite（`conversations` 表） | **是** | `agent_id` → 删除，`team_id` → 删除，新增 `target_type` + `target_id` |
| **CronJob** | 文件系统（JSON） | **否**（类型变更即可） | `agentId` + `teamId?` → 改类型定义 |
| **Project** | 文件系统（JSON） | **否**（类型变更即可） | `defaultAgentId?` + `defaultTeamId?` → 改类型定义 |
| **CronJobRuns** | SQLite（`cron_job_runs` 表） | **否**（仅有 `agent_id`，无 target 语义） | 不涉及 |

### 关键发现

- **只有 `conversations` 表需要 SQLite 迁移**
- CronJob 和 Project 都是文件系统存储（JSON），类型变更 + 文件读写时的 normalize 即可处理旧数据
- CronJob 已有先例：`projects.ts` 中的 `normalizeDefaultTarget()` 和 `normalize()` 处理旧字段迁移

**验证来源**：
- `storage/cronjobs.ts`：`FileCronJobStorage`，使用 `readJson`/`writeJson`
- `storage/projects.ts`：`FileProjectStorage`，使用 `readJson`/`writeJson`
- `db/schema.ts`：SQLite schema 定义

## 4. 推荐 DB 迁移方案

### conversations 表（SQLite）

```sql
-- Migration v10: target refactor — replace agent_id + team_id with target_type + target_id

-- Step 1: Add new columns
ALTER TABLE conversations ADD COLUMN target_type TEXT NOT NULL DEFAULT 'agent';
ALTER TABLE conversations ADD COLUMN target_id TEXT NOT NULL DEFAULT '';

-- Step 2: Migrate data (team_id takes precedence, matching existing normalizeDefaultTarget logic)
UPDATE conversations SET target_type = 'team', target_id = team_id WHERE team_id IS NOT NULL AND team_id != '';
UPDATE conversations SET target_type = 'agent', target_id = agent_id WHERE target_type = 'agent';

-- Step 3: Drop old indexes and columns
DROP INDEX IF EXISTS idx_conversations_agent;
ALTER TABLE conversations DROP COLUMN agent_id;
ALTER TABLE conversations DROP COLUMN team_id;

-- Step 4: Create new index
CREATE INDEX IF NOT EXISTS idx_conversations_target ON conversations(target_type, target_id);
```

### CronJob（文件系统）

在读取时 normalize：
```typescript
// 读 JSON 后检测旧格式，自动转换
if ('agentId' in raw && !('targetType' in raw)) {
  return { ...raw, targetType: raw.teamId ? 'team' : 'agent', targetId: raw.teamId ?? raw.agentId }
}
```

### Project（文件系统）

同理，在读取时 normalize：
```typescript
if ('defaultAgentId' in raw && !('defaultTargetType' in raw)) {
  const hasTeam = !!raw.defaultTeamId
  return { ...raw, defaultTargetType: hasTeam ? 'team' : 'agent', defaultTargetId: hasTeam ? raw.defaultTeamId : raw.defaultAgentId }
}
```

## 5. 风险点

| 风险 | 严重程度 | 缓解措施 |
|------|---------|---------|
| `conversations.agent_id` 有索引引用，直接 DROP COLUMN 会失败 | **高** | 必须先 `DROP INDEX idx_conversations_agent` |
| 迁移中 `DEFAULT ''` 的 `target_id` 若后续代码期望非空 branded ID | 中 | Step 2 的 UPDATE 会填充真实值；如有漏网之鱼需检查 |
| 旧 CronJob JSON 文件可能无 `teamId` 字段 | 低 | normalize 逻辑已覆盖（`teamId` 不存在时默认为 agent） |
| `cron_job_runs.agent_id` 不在本次改造范围 | 低 | 确认：这是运行记录的 agent 追踪字段，非 target 语义，不需改动 |
| 需求明确"不考虑向后兼容"——但文件系统的 normalize 仍建议保留 | 低 | normalize 是无害的防御性代码，防止极端情况下旧文件读取失败 |
| 上次 commit `22e2885` 的重构被 revert 过 | **中** | 本次方案更简单明确：只动一张 SQLite 表 + 两种 JSON 类型；需充分测试 |
