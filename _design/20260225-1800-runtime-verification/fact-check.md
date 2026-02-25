# 技术事实验证报告

> 验证时间：2026-02-25
> 验证师：Fact Checker
> 验证对象：Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) 三个关键技术能力
> 验证手段：Context7 官方文档查询、WebSearch、项目源码交叉比对

---

## 1. Multimodal / 图片输入支持

### 结论：✅ 支持（仅限 Streaming Input Mode）

### 证据

**官方文档（Context7 + WebSearch 交叉确认）**：

SDK 的 `query()` 函数签名如下：

```typescript
function query({
  prompt,
  options
}: {
  prompt: string | AsyncIterable<SDKUserMessage>;
  options?: Options;
}): Query
```

两种输入模式的能力差异：

| 能力 | String prompt 模式 | Streaming Input 模式 (`AsyncIterable<SDKUserMessage>`) |
|------|-------------------|-------------------------------------------------------|
| 文本 | ✅ | ✅ |
| **图片附件 (base64)** | **❌ 不支持** | **✅ 支持** |
| 多轮对话 | 通过 `resume` | 原生 |
| Hooks 集成 | ❌ | ✅ |
| 中断 | ❌ | ✅ |

官方文档（`streaming-vs-single-mode` 页面）明确给出了带图片的 Streaming Input 示例：

```typescript
async function* generateMessages() {
  yield {
    type: "user" as const,
    message: {
      role: "user" as const,
      content: [
        { type: "text", text: "Review this architecture diagram" },
        {
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: await readFile("diagram.png", "base64")
          }
        }
      ]
    }
  };
}

for await (const message of query({
  prompt: generateMessages(),
  options: { maxTurns: 10 }
})) { ... }
```

图片 content block 格式遵循 Anthropic Messages API 标准：
- `type: "image"`
- `source.type: "base64"`
- `source.media_type`: MIME 类型（`"image/png"`, `"image/jpeg"` 等）
- `source.data`: base64 编码的图片数据

### 当前代码问题

**问题 1 — `chat-claude-code.ts:34-39`**：`extractTextContent()` 只提取 `text` parts，丢弃了图片 parts：

```typescript
function extractTextContent(parts: UIMessage['parts']): string {
  return parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map(p => p.text)
    .join('\n')
}
```

**问题 2 — `handler.ts:161-171`**：`createUserMessageGenerator()` 只创建纯文本 content：

```typescript
async function* createUserMessageGenerator(text: string) {
  yield {
    type: 'user' as const,
    message: {
      role: 'user' as const,
      content: text,  // ← 只有文本，没有图片
    },
    parent_tool_use_id: null,
    session_id: '',
  }
}
```

**问题 3 — `handler.ts:100-110`**：仅在有 MCP servers 时才使用 Streaming Input Mode，否则用 string prompt（不支持图片）：

```typescript
const sdkQuery = hasMcpServers
  ? query({ prompt: createUserMessageGenerator(userMessage), ... })  // ← 有图片能力
  : query({ prompt: userMessage, ... })                              // ← 无图片能力
```

### 影响 & 修复方向

1. **`extractTextContent` → 改为 `extractContentParts`**：同时提取 text 和 image parts，返回 SDK 兼容的 content block 数组
2. **`createUserMessageGenerator` → 接受 content block 数组**：而非纯文本 string
3. **始终使用 Streaming Input Mode**：无论是否有 MCP servers（架构文档 §4.8 已有此建议："统一处理逻辑，避免两条代码路径"）
4. UIMessage 的 `file` type parts 中可能包含 base64 图片数据，需要正确映射到 SDK 的 `image` content block

---

## 2. Skills 文件系统发现机制

### 结论：✅ SDK 有完整的文件系统 Skills 发现机制，但与 Golemancy 当前方案存在路径不兼容

### 证据（Context7 官方文档 `agent-sdk/skills` 页面）

#### 2.1 `settingSources` 配置

SDK **默认不加载任何文件系统 settings**。必须显式配置 `settingSources` 才能启用 Skills：

```typescript
// ❌ 错误 — Skills 不会被加载
const options = { allowedTools: ["Skill"] };

// ✅ 正确 — Skills 会被加载
const options = {
  settingSources: ["user", "project"],  // 必须配置
  allowedTools: ["Skill"],              // 必须启用
};
```

`settingSources` 可选值：
- `"user"` — 从 `~/.claude/skills/` 加载（用户级）
- `"project"` — 从 `{cwd}/.claude/skills/` 加载（项目级）

#### 2.2 Skills 目录结构

每个 Skill 是一个目录，包含 `SKILL.md` 文件：

```
{cwd}/.claude/skills/
├── processing-pdfs/
│   └── SKILL.md
├── code-review/
│   └── SKILL.md
└── testing/
    └── SKILL.md
```

#### 2.3 Skills 发现与调用流程

1. **启动时自动发现**：SDK 在 session 初始化时扫描所有 `settingSources` 指定的目录，读取 Skill 元数据
2. **按需加载**：Skill 的完整内容在被 Claude 调用时才加载
3. **模型自主调用**：Claude 根据上下文自主决定何时使用 Skill（通过 `Skill` tool）
4. **不支持编程注册**：Skills 必须是文件系统工件，SDK 没有编程 API 来注册 Skills

#### 2.4 `allowedTools` 要求

必须在 `allowedTools` 中包含 `"Skill"` 才能启用 Skill tool：

```typescript
options: {
  cwd: "/path/to/project",               // 包含 .claude/skills/ 的目录
  settingSources: ["user", "project"],    // 启用文件系统 settings
  allowedTools: ["Skill", "Read", ...],   // 必须包含 "Skill"
}
```

### 当前代码状态

**Golemancy 的 Skills 存储路径**：`~/.golemancy/projects/{projectId}/skills/{skillId}/`

**SDK 期望的路径**：`{cwd}/.claude/skills/{skillName}/SKILL.md`

**当前实现（`chat-claude-code.ts:119-133`）**：通过 `loadAgentSkillTools()` 将 skill 内容读取出来，拼接到 `systemPrompt` 中：

```typescript
if (agent.skillIds?.length > 0) {
  const skillResult = await loadAgentSkillTools(projectId, agent.skillIds)
  if (skillResult) {
    systemPrompt = systemPrompt + '\n\n' + skillResult.instructions
  }
}
```

**当前实现（`config-mapper.ts`）**：没有配置 `settingSources`，也没有将 `"Skill"` 加入 `allowedTools`。

### 影响 & 两种可选方案

**方案 A（当前方案，维持不变）— 注入 system prompt**：
- ✅ 不需要文件系统适配
- ✅ 已经实现且可工作
- ❌ Skills 作为纯文本注入，Claude 无法知道它们是独立的 Skill（无元数据、无按需加载）
- ❌ 所有 Skills 一次性注入到 system prompt，增加 token 消耗

**方案 B（推荐，迁移到文件系统）— 利用 SDK 原生 Skills**：
- 在 `{workspaceDir}/.claude/skills/` 下创建符号链接或复制 Golemancy skills
- 配置 `settingSources: ["project"]` + `allowedTools: ["Skill"]`
- ✅ 按需加载，节省 token
- ✅ Claude 自主决定何时使用，上下文更准确
- ❌ 需要实现 Golemancy skills → `.claude/skills/` 的同步/映射逻辑
- ❌ 需要将 Golemancy 的 skill 格式适配为 SKILL.md 格式

### 补充：Custom Slash Commands（相关发现）

SDK 还支持自定义 Slash Commands，存放在 `.claude/commands/` 目录中：

```
.claude/commands/
├── refactor.md           # → /refactor 命令
└── security-check.md     # → /security-check 命令
```

格式支持 YAML frontmatter（`allowed-tools`, `description`, `model`）和动态参数（`$1`, `$2`）。这与 Golemancy 的 Skills 概念有部分重叠，但 Commands 是用户主动触发，Skills 是 Claude 自主调用。如果 Golemancy 要完整利用 SDK 的文件系统功能，可能需要区分这两种场景。

---

## 3. Artifact 支持

### 结论：❌ SDK 不支持 Artifact，SDK 中不存在 Artifact 概念

### 证据

**SDK 消息类型完整列表**（Context7 + WebSearch + GitHub 仓库交叉确认）：

```typescript
type SDKMessage =
  | SDKAssistantMessage         // type: "assistant"
  | SDKUserMessage              // type: "user"
  | SDKUserMessageReplay        // type: "user" (with required UUID)
  | SDKResultMessage            // type: "result"
  | SDKSystemMessage            // type: "system", subtype: "init"
  | SDKPartialAssistantMessage  // type: "stream_event"
  | SDKCompactBoundaryMessage;  // type: "system", subtype: "compact_boundary"
```

**没有**任何 artifact 相关的消息类型、content block 类型或字段。

**范式差异**：

| 概念 | claude.ai (Web) | Claude Code / Agent SDK |
|------|-----------------|------------------------|
| 输出内容 | `<antArtifact>` XML 标签嵌入在文本中 | 文件系统操作（Write/Edit tool） |
| 渲染 | 前端解析 XML → iframe 侧面板 | 无渲染，直接写入磁盘 |
| 支持类型 | HTML, React, SVG, Mermaid, Code 等 | 任何文件类型 |
| API 层面 | 不是 API 特性，是 claude.ai UI 特性 | N/A |

**GitHub 确认**：`anthropics/claude-agent-sdk-typescript` 仓库 Issues 中零个与 "artifact" 相关的议题。

**最接近的替代品**：
- `outputFormat` (JSON Schema) — 结构化输出，但不是 artifact
- `enableFileCheckpointing` — 追踪文件变更，可映射到 Golemancy 的 artifact 系统
- `Write` tool 输出 — 可通过 `PostToolUse` hook 截获，转换为 Golemancy artifact

### 影响 & 建议

1. **Golemancy 的 Artifact 功能在 SDK runtime 下不会自动产生**
2. **可选的替代方案**：
   - **方案 A（Hook 截获）**：通过 `PostToolUse` hook 监听 `Write` 和 `Edit` 工具的执行，将文件操作转换为 Golemancy artifact 记录
   - **方案 B（不支持）**：在 SDK runtime 下明确标注"不支持 Artifact"，引导用户使用 Vercel runtime 获取 artifact 功能
   - **方案 C（structured_output）**：利用 `outputFormat` 让 SDK 输出结构化数据，在 Golemancy 侧解析为 artifact
3. **推荐方案 A**：架构文档 §3.2 中的 `HooksFactory.createToolDataForwarder()` 已预留了 PostToolUse → StreamAdapter 的通道，可以在此基础上添加 artifact 提取逻辑

---

## 验证来源汇总

| 来源类型 | 具体来源 | 用于验证 |
|----------|---------|---------|
| Context7 官方文档 | `platform.claude.com/docs/en/agent-sdk/typescript` | query() 签名、SDKMessage 类型 |
| Context7 官方文档 | `platform.claude.com/docs/en/agent-sdk/streaming-vs-single-mode` | Multimodal 支持、Streaming vs Single 对比 |
| Context7 官方文档 | `platform.claude.com/docs/en/agent-sdk/skills` | Skills 机制全部细节 |
| WebSearch | npm `@anthropic-ai/claude-agent-sdk` | SDK 包信息 |
| WebSearch | GitHub `anthropics/claude-agent-sdk-typescript` Issues | Artifact 相关议题（零结果） |
| WebSearch | Anthropic 官方博客 "Building Agents with Claude Agent SDK" | SDK 设计理念 |
| 项目源码 | `packages/server/src/routes/chat-claude-code.ts` | 当前 extractTextContent 实现 |
| 项目源码 | `packages/server/src/agent/claude-code/handler.ts` | 当前 createUserMessageGenerator 实现 |
| 项目源码 | `packages/server/src/agent/claude-code/config-mapper.ts` | 当前 SDK 配置映射（无 settingSources） |
| 项目文档 | `_docs/agent-sdk-architecture.md` | 架构设计中的相关描述 |
| 项目文档 | `_docs/agent-sdk/slash-commands.md` | SDK Slash Commands 文档 |
