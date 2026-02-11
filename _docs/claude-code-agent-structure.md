# Claude Code Agent 管理结构

> 数据来源：claude-code 公开仓库 CHANGELOG.md + plugins/ + 当前运行实例的系统提示词直接验证。
> 标注 [已验证] = 在当前 session 的系统提示词/工具列表中可直接观察到。
> 标注 [CHANGELOG] = 来自 CHANGELOG.md 版本记录。
> 标注 [插件源码] = 来自 plugins/ 目录下的文件。

---

## 一、Agent 层级结构

```
Claude Code (程序)
│
├── Main Agent [已验证]
│   │  唯一的顶层 Agent，接收用户所有输入
│   │  可通过 --agent 指定自定义 agent 定义覆盖默认行为 [CHANGELOG v2.0.59]
│   │
│   ├── 内置 Tools [已验证]
│   │   ├── 文件操作: Read, Write, Edit, Glob, Grep, NotebookEdit
│   │   ├── 执行: Bash
│   │   ├── 网络: WebFetch, WebSearch
│   │   ├── 交互: AskUserQuestion
│   │   ├── Agent 管理: Task, TaskOutput, TaskStop
│   │   ├── 计划: EnterPlanMode, ExitPlanMode
│   │   ├── Skill 调用: Skill
│   │   ├── 任务管理: TaskCreate, TaskUpdate, TaskList, TaskGet
│   │   └── 团队: TeamCreate, TeamDelete, SendMessage
│   │
│   ├── 内置 Subagents（通过 Task 工具 spawn）[已验证]
│   │   ├── Explore [已验证]
│   │   │   模型: Haiku（省 token）[CHANGELOG v2.0.17]
│   │   │   用途: 代码库搜索、文件探索
│   │   │   工具: 只读（Read, Grep, Glob 等，无 Edit/Write/Bash）
│   │   │
│   │   ├── Plan [已验证]
│   │   │   用途: 设计实现方案、架构规划
│   │   │   工具: 只读（无 Edit/Write）[CHANGELOG v2.0.28]
│   │   │
│   │   ├── general-purpose [已验证]
│   │   │   用途: 通用任务执行
│   │   │   工具: 全部工具（包括 Edit, Write, Bash）
│   │   │
│   │   ├── Bash [已验证]
│   │   │   用途: 命令执行专家
│   │   │   工具: 仅 Bash
│   │   │
│   │   ├── claude-code-guide [已验证]
│   │   │   用途: 回答关于 Claude Code 本身的使用问题
│   │   │   工具: Glob, Grep, Read, WebFetch, WebSearch
│   │   │
│   │   └── statusline-setup [已验证]
│   │       用途: 配置状态栏
│   │       工具: Read, Edit
│   │
│   ├── 自定义 Subagents（Plugin/用户定义）[插件源码]
│   │   │  .md 文件 + YAML frontmatter
│   │   │  通过 Task 工具 spawn，与内置 subagent 走同一条路
│   │   │
│   │   │  加载位置（优先级从低到高）：
│   │   │  ├── 插件: plugin-name/agents/*.md
│   │   │  ├── 项目: .claude/agents/*.md
│   │   │  └── 用户: ~/.claude/agents/*.md
│   │   │
│   │   │  Frontmatter 字段：
│   │   │  ├── name: 标识符（必需）
│   │   │  ├── description: 触发条件 + <example> 块（必需）
│   │   │  ├── model: inherit | sonnet | opus | haiku
│   │   │  ├── tools: ["Read", "Grep", ...] 或省略=全部
│   │   │  ├── disallowedTools: 显式禁止的工具
│   │   │  ├── permissionMode: 权限模式
│   │   │  ├── memory: user | project | local
│   │   │  ├── hooks: PreToolUse, PostToolUse, Stop
│   │   │  ├── skills: 自动加载的 skill 列表
│   │   │  └── color: UI 显示颜色
│   │   │
│   │   └── 示例（来自 plugins/）：
│   │       ├── code-explorer — 只读，用 Haiku [feature-dev 插件]
│   │       ├── code-architect — 只读，架构分析 [feature-dev 插件]
│   │       ├── code-reviewer — 只读，代码审查 [feature-dev 插件]
│   │       ├── conversation-analyzer — 仅 Read+Grep [hookify 插件]
│   │       └── 6 个 PR review agents [pr-review-toolkit 插件]
│   │
│   ├── Skills [已验证 Skill 工具存在]
│   │   │  纯 Markdown 知识包，注入到系统提示词
│   │   │  NOT 工具，NOT 代码执行
│   │   │
│   │   │  目录结构：
│   │   │  skill-name/
│   │   │  ├── SKILL.md          # 核心文档（必需）
│   │   │  ├── references/       # 详细参考（按需加载）
│   │   │  ├── examples/         # 示例
│   │   │  ├── scripts/          # 脚本
│   │   │  └── assets/           # 资源文件
│   │   │
│   │   │  Frontmatter 字段：
│   │   │  ├── name（必需）
│   │   │  ├── description（必需）
│   │   │  ├── version
│   │   │  ├── context: fork — 在子 agent 中执行
│   │   │  ├── agent — 指定执行用的 agent 类型
│   │   │  ├── user-invocable: false — 不出现在斜杠命令菜单
│   │   │  ├── allowed-tools — 限制 skill 执行时可用的工具
│   │   │  └── hooks
│   │   │
│   │   │  三级渐进加载：
│   │   │  L1: name + description → 始终在 system prompt 中（~100词）
│   │   │  L2: SKILL.md body → 触发时加载（<5k词）
│   │   │  L3: references/examples/scripts → 按需读取
│   │   │
│   │   │  加载位置：
│   │   │  ├── 插件: plugin-name/skills/skill-name/SKILL.md
│   │   │  ├── 项目: .claude/skills/skill-name/SKILL.md
│   │   │  └── 用户: ~/.claude/skills/skill-name/SKILL.md
│   │   │
│   │   │  Token 预算：上下文窗口的 2% [CHANGELOG v2.1.32]
│   │   │
│   │   └── 调用方式：
│   │       ├── AI 自主选择 — 根据 description 匹配当前任务
│   │       ├── 用户斜杠命令 — /skill-name
│   │       └── Skill 工具 — 程序化调用
│   │
│   ├── MCP Servers [已验证 mcp__context7, mcp__ide 工具存在]
│   │   │  外部工具扩展协议
│   │   │
│   │   │  传输方式：
│   │   │  ├── stdio — 本地进程
│   │   │  ├── SSE — HTTP Server-Sent Events
│   │   │  ├── HTTP — REST
│   │   │  └── ws — WebSocket
│   │   │
│   │   │  配置位置：
│   │   │  ├── 项目: .mcp.json
│   │   │  ├── 插件: plugin-name/.mcp.json 或 plugin.json 内联
│   │   │  └── 用户级设置
│   │   │
│   │   │  工具命名: mcp__<server-name>__<tool-name>
│   │   │
│   │   │  自动模式 [CHANGELOG v2.1.7]：
│   │   │  当 MCP 工具描述超过上下文 10% 时，
│   │   │  自动切换为 MCPSearch 按需发现（不预加载）
│   │   │
│   │   └── 当前实例的 MCP servers [已验证]：
│   │       ├── context7 — 库文档查询（resolve-library-id, query-docs）
│   │       └── ide — IDE 诊断（getDiagnostics）
│   │
│   └── Hooks [CHANGELOG v1.0.38]
│       │  事件驱动的 Shell 命令
│       │  NOT AI 工具，是确定性脚本执行
│       │
│       │  事件类型：
│       │  ├── PreToolUse — 工具调用前
│       │  ├── PostToolUse — 工具调用后
│       │  ├── Stop — agent 停止时
│       │  ├── SubagentStart — subagent 启动 [v2.0.43]
│       │  ├── SubagentStop — subagent 停止
│       │  ├── SessionStart — session 开始
│       │  ├── SessionEnd — session 结束
│       │  ├── UserPromptSubmit — 用户提交消息
│       │  ├── PreCompact — 压缩前
│       │  ├── Notification — 通知
│       │  ├── PermissionRequest — 权限请求 [v2.0.45]
│       │  ├── Setup — 初始化 [v2.1.10]
│       │  ├── TeammateIdle — 队友空闲 [v2.1.33]
│       │  └── TaskCompleted — 任务完成 [v2.1.33]
│       │
│       └── Hook 类型：
│           ├── command — 执行脚本/二进制（确定性）
│           └── prompt — LLM 决策（灵活）
│
├── Agent Team（实验性）[CHANGELOG v2.1.32]
│   │  需要 CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
│   │  多个独立 Claude Code 实例在 tmux 中运行
│   │
│   ├── Team Lead（协调者）
│   │   ├── TeamCreate — 创建团队 + 任务列表
│   │   ├── SendMessage — 给队友发消息 / 广播 / 关闭请求
│   │   ├── TaskCreate/TaskUpdate/TaskList/TaskGet — 任务管理
│   │   └── 不直接写代码（最佳实践）
│   │
│   ├── Teammate 1..N（执行者）
│   │   ├── 独立 Claude Code 实例
│   │   ├── 通过 SendMessage 与 Lead 通信
│   │   ├── 从 TaskList claim 任务
│   │   ├── 有完整工具访问权限
│   │   └── 每轮结束自动进入 idle 状态
│   │
│   ├── 共享状态
│   │   ├── ~/.claude/teams/{team-name}/config.json — 成员列表
│   │   └── ~/.claude/tasks/{team-name}/ — 共享任务列表
│   │
│   └── 任务依赖
│       TaskUpdate 支持 addBlocks / addBlockedBy
│
└── Background Agents [CHANGELOG v2.0.60]
    用 Ctrl+B 把当前 agent 放到后台继续运行
    用户可以同时做其他事情
```

---

## 二、关键实体关系图

```
┌─────────────────────────────────────────────────────────────────┐
│                        Session (会话)                            │
│  = 一次完整的对话，从开始到结束                                     │
│  - 可用 --continue 继续上次                                       │
│  - 可用 --resume 恢复指定 session                                 │
│  - 可用 /rename 命名                                             │
│  - 可关联到 PR (--from-pr)                                       │
│  - 自动压缩实现无限上下文                                          │
│  - 可用 --fork-session 分叉                                      │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                    Main Agent (主 Agent)                    │  │
│  │  每个 Session 有且只有一个 Main Agent                        │  │
│  │  可通过 --agent 指定自定义 agent 定义                        │  │
│  │                                                            │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │  │
│  │  │  Subagent A  │  │  Subagent B  │  │  Subagent C  │     │  │
│  │  │  (Task 工具   │  │  (Task 工具   │  │  (Task 工具   │     │  │
│  │  │   spawn)     │  │   spawn)     │  │   spawn)     │     │  │
│  │  │              │  │              │  │              │     │  │
│  │  │  独立上下文   │  │  独立上下文   │  │  独立上下文   │     │  │
│  │  │  结果回传     │  │  结果回传     │  │  结果回传     │     │  │
│  │  │  最多一层     │  │  可并行运行   │  │  可后台运行   │     │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘     │  │
│  │         ↑                                                  │  │
│  │         │ AI 自主决定 spawn（基于 agent description）        │  │
│  │         │ 或用户自然语言请求                                 │  │
│  └─────────┴──────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌───────────────────┐  ┌───────────────────┐                   │
│  │   Task List       │  │   Todo List       │                   │
│  │   (新系统 v2.1.16)│  │   (旧系统)         │                   │
│  │                   │  │                   │                   │
│  │   TaskCreate      │  │   TodoWrite       │                   │
│  │   TaskUpdate      │  │                   │                   │
│  │   TaskList        │  │   纯平铺列表       │                   │
│  │   TaskGet         │  │   无依赖追踪       │                   │
│  │                   │  │                   │                   │
│  │   有依赖追踪      │  │                   │                   │
│  │   有 owner 分配   │  │                   │                   │
│  │   有状态流转      │  │                   │                   │
│  │   (pending →      │  │                   │                   │
│  │    in_progress →  │  │                   │                   │
│  │    completed)     │  │                   │                   │
│  └───────────────────┘  └───────────────────┘                   │
│                                                                  │
│  ┌───────────────────┐                                          │
│  │   Memory          │                                          │
│  │                   │                                          │
│  │   MEMORY.md 前 200 行注入 system prompt                      │
│  │   额外 .md 文件按需读取                                      │
│  │   持久化目录: ~/.claude/projects/{hash}/memory/              │
│  │   Agent 可配置 memory scope: user|project|local              │
│  └───────────────────┘                                          │
└──────────────────────────────────────────────────────────────────┘
```

---

## 三、Agent ↔ Skill ↔ MCP ↔ Tool 关系

```
Main Agent
│
├─ 直接拥有 ──→ 内置 Tools（Read, Write, Bash, ...）
│               每个 tool 是一个独立的函数调用
│               主 Agent 默认拥有所有 tools
│
├─ 通过 Skill 工具调用 ──→ Skills
│               Skill ≠ Tool
│               Skill = Markdown 知识注入
│               Skill 本身不是可执行函数
│               Skill 被加载后，其内容进入 system prompt
│               Agent 按照 Skill 指示去调用 Tools
│
│               关系: Agent ←1:N→ Skill
│               一个 Agent 可以有多个 Skill
│               Skill 通过 description 匹配被 AI 自动选择
│               也可通过 agent frontmatter 的 skills 字段绑定
│
├─ 通过 MCP 协议连接 ──→ MCP Servers
│               MCP Server 提供额外的 Tools
│               这些 Tools 和内置 Tools 地位相同
│               命名: mcp__<server>__<tool>
│               例如: mcp__context7__query-docs
│
│               关系: Agent ←1:N→ MCP Server ←1:N→ MCP Tool
│
├─ 通过 Task 工具 spawn ──→ Subagents
│               Subagent = 独立的 Claude 实例
│               有自己的 system prompt + 上下文窗口
│               不能再 spawn subagent（最多一层）
│               可并行运行多个
│
│               Subagent 也可以拥有:
│               ├── 受限的 Tools（通过 frontmatter tools 字段）
│               ├── 自己的 Skills（通过 frontmatter skills 字段）
│               └── MCP Tools（继承主 agent 的 MCP 连接）
│
│               关系: Main Agent ←1:N→ Subagent（一层，不可嵌套）
│
└─ 通过 Hooks 配置 ──→ Shell 脚本
                Hooks ≠ Tool（不是 AI 可调用的函数）
                Hooks = 事件驱动的自动化脚本
                在 Tool 调用前后自动触发
                Agent 看到 Hook 的输出（作为 system-reminder）
```

---

## 四、Session ↔ Agent ↔ Task 关系

```
Session (会话)
│
│  1 Session : 1 Main Agent（固定绑定）
│  Session 创建时确定 Main Agent，不能中途换
│  但 Main Agent 可以 spawn 任意多个 Subagent
│
├── Main Agent
│   │
│   ├── 处理用户所有消息
│   │
│   ├── AI 自主决定 spawn Subagent
│   │   ├── Subagent 执行完返回结果
│   │   └── 结果注入 Main Agent 的上下文
│   │
│   ├── Task List（新系统）
│   │   │  Session 级别的任务列表
│   │   │  Main Agent 和 Subagent 共享
│   │   ├── Task 1 (status: completed)
│   │   ├── Task 2 (status: in_progress, owner: main)
│   │   ├── Task 3 (status: pending, blockedBy: [2])
│   │   └── Task 4 (status: pending)
│   │
│   └── Memory
│       Session 跨越的持久化知识
│       MEMORY.md → 注入 system prompt
│       不属于任何 Task，属于 Project 级别
│
│
│  特殊情况: Agent Team（实验性）
│
├── Team Session
│   │
│   │  1 Team : 1 共享 Task List
│   │  N 个独立 Session（每个 Teammate 一个）
│   │
│   ├── Team Lead (Session 1)
│   │   ├── TaskCreate — 创建任务
│   │   ├── SendMessage — 分配任务给 Teammate
│   │   └── 监控进度
│   │
│   ├── Teammate A (Session 2)
│   │   ├── TaskList — 查看可认领的任务
│   │   ├── TaskUpdate — 认领 + 完成任务
│   │   └── SendMessage — 汇报结果
│   │
│   └── Teammate B (Session 3)
│       └── 同上
│
│
│  关键约束（已验证的事实）：
│
│  ✓ Session 1:1 Main Agent（不可更换）
│  ✓ Main Agent 1:N Subagent（AI 自主决定）
│  ✓ Subagent 不可再 spawn Subagent（最多一层）
│  ✓ 多个 Subagent 可并行运行
│  ✓ Task List 属于 Session（普通模式）或 Team（团队模式）
│  ✓ Skill 通过 AI 自动匹配加载，不需要用户 @mention
│  ✓ MCP Tools 和内置 Tools 地位平等
│  ✓ Hooks 是确定性脚本，不是 AI 工具
│  ✗ 没有 Artifact 概念（产出 = 文件系统中的文件）
│  ✗ 没有 @mention 路由（Agent 激活完全由 AI 决策）
│  ✗ 用户不需要手动选择 Agent 开始对话
```

---

## 五、对比表：实体 × 可见性

| 实体 | 在哪里定义 | 谁能访问 | 生命周期 |
|------|-----------|---------|---------|
| Main Agent | --agent 参数 或 默认 | Session 级 | = Session 生命周期 |
| Subagent | Task 工具 spawn | Main Agent 的一次调用 | 执行完即销毁 |
| Teammate | TeamCreate + Task spawn | Team 级，独立 Session | Team 存续期间 |
| Skill | .claude/skills/ 或 plugins/ | 全局可用，AI 按需加载 | 持久化在文件系统 |
| MCP Server | .mcp.json 或 settings | Session 级连接 | Session 存续期间 |
| MCP Tool | MCP Server 暴露 | 与内置 Tool 平等 | Server 连接期间 |
| Hook | settings.json 或 frontmatter | 事件驱动自动执行 | 持久化配置 |
| Task (任务) | TaskCreate 或 TodoWrite | Session 或 Team 共享 | 显式管理 |
| Memory | ~/.claude/projects/.../memory/ | 跨 Session 持久化 | Project 级别 |
| Session | 启动时自动创建 | 单用户 | 可暂停/恢复/分叉 |
