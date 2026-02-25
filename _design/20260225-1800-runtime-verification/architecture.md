# 架构设计文档 — Conversation 锁定 + 图片支持 + Skills 迁移

> 设计时间：2026-02-25
> 架构师：Architect
> 基于：需求文档、事实验证报告、代码分析

---

## 变更 1: Conversation Runtime 锁定

### 1.1 设计目标

对话创建时记录 runtime（`standard` 或 `claude-code`），后续消息发送时校验一致性，防止在同一对话中混用不同 runtime 导致上下文错乱。

### 1.2 数据模型变更

#### 类型变更 — `packages/shared/src/types/conversation.ts`

```typescript
// Conversation 接口新增 runtime 字段
export interface Conversation extends Timestamped {
  id: ConversationId
  projectId: ProjectId
  agentId: AgentId
  title: string
  runtime: AgentRuntime  // 新增：'standard' | 'claude-code'
  messages: Message[]
  lastMessageAt: string
  compactRecords?: CompactRecord[]
  sdkSessionId?: string
}
```

需要在文件顶部导入 `AgentRuntime`：
```typescript
import type { AgentRuntime } from './settings'
```

#### 服务接口变更 — `packages/shared/src/services/interfaces.ts`

```typescript
// IConversationService.create 签名新增 runtime 参数
create(projectId: ProjectId, agentId: AgentId, title: string, runtime?: AgentRuntime): Promise<Conversation>
```

`runtime` 参数设为可选以保持向后兼容——不传时默认 `'standard'`。

#### DB Schema — `packages/server/src/db/schema.ts`

```typescript
export const conversations = sqliteTable('conversations', {
  // ... existing columns ...
  runtime: text('runtime').notNull().default('standard'),  // 新增
})
```

#### DB Migration — `packages/server/src/db/migrate.ts`

新增 Migration v8 段落：

```typescript
// --- Migration v8: runtime column on conversations ---
const colsV8 = db.all<{ name: string }>(sql`PRAGMA table_info(conversations)`)
if (!colsV8.some(c => c.name === 'runtime')) {
  log.info('migrating conversations table: adding runtime column')
  db.run(sql`ALTER TABLE conversations ADD COLUMN runtime TEXT NOT NULL DEFAULT 'standard'`)
}
```

已有的对话数据缺少 `runtime` 列会自动被 `DEFAULT 'standard'` 填充——这是安全的，因为在此变更之前只有 standard runtime 的对话被持久化过（claude-code runtime 是新功能，也可能已有少量数据，但默认 standard 不会破坏它们，会在下次访问时由路由层校验修正）。

### 1.3 受影响文件清单

| 文件 | 改动描述 |
|------|---------|
| `packages/shared/src/types/conversation.ts` | `Conversation` 接口新增 `runtime: AgentRuntime` 字段 |
| `packages/shared/src/types/settings.ts` | 无改动（`AgentRuntime` 已存在） |
| `packages/shared/src/services/interfaces.ts` | `IConversationService.create` 签名新增 `runtime?` 参数 |
| `packages/server/src/db/schema.ts` | `conversations` 表新增 `runtime` 列 |
| `packages/server/src/db/migrate.ts` | 新增 Migration v8 |
| `packages/server/src/storage/conversations.ts` | `create()` 接受 `runtime` 参数、`rowToConversation()` 映射 `runtime` 字段 |
| `packages/server/src/routes/conversations.ts` | `POST /` 端点透传 `runtime`（默认 `'standard'`） |
| `packages/server/src/routes/chat.ts` | 分流处新增 runtime 一致性校验 |
| `packages/server/src/routes/chat-claude-code.ts` | 无改动（由 `chat.ts` 在分流前校验） |
| `packages/server/src/scheduler/executor.ts` | `create()` 调用处传入对应 runtime 值 |
| `packages/ui/src/stores/useAppStore.ts` | `createConversation` 传入 runtime 参数 |
| `packages/ui/src/services/http/services.ts` | `create()` 请求体新增 runtime |
| `packages/ui/src/services/mock/services.ts` | `create()` mock 返回 runtime |

### 1.4 关键代码变更

#### 1.4.1 Storage — `conversations.ts`

```typescript
// create 方法签名
async create(
  projectId: ProjectId,
  agentId: AgentId,
  title: string,
  runtime: AgentRuntime = 'standard',
  sdkSessionId?: string,
): Promise<Conversation> {
  const db = this.getProjectDb(projectId)
  const id = generateId('conv')
  const now = new Date().toISOString()

  await db.insert(schema.conversations).values({
    id, projectId, agentId, title,
    runtime,   // 新增
    lastMessageAt: now,
    ...(sdkSessionId != null ? { sdkSessionId } : {}),
    createdAt: now, updatedAt: now,
  })

  return {
    id, projectId, agentId, title,
    runtime,   // 新增
    messages: [], lastMessageAt: now,
    ...(sdkSessionId != null ? { sdkSessionId } : {}),
    createdAt: now, updatedAt: now,
  }
}

// rowToConversation 映射
private rowToConversation(row: ..., messages: Message[] = []): Conversation {
  return {
    // ... existing fields ...
    runtime: (row.runtime ?? 'standard') as AgentRuntime,  // 新增（兼容旧数据）
  }
}
```

#### 1.4.2 路由校验 — `chat.ts`

在 runtime 分流处（约 L111）之前新增校验逻辑：

```typescript
// --- Runtime branching: claude-code SDK vs standard ---
const agentRuntime = resolveAgentRuntime(settings, project?.config)

// Runtime lock: if conversation exists, validate runtime consistency
if (conversationId) {
  const conv = await deps.conversationStorage.getById(
    projectId as ProjectId,
    conversationId as ConversationId,
  )
  if (conv && conv.runtime !== agentRuntime) {
    return c.json({
      error: `Runtime mismatch: conversation was created with "${conv.runtime}" runtime, but current runtime is "${agentRuntime}". Please create a new conversation.`,
    }, 409)  // 409 Conflict
  }
}

if (agentRuntime === 'claude-code') {
  return handleClaudeCodeChat(c, { ... }, deps)
}
```

使用 HTTP 409 Conflict 状态码，语义上表达"请求与当前资源状态冲突"。

#### 1.4.3 Conversation 创建处传入 runtime

**UI 侧 — `ChatPage.tsx`**：创建对话时需要知道当前 runtime，通过 `useAgentRuntime()` hook 获取后传递给 `createConversation`。

```typescript
// ChatPage.tsx
const agentRuntime = useAgentRuntime()

const handleNewChat = useCallback(async () => {
  if (!mainAgentId) return
  await createConversation(mainAgentId, 'New Chat', agentRuntime)
}, [mainAgentId, createConversation, agentRuntime])
```

**Store — `useAppStore.ts`**：

```typescript
async createConversation(agentId: AgentId, title: string, runtime?: AgentRuntime) {
  const projectId = get().currentProjectId
  if (!projectId) throw new Error('No project selected')
  const conv = await getServices().conversations.create(projectId, agentId, title, runtime)
  set(s => ({ conversations: [...s.conversations, conv], currentConversationId: conv.id }))
  return conv
}
```

**Cron Executor — `executor.ts`**：

```typescript
// Standard 路径（约 L95）
const conv = await this.deps.conversationStorage.create(
  projectId, cronJob.agentId,
  `[Cron] ${cronJob.name} — ${timestamp}`,
  'standard',  // 新增
)

// Claude Code 路径（约 L294）
const conv = await this.deps.conversationStorage.create(
  projectId, cronJob.agentId,
  `[Cron] ${cronJob.name} — ${timestamp}`,
  'claude-code',  // 新增
)
```

### 1.5 边界情况和错误处理

1. **已有数据无 runtime 列**：SQLite `DEFAULT 'standard'` 自动回填。`rowToConversation` 中 `row.runtime ?? 'standard'` 双重保护。
2. **Runtime 切换后的旧对话**：用户切换 runtime 后，旧对话因 runtime 不匹配会在发送消息时返回 409 错误。UI 可提示用户"请创建新对话"。
3. **无 conversationId 的首次发送**：UI 先创建 conversation（传入 runtime），再发送 chat 请求。conversation 创建时就确定了 runtime。
4. **并发场景**：如果用户在对话进行中切换了 runtime，正在进行的请求不受影响（已过校验），下一次请求才会被拦截。

### 1.6 向后兼容性

- DB migration 是 additive（新增列带默认值），不影响现有数据
- `IConversationService.create` 的 `runtime` 参数可选，默认 `'standard'`
- Mock services 返回 `runtime: 'standard'`，不影响 UI 测试

---

## 变更 2: 图片上传支持 Claude Code

### 2.1 设计目标

在 Claude Code 模式下，用户上传的图片能正确传递给 SDK。核心是：
1. 始终使用 Streaming Input Mode（去掉 string prompt 分支）
2. 从 UIMessage parts 中提取 text + image content blocks
3. 将 file parts（base64 data URL）转换为 SDK 的 image content block 格式

### 2.2 数据流

```
UIMessage.parts                    SDK content blocks
─────────────                      ──────────────────
{ type: 'text', text: '...' }  →  { type: 'text', text: '...' }
{ type: 'file',                →  { type: 'image',
  mediaType: 'image/png',          source: {
  url: 'data:image/png;base64,...'    type: 'base64',
}                                     media_type: 'image/png',
                                      data: '<base64 data>'
                                    }
                                  }
```

### 2.3 受影响文件清单

| 文件 | 改动描述 |
|------|---------|
| `packages/server/src/routes/chat-claude-code.ts` | `extractTextContent()` → `extractContentParts()` — 提取 text + image parts；rehydrate file parts 到 data URL |
| `packages/server/src/agent/claude-code/handler.ts` | `createUserMessageGenerator()` 接受 content block 数组；始终使用 Streaming Input Mode |
| `packages/server/src/agent/claude-code/handler.ts` | `ClaudeCodeChatParams.userMessage` 类型从 `string` → `SDKContentBlock[]` |
| `packages/server/src/scheduler/executor.ts` | `executeClaudeCode` 中的 userMessage 也改为 content blocks 格式（Cron 无图片，纯文本 block） |

### 2.4 关键代码变更

#### 2.4.1 新增类型定义

在 `handler.ts` 或独立的 `types.ts` 中定义 SDK content block 类型：

```typescript
/** SDK-compatible content block types */
export type SDKTextBlock = {
  type: 'text'
  text: string
}

export type SDKImageBlock = {
  type: 'image'
  source: {
    type: 'base64'
    media_type: string  // 'image/png', 'image/jpeg', 'image/gif', 'image/webp'
    data: string        // raw base64 data (no data URL prefix)
  }
}

export type SDKContentBlock = SDKTextBlock | SDKImageBlock
```

#### 2.4.2 `extractContentParts()` — `chat-claude-code.ts`

替换 `extractTextContent()`：

```typescript
import { rehydrateUploadsForAI } from '../utils/message-parts'

/**
 * Extract content parts from UIMessage parts for SDK consumption.
 * Returns SDK-compatible content blocks (text + image).
 *
 * File parts with base64 data URLs are converted to SDK image blocks.
 * Non-image file parts are skipped with a warning.
 */
async function extractContentParts(
  projectId: string,
  parts: UIMessage['parts'],
): Promise<SDKContentBlock[]> {
  // First, rehydrate any golemancy-upload: refs or HTTP URLs back to data URLs
  const rehydrated = await rehydrateUploadsForAI(projectId, parts as unknown[])

  const blocks: SDKContentBlock[] = []

  for (const part of rehydrated) {
    const p = part as Record<string, unknown>

    // Text parts → text block
    if (p.type === 'text' && typeof p.text === 'string') {
      blocks.push({ type: 'text', text: p.text })
      continue
    }

    // File parts → image block (if image MIME type)
    if (p.type === 'file' && typeof p.url === 'string' && typeof p.mediaType === 'string') {
      const mediaType = p.mediaType as string
      if (!mediaType.startsWith('image/')) {
        log.warn({ mediaType }, 'non-image file part in claude-code mode, skipping')
        continue
      }

      const dataUrl = p.url as string
      const parsed = parseBase64DataUrl(dataUrl)
      if (!parsed) {
        log.warn({ mediaType }, 'failed to parse data URL for image, skipping')
        continue
      }

      blocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: parsed.mediaType,
          data: parsed.data,
        },
      })
    }
  }

  return blocks
}

/**
 * Parse a base64 data URL into media type and raw data.
 * Input:  'data:image/png;base64,iVBOR...'
 * Output: { mediaType: 'image/png', data: 'iVBOR...' }
 */
function parseBase64DataUrl(url: string): { mediaType: string; data: string } | null {
  const match = url.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return null
  return { mediaType: match[1], data: match[2] }
}
```

#### 2.4.3 调用处更新 — `chat-claude-code.ts`

```typescript
// 替换原来的 extractTextContent 调用（约 L71）
const contentBlocks = await extractContentParts(projectId, lastUserMsg.parts)

// userMessage 传给 handler 的改为 content blocks
sdkResult = await handleClaudeCodeStream(
  {
    agent,
    contentBlocks,     // 替代 userMessage: string
    sdkSessionId,
    systemPrompt,
    cwd: workspaceDir,
    permissionMode,
    allAgents,
    mcpConfigs,
    signal: c.req.raw.signal,
  },
  writer,
)

// 保存用户消息时 content 仍用纯文本提取（用于 FTS 搜索）
const userTextContent = contentBlocks
  .filter((b): b is SDKTextBlock => b.type === 'text')
  .map(b => b.text)
  .join('\n')

await deps.conversationStorage.saveMessage(
  projectId as ProjectId,
  conversationId as ConversationId,
  {
    id: lastUserMsg.id as MessageId,
    role: 'user',
    parts: extractedParts,
    content: userTextContent,  // 纯文本用于 FTS
  },
)
```

#### 2.4.4 Handler 改造 — `handler.ts`

```typescript
export interface ClaudeCodeChatParams {
  agent: Agent
  contentBlocks: SDKContentBlock[]   // 替代 userMessage: string
  sdkSessionId?: string
  systemPrompt: string
  cwd?: string
  permissionMode?: PermissionMode | string
  allAgents: Agent[]
  mcpConfigs: MCPServerConfig[]
  signal?: AbortSignal
}

// createUserMessageGenerator 改为接受 content blocks
async function* createUserMessageGenerator(
  contentBlocks: SDKContentBlock[],
) {
  // 如果只有一个 text block，content 可以直接用 string
  // 但为统一处理，始终用 content blocks 数组
  yield {
    type: 'user' as const,
    message: {
      role: 'user' as const,
      content: contentBlocks,  // SDK 支持 string | ContentBlock[]
    },
    parent_tool_use_id: null,
    session_id: '',
  }
}

// 始终使用 Streaming Input Mode — 去掉 string prompt 分支
export async function handleClaudeCodeStream(
  params: ClaudeCodeChatParams,
  writer: UIMessageStreamWriter,
): Promise<ClaudeCodeChatResult> {
  const { contentBlocks, ... } = params

  // ... build sdkOptions ...

  // 始终使用 AsyncGenerator prompt（Streaming Input Mode）
  const sdkQuery = query({
    prompt: createUserMessageGenerator(contentBlocks),
    options: options as Parameters<typeof query>[0]['options'],
  })

  // ... consume stream (不变) ...
}
```

#### 2.4.5 Cron Executor 适配 — `executor.ts`

Cron 执行不涉及图片上传，构造纯文本 content block：

```typescript
// executeClaudeCode 方法中（约 L303）
const userContent = cronJob.instruction || `[Scheduled: ${cronJob.name}] Execute your task.`
const contentBlocks: SDKContentBlock[] = [{ type: 'text', text: userContent }]

// 传递给 handleClaudeCodeStream
await handleClaudeCodeStream({
  agent,
  contentBlocks,   // 替代 userMessage
  // ...
}, writer)
```

注意：Cron 的 `executeClaudeCode` 不使用 SSE streaming writer——它直接消费 SDK 结果。需要确认当前 executor 是否也调用 `handleClaudeCodeStream`，如果是独立实现，则同样需要修改 content 传递方式。

### 2.5 边界情况和错误处理

1. **非图片文件**：`extractContentParts()` 跳过非 `image/*` MIME 的 file parts，记录 warn 日志。
2. **无法解析的 data URL**：`parseBase64DataUrl()` 返回 null，跳过该 part。
3. **图片过大**：SDK 自身会对过大的图片返回错误——不在 Golemancy 层做限制，由 SDK 报错后通过 SSE error 事件传递给 UI。
4. **golemancy-upload 引用**：通过 `rehydrateUploadsForAI()` 统一转回 data URL 后再解析——复用已有逻辑。
5. **纯文本消息（无图片）**：`extractContentParts()` 返回 `[{ type: 'text', text: '...' }]`，`createUserMessageGenerator` 正常工作。
6. **空消息**：`contentBlocks` 长度为 0 时应返回错误（在路由层校验）。

### 2.6 向后兼容性

- `extractTextContent()` 函数在 `chat.ts`（standard 路径）中仍然被使用，不删除。只在 `chat-claude-code.ts` 中替换为 `extractContentParts()`。
- SDK 的 `content` 字段同时支持 `string` 和 `ContentBlock[]`，不存在兼容问题。
- Cron executor 中构造 `[{ type: 'text', text: ... }]` 完全兼容。

---

## 变更 3: Skills 迁移到 Project 级别 + SDK 文件系统集成

### 3.1 设计目标

1. Skills 引用从 Agent 级别（`agent.skillIds`）迁移到 Project 级别（`project.config.skillIds`）
2. Claude Code 模式下，将 Golemancy skills 同步到 SDK 期望的 `{cwd}/.claude/skills/` 路径
3. Standard 模式下，保持现有 `loadAgentSkillTools()` 行为不变（但改为从 project 读取 skillIds）
4. 配置 `settingSources: ["project"]` + `allowedTools: ["Skill"]`

### 3.2 数据模型变更

#### 类型变更 — `packages/shared/src/types/settings.ts`

```typescript
export interface ProjectConfig {
  maxConcurrentAgents: number
  permissionsConfigId?: PermissionsConfigId
  agentRuntime?: AgentRuntime
  skillIds?: SkillId[]  // 新增：Project 级别 skill 引用
}
```

需要导入 `SkillId`：
```typescript
import type { PermissionsConfigId, SkillId } from './common'
```

#### Agent 类型不变（向后兼容期）

**注意**：`agent.skillIds` 字段暂时保留以保证向后兼容，但标记为 deprecated。读取逻辑优先读 `project.config.skillIds`，回退到 `agent.skillIds`。在所有 Agent 的 `skillIds` 清空后，可在后续版本移除该字段。

```typescript
// packages/shared/src/types/agent.ts
export interface Agent extends Timestamped {
  // ...
  skillIds: SkillId[]  // @deprecated — 迁移到 ProjectConfig.skillIds
  // ...
}
```

### 3.3 迁移策略（Agent → Project）

Skills 迁移需要处理"多个 Agent 可能引用不同 skills"的情况：

```
迁移逻辑：
1. 读取 Project 下所有 Agents 的 skillIds
2. 合并去重 → 写入 project.config.skillIds
3. 清空所有 agents 的 skillIds = []
```

这个迁移可以在以下两个时机执行：

**方案 A（推荐）— 懒迁移（Lazy Migration）**：
- 在 `chat.ts` / `chat-claude-code.ts` / `executor.ts` 的 skill 加载处：
  - 优先读 `project.config.skillIds`
  - 如果为空，回退读 `agent.skillIds`（兼容旧数据）
- 在 Project Settings 页面保存时，如果检测到 agent 上还有 skillIds，自动迁移到 project 级别

**方案 B — 主动迁移**：在服务器启动时扫描所有 projects，执行迁移。风险较高（启动慢、并发问题）。

**选择方案 A**：懒迁移更安全，渐进式。

### 3.4 SDK 文件系统集成（Claude Code 模式）

#### 3.4.1 Skills 同步到 `.claude/skills/`

SDK 要求 Skills 以文件系统形式存在于 `{cwd}/.claude/skills/{skillName}/SKILL.md`。Golemancy 的 Skills 存储在 `~/.golemancy/projects/{projectId}/skills/{skillId}/SKILL.md`。

**同步策略：Symlink**（而非复制）

```
~/.golemancy/projects/{projectId}/skills/
├── skill-abc123/
│   ├── SKILL.md        ← Golemancy 格式（gray-matter frontmatter + body）
│   └── metadata.json
└── skill-def456/
    ├── SKILL.md
    └── metadata.json

{workspace}/.claude/skills/         ← SDK 扫描目录
├── skill-abc123 → symlink to ~/.golemancy/projects/{projectId}/skills/skill-abc123
└── skill-def456 → symlink to ~/.golemancy/projects/{projectId}/skills/skill-def456
```

Symlink 优势：
- 零复制，Golemancy CRUD 操作直接生效
- `SKILL.md` 格式兼容：SDK 读取 `SKILL.md` 的内容作为 Skill prompt，gray-matter frontmatter 会被 SDK 忽略（SDK 只读内容文本，frontmatter 作为普通文本也能被 Claude 理解）

#### 3.4.2 SKILL.md 格式兼容性分析

**Golemancy 格式**（gray-matter）：
```markdown
---
name: Code Review
description: Comprehensive code review skill
---
Review the code following these guidelines:
1. Check for security vulnerabilities
2. Ensure code readability
...
```

**SDK 期望格式**：
```markdown
Review the code following these guidelines:
1. Check for security vulnerabilities
2. Ensure code readability
...
```

SDK 读取整个 `SKILL.md` 文件内容作为 Skill 的 prompt。gray-matter frontmatter（`---...---`）会被当作文本内容传递给 Claude，不会导致错误——Claude 能理解 YAML frontmatter 并正确提取核心指令。**因此无需格式转换，直接 symlink 即可。**

#### 3.4.3 同步函数设计

新建文件 `packages/server/src/agent/claude-code/skills-sync.ts`：

```typescript
import fs from 'node:fs/promises'
import path from 'node:path'
import { getProjectPath, validateId } from '../../utils/paths'
import { logger } from '../../logger'

const log = logger.child({ component: 'claude-code:skills-sync' })

/**
 * Sync Golemancy project skills to SDK's `.claude/skills/` directory.
 * Creates symlinks from {workspace}/.claude/skills/{skillId}
 * → {projectSkillsDir}/{skillId}
 *
 * Returns a cleanup function that removes the .claude/skills/ directory.
 */
export async function syncSkillsToSdkDir(
  projectId: string,
  skillIds: string[],
  workspaceDir: string,
): Promise<{ cleanup: () => Promise<void> }> {
  const sdkSkillsDir = path.join(workspaceDir, '.claude', 'skills')
  const projectSkillsDir = path.join(getProjectPath(projectId), 'skills')

  // Ensure .claude/skills/ directory exists
  await fs.mkdir(sdkSkillsDir, { recursive: true })

  // Clean existing symlinks (from previous session)
  try {
    const existing = await fs.readdir(sdkSkillsDir)
    for (const entry of existing) {
      const entryPath = path.join(sdkSkillsDir, entry)
      const stat = await fs.lstat(entryPath)
      if (stat.isSymbolicLink()) {
        await fs.unlink(entryPath)
      }
    }
  } catch {
    // Directory may not exist yet, that's fine
  }

  // Create symlinks for each skill
  let linkedCount = 0
  for (const skillId of skillIds) {
    validateId(skillId)
    const source = path.join(projectSkillsDir, skillId)
    const target = path.join(sdkSkillsDir, skillId)

    try {
      await fs.access(source)
      await fs.symlink(source, target, 'dir')
      linkedCount++
    } catch {
      log.warn({ skillId, projectId }, 'skill directory not found, skipping symlink')
    }
  }

  log.debug({ projectId, linkedCount, total: skillIds.length }, 'synced skills to SDK directory')

  const cleanup = async () => {
    try {
      // Remove only the symlinks we created, not the entire .claude directory
      // (user may have their own .claude config)
      for (const skillId of skillIds) {
        const target = path.join(sdkSkillsDir, skillId)
        try {
          const stat = await fs.lstat(target)
          if (stat.isSymbolicLink()) {
            await fs.unlink(target)
          }
        } catch {
          // Already removed or doesn't exist
        }
      }
    } catch (err) {
      log.warn({ err, projectId }, 'failed to cleanup SDK skills symlinks')
    }
  }

  return { cleanup }
}
```

### 3.5 受影响文件清单

| 文件 | 改动描述 |
|------|---------|
| `packages/shared/src/types/settings.ts` | `ProjectConfig` 新增 `skillIds?: SkillId[]` |
| `packages/shared/src/types/agent.ts` | `skillIds` 字段加 `@deprecated` 注释 |
| `packages/server/src/agent/claude-code/skills-sync.ts` | **新增文件** — Skills 同步到 `.claude/skills/` |
| `packages/server/src/agent/claude-code/config-mapper.ts` | `buildSdkOptions()` 添加 `settingSources` 和 `Skill` 到 `allowedTools` |
| `packages/server/src/routes/chat-claude-code.ts` | 修改 skill 加载逻辑：从 project 读 skillIds，调用 `syncSkillsToSdkDir`，移除 system prompt 注入 |
| `packages/server/src/routes/chat.ts` | standard 路径的 skill 加载改为读 project.config.skillIds |
| `packages/server/src/scheduler/executor.ts` | 两条路径的 skill 加载改为读 project.config.skillIds |
| `packages/server/src/agent/tools.ts` | `loadAgentTools()` 中 skillIds 来源从 agent 改为传入参数 |
| `packages/server/src/storage/skills.ts` | `delete()` 的引用检查改为检查 project.config.skillIds |
| `packages/ui/src/pages/agent/AgentDetailPage.tsx` | 移除 Skills tab / skillIds 编辑；提示"Skills 已迁移到 Project 级别" |
| `packages/ui/src/pages/project/ProjectSettingsPage.tsx` | 新增 Skills 配置区域（多选 skill 引用） |
| `packages/ui/src/services/http/services.ts` | Project update 包含 skillIds |
| `packages/ui/src/services/mock/services.ts` | mock Project 包含 skillIds |

### 3.6 关键代码变更

#### 3.6.1 Config Mapper — 添加 Skills 支持

```typescript
// packages/server/src/agent/claude-code/config-mapper.ts

export interface SdkQueryOptions {
  // ... existing fields ...
  settingSources?: string[]  // 新增
}

export function buildSdkOptions(params: BuildSdkOptionsParams): SdkQueryOptions {
  // ... existing logic ...

  // Skills — enable SDK native skill discovery via file system
  if (params.hasSkills) {
    options.settingSources = ['project']  // SDK 从 {cwd}/.claude/skills/ 加载
    if (!allowedTools.includes('Skill')) {
      allowedTools.push('Skill')
    }
  }

  // ... rest unchanged ...
}
```

`BuildSdkOptionsParams` 新增 `hasSkills: boolean` 字段，由调用方在 sync 完成后设置。

#### 3.6.2 Chat Claude Code 路由 — Skill 加载改造

```typescript
// packages/server/src/routes/chat-claude-code.ts

// 替换原有的 skill 加载逻辑（L118-132）

// Resolve skill IDs: project-level first, fallback to agent-level (migration compat)
const skillIds = project?.config?.skillIds?.length
  ? project.config.skillIds
  : agent.skillIds ?? []

// Claude Code mode: sync skills to filesystem for SDK native discovery
let skillCleanup: (() => Promise<void>) | undefined
let hasSkills = false

if (skillIds.length > 0) {
  try {
    const { cleanup } = await syncSkillsToSdkDir(projectId, skillIds, workspaceDir)
    skillCleanup = cleanup
    hasSkills = true
  } catch (err) {
    log.warn({ err, projectId }, 'failed to sync skills to SDK directory')
  }
}

// System prompt — no longer inject skill instructions in claude-code mode
// SDK will discover skills via .claude/skills/ and load them natively
const systemPrompt = agent.systemPrompt

// Pass hasSkills to handler for config-mapper
sdkResult = await handleClaudeCodeStream(
  {
    // ... existing params ...
    hasSkills,  // 新增
  },
  writer,
)
```

#### 3.6.3 Standard 模式 — Skill 加载适配

```typescript
// packages/server/src/routes/chat.ts
// 和 packages/server/src/agent/tools.ts

// 将 skillIds 来源从 agent 改为 project（向后兼容）
const skillIds = project?.config?.skillIds?.length
  ? project.config.skillIds
  : agent.skillIds ?? []

const agentToolsResult = await loadAgentTools({
  agent,
  projectId,
  settings,
  allAgents,
  skillIds,  // 新参数，替代从 agent 内部读取
  // ...
})
```

#### 3.6.4 Skills 删除引用检查

```typescript
// packages/server/src/storage/skills.ts
// delete() 方法中检查 project.config.skillIds

async delete(projectId: ProjectId, id: SkillId): Promise<void> {
  // 检查 project 级别引用
  // 注意：FileSkillStorage 需要注入 projectStorage 依赖
  const project = await this.projectStorage.getById(projectId)
  if (project?.config?.skillIds?.includes(id)) {
    throw new Error(`Skill ${id} is referenced by project configuration`)
  }
  // 兼容期：也检查 agent 级别引用
  const agents = await this.agentStorage.list(projectId)
  if (agents.some(a => a.skillIds.includes(id))) {
    throw new Error(`Skill ${id} is assigned to agents`)
  }
  await deleteDir(this.skillDir(projectId, id))
}
```

### 3.7 边界情况和错误处理

1. **Workspace `.claude/` 目录已存在**：`mkdir -p` 不会覆盖。Symlink 创建前先清理已有 symlinks（仅清理 symlinks，不动常规文件/目录）。
2. **Skill 文件不存在**：跳过并 warn，不阻断整体流程。
3. **权限问题**：Workspace 目录通常由 Golemancy 创建，有完全权限。如果是用户自定义 workspace，可能需要 catch 权限错误。
4. **并发对话同一 workspace**：多个对话共享同一 workspace 的 `.claude/skills/` 目录。Symlink 是幂等的——重复创建同一 symlink 没问题。Cleanup 时只删除当前 session 创建的 symlinks（基于 skillIds 列表）。
5. **Skill 内容更新**：因为是 symlink 而非复制，Golemancy 侧的 skill CRUD 操作会实时反映到 SDK 读取的路径。
6. **gray-matter frontmatter**：SDK 会将整个文件内容作为 skill prompt，包括 `---\nname: ...\n---` 部分。Claude 能理解这种格式。如果未来需要严格兼容，可以考虑生成一个不含 frontmatter 的 symlink 目标文件，但当前不需要。

### 3.8 向后兼容性

- `agent.skillIds` 保留不删除，懒迁移策略让旧数据继续工作
- `project.config.skillIds` 可选字段，不影响已有 project config 的反序列化
- Standard 模式下 `loadAgentSkillTools()` 逻辑不变，只是 skillIds 来源变了
- FileSkillStorage 的读写操作完全不变，只是引用检查增加了 project 级别

### 3.9 UI 影响

1. **Agent Detail Page**：移除 Skills tab 中的 skillIds 编辑控件。显示提示文字："Skills are now configured at the Project level. Go to Project Settings to manage skills."
2. **Project Settings Page**：在 Agent tab 中新增 Skills 选择区域（多选列表/穿梭框），引用 project 下的 skills。
3. **Skills Page**：CRUD 不变（仍在 Project 下管理），只是"被哪个 Agent 引用"的信息改为"被 Project 引用"。

---

## 实施顺序建议

```
Phase 1 — Conversation Runtime 锁定（变更 1）
  ├── DB schema + migration
  ├── 类型 + 接口
  ├── Storage 实现
  ├── Route 校验逻辑
  ├── UI 创建对话传 runtime
  └── Cron executor 适配

Phase 2 — 图片上传支持（变更 2）
  ├── extractContentParts 函数
  ├── handler.ts 改造（始终 Streaming Input Mode）
  ├── chat-claude-code.ts 调用更新
  └── executor 适配

Phase 3 — Skills 迁移（变更 3）
  ├── ProjectConfig 类型变更
  ├── skills-sync.ts 新文件
  ├── config-mapper.ts settingSources 支持
  ├── chat-claude-code.ts skill 加载改造
  ├── chat.ts / executor / tools.ts skillIds 来源变更
  ├── skill storage 引用检查
  └── UI 变更（Agent Detail + Project Settings）
```

Phase 1 和 Phase 2 互相独立，可以并行实施。Phase 3 较为复杂（涉及数据迁移和 UI 变更），建议最后实施。

---

## 测试策略

### 变更 1 测试点
- Unit: `create()` 正确写入 runtime
- Unit: `rowToConversation()` 正确映射 runtime（含旧数据 `null` → `'standard'`）
- Unit: `chat.ts` runtime 不匹配返回 409
- Unit: `chat.ts` runtime 匹配正常通过
- Unit: Cron executor 传入正确 runtime

### 变更 2 测试点
- Unit: `extractContentParts()` 正确提取 text blocks
- Unit: `extractContentParts()` 正确提取 image blocks（含 base64 解析）
- Unit: `extractContentParts()` 跳过非图片 file parts
- Unit: `createUserMessageGenerator()` 输出正确的 content blocks
- Unit: `parseBase64DataUrl()` 边界情况（无效 URL, 空字符串）
- Unit: 纯文本消息走 Streaming Input Mode 正常

### 变更 3 测试点
- Unit: `syncSkillsToSdkDir()` 正确创建 symlinks
- Unit: `syncSkillsToSdkDir()` cleanup 正确清理
- Unit: `buildSdkOptions()` 有 skills 时包含 `settingSources` 和 `Skill`
- Unit: skillIds 懒迁移逻辑（project 优先，agent 回退）
- Unit: skill delete 检查 project 引用
- Integration: Claude Code 模式 + Skills + 对话流完整通路
