# ChatTarget 重构 — 事实验证报告

## 1. 项目现有 SQLite migration 体系

### 结论
项目使用 **手写 SQL migration**，通过 `PRAGMA table_info()` 做幂等检测，没有版本号管理系统（无 migration table、无序号文件）。drizzle-kit 仅作为 devDependency 存在，未实际用于 migration 生成。

### 证据
- `packages/server/src/db/migrate.ts` 是唯一的 migration 入口，所有 migration 以 `db.run(sql`...`)` 形式内联在一个函数中
- 每个 migration 块用注释标记版本（`v2`, `v3`, `v4`, ... `v9`），但无自动化版本追踪
- 幂等策略：
  - 新表：`CREATE TABLE IF NOT EXISTS`（天然幂等）
  - 新列：先 `PRAGMA table_info(table)` 查列是否存在，不存在才 `ALTER TABLE ADD COLUMN`
  - 删列：同样先查再 `ALTER TABLE DROP COLUMN`（如 v7 删 `project_id`）
  - 删表：`DROP TABLE IF EXISTS`
- drizzle-kit (`^0.30`) 是 devDependency，但项目中无 `drizzle.config.*` 文件，未用于生成 migration SQL
- drizzle-orm 的 schema（`packages/server/src/db/schema.ts`）仅用于类型安全的查询（select/insert/update/delete），不参与 migration

### 对设计的影响
新 migration 应遵循现有模式：在 `migrateDatabase()` 函数末尾（`setupFTS` 之前）追加新 migration 块，使用 `PRAGMA table_info()` + 条件判断保证幂等性。同时需要更新 `schema.ts` 中的 drizzle schema 定义以保持查询类型一致。

---

## 2. SQLite ALTER TABLE 能力

### 结论
项目使用的 SQLite 版本（3.49.2）**完全支持** RENAME COLUMN（3.25.0+）和 DROP COLUMN（3.35.0+），且项目已有 DROP COLUMN 的使用先例。

### 证据
- **better-sqlite3 版本**：项目使用 `better-sqlite3@11.10.0`，内嵌 SQLite **3.49.2**（验证自 `node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3/deps/sqlite3/sqlite3.h` 第 149 行：`#define SQLITE_VERSION "3.49.2"`）
- **RENAME COLUMN**：SQLite 3.25.0（2018-09-15）起支持 — 远低于当前版本
- **DROP COLUMN**：SQLite 3.35.0（2021-03-12）起支持 — 远低于当前版本。建议使用 3.35.5+ 避免早期版本的 DROP COLUMN 腐败 bug，当前 3.49.2 没有此问题
- **项目已有先例**：`migrate.ts` 中 migration v7 已使用 `ALTER TABLE conversations DROP COLUMN project_id` 和 `ALTER TABLE cron_job_runs DROP COLUMN project_id`；v2 使用了 `ALTER TABLE messages DROP COLUMN tool_calls`

### 对设计的影响
可以放心使用 `ALTER TABLE ... RENAME COLUMN` 和 `ALTER TABLE ... DROP COLUMN`。如果 ChatTarget 重构需要把 `agent_id` + `team_id` 两列合并/重命名，SQLite 层面没有限制。不过，由于 conversations 表的 `agent_id` 列上有索引 `idx_conversations_agent`，改列名时需要先 DROP 旧索引再 CREATE 新索引。

---

## 3. File-based storage 读写模式

### 结论
文件存储（projects、cronjobs 等）使用 **JSON 文件 + 原子写入**，**无运行时 schema 验证**，旧字段通过读取时的 `normalize()` 函数做懒迁移，无独立 migration 机制。

### 证据

**读写基础设施**（`packages/server/src/storage/base.ts`）：
- `readJson<T>()`：`JSON.parse()` 后直接 `as T`，零运行时校验
- `writeJson<T>()`：写入 tmp 文件后 `rename` 原子替换，保证不会写入半截数据

**Projects 的懒迁移**（`packages/server/src/storage/projects.ts`）：
- `normalize()` 方法在每次 `list()` 和 `getById()` 读取时执行
- 示例：`mainAgentId → defaultAgentId` 的字段重命名，通过 `project.defaultAgentId ?? raw.mainAgentId` 兼容旧数据
- `normalizeDefaultTarget()` 方法处理 `defaultAgentId` + `defaultTeamId` 互斥逻辑
- 旧 JSON 文件中的废弃字段不会被主动清理，只在下次 `update()` 时通过展开运算符自然携带

**CronJobs**（`packages/server/src/storage/cronjobs.ts`）：
- 无 normalize 逻辑，直接 `readJson<CronJob>()`
- `projectId` 不存入文件（由目录结构决定），读取时手动注入

### 对设计的影响
ChatTarget 重构如果改变 Project/CronJob 的字段结构（如将 `agentId` + `teamId` 替换为 `chatTarget`），需要：
1. 在 `normalize()` 中添加向后兼容逻辑（读旧 → 转新），与 `mainAgentId → defaultAgentId` 同样的模式
2. 旧 JSON 文件不需要批量迁移，懒迁移即可
3. CronJob 如果也需要类似变更，需要新增 normalize 逻辑（目前没有）

---

## 4. AI SDK Chat transport

### 结论
`Chat` 实例的 `transport` 是**创建时固定的**（`private readonly`），运行时不可替换。但 `DefaultChatTransport` 的 `body` 字段支持 `Resolvable<object>`（即可以传入一个函数），**每次请求时动态求值**。

### 证据

**`AbstractChat.transport`**（`ai@6.0.82` — `dist/index.d.ts` 第 3371 行）：
```typescript
private readonly transport;
```
TypeScript 层面声明为 `private readonly`，不可从外部访问或替换。

**`HttpChatTransport.body`**（第 3562 行）：
```typescript
body?: Resolvable<object>;
```
其中 `Resolvable<T> = MaybePromiseLike<T> | (() => MaybePromiseLike<T>)`（`@ai-sdk/provider-utils`）— 支持传入函数。

**运行时行为**（`dist/index.js` 第 12328 行）：
```javascript
const resolvedBody = await resolve(this.body);
```
每次 `sendMessages()` 调用时都会 `resolve(this.body)`，如果 `body` 是函数则每次执行获取最新值。

**`HttpChatTransport.body` 可见性**（第 3585 行）：
```typescript
protected body: HttpChatTransportInitOptions<UI_MESSAGE>['body'];
```
`body` 是 `protected`（非 `private readonly`），理论上可被子类修改，也可在运行时通过 JS 直接赋值（但不推荐）。

**当前项目用法**（`packages/ui/src/lib/chat-instances.ts` 第 39-46 行）：
```typescript
new DefaultChatTransport({
  api: `${config.serverConfig.baseUrl}/api/chat`,
  body: {
    projectId: config.projectId,
    agentId: config.agentId,
    conversationId: config.conversationId,
  },
  ...
})
```
目前 `body` 传的是**静态对象**，`agentId` 在创建时就固定了。

### 对设计的影响
ChatTarget 重构有两个可行路径：

**方案 A — destroy + recreate**：当 ChatTarget 变化时销毁旧 Chat 实例、创建新实例。项目已有 `destroyChat()` 函数，模式成熟。缺点是丢失客户端消息状态（但消息已持久化到 DB，可重新加载）。

**方案 B — body 用函数**：将 `body` 改为闭包/函数形式，捕获一个可变引用：
```typescript
const targetRef = { current: { agentId, conversationId, projectId } }
body: () => ({ ...targetRef.current }),
```
这样不需要重建 Chat 实例，只需更新 `targetRef.current`。这是 AI SDK 官方支持的模式（`Resolvable` 设计意图）。

**注意**：无论哪种方案，都不需要修改 `AbstractChat` 或 `transport` 本身。变更只在 `body` 层面。

---

## 5. drizzle-orm 与手写 SQL migration 的兼容性

### 结论
项目采用**手写 SQL migration + drizzle-orm schema 查询**的双轨模式，二者解耦。Migration 通过 `sql` 模板标签执行原生 SQL，drizzle schema 仅用于类型安全查询。两者必须手动保持同步。

### 证据

**Migration 不依赖 drizzle schema**：
- `migrate.ts` 导入 `{ sql } from 'drizzle-orm'`（模板标签），但不导入任何 schema 定义
- 所有 DDL 用原生 SQL 字符串：`CREATE TABLE`, `ALTER TABLE`, `PRAGMA table_info()` 等

**drizzle schema 不参与 DDL**：
- `schema.ts` 定义了 `conversations`, `messages` 等表结构，仅用于查询时的类型推断
- `client.ts` 中 `drizzle(sqlite, { schema })` 注入 schema 做关系查询，但不执行 DDL

**查询层面的使用**：
- `conversations.ts` 的 CRUD 操作全部使用 drizzle schema 对象（如 `schema.conversations.agentId`, `eq()`, `desc()`）
- FTS 搜索使用 `db.all<FtsMessageRow>(sql`...`)` 原生 SQL（drizzle 不支持 FTS5）
- 两种模式在同一个文件中共存（如 `conversations.ts`）

**同步要求**：
- 当 migration 改变表结构时，必须同步更新 `schema.ts`，否则 drizzle 查询会类型错误或运行时失败
- 当前 `schema.ts` 中 conversations 表有 `agentId` 和 `teamId` 字段，与 migration v9 的最终状态一致

### 对设计的影响
ChatTarget 重构需要同步修改两个文件：
1. `migrate.ts`：添加新 migration 块（如 RENAME/ADD/DROP COLUMN）
2. `schema.ts`：更新 drizzle 表定义以匹配新的列结构

修改顺序无关（两者独立），但必须保持一致。如果列名变化（如 `agent_id` → `target_id`），则所有使用 `schema.conversations.agentId` 的查询代码也要同步更新。建议：先改 schema + 查询代码，再追加 migration，最后一起测试。
