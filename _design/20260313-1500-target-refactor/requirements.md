# 需求分析：消除 agentId + teamId 互斥双字段设计缺陷

> 分析日期：2026-03-13
> 基于需求文档：`_requirement/20260313-1500-target-refactor.md`

---

## 一、受影响模块全景

### 1. 类型层 (packages/shared)

| 文件 | 当前双字段 | 影响 |
|------|-----------|------|
| `types/common.ts` | 无（但需新增 `TargetType` 类型） | 新增联合类型定义 |
| `types/conversation.ts:31-32` | `agentId: AgentId` + `teamId?: TeamId` | **核心改造**：替换为统一 target |
| `types/cronjob.ts:8-9` | `agentId: AgentId` + `teamId?: TeamId` | **核心改造**：替换为统一 target |
| `types/project.ts:10-11` | `defaultAgentId?: AgentId` + `defaultTeamId?: TeamId` | **核心改造**：替换为统一 target |
| `services/interfaces.ts:22` | `IProjectService.update` 签名含 `defaultAgentId` + `defaultTeamId` | 签名改造 |
| `services/interfaces.ts:45` | `IConversationService.create` 含 `agentId` + `teamId?` | 签名改造 |
| `services/interfaces.ts:50` | `IConversationService.update` 含 `agentId?` + `teamId?` | 签名改造 |
| `services/interfaces.ts:109-110` | `ICronJobService.create/update` 含 `agentId` + `teamId?` | 签名改造 |

### 2. UI 层 (packages/ui)

| 文件 | 影响点 | 说明 |
|------|--------|------|
| `pages/chat/ChatPage.tsx:158-179` | `defaultAgentId` + `defaultTeamId` 双变量、`handleNewChat` 优先级逻辑 | **复杂互斥逻辑**：先判断 defaultTeamId → 查 leader → 再 fallback defaultAgentId |
| `pages/chat/ChatPage.tsx:186-193` | `handleSwitchAgent(agentId, teamId?)` | 互斥参数传递 |
| `pages/chat/ChatPage.tsx:267` | `ChatEmptyState` 传 `defaultAgentId` | Props 改造 |
| `pages/chat/ChatWindow.tsx:43` | `onSwitchAgent: (agentId: AgentId, teamId?: TeamId)` | Props 签名改造 |
| `pages/chat/ChatWindow.tsx:109-116` | `conversation.agentId` + `conversation.teamId` 解构使用 | Chat instance keying |
| `pages/chat/ChatWindow.tsx:254` | `conversation.teamId ? teams.find(...)` 显示逻辑 | 标签显示 |
| `pages/chat/ChatWindow.tsx:313` | select value = `teamId ? encode : agentId` | 选择器值计算 |
| `pages/chat/ChatSidebar.tsx:144` | `conv.teamId ? teams.find(...) : agents.find(...)` | Sidebar 显示名称 |
| `pages/chat/ChatEmptyState.tsx:7,14` | `defaultAgentId?: AgentId` prop | Props 改造 |
| `pages/cron/CronJobFormModal.tsx:47-56` | 分离 state：`agentId` + `teamId`，`selectValue` 计算 | 互斥 state 管理 |
| `pages/cron/CronJobFormModal.tsx:69-87` | `editJob.agentId` + `editJob.teamId` 初始化 | 初始化逻辑 |
| `pages/cron/CronJobFormModal.tsx:90-92` | `isValid` 校验只检查 `agentId` | 验证逻辑 |
| `pages/cron/CronJobFormModal.tsx:99-121` | `resolvedTeamId` 逻辑、`handleSubmit` 拼装 | 提交逻辑 |
| `pages/cron/CronJobsPage.tsx:138` | `job.teamId ? teams.find(...)` | 显示逻辑 |
| `pages/project/ProjectSettingsPage.tsx:55-64` | `handleDefaultChange` 需清另一个字段 | **典型互斥 hack** |
| `pages/project/ProjectSettingsPage.tsx:191` | value 计算 `defaultTeamId ? encode : defaultAgentId` | 选择器值计算 |
| `lib/chat-instances.ts:11,26` | `ChatInstanceConfig.agentId` | 虽然只存 agentId，但需关联 |
| `lib/team-select.ts` | `encodeTeamValue` / `decodeSelectValue` | **可能被删除或重构**（当前是 UI hack） |
| `stores/useAppStore.ts:132` | `updateProject` 签名含 `defaultAgentId` + `defaultTeamId` | 签名改造 |
| `stores/useAppStore.ts:152-153` | `createConversation` + `updateConversation` 签名 | 签名改造 |
| `stores/useAppStore.ts:192-193` | `createCronJob` + `updateCronJob` 签名 | 签名改造 |
| `stores/useAppStore.ts:384` | `createProject` 自动 set `defaultAgentId` | 改为 set target |
| `stores/useAppStore.ts:439-442` | `deleteAgent` cascade clear `defaultAgentId` | 改为 target 级联 |
| `stores/useAppStore.ts:996-999` | `deleteTeam` cascade clear `defaultTeamId` | 改为 target 级联 |
| `services/http/services.ts:32` | `HttpProjectService.update` 签名 | 签名改造 |
| `services/http/services.ts:88-91` | `HttpConversationService.create` 拼 `{ agentId, teamId }` | Body 改造 |
| `services/http/services.ts:93` | `HttpConversationService.update` 签名 | 签名改造 |
| `services/mock/services.ts:68` | `MockProjectService.update` 签名 | 签名改造 |
| `services/mock/data.ts:24` | seed data `defaultAgentId: 'agent-1'` | 数据改造 |

### 3. Server 层 (packages/server)

| 文件 | 影响点 | 说明 |
|------|--------|------|
| `db/schema.ts:5-6` | conversations 表 `agentId` + `teamId` 列 | **DB 迁移核心** |
| `db/migrate.ts` | 需新增迁移脚本 | 新列 + 数据转换 + drop 旧列 |
| `routes/chat.ts:61,65` | body 解构 `agentId?` + `teamId?` | API 入口改造 |
| `routes/chat.ts:85-93` | agentId 从 body 或 conversation 解析 | 需改为 target 解析 |
| `routes/chat.ts:108-117` | teamId 从 body 或 conversation 解析 | 需改为 target 解析 |
| `routes/conversations.ts:67,77` | create/update API 接收 `agentId` + `teamId` | API 改造 |
| `routes/agents.ts:75-79` | delete cascade `defaultAgentId` | 需改为 target 级联 |
| `routes/teams.ts:91-95` | delete cascade `defaultTeamId` | 需改为 target 级联 |
| `storage/conversations.ts:51-78` | `create(projectId, agentId, title, teamId?)` | 签名+实现改造 |
| `storage/conversations.ts:146-152` | `update(...)` 含 `agentId?` + `teamId?` | 签名+实现改造 |
| `storage/conversations.ts:293-304` | `rowToConversation` 映射 `agentId` + `teamId` | 映射改造 |
| `storage/projects.ts:13-28` | `normalizeDefaultTarget()` **互斥逻辑** | **需求明确要删除** |
| `storage/projects.ts:30-37` | `normalize()` 中含 `mainAgentId` 迁移 | 需改为 target 迁移 |
| `storage/projects.ts:97-131` | `update()` 中互斥清除逻辑 | **需求明确要删除** |
| `storage/cronjobs.ts:32-52` | `create()` 签名含 `agentId` | 签名改造 |
| `storage/cronjobs.ts:54-73` | `update()` 签名含 `agentId` | 签名改造 |
| `storage/clone-project.ts:32-36` | `mainAgentId → defaultAgentId` 迁移 | 改为 target 迁移 |
| `storage/clone-project.ts:211-216` | clone cronjob 时 remap `agentId` + `teamId` | 改为 target remap |
| `storage/clone-project.ts:234-239` | clone project 时 remap `defaultAgentId` + `defaultTeamId` | 改为 target remap |
| `storage/dashboard.ts` | 多处 SQL 查询使用 `conversations.agent_id` | **SQL 无需改**（agent_id 仍在 conversations 表中被 target 替代后需更新查询） |
| `storage/global-dashboard.ts` | 同上 | 同上 |
| `scheduler/executor.ts:50-51` | `cronJob.agentId` 直接使用 | 需改为 `resolveAgentId()` |
| `scheduler/executor.ts:87-93` | `cronJob.teamId` 直接使用 | 需改为 target 判断 |
| `scheduler/executor.ts:97-102` | `conversationStorage.create(projectId, agentId, ..., teamId)` | 签名改造 |
| `agent/sub-agent.ts:107-135` | 创建子 session conversation | 签名改造 |

### 4. 测试文件

| 文件 | 影响 |
|------|------|
| `server/src/app.test.ts` | conversation 创建/查询测试 |
| `server/src/db/db.test.ts` | schema 测试 |
| `server/src/db/migrate-v2.test.ts` | 迁移测试 |
| `server/src/routes/agents.test.ts` | defaultAgentId cascade 测试 |
| `server/src/routes/chat.test.ts` | chat API 测试 |
| `server/src/routes/conversations.test.ts` | conversation CRUD 测试 |
| `server/src/routes/teams.test.ts` | defaultTeamId cascade 测试 |
| `server/src/scheduler/executor.test.ts` | cron executor 测试 |
| `server/src/storage/conversations.test.ts` | conversation storage 测试 |
| `server/src/storage/dashboard.test.ts` | dashboard 测试 |
| `server/src/storage/global-dashboard.test.ts` | global dashboard 测试 |
| `server/src/storage/projects.test.ts` | project storage 测试（含互斥测试） |
| `ui/src/lib/chat-instances.test.ts` | chat instance 测试 |
| `ui/src/pages/chat/ChatWindow.test.tsx` | ChatWindow 测试 |
| `ui/src/pages/cron/CronJobsPage.test.tsx` | CronJobs 测试 |
| `ui/src/pages/project/ProjectSettingsPage.test.tsx` | ProjectSettings 测试 |
| `ui/src/services/http/services.test.ts` | HTTP service 测试 |
| `ui/src/services/mock/services.test.ts` | Mock service 测试 |
| `ui/src/stores/useAppStore.test.ts` | store 测试（含 cascade 测试） |

---

## 二、验收标准

### 需求 1：消除双字段，统一为 targetType + targetId

**AC-1.1** — `Conversation` 类型不再有 `agentId` 和 `teamId` 两个字段，替换为统一的 target 表示（如 `targetType: 'agent' | 'team'` + `targetId: AgentId | TeamId`）
- [ ] `shared/types/conversation.ts` 中 `agentId` 和 `teamId` 被移除
- [ ] 新的 target 字段已添加
- [ ] 编译通过（`pnpm lint`）

**AC-1.2** — `CronJob` 类型同样统一
- [ ] `shared/types/cronjob.ts` 中 `agentId` 和 `teamId` 被移除
- [ ] 新的 target 字段已添加
- [ ] 注意：`CronJobRun` 中的 `agentId` 是运行时记录，需保持不变（它记录实际执行的 agent）

**AC-1.3** — `Project` 类型同样统一
- [ ] `shared/types/project.ts` 中 `defaultAgentId` 和 `defaultTeamId` 被移除
- [ ] 替换为统一的 default target 表示（如 `defaultTarget?: { type: 'agent' | 'team'; id: AgentId | TeamId }`）

**AC-1.4** — 服务接口签名统一更新
- [ ] `IProjectService.update` 签名不再含 `defaultAgentId` / `defaultTeamId`
- [ ] `IConversationService.create/update` 签名不再含分离的 `agentId` / `teamId`
- [ ] `ICronJobService.create/update` 签名不再含分离的 `agentId` / `teamId`

### 需求 2：提供 resolveAgentId() 工具函数

**AC-2.1** — 函数实现
- [ ] 在 `shared/utils/` 中导出 `resolveAgentId()` 函数
- [ ] 当 `type === 'agent'` 时直接返回 `targetId as AgentId`
- [ ] 当 `type === 'team'` 时接受 team 数据（或 team 查询函数），返回 leader agent 的 `agentId`
- [ ] 函数有单元测试

**AC-2.2** — 全部调用点使用
- [ ] `ChatPage.handleNewChat` 使用 `resolveAgentId()` 而非手动解析
- [ ] `CronJobFormModal` 使用 `resolveAgentId()` 而非手动解析
- [ ] `executor.ts` 使用 `resolveAgentId()` 而非直接 `cronJob.agentId`
- [ ] `routes/chat.ts` 使用 `resolveAgentId()` 而非手动解析
- [ ] `sub-agent.ts` 使用正确的 target 传递

### 需求 3：所有死代码清除

**AC-3.1** — `normalizeDefaultTarget()` 删除
- [ ] `storage/projects.ts` 中的 `normalizeDefaultTarget()` 方法已删除
- [ ] `normalize()` 方法中不再有互斥逻辑
- [ ] `update()` 方法中的互斥清除代码已删除（`projects.ts:115-127`）

**AC-3.2** — 旧字段完全清除
- [ ] 全局搜索 `defaultAgentId` — 0 结果
- [ ] 全局搜索 `defaultTeamId` — 0 结果
- [ ] Conversation 上下文中搜索 `\.agentId` + `\.teamId` — 不再出现分离使用（`CronJobRun.agentId` 除外）
- [ ] `team-select.ts` 中的 `encodeTeamValue` / `decodeSelectValue` 被评估：如果新设计不再需要编码，则删除

**AC-3.3** — 互斥逻辑完全清除
- [ ] `ChatPage.tsx:160` 的 `canNewChat = !!defaultAgentId || !!defaultTeamId` 改为基于 target 的判断
- [ ] `ChatPage.tsx:167-178` 的优先级 fallback 逻辑删除
- [ ] `ProjectSettingsPage.tsx:59-63` 的三路清除逻辑删除
- [ ] `CronJobFormModal.tsx` 的双 state + `resolvedTeamId` 逻辑删除
- [ ] `deleteAgent` / `deleteTeam` 中的分离级联清除改为统一 target 级联

### 需求 4：DB 迁移

**AC-4.1** — 迁移脚本
- [ ] 新增迁移脚本将 `conversations` 表的 `agent_id` + `team_id` 转换为新列
- [ ] 旧数据一次性转换
- [ ] 旧列被 drop
- [ ] CronJob 存储在 JSON 文件中，不需要 DB 迁移（但 JSON 格式需要升级处理）
- [ ] Project 存储在 JSON 文件中，不需要 DB 迁移（但 JSON 格式需要升级处理）

**AC-4.2** — 旧数据兼容
- [ ] 旧 JSON（project.json、cronjob.json）读取时能自动迁移到新格式
- [ ] 迁移后的数据在新格式下正确工作

### 需求 5：不破坏现有功能

**AC-5.1** — 编译
- [ ] `pnpm lint` 通过（所有 package 无类型错误）

**AC-5.2** — 测试
- [ ] `pnpm test` 通过（所有单元测试）
- [ ] `pnpm test:build` 通过（构建预检）

**AC-5.3** — 功能点回归
- [ ] 新建对话（agent 模式）正常
- [ ] 新建对话（team 模式）正常
- [ ] 对话切换 agent/team 正常
- [ ] Project Settings 设置默认 agent/team 正常
- [ ] CronJob 创建（agent 模式）正常
- [ ] CronJob 创建（team 模式）正常
- [ ] CronJob 执行正常
- [ ] 删除 agent 级联清除 project default target 正常
- [ ] 删除 team 级联清除 project default target 正常
- [ ] 克隆项目时 target 正确 remap
- [ ] Dashboard 相关查询正常
- [ ] Sub-agent delegation 正常
- [ ] ChatSidebar 显示 team/agent 名称正常

---

## 三、风险评估

### 3.1 上次 revert 的教训

**commit 22e2885**（"claude implement team agent fix like a shit."）的全面重构被 **commit e4cbe58** 立即 revert。分析 stat 可知：
- 涉及 **60 个文件**，**+2286 / -487** 行改动
- 改动范围覆盖 shared types、server routes/storage/agent、UI pages/store/services
- 提交信息本身暗示质量不佳

**失败原因推测**：
1. **一次性大范围改动**，缺乏分步验证
2. **可能未通过 lint/test**就提交
3. **改动和回归测试的比例不对**（改了很多代码但测试覆盖不充分）

### 3.2 这次如何避免

| 风险 | 缓解措施 |
|------|----------|
| 改动范围过大导致遗漏 | 本文档逐文件列出所有影响点，实现时逐条对照 |
| 类型改造引发连锁编译错误 | 从 shared types 开始改，自底向上，每一步 `pnpm lint` |
| DB 迁移数据丢失 | 迁移脚本先写测试，验证旧数据转换正确 |
| JSON 文件格式不兼容 | `normalize()` 保留旧格式读取能力，写入时用新格式 |
| 功能回归 | 改完后逐条过 AC-5.3 功能点 |
| 互斥逻辑残留 | 全局 grep 验证旧字段已清除（AC-3.2） |

### 3.3 关键决策点（需 Design 阶段确认）

1. **字段命名**：`targetType` + `targetId` 还是嵌套 `target: { type, id }`？
   - 需考虑 DB schema（SQLite 不支持嵌套）、JSON 文件、TypeScript 类型的统一
2. **`team-select.ts` 的去留**：新 target 抽象下是否还需要 encode/decode？
3. **`CronJobRun.agentId` 是否保持不变**：这是运行时记录的实际执行 agent，不是 target
4. **Dashboard SQL 查询中 `agent_id` 列**：conversations 表改造后 SQL 需同步更新
5. **`chat-instances.ts` 中的 `agentId`**：Chat transport body 中传 `agentId`，server 端需要知道实际 agent 来查找 agent config

---

## 四、实现顺序建议

建议按以下顺序实现，每步都可独立验证：

1. **shared types + utils** — 定义新类型、`resolveAgentId()`、导出
2. **shared services/interfaces** — 更新接口签名
3. **server DB migration** — conversations 表列变更
4. **server storage** — conversations.ts、projects.ts、cronjobs.ts、clone-project.ts
5. **server routes** — chat.ts、conversations.ts、agents.ts、teams.ts
6. **server scheduler** — executor.ts
7. **server agent** — sub-agent.ts
8. **UI store** — useAppStore.ts
9. **UI services** — http/services.ts、mock/services.ts、mock/data.ts
10. **UI pages** — ChatPage、ChatWindow、ChatSidebar、ChatEmptyState、CronJobFormModal、CronJobsPage、ProjectSettingsPage
11. **UI lib** — chat-instances.ts、team-select.ts（评估是否删除）
12. **测试更新** — 所有 *.test.* 文件
13. **死代码清理** — 全局 grep 验证
14. **最终验证** — `pnpm lint && pnpm test && pnpm test:build`
