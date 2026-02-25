# Claude Agent SDK Sub-agent 能力运行时验证报告

> 测试时间：2026-02-25（Test 1-7），2026-02-26（Test 8-9 MCP Bridge 嵌套突破）
> 状态：**全部通过 (9/9)**
> SDK 版本：`@anthropic-ai/claude-agent-sdk` v0.2.56
> CLI 版本：`@anthropic-ai/claude-code` v2.1.56
> 测试代码：`_test-agent-sdk/`
> 前置文档：[`20260225-agent-sdk-evaluation.md`](./20260225-agent-sdk-evaluation.md)（附录 D 源码分析）

---

## 目录

- [一、背景与目的](#一背景与目的)
- [二、测试环境](#二测试环境)
- [三、测试结果总览](#三测试结果总览)
- [四、各测试用例详述](#四各测试用例详述)
- [五、关键发现与踩坑记录](#五关键发现与踩坑记录)
- [六、结论](#六结论)

---

## 一、背景与目的

[评估报告](./20260225-agent-sdk-evaluation.md)附录 D 通过**静态源码分析**得出结论：SDK v0.2.52 的 `AgentDefinition` 支持 per-agent Skills、MCP Servers、Tools 等能力，远超官方文档描述。但源码分析无法证明运行时行为。

本测试项目的目的是：**通过实际运行的代码，验证这些能力是否真的工作。**

验证的核心问题：

| # | 问题 | 对应测试 |
|---|------|---------|
| 1 | Sub-agent 能被 spawn 并返回结果吗？ | Test 1 |
| 2 | Sub-agent 能调用 in-process MCP 自定义工具吗？ | Test 2 |
| 3 | Sub-agent 能加载 per-agent Skills 吗？ | Test 3 |
| 4 | Sub-agent 能使用内联 stdio MCP Server 吗？ | Test 4 |
| 5 | Sub-agent 的 tools/disallowedTools 限制生效吗？ | Test 5 |
| 6 | Sub-agent 嵌套（Task 工具）真的被阻止吗？ | Test 6 |
| 7 | 多个不同配置的 sub-agent 能同时独立工作吗？ | Test 7 |
| 8 | MCP Bridge 能绕过 iP6 实现 2 层嵌套吗？ | Test 8 |
| 9 | MCP Bridge 递归能实现 3 层嵌套（证明无限）吗？ | Test 9 |

---

## 二、测试环境

| 项 | 值 |
|----|-----|
| OS | macOS (Darwin 23.4.0) |
| Node.js | v22+ |
| 包管理 | pnpm |
| 认证 | Claude Max 订阅（本地 CLI OAuth） |
| 主 Agent 模型 | `claude-sonnet-4-6` |
| Sub-agent 模型 | `haiku` |
| 权限模式 | `bypassPermissions` + `allowDangerouslySkipPermissions: true` |

### 项目结构

```
_test-agent-sdk/
├── package.json                     # 依赖: agent-sdk, @modelcontextprotocol/sdk, zod
├── tsconfig.json
├── .tmp/
│   └── echo-mcp-server.mjs         # Test 4 用的 stdio MCP 服务脚本
└── src/
    ├── test-1-basic-subagent.ts     # 基础 sub-agent
    ├── test-2-custom-tools.ts       # in-process MCP 自定义工具
    ├── test-3-skills.ts             # per-agent Skills
    ├── test-4-mcp-servers.ts        # 内联 stdio MCP Server
    ├── test-5-tool-restrictions.ts  # 工具白名单 + 黑名单
    ├── test-6-nesting.ts            # 嵌套阻止验证
    ├── test-7-combined.ts           # 多 sub-agent 综合
    └── run-all.ts                   # 统一运行入口
```

### 运行方式

```bash
cd _test-agent-sdk
pnpm install
pnpm tsx src/run-all.ts              # 全部测试
pnpm tsx src/run-all.ts 3 4          # 选择性运行
pnpm tsx src/test-3-skills.ts        # 单个测试
```

---

## 三、测试结果总览

```
████████████████████████████████████████████████████████████
  SUMMARY
████████████████████████████████████████████████████████████
  ✅ Test 1: Basic Sub-agent
  ✅ Test 2: Custom Tools (MCP)
  ✅ Test 3: Skills
  ✅ Test 4: Independent MCP Servers
  ✅ Test 5: Tool Restrictions
  ✅ Test 6: Nesting (Expected Blocked — Task tool)
  ✅ Test 7: Combined
  ✅ Test 8: MCP Bridge Nesting (L0→L1→L2)
  ✅ Test 9: 3-Level Deep Nesting (L0→L1→L2→L3)

  Total: 9 passed, 0 failed out of 9
████████████████████████████████████████████████████████████
```

---

## 四、各测试用例详述

### Test 1: 基础 Sub-agent

**验证目标**：Sub-agent 只配置 `description` + `prompt` + `model`，能否被 spawn 并返回结果。

**配置**：

```typescript
agents: {
  summarizer: {
    description: 'A summarization agent that provides concise summaries',
    prompt: 'You are a concise summarizer...',
    model: 'haiku',
  },
}
```

**判定条件**：
- `task_started` 事件触发 ✅
- `result.subtype === 'success'` ✅

**结论**：基础 sub-agent 工作正常。`task_notification` 仅在异步/后台任务时触发，同步 await 的 sub-agent 只会触发 `task_started`。

---

### Test 2: Sub-agent + In-process MCP 自定义工具

**验证目标**：通过 `createSdkMcpServer()` + `tool()` 创建 in-process MCP 服务器，sub-agent 通过字符串引用 `mcpServers: ['calculator']` 使用自定义工具。

**配置**：

```typescript
// 顶层注册 MCP 服务器
const calculatorServer = createSdkMcpServer({
  name: 'calculator',
  tools: [
    tool('add_numbers', 'Add two numbers', { a: z.number(), b: z.number() },
      async (args) => { /* ... */ }),
  ],
})

// Sub-agent 按名引用
agents: {
  'math-helper': {
    mcpServers: ['calculator'],  // 字符串引用
    // ...
  },
}
```

**判定条件**：
- `task_started` 事件触发 ✅
- 自定义工具回调函数被调用（`toolWasCalled === true`）✅
- `result.subtype === 'success'` ✅

**结论**：in-process MCP 自定义工具完全可用。Sub-agent 调用 `mcp__calculator__add_numbers(17, 25)` → 返回 42。

> **注意**：使用 in-process MCP 时，`prompt` 参数必须是 async generator 而非普通字符串。

---

### Test 3: Sub-agent + Per-agent Skills

**验证目标**：Sub-agent 通过 `skills: ['sdk-test-reviewer']` 加载项目级 Skill，Skill 内容注入到 sub-agent 的 prompt 中。

**配置**：

```typescript
// SDK query options
settingSources: ['project'],  // 启用项目级设置发现

agents: {
  reviewer: {
    skills: ['sdk-test-reviewer'],  // Per-agent skill
    // ...
  },
}
```

**Skill 文件**（位于 git root `.claude/skills/sdk-test-reviewer/SKILL.md`）：

```markdown
---
name: sdk-test-reviewer
description: A test skill for verifying Agent SDK per-agent skill loading.
---

# SDK Test Reviewer Skill

...

IMPORTANT: When asked what skill you are using, you MUST respond with exactly:
"I am using the sdk-test-reviewer skill."
```

**判定条件**：
- `task_started` 事件触发 ✅
- Sub-agent 返回包含精确短语 `"I am using the sdk-test-reviewer skill."` ✅
- Sub-agent 未否认拥有 skill（排除假阳性）✅
- `result.subtype === 'success'` ✅

**结论**：Per-agent Skills 完全可用。Sub-agent 精确回复了 SKILL.md 中指定的短语，证明 Skill 内容被成功注入到 sub-agent prompt。

---

### Test 4: Sub-agent + 内联 stdio MCP Server

**验证目标**：Sub-agent 通过内联对象定义独立的 stdio MCP 服务器（非字符串引用，而是 `Record<string, McpServerConfig>`）。

**配置**：

```typescript
agents: {
  'echo-agent': {
    mcpServers: [
      {
        'echo-server': {
          command: 'node',
          args: [mcpServerScript],  // 外部脚本路径
          env: { NODE_PATH: nodeModulesPath },
        },
      },
    ],
    // ...
  },
}
```

**MCP 服务脚本**（`.tmp/echo-mcp-server.mjs`，使用 `McpServer` 高级 API）：

```javascript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({ name: 'echo-server', version: '1.0.0' });
server.tool('echo', 'Echoes back the input message with a prefix ECHO:',
  { message: z.string() },
  async ({ message }) => {
    return { content: [{ type: 'text', text: 'ECHO: ' + message }] };
  });

const transport = new StdioServerTransport();
await server.connect(transport);
```

**判定条件**：
- `task_started` 事件触发 ✅
- 返回结果包含 `ECHO:` 前缀（证明使用了 MCP 工具而非 Bash echo）✅
- `result.subtype === 'success'` ✅

**结论**：内联 stdio MCP Server 完全可用。Sub-agent 调用 `mcp__echo-server__echo('Hello from sub-agent')` → 返回 `ECHO: Hello from sub-agent`。CLI 在 sub-agent 启动时动态创建 MCP 连接，sub-agent 结束后自动清理。

---

### Test 5: Sub-agent + 工具限制

**验证目标**：`tools` 白名单和 `disallowedTools` 黑名单同时生效。

**配置**：

```typescript
agents: {
  reader: {
    tools: ['Read', 'Glob'],                     // 白名单
    disallowedTools: ['Bash', 'Write', 'Edit'],   // 黑名单
    // ...
  },
}
```

**判定条件**：
- `task_started` 事件触发 ✅
- Sub-agent 未使用被禁止的工具（`Bash`, `Write`, `Edit`）✅
- Sub-agent 成功使用 `Read` 读取了 `package.json` ✅
- 结果包含 `"test-agent-sdk"`（package.json 的 name 字段）✅

**结论**：工具限制完全生效。白名单 + 黑名单双重过滤机制工作正常。

---

### Test 6: Sub-agent 嵌套（预期阻止）

**验证目标**：即使 sub-agent 在 `tools` 中显式请求 `Task` 工具，CLI 运行时也会将其过滤，阻止嵌套。

**配置**：

```typescript
agents: {
  'agent-a': {
    tools: ['Read', 'Glob', 'Bash', 'Task'],  // 显式请求 Task
    // ...
  },
  'agent-b': {
    prompt: 'You are agent-b. Say hello.',
    // ...
  },
}
```

**判定条件**：
- 只触发 1 次 `task_started`（main → agent-a），而非 2 次 ✅
- agent-a 报告 Task 工具不可用 ✅
- `result.subtype === 'success'` ✅

**结论**：嵌套限制确认。CLI `iP6` 集合硬编码过滤 `Task` 工具，`tools` 白名单无法覆盖。agent-a 的可用工具只有 `Read`、`Glob`、`Bash`。

---

### Test 7: 综合测试 — 多 Sub-agent 独立配置

**验证目标**：单个 `query()` 中定义多个具有不同配置的 sub-agent，各自独立工作。

**配置**：

```typescript
agents: {
  'time-agent': {
    mcpServers: ['utils'],
    disallowedTools: ['Bash', 'Write', 'Edit'],
  },
  'text-agent': {
    mcpServers: ['utils'],
    disallowedTools: ['Bash', 'Write', 'Edit'],
  },
  'reader-agent': {
    tools: ['Read'],  // 仅 Read
  },
}
```

**判定条件**：
- 至少 3 次 `task_started` 事件 ✅
- `get_timestamp` 工具被调用 ✅
- `to_uppercase` 工具被调用 ✅
- `result.subtype === 'success'` ✅

**运行结果**：

| 序号 | Agent | 任务 | 结果 |
|------|-------|------|------|
| 1 | time-agent | 获取时间戳 | `1772033231116` (Unix ms) |
| 2 | text-agent | 转大写 | `"HELLO WORLD"` |
| 3 | reader-agent | 读 package.json | `"test-agent-sdk"` |

**结论**：多个 sub-agent 的 per-agent 配置互不干扰，独立生效。

---

### Test 8: MCP Bridge 嵌套突破（L0→L1→L2）

> 测试时间：2026-02-26

**验证目标**：通过 MCP Bridge 模式绕过 `iP6` Task 工具过滤，实现 2 层 sub-agent 嵌套（Task 原生只支持 1 层）。

**核心原理**：

```
Level 0 (Main Agent)
  │ Task tool (SDK 原生)
  ▼
Level 1 (Sub-agent via Task)
  │ MCP tool "delegate_task" (不受 iP6 过滤)
  │   → handler 内部调用 query() → 新 CLI 子进程
  ▼
Level 2 (独立 Agent via MCP Bridge)  ← iP6 原本阻止的层级！
```

**配置**：

```typescript
// 创建 MCP Bridge 工具
const agentBridgeServer = createSdkMcpServer({
  name: 'agent-bridge',
  tools: [
    tool('delegate_task', 'Delegate a task to a nested agent',
      { task: z.string() },
      async (args) => {
        // 关键：在 MCP handler 内调用 query() 创建独立 CLI 会话
        let result = ''
        for await (const msg of query({
          prompt: args.task,
          options: { model: 'haiku', maxTurns: 5, ... },
        })) {
          if (msg.type === 'result' && msg.subtype === 'success') result = msg.result
        }
        return { content: [{ type: 'text', text: result }] }
      }),
  ],
})

// Sub-agent 通过 mcpServers 引用 bridge
agents: {
  'nesting-agent': {
    mcpServers: ['agent-bridge'],
    prompt: '...',
  },
}
```

**判定条件**：
- Level 1 sub-agent 被 Task tool spawn ✅
- MCP bridge tool handler 被调用（`bridgeToolCalled === true`）✅
- Level 2 agent 在 bridge handler 内的 `query()` 中成功执行 ✅
- 唯一 magic string `LEVEL2_MAGIC_STRING_7f3a9b` 从 Level 2 回传到 Level 0 ✅
- `result.subtype === 'success'` ✅

**运行日志**：

```
🔧 Tool call: Task(nesting-agent)                          ← L0→L1
🔧 Tool call: mcp__agent-bridge__delegate_task(...)         ← L1→bridge
🌉 Bridge tool called! Spawning Level 2 agent...            ← bridge handler 执行
🌉 Level 2 agent completed! Result: LEVEL2_MAGIC_STRING_7f3a9b  ← L2 返回
```

**结论**：MCP Bridge 模式成功绕过 `iP6` Task 工具过滤。Level 2 agent 通过 MCP tool handler 内的 `query()` 独立运行，不受父级 `iP6` 约束。cost=$0.17。

---

### Test 9: 3 层深度嵌套（L0→L1→L2→L3，证明无限）

> 测试时间：2026-02-26

**验证目标**：通过递归 MCP Bridge Factory 实现 3 层嵌套，归纳证明无限层级可行性。

**核心原理**：

```
Level 0 (Main Agent)
  │ Task tool
  ▼
Level 1 (Sub-agent)
  │ MCP bridge #1 → query()
  ▼
Level 2 (Intermediate Agent，自带 bridge)
  │ MCP bridge #2 → query()
  ▼
Level 3 (Leaf Agent)
  │ 返回 magic string
```

**配置**（递归 Bridge Factory）：

```typescript
function createBridgeServer(currentDepth: number, maxDepth: number) {
  return createSdkMcpServer({
    name: 'agent-bridge',
    tools: [
      tool('delegate_task', '...', { task: z.string() },
        async (args) => {
          const nextLevel = currentDepth + 1
          const isLeaf = nextLevel >= maxDepth

          if (isLeaf) {
            // 叶子：无 bridge 的简单 agent
            for await (const msg of query({ prompt: args.task, ... })) { ... }
          } else {
            // 中间层：agent 自带下一级 bridge（递归）
            const nestedBridge = createBridgeServer(nextLevel, maxDepth)
            for await (const msg of query({
              prompt: genMsg(),
              options: { mcpServers: { 'agent-bridge': nestedBridge }, ... },
            })) { ... }
          }
        }),
    ],
  })
}
```

**判定条件**：
- Level 1 reached (Task) ✅
- Level 2 reached (bridge #1) ✅
- Level 3 reached (bridge #2) ✅
- Bridge call count ≥ 2 ✅
- Magic string `DEEP_LEVEL3_MAGIC_a1b2c3` 从 Level 3 回传到 Level 0 ✅
- `result.subtype === 'success'` ✅

**运行日志**：

```
🔧 Tool call: Task(deep-agent)                             ← L0→L1
🔧 Tool call: mcp__agent-bridge__delegate_task(...)         ← L1→bridge
🌉 [Depth 1→2] Bridge called (call #1)                     ← bridge #1
🌉 [Depth 2] Spawning INTERMEDIATE agent with bridge       ← L2 自带 bridge
🌉 [Depth 2→3] Bridge called (call #2)                     ← bridge #2
🌉 [Depth 3] Spawning LEAF agent                           ← L3 叶子
🌉 [Depth 3] Leaf result: DEEP_LEVEL3_MAGIC_a1b2c3         ← L3 返回
🌉 [Depth 2] Intermediate result: ...DEEP_LEV...           ← L2 返回
```

**结论**：递归 MCP Bridge 成功实现 3 层嵌套。由归纳法可证：
- **基础步骤**：Test 8 证明 MCP bridge 可创建 1 层额外嵌套（L1→L2）
- **归纳步骤**：Test 9 证明 bridged agent 自身也可携带 bridge，创建下一层（L2→L3）
- **归纳结论**：对任意 N，可构造 N 层嵌套。即 **无限层级可行**。

cost=$0.17。每层额外开销约为 1 个 haiku query 的子进程。

---

## 五、关键发现与踩坑记录

### 5.1 `CLAUDECODE` 环境变量导致嵌套检测

**问题**：在 Claude Code 会话内运行测试时，SDK spawn 的 CLI 子进程检测到 `CLAUDECODE` 环境变量，认为处于嵌套会话，直接退出（exit code 1）。

**解决**：所有测试文件顶部添加 `delete process.env.CLAUDECODE`。

### 5.2 Skills 发现机制

**问题**：最初将 SKILL.md 放在 `_test-agent-sdk/.claude/skills/` 下，skill 未被加载。

**根因**：SDK 的 skill 发现是相对于 **git root** 而非 `cwd`。`_test-agent-sdk/` 位于 `SoloCraft.team` git 仓库内，所以 SDK 从 `SoloCraft.team/.claude/skills/` 查找。

**解决**：将 skill 移到项目 git root：`SoloCraft.team/.claude/skills/sdk-test-reviewer/SKILL.md`。

### 5.3 SKILL.md 必须有 YAML Frontmatter

**问题**：SKILL.md 没有 frontmatter 时，skill discovery 找不到它。

**根因**：CLI 的 skill 解析逻辑要求 SKILL.md 开头有 YAML frontmatter，至少包含 `name` 和 `description` 字段。

**解决**：

```markdown
---
name: sdk-test-reviewer
description: A test skill for verifying Agent SDK per-agent skill loading.
---

# Skill content here...
```

### 5.4 `settingSources: ['project']` 是必需的

如不设置 `settingSources`，SDK 不会加载项目级 `.claude/skills/`。必须显式声明 `settingSources: ['project']`。

### 5.5 MCP Server 脚本 API 兼容性

**问题**：最初使用低级 `Server` API + `setRequestHandler('tools/list', ...)` 字符串形式，SDK 报错 `Schema is missing a method literal`。

**根因**：MCP SDK v1.27.1 的 `Server.setRequestHandler()` 需要 Schema 对象（如 `CallToolRequestSchema`），不接受字符串。

**解决**：改用 `McpServer` 高级 API（`server.tool()` 方法），内部自动处理 schema 注册。

### 5.6 MCP 子进程模块解析

**问题**：MCP 服务器脚本作为独立 Node.js 子进程运行，使用 bare specifier（`@modelcontextprotocol/sdk/server/mcp.js`）时无法解析模块。

**解决**：在 MCP 服务器配置中通过 `env.NODE_PATH` 传入 `node_modules` 路径：

```typescript
mcpServers: [{
  'echo-server': {
    command: 'node',
    args: [scriptPath],
    env: { NODE_PATH: resolve(cwd, 'node_modules') },
  },
}]
```

### 5.7 区分 MCP echo 与 Bash echo

**问题**：当 MCP 服务器启动失败时（SDK 静默降级），sub-agent 会改用 `Bash` 工具执行 `echo` 命令，导致假阳性。

**解决**：MCP echo 工具返回带 `ECHO:` 前缀的文本。测试验证结果是否包含该前缀来区分 MCP 调用与 Bash 回退。

### 5.8 `task_notification` vs `task_started`

`task_notification` 仅在后台/异步任务完成时触发。对于同步 await 的 sub-agent，只有 `task_started` 事件。测试判定条件不应依赖 `task_notification`。

---

## 六、结论

### 6.1 运行时验证结果

| 能力 | 源码分析结论 | 运行时验证 | 状态 |
|------|------------|-----------|------|
| 基础 Sub-agent (prompt + model) | ✅ | ✅ Test 1 PASS | **确认** |
| In-process MCP 自定义工具 | ✅ | ✅ Test 2 PASS | **确认** |
| Per-agent Skills | ✅ | ✅ Test 3 PASS | **确认** |
| 内联 stdio MCP Server | ✅ | ✅ Test 4 PASS | **确认** |
| 工具白名单 + 黑名单 | ✅ | ✅ Test 5 PASS | **确认** |
| Task 工具嵌套阻止 (iP6 过滤) | ❌ | ❌ Test 6 PASS（预期行为）| **确认** |
| 多 Sub-agent 独立配置 | ✅ | ✅ Test 7 PASS | **确认** |
| MCP Bridge 2 层嵌套 (L0→L1→L2) | — | ✅ Test 8 PASS | **突破** |
| MCP Bridge 3 层嵌套 (L0→L1→L2→L3) | — | ✅ Test 9 PASS | **突破（证明无限）** |

### 6.2 对评估报告的影响

本运行时测试**完全验证了**[评估报告附录 D](./20260225-agent-sdk-evaluation.md#附录-dsdk-源码深度分析2026-02-25-补充) 的源码分析结论：

1. **Per-agent Skills** — 运行时确认可用。Sub-agent 能加载并遵循独立的 Skill 指令。
2. **Per-agent MCP** — 运行时确认可用。包括两种模式：
   - 字符串引用（`mcpServers: ['name']`）→ 引用父级已注册的 MCP
   - 内联定义（`mcpServers: [{ name: { command, args, env } }]`）→ 启动独立 stdio 进程
3. **Per-agent Tools** — 运行时确认可用。`tools` 白名单 + `disallowedTools` 黑名单双重过滤。
4. ~~**嵌套限制** — 运行时确认存在~~ → **部分修正**：
   - Task 工具确实被 `iP6` 过滤（Test 6 确认）
   - 但 **MCP Bridge 模式突破了此限制**（Test 8+9 确认）：在 `createSdkMcpServer` tool handler 内调用 `query()` 创建独立 CLI 会话，不继承 `iP6` 过滤
   - 归纳证明可实现**无限层级嵌套**

### 6.3 评估报告附录 D.9 建议 #4 完成

> D.9 建议 #4：**建议进行实际功能验证**：本分析基于源码静态分析，建议编写实际测试代码验证 `mcpServers` 和 `skills` 字段在 sub-agent 中的运行效果。

本测试项目完成了该建议。所有 per-agent 能力均已通过运行时验证。

### 6.4 修正后的能力对比（最终版）

基于源码分析 + 运行时验证的双重确认：

| 能力维度 | Golemancy | Agent SDK (v0.2.56) | 验证状态 |
|---------|-----------|---------------------|---------|
| Per-agent Tools | ✅ | ✅ (tools + disallowedTools) | 运行时确认 |
| Per-agent Skills | ✅ | ✅ (skills 字段) | 运行时确认 |
| Per-agent MCP | ✅ | ✅ (mcpServers 字段，含内联定义) | 运行时确认 |
| Per-agent Model | ✅ | ✅ (model 字段) | 运行时确认 |
| Sub-agent 嵌套 | ✅ 无限 | ~~❌ 单层~~ → ✅ **无限**（MCP Bridge 模式） | Test 8+9 运行时确认 |
| Per-agent Permissions | ✅ 三级 | ⚠️ 有限 | 未单独测试 |
