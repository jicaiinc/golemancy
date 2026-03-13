# 抽象质量审查报告：targetType + targetId 统一方案

> 审查时间：2026-03-13
> 审查人：Abstraction Strategist
> 输入文档：architecture.md, fact-check.md, requirements.md

---

## 1. 命名一致性

**评价：PASS**

`targetType` + `targetId` 在三处实体上的命名方案：

| 实体 | 字段命名 | 是否一致 |
|------|---------|---------|
| Conversation | `targetType` + `targetId` | 是 |
| CronJob | `targetType` + `targetId` | 是 |
| Project | `defaultTargetType?` + `defaultTargetId?` | 是（加 `default` 前缀语义正确） |

**分析：**

- 三处统一使用 `targetType` / `targetId` 命名，语义清晰。`target` 准确表达了"对话/定时任务/项目默认值所指向的执行实体"。
- Project 使用 `defaultTargetType` / `defaultTargetId`，`default` 前缀保持了与原 `defaultAgentId` 的语义连续性，且明确区分"这是默认值"而非"当前值"。
- 与现有 `id: ConversationId`、`id: CronJobId` 等字段无命名冲突。
- DB 列名 `target_type` / `target_id` 与 TypeScript 字段名 camelCase 映射一致，符合 Drizzle ORM 的现有命名风格。

**无 CONCERN。**

---

## 2. 联合类型安全

**评价：CONCERN（轻微）**

`targetId: AgentId | TeamId` 配合 `targetType: TargetType` 做类型收窄的模式在 TypeScript 中是可行的，但存在一个结构性问题：**这不是真正的判别联合（discriminated union）**。

### 当前方案的问题

```typescript
// 架构中提出的 narrowing 方式
function narrowTargetId(targetType: TargetType, targetId: AgentId | TeamId) {
  if (targetType === 'agent') return { agentId: targetId as AgentId }
  return { teamId: targetId as TeamId }
}
```

关键词是 `as AgentId` / `as TeamId`——这是**类型断言**（type assertion），不是编译器自动推导的类型收窄。TypeScript 编译器无法从 `targetType === 'agent'` 推断出 `targetId` 的具体类型，因为两个字段之间没有类型级别的关联。如果开发者写错了判断条件（比如 `targetType === 'team'` 分支里 `as AgentId`），编译器不会报错。

### 更安全的替代方案

判别联合（discriminated union）可以让编译器自动做类型收窄：

```typescript
type Target =
  | { targetType: 'agent'; targetId: AgentId }
  | { targetType: 'team'; targetId: TeamId }
```

但这在**扁平数据结构**中无法直接使用——Conversation 等接口是 flat object，不是嵌套结构。要让判别联合生效，需要将整个 Conversation 变成联合类型：

```typescript
type Conversation =
  | (ConversationBase & { targetType: 'agent'; targetId: AgentId })
  | (ConversationBase & { targetType: 'team'; targetId: TeamId })
```

这种方式在理论上更安全，但会让 `Conversation` 类型的使用复杂度显著上升（每次访问 `targetId` 前都需要先 narrow `targetType`），且与项目现有的 interface 风格不一致。

### 结论

当前方案的 `as` 断言模式是**务实的选择**。`AgentId` 和 `TeamId` 都是 branded string，底层都是 string，运行时不会因为类型错误产生 crash。类型断言的风险点仅在于逻辑层面的 targetType/targetId 不匹配，这种错误会在业务逻辑测试中暴露。

**建议：保持现有方案，但在 `resolveAgentId()` 函数的 JSDoc 中明确说明这一 limitation，提醒使用方注意 targetType 与 targetId 必须配对正确。** 不需要为此引入判别联合——收益不抵复杂度。

---

## 3. resolveAgentId() 职责边界

**评价：CONCERN（中等）**

### 放在 shared 包的合理性

`resolveAgentId()` 放在 `shared` 包中是合理的——它是纯函数，不依赖任何 I/O，输入 `(targetType, targetId, team?)` 输出 `AgentId`。server 和 UI 都需要这个逻辑。

### 使用模式差异的问题

问题在于 **server 端和 UI 端获取 `team` 参数的方式不同**，这会导致调用模式分化：

**Server 端（有 storage 直接访问）：**
```typescript
// 可以在调用点直接查 team
let team: Team | undefined
if (cronJob.targetType === 'team') {
  team = await deps.teamStorage.getById(projectId, cronJob.targetId as TeamId)
}
const agentId = resolveAgentId(cronJob.targetType, cronJob.targetId, team)
```

**UI 端（依赖 Zustand store 或 HTTP service）：**
```typescript
// 需要从 store 获取 team list，再 find
const teams = useAppStore.getState().teams
const team = teams.find(t => t.id === project.defaultTargetId)
const agentId = resolveAgentId(project.defaultTargetType!, project.defaultTargetId!, team)
```

两端的"获取 team"方式不同，但 `resolveAgentId()` 本身的职责是一致的：给定 target 信息和 team 数据，返回 agentId。**函数本身没有问题，差异在于调用方的数据获取方式，这属于正常的架构分层差异。**

### 潜在的遗忘风险

更值得关注的是：调用方可能**忘记在 `targetType === 'team'` 时传入 team**，导致运行时抛错。函数签名 `team?: Team` 的可选参数不会在编译期强制要求传入。

**建议：可以接受当前设计。** 因为：
1. `resolveAgentId()` 内部已有 `throw` 防护（team 未传入时明确报错）
2. 调用点数量有限（architecture.md 列出了约 4-5 个），每个调用点都有明确的 if/else 分支
3. 替代方案（如重载签名、server 专用 wrapper）会增加不必要的复杂度

但建议在实现时，每个调用点都加上 `// resolveAgentId: team is required when targetType === 'team'` 的简短注释，作为 code review 时的 checklist。

---

## 4. DB Schema 与 ORM 映射

**评价：CONCERN（中等）**

### CHECK 约束

`target_type TEXT` 没有 CHECK 约束（`CHECK(target_type IN ('agent', 'team'))`）。在 SQLite 中 CHECK 约束是支持的且开销极低。

**建议：在迁移脚本中不加 CHECK 约束。** 理由：
1. 项目现有 schema 中无任何 CHECK 约束先例（`status`、`role`、`trigger` 等枚举字段都是纯 TEXT）
2. 保持一致性比追求单点安全更重要
3. TypeScript 类型系统 + ORM 层已经在应用层约束了值的范围
4. 加了 CHECK 后，未来扩展 TargetType（如加入 'workflow'）需要额外 ALTER TABLE

### `.notNull()` 在迁移后的生效问题

架构文档正确指出：`ALTER TABLE ADD COLUMN` 时不能加 `NOT NULL`（除非有 DEFAULT），所以新列实际上在 SQLite 层面是 **nullable** 的。Drizzle schema 声明 `.notNull()` 只是 ORM 层的约束。

**这里有一个隐患：** 如果迁移脚本执行到 Step 2（UPDATE）之前进程崩溃，部分行的 `target_type` / `target_id` 会是 NULL。重启后迁移检测条件 `convColsV10.some(c => c.name === 'agent_id')` 为 false（因为 Step 4 DROP 还没执行），但新列已经存在且值为 NULL。

**事实验证报告（fact-check.md）提出了替代方案：** 使用 `DEFAULT 'agent'` 和 `DEFAULT ''` 添加列。这更安全——即使 UPDATE 未执行，数据也有合法默认值。

**建议：采用 fact-check.md 的方案，加 DEFAULT 值。** 但需注意 `target_id DEFAULT ''` 会产生空字符串 branded ID，虽然概率极低（迁移通常是原子性的），但防御性代码成本也极低。架构文档中应明确选择其中一种方案。

### 迁移幂等性

当前方案用 `PRAGMA table_info()` 检查 `agent_id` 列是否存在来判断是否需要迁移。这是项目的既有模式，没有问题。但建议确认：如果 `target_type` 列已经存在（中间状态），迁移不会重复添加列。

**实际上不会出问题**：`ALTER TABLE ADD COLUMN` 在列已存在时会报错，而迁移只在 `agent_id` 存在时才执行。`agent_id` 存在 = 迁移未完成（或从未开始）。如果中间崩溃导致 `target_type` 已存在但 `agent_id` 也还在，ADD COLUMN 会报错。

**建议：在 Step 1 加条件判断。** 改为：
```sql
-- 仅当列不存在时添加
PRAGMA table_info(conversations) → 检查 target_type 是否已存在
```
或者使用项目已有的 pattern（`if (!cols.some(c => c.name === 'target_type'))`）包裹 ADD COLUMN。

---

## 5. 文件系统 normalize 策略

**评价：CONCERN（轻微）**

### 现象

CronJob 和 Project 的 normalize **只在读取时做转换，不回写**。这意味着：
- 旧格式的 JSON 文件会一直存在于磁盘上
- 每次读取都需要执行 normalize 逻辑
- 直接用文件浏览器/脚本查看 JSON 文件会看到旧格式

### 这是否是问题？

**在实际场景中不是大问题。** 理由：
1. 需求明确"不考虑向后兼容"，但 normalize 是防御性代码，成本极低
2. 旧格式文件在**下一次 update() 写入时自然转换**——因为 `update()` 写入的是内存中已 normalize 的对象
3. 只有从未被 update 过的旧文件会一直保留旧格式
4. 架构文档已注明"normalize 仅在过渡期使用，后续可批量转换后删除"

### 是否需要主动回写？

**不建议。** 主动回写（read-normalize-write-back）有副作用：
- 改变文件的 `mtime`，可能干扰 git 追踪（如果数据目录纳入版本管理）
- 在 list() 中批量写入可能产生性能问题
- 增加了 normalize 函数的副作用，违反单一职责

**建议：保持当前方案（读时 normalize，写时自然覆盖）。** 如果强迫症发作，可以在 v2.0 做一次性批量迁移脚本，但不值得在本次重构中处理。

---

## 6. 接口签名变更的影响

**评价：CONCERN（中等）**

### IConversationService.create 签名变更

**Before:**
```typescript
create(projectId: ProjectId, agentId: AgentId, title: string, teamId?: TeamId): Promise<Conversation>
```

**After:**
```typescript
create(projectId: ProjectId, targetType: TargetType, targetId: AgentId | TeamId, title: string): Promise<Conversation>
```

### 参数顺序变更分析

变更点：
1. `agentId` → `targetType` + `targetId`（语义变更，合理）
2. `title` 从第 3 位移到第 4 位
3. 可选的 `teamId?` 被移除（被 `targetType` + `targetId` 吸收）

**这个变更是合理的。** 理由：
- 将两个必填的 target 字段放在一起（`targetType`, `targetId`），语义分组比 `agentId, title, teamId?` 更清晰
- 旧签名中 `teamId?` 作为最后一个可选参数容易被遗忘——这正是当前 bug 的根源
- `title` 移到第 4 位不影响可读性，且编译器会捕获所有调用点的参数类型错误

### sub-agent.ts 的影响

`sub-agent.ts:125-128` 调用 `conversationStorage.create()` 时只传了 `(projectId, agentId, title)`——没传 `teamId`。这在新签名下需要改为 `(projectId, 'agent', childAgent.id, title)`。

**这个调用点在 architecture.md 的影响清单（§8）中被列出了**（`agent/sub-agent.ts:107-135`），但描述只说"签名改造"。需要确认实现时不遗漏。

### dashboard.ts / global-dashboard.ts 中的原始 SQL

架构文档§8 中 `dashboard.ts` 和 `global-dashboard.ts` **没有被列入变更清单**，但 fact-check 确认这两个文件中有多处直接引用 `c.agent_id` 的原始 SQL 查询（共 9 处）。

**这是一个遗漏。** conversations 表中 `agent_id` 列被 drop 后，这些 SQL 查询会直接报错。

需要分析这些查询的语义：
- `dashboard.ts:150,158,172,183` — `WHERE c.agent_id = ${agent.id}`：按 agent 过滤对话。新 schema 下应改为 `WHERE c.target_type = 'agent' AND c.target_id = ${agent.id}`，**但这会丢失 team 中该 agent 作为 leader 的对话统计**。需要明确需求：dashboard 是按"执行 agent"还是按"target"统计？
- `dashboard.ts:227,399,549` 和 `global-dashboard.ts:154,457` — `SELECT c.agent_id`：选取 agent_id 用于关联显示。新 schema 下列名改为 `target_id`，但语义从"agent"变成了"target"（可能是 team）。

**建议：在实施清单中补充 `dashboard.ts` 和 `global-dashboard.ts` 的改造方案。** 这两个文件的 SQL 查询需要重新设计，不是简单的列名替换。具体方案取决于产品需求：dashboard 是否要区分 agent target 和 team target 的统计维度。

---

## 总结

| 维度 | 评价 | 严重程度 | 是否阻断实施 |
|------|------|---------|------------|
| 1. 命名一致性 | **PASS** | — | 否 |
| 2. 联合类型安全 | **CONCERN** | 轻微 | 否 |
| 3. resolveAgentId() 职责边界 | **CONCERN** | 中等 | 否 |
| 4. DB schema 与 ORM 映射 | **CONCERN** | 中等 | 否（但需补充迁移中间状态防护） |
| 5. 文件系统 normalize 策略 | **CONCERN** | 轻微 | 否 |
| 6. 接口签名变更 | **CONCERN** | 中等 | **需补充 dashboard SQL 改造方案** |

### 必须在实施前解决的问题

1. **dashboard.ts + global-dashboard.ts 的 SQL 改造被遗漏**：共 9 处 `c.agent_id` 引用，conversations 表 drop `agent_id` 后会直接崩溃。必须补充到影响清单和实施方案中。
2. **迁移脚本中间状态防护**：Step 1 的 `ADD COLUMN` 应加条件判断（列已存在时跳过），或采用 fact-check.md 的 `DEFAULT` 方案，防止中间崩溃后重启出错。

### 建议但不阻断的改进

3. 联合类型的 `as` 断言在 JSDoc 中注明 limitation
4. `resolveAgentId()` 调用点加简短注释标注 team 参数要求
5. 文件系统 normalize 保持现状（读时转换），不做主动回写
