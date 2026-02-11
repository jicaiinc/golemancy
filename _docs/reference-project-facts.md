# 参考项目事实报告

> 所有内容均来自源码阅读，不含推测。

---

## 一、对话是怎么开始的？

### Claude Code

- 用户在终端运行 `claude`，**直接开始对话**
- **没有**"先选 Agent 再开对话"的步骤
- 可选用 `--agent` 参数指定特定 agent 的 system prompt 启动
- 对话可以用 `--continue`（继续上次）或 `--resume`（选择历史）恢复

### Moltbot

- 用户从任意渠道（WhatsApp/Telegram/Discord/Web 等）发一条消息
- 系统自动计算 Session Key：`agent:<agentId>:<channel>:<chatType>:<peerId>`
- 如果这个 key 对应的 session 不存在，自动创建新 session
- **用户不需要手动选择 Agent**——通过 Bindings 配置自动路由

**共同点：用户直接开始说话，不需要先选 Agent。**

---

## 二、消息由谁来处理？

### Claude Code

- **单一主 Agent**（Claude 模型本身）处理所有消息
- **不存在"路由到不同 Agent"的机制**——主 Claude 模型直接处理
- 需要其他能力时，Claude **自主决定** spawn subagent（通过 Task 工具）
- 决策依据：Agent 定义中的 `description` 字段（含 `<example>` 块）
- 用户也可以**用自然语言请求**（如 "Launch code-explorer to trace how auth works"），但不是 @mention
- Agent 定义文件中的 description 是最关键的字段——Claude 据此判断何时该用哪个 agent

**关键代码引用**（`plugins/CLAUDE.md` 第 83-84 行）：
```
The `description` field should include `<example>` blocks to help Claude Code understand when to invoke the agent.
```

### Moltbot

- 通过 **Bindings 优先级匹配** 路由到 Agent（`src/routing/resolve-route.ts`）
- 匹配优先级：peer > guild > team > account > channel > default
- 默认 Agent ID 是 `"main"`
- **路由是自动的，用户不参与决定**

**关键代码**（`resolve-route.ts` 的 `resolveAgentRoute()`）：
```typescript
// 优先级：peer 精确匹配 > guild 匹配 > team 匹配 > account 匹配 > channel 通配 > 默认
```

**共同点：消息路由是自动的，用户不需要手动 @mention。Claude Code 是 AI 自主决策，Moltbot 是配置规则决策。**

---

## 三、多 Agent 协作怎么发生？

### Claude Code

**Subagent 机制**：
1. 主 Claude 在对话过程中**自主决定**调用 Task 工具 spawn 一个 subagent
2. Subagent 有独立的 context window，执行完后结果返回主对话
3. 主 Claude 读取 subagent 结果并继续工作
4. **Subagent 不能再 spawn subagent**（最多一层）
5. 多个 subagent 可以**并行**运行

**Agent Team 机制（实验性）**：
- 多个独立 Claude Code 实例在 tmux 中运行
- 通过 SendMessage 工具通信
- 共享 Task List（TaskCreate/TaskUpdate/TaskList 工具）
- Team Lead 通过自然语言分配任务，Teammate claim 并执行

### Moltbot

**sessions_spawn 工具**：
1. 主 Agent 的 AI **自主决定**调用 `sessions_spawn` 工具
2. 生成子 Session Key：`agent:<targetAgentId>:subagent:<UUID>`
3. 子 agent 完成后，`subagent-announce.ts` 将结果注入主 agent 的消息流
4. 结果格式：`"A subagent task 'xxx' just completed. Findings: <reply>"`
5. **同样禁止 subagent 再 spawn subagent**
6. 可以跨 Agent spawn（需配置 `subagents.allowAgents`）

**关键代码**（`sessions-spawn-tool.ts` 第 168 行）：
```typescript
const childSessionKey = `agent:${targetAgentId}:subagent:${crypto.randomUUID()}`;
```

**共同点：多 Agent 协作都是主 Agent 的 AI 自主决定的，不是用户手动触发。Subagent 有独立上下文，结果回传给主 Agent。**

---

## 四、Task / 任务管理

### Claude Code

有**两个不同的 Task 概念**：

1. **Task 工具**（启动 subagent）：
   - `Task` — 启动 subagent
   - `TaskOutput` — 读取 subagent 输出
   - `TaskStop` — 停止 subagent

2. **Task 管理系统**（todo/看板）：
   - `TaskCreate` / `TaskUpdate` / `TaskList` / `TaskGet` — 结构化任务管理
   - 有依赖追踪（dependency tracking）
   - `/tasks` 命令查看任务
   - 有 UI 显示（task list 在终端中渲染）
   - Agent Team 中 Teammate 可以 claim 和 complete tasks

**CHANGELOG 第 213 行**：
```
Added new task management system, including new capabilities like dependency tracking
```

### Moltbot

- **没有** Task 实体
- `sessions_spawn` 的 `task` 参数只是一个字符串描述
- **没有** Board / To-do / Kanban
- **有** Cron 系统（定时任务）：支持 at/every/cron 三种 schedule

**共同点：Claude Code 有显式的 Task 管理系统（含依赖追踪），Moltbot 没有。两者都没有独立的"用户看板"。**

---

## 五、Artifact / 产出物

### Claude Code

- **没有** Artifact 概念
- 文件通过 Write/Edit 工具直接写入文件系统
- 产出就是磁盘上的文件

### Moltbot

- **没有** Artifact 概念
- Agent 产出作为消息回复存储在 session transcript (JSONL) 中
- 文件操作通过 read/write/edit 工具直接写入文件系统

**共同点：两个项目都没有 Artifact 抽象层。产出就是文件。**

---

## 六、Memory

### Claude Code

- **CLAUDE.md 层级**：全局 → 项目 → 子目录，session 启动时自动加载
- **Auto Memory**：Claude 自动记录和回忆（闭源实现）
- **Agent Memory**：agent frontmatter 中 `memory: user | project | local`，agent 级别的持久化记忆
- `/memory` 命令可以编辑 memory 文件
- Memory **独立于 session**，是项目级持久化配置

### Moltbot

- **向量搜索索引**（SQLite + sqlite-vec）
- 数据来源：`MEMORY.md` + `memory/*.md` 文件
- **Agent 通过 `write` 工具写入 memory 文件**，系统自动索引
- Agent 通过 `memory_search`（语义搜索）和 `memory_get`（读取片段）读取
- System prompt 强制要求：
  ```
  "Before answering anything about prior work, decisions, dates, people, preferences, or todos:
   run memory_search on MEMORY.md + memory/*.md"
  ```
- Memory 按 agentId 隔离（每个 agent 有自己的 workspace 目录）
- 同步时机：session start / 搜索前 / 文件变化 / 定时

**差异：Claude Code 的 Memory 是项目级共享的；Moltbot 的 Memory 是 Agent 级别隔离的（每个 agent 有独立 workspace）。**

---

## 七、Skill 加载机制

### Claude Code

- Skill 是目录格式：`SKILL.md` + `scripts/` + `references/` + `assets/`
- 三级加载（Progressive Disclosure）：
  1. 元数据（name + description）— 所有 Skill 启动时加载
  2. SKILL.md body — Skill 被触发时加载
  3. scripts/references/assets — 按需加载
- System prompt 中列出所有 Skill 的 name + description
- **Claude 自动选择最匹配的 Skill 并读取其 SKILL.md**

### Moltbot

- Skill 从 4 个来源按优先级加载：extra < bundled < managed < workspace
- 使用 `@mariozechner/pi-coding-agent` 包的 `loadSkillsFromDir()` 和 `formatSkillsForPrompt()`
- System prompt 注入 `<available_skills>` XML 块
- Agent 在回复前扫描 skill descriptions，选择最匹配的 skill 并读取
- Skill 可以设置 `disableModelInvocation: true`（不出现在 prompt 中）或 `userInvocable: false`（不注册为用户命令）
- Session 缓存 `skillsSnapshot`（避免每次重新加载）

**关键代码**（`system-prompt.ts` 第 16-38 行）：
```typescript
"Before replying: scan <available_skills> <description> entries."
"If exactly one skill clearly applies: read its SKILL.md at <location>, then follow it."
"If multiple could apply: choose the most specific one, then read/follow it."
"If none clearly apply: do not read any SKILL.md."
```

**共同点：Skill 都是通过 system prompt 注入 description 列表，AI 自主选择匹配的 Skill 并读取详细内容。不是用户手动选择。**

---

## 八、关键模式总结

| 模式 | Claude Code | Moltbot |
|------|-------------|---------|
| 对话入口 | 直接开始，不选 Agent | 直接发消息，自动路由 |
| 消息路由 | 单一 Agent + AI 自主 spawn subagent | Bindings 配置自动路由 |
| Agent 激活 | AI 根据 description 自主决策 | Bindings 规则 + AI 自主 spawn |
| 多 Agent 协作 | AI 自主 spawn，结果回传 | AI 自主 spawn，结果注入消息流 |
| Task 管理 | 有（TaskCreate/Update/List，含依赖） | 无 |
| Artifact | 无（文件就是文件） | 无（文件就是文件） |
| Memory | 项目级共享 | Agent 级隔离 |
| Skill 选择 | AI 自主选择 | AI 自主选择 |
| 用户 @mention | 有（v1.0.135 加入自定义 agent 的 @mention 调用） | 不支持 |

**最核心的事实：Agent 的激活和协作主要是 AI 自主决策的。Claude Code 后来加入了 @mention 调用自定义 agent 的能力（CHANGELOG v1.0.135），但消息路由仍然不依赖 @mention。**
