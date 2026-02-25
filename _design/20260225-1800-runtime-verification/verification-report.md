# 全功能验证报告

**验证日期**: 2026-02-25
**验证工程师**: Claude Opus 4.6 (验证工程师角色)
**验证方式**: 源码静态审查 (只读)

---

## 总览

| # | 功能点 | 状态 | 说明 |
|---|--------|------|------|
| A1 | Runtime 自由切换 | ✅ 通过 | 三层级联 Project → Global → standard 正确实现 |
| A2 | Conversation Runtime 锁定 | ✅ 通过 | DB migration v8 + 409 conflict + UI 传 runtime 完整 |
| A3 | Compact (SDK events) | ✅ 通过 | SSE adapter 正确处理 data-compact，UI 隐藏手动按钮 |
| A4 | 图片上传 | ✅ 通过 | extractContentParts + parseBase64DataUrl + always streaming mode |
| A5 | Built-in Tools | ✅ 通过 | BUILTIN_TOOL_MAP 映射 bash/browser/task → SDK 工具名 |
| A6 | Skills | ✅ 通过 | Project-level skillIds + symlink + settingSources + Skill allowedTool |
| A7 | MCP | ✅ 通过 | MCP adapter 转换 stdio/sse/http 三种类型 + allowedTools wildcard |
| A8 | Sub-Agents | ✅ 通过 | config-mapper 正确映射 sub-agent 定义 + Task tool |
| A9 | Token 追踪 | ✅ 通过 | tokenRecordStorage.save + data-usage 事件 + modelUsage 聚合 |
| A10 | Agent 状态 | ✅ 通过 | activeChatRegistry + running/idle lifecycle 完整 |
| A11 | 消息存储 | ✅ 通过 | user + assistant 消息均正确保存 |
| A12 | Session 管理 | ✅ 通过 | sdkSessionId 读取 + updateSdkSessionId + resume |
| A13 | FTS 搜索 | ✅ 通过 | content 字段为纯文本，FTS5 索引可用 |
| A14 | Cron Jobs | ✅ 通过 | executeClaudeCode 方法完整覆盖所有步骤 |
| A15 | Permissions | ✅ 通过 | resolvePermissionsConfig + mapPermissionMode 三模式映射 |
| A16 | Artifacts | ✅ 通过 | P2 确认不处理，SDK 无 artifact 支持 |
| A17 | Memory | ✅ 通过 | FileMemoryStorage 是 runtime 无关的文件存储 |
| B18 | Global Settings UI | ✅ 通过 | 3 tabs (General/Runtime/Speech) + ProvidersSection inline |
| B19 | Project Settings UI | ✅ 通过 | Runtime 在 AgentTab，无 Inherit，grid-cols-2 |
| B20 | Agent Detail 条件渲染 | ✅ 通过 | SkillsTab/ToolsTab/SubAgentsTab 均有 claude-code info card |

**结论**: 全部 20 个验证点均通过。

---

## 详细验证

### A1: Runtime 自由切换 ✅

**文件**: `packages/server/src/agent/resolve-runtime.ts`

```typescript
export function resolveAgentRuntime(
  settings: GlobalSettings,
  projectConfig?: ProjectConfig,
): AgentRuntime {
  return projectConfig?.agentRuntime ?? settings.agentRuntime ?? 'standard'
}
```

- 三层级联: `Project Config → Global Settings → 'standard'` (default)
- 使用 `??` (nullish coalescing) 确保 `undefined` 时正确 fallback

**文件**: `packages/ui/src/hooks/index.ts` — `useAgentRuntime()` hook

```typescript
export function useAgentRuntime(): AgentRuntime {
  const settings = useAppStore(s => s.settings)
  const project = useCurrentProject()
  const projectRuntime = project?.config?.agentRuntime
  if (projectRuntime) return projectRuntime
  return settings?.agentRuntime ?? 'standard'
}
```

- UI 侧镜像了服务端的三层级联逻辑
- 在 ChatPage 中使用 `useAgentRuntime()` 传递给 `createConversation` 和 `handleSwitchAgent`

**验证结果**: 通过。服务端和 UI 侧逻辑一致。

---

### A2: Conversation Runtime 锁定 ✅

**1. 类型定义** — `packages/shared/src/types/conversation.ts`

```typescript
export interface Conversation extends Timestamped {
  // ...
  runtime: AgentRuntime  // 'standard' | 'claude-code'
  // ...
}
```

- `runtime` 是必需字段（非可选），类型为 `AgentRuntime`

**2. DB Schema** — `packages/server/src/db/schema.ts`

```typescript
runtime: text('runtime').notNull().default('standard'),
```

- 非空列，默认值 `'standard'`

**3. Migration v8** — `packages/server/src/db/migrate.ts`

```typescript
const colsV8 = db.all<{ name: string }>(sql`PRAGMA table_info(conversations)`)
if (!colsV8.some(c => c.name === 'runtime')) {
  log.info('migrating conversations table: adding runtime column')
  db.run(sql`ALTER TABLE conversations ADD COLUMN runtime TEXT NOT NULL DEFAULT 'standard'`)
}
```

- 正确的增量迁移，幂等检查

**4. 409 Conflict** — `packages/server/src/routes/chat.ts`

```typescript
if (conversationId) {
  const conv = await deps.conversationStorage.getById(...)
  if (conv && conv.runtime !== agentRuntime) {
    return c.json({
      error: `Runtime mismatch: conversation was created with "${conv.runtime}" runtime, but current runtime is "${agentRuntime}". Please create a new conversation.`,
    }, 409)
  }
}
```

- 在 runtime 分支之前进行 409 校验
- 错误消息清晰，包含两个 runtime 值

**5. Storage create()** — `packages/server/src/storage/conversations.ts`

```typescript
async create(projectId: ProjectId, agentId: AgentId, title: string, runtime: AgentRuntime = 'standard', sdkSessionId?: string): Promise<Conversation> {
```

- `runtime` 参数带默认值 `'standard'`
- 正确写入数据库并返回

**6. rowToConversation** — 正确映射 `runtime` 字段:

```typescript
runtime: (row.runtime ?? 'standard') as AgentRuntime,
```

**7. UI 传递 runtime** — `packages/ui/src/pages/chat/ChatPage.tsx`

```typescript
const agentRuntime = useAgentRuntime()

const handleNewChat = useCallback(async () => {
  if (!mainAgentId) return
  await createConversation(mainAgentId, 'New Chat', agentRuntime)
}, [mainAgentId, createConversation, agentRuntime])

const handleSwitchAgent = useCallback(async (agentId: AgentId) => {
  // ...
  await createConversation(agentId, 'New Chat', agentRuntime)
  // ...
}, [/* ... */ agentRuntime])
```

**8. 全链路验证**:
- Store: `createConversation(agentId, title, runtime?)` → 正确传递
- HTTP Service: `create(projectId, agentId, title, runtime?)` → POST body 包含 runtime
- Server Route: `conversations.ts` POST `/` 解析 `runtime` 并传给 `storage.create()`

**验证结果**: 通过。Conversation runtime 锁定从类型定义到数据库迁移到 409 校验到 UI 传递全链路正确。

---

### A3: Compact (SDK events → UI) ✅

**1. SSE Adapter** — `packages/server/src/agent/claude-code/sse-adapter.ts`

处理三种 compact 相关事件:
- `subtype === 'compact_boundary'` → `data-compact { status: 'completed', trigger, preTokens }`
- `subtype === 'status'` && `msg.status === 'compacting'` → `data-compact { status: 'started' }`

**2. UI 隐藏手动 compact** — `packages/ui/src/pages/chat/ChatPage.tsx`

```typescript
const isClaudeCode = agentRuntime === 'claude-code'
const compactThreshold = isClaudeCode ? null : (currentAgent?.compactThreshold ?? DEFAULT_COMPACT_THRESHOLD)
// StatusBar: onCompactNow={isClaudeCode ? undefined : handleCompactNow}
```

- Claude Code 模式下 threshold 为 null，compact 按钮不显示

**3. SDK compact events → UI** — `packages/ui/src/pages/chat/ChatWindow.tsx`

```typescript
if (part.type === 'data-compact' && part.data) {
  if (part.data.status === 'started') {
    setCompacting(true)
    onCompactingChange?.(true)
  } else if (part.data.status === 'completed') {
    setCompacting(false)
    onCompactingChange?.(false)
    if (part.data.record) {
      // Standard runtime — full CompactRecord from server
    } else if (part.data.trigger) {
      // Claude Code SDK — synthesize a record for display
      const synthesized: CompactRecord = { ... }
      setCompactRecords(prev => [...prev, synthesized])
    }
  } else if (part.data.status === 'failed') {
    setCompacting(false)
    onCompactingChange?.(false)
  }
}
```

- 正确区分标准 runtime 的完整 record 和 SDK 的简化格式
- SDK compact 事件被合成为 CompactRecord 以便 UI 展示

**验证结果**: 通过。

---

### A4: 图片上传 ✅

**1. extractContentParts()** — `packages/server/src/routes/chat-claude-code.ts`

```typescript
async function extractContentParts(
  projectId: string,
  parts: UIMessage['parts'],
): Promise<SDKContentBlock[]> {
  const rehydrated = await rehydrateUploadsForAI(projectId, parts as unknown[])
  const blocks: SDKContentBlock[] = []
  for (const part of rehydrated) {
    if (p.type === 'text' && typeof p.text === 'string') {
      blocks.push({ type: 'text', text: p.text })
    }
    if (p.type === 'file' && typeof p.url === 'string' && typeof p.mediaType === 'string') {
      // Only image types, parse base64
      const parsed = parseBase64DataUrl(p.url as string)
      blocks.push({ type: 'image', source: { type: 'base64', media_type: parsed.mediaType, data: parsed.data } })
    }
  }
  return blocks
}
```

- 正确处理 text + image 两种内容块
- 非图片类型被跳过（warn logged）

**2. parseBase64DataUrl()**

```typescript
function parseBase64DataUrl(url: string): { mediaType: string; data: string } | null {
  const match = url.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return null
  return { mediaType: match[1], data: match[2] }
}
```

- 正确解析 data URL 格式

**3. Always streaming mode** — `packages/server/src/agent/claude-code/handler.ts`

```typescript
const sdkQuery = query({
  prompt: createUserMessageGenerator(contentBlocks),
  options: options as Parameters<typeof query>[0]['options'],
})
```

- 使用 AsyncGenerator `createUserMessageGenerator` 作为 prompt 输入
- 始终使用 streaming input mode 以支持多模态内容（文本 + 图片）

**4. SDKContentBlock types**

```typescript
export type SDKTextBlock = { type: 'text'; text: string }
export type SDKImageBlock = {
  type: 'image'
  source: { type: 'base64'; media_type: string; data: string }
}
export type SDKContentBlock = SDKTextBlock | SDKImageBlock
```

**5. executor.ts** — Cron Jobs 使用 contentBlocks:

```typescript
const contentBlocks: SDKContentBlock[] = [{ type: 'text', text: userContent }]
const sdkResult = await handleClaudeCodeStream({ agent, contentBlocks, ... }, noopWriter)
```

**验证结果**: 通过。

---

### A5: Built-in Tools (Bash, Browser, Task) ✅

**文件**: `packages/server/src/agent/claude-code/config-mapper.ts`

```typescript
const BUILTIN_TOOL_MAP: Record<string, string[]> = {
  bash: ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep'],
  browser: ['WebFetch', 'WebSearch'],
  task: ['Task'],
}
```

- Golemancy 的 `bash` → SDK 的文件操作工具集
- Golemancy 的 `browser` → SDK 的 Web 工具
- Golemancy 的 `task` → SDK 的 Task 工具
- 在 `buildSdkOptions()` 中遍历 `agent.builtinTools` 映射到 `allowedTools`

**验证结果**: 通过。

---

### A6: Skills ✅

**1. ProjectConfig.skillIds** — `packages/shared/src/types/settings.ts`

```typescript
export interface ProjectConfig {
  maxConcurrentAgents: number
  permissionsConfigId?: PermissionsConfigId
  agentRuntime?: AgentRuntime
  skillIds?: SkillId[]  // ← 新增
}
```

**2. Symlink 创建** — `packages/server/src/agent/claude-code/skills-sync.ts`

```typescript
export async function syncSkillsToSdkDir(
  projectId: string, skillIds: string[], workspaceDir: string,
): Promise<{ cleanup: () => Promise<void> }> {
  const sdkSkillsDir = path.join(workspaceDir, '.claude', 'skills')
  // 清理旧 symlinks → 创建新 symlinks → 返回 cleanup 函数
}
```

- 创建 `{workspace}/.claude/skills/{skillId}` → `{projectSkillsDir}/{skillId}` 的 symlink
- 清理旧 session 遗留的 symlinks
- 返回 cleanup 函数在 chat 结束后清理

**3. config-mapper settingSources + Skill allowedTool**

```typescript
if (params.hasSkills) {
  options.settingSources = ['project']
  if (!allowedTools.includes('Skill')) {
    allowedTools.push('Skill')
  }
}
```

- 设置 `settingSources: ['project']` 让 SDK 从文件系统发现 skills
- 添加 `Skill` 到 allowedTools

**4. chat-claude-code.ts — 懒迁移 fallback**

```typescript
const skillIds = project?.config?.skillIds?.length
  ? project.config.skillIds
  : (agent.skillIds ?? [])
```

- Project-level skillIds 优先
- 如果 project 级别为空，fallback 到 agent.skillIds (兼容迁移)

**5. chat.ts — standard 路径**

```typescript
const skillIds = project?.config?.skillIds?.length
  ? (project.config.skillIds as string[])
  : undefined
```

- Standard 路径同样优先使用 project-level skillIds

**6. loadAgentTools — skillIds 参数**

```typescript
const effectiveSkillIds = params.skillIds ?? (agent.skillIds?.length ? agent.skillIds : [])
```

- 接受外部传入的 `skillIds` 参数
- Fallback 到 `agent.skillIds`

**验证结果**: 通过。完整的三层 fallback (project → agent → empty) 在 chat-claude-code.ts, chat.ts, executor.ts, tools.ts 中一致。

---

### A7: MCP ✅

**1. MCP 配置转换** — `packages/server/src/agent/claude-code/mcp-adapter.ts`

```typescript
export function convertMcpServers(configs: MCPServerConfig[]): Record<string, SdkMcpServerConfig> {
  // 支持 stdio / sse / http 三种传输类型
  // 过滤 enabled=false 的服务器
  // 保留 command, args, env (stdio) / url, headers (sse/http)
}
```

**2. chat-claude-code.ts — mcpConfigs 加载**

```typescript
const mcpConfigs = agent.mcpServers?.length > 0
  ? await deps.mcpStorage.resolveNames(projectId as ProjectId, agent.mcpServers)
  : []
```

- 通过 `resolveNames` 将名称引用解析为完整配置

**3. config-mapper — MCP allowedTools wildcard**

```typescript
for (const serverName of Object.keys(sdkMcpServers)) {
  allowedTools.push(`mcp__${serverName}__*`)
}
```

- 为每个 MCP 服务器添加 wildcard 工具权限

**验证结果**: 通过。

---

### A8: Sub-Agents ✅

**文件**: `packages/server/src/agent/claude-code/config-mapper.ts`

```typescript
if (agent.subAgents?.length > 0) {
  if (!allowedTools.includes('Task')) {
    allowedTools.push('Task')
  }
  const agents: Record<string, SdkAgentDefinition> = {}
  for (const ref of agent.subAgents) {
    const subAgent = agentMap.get(ref.agentId)
    if (!subAgent) continue
    agents[subAgent.name] = {
      description: subAgent.description || `Sub-agent: ${subAgent.name}`,
      prompt: subAgent.systemPrompt || '',
      tools: subAgentTools,    // 映射 builtinTools → SDK 工具名
      model: normalizeModel(subAgent.modelConfig?.model),
    }
  }
  options.agents = agents
}
```

- Sub-agent 映射包含 description, prompt, tools, model
- 自动添加 Task tool 以允许调用 sub-agents
- Sub-agent 的 builtinTools 也通过 BUILTIN_TOOL_MAP 转换

**验证结果**: 通过。

---

### A9: Token 追踪 ✅

**1. chat-claude-code.ts — tokenRecordStorage.save**

```typescript
deps.tokenRecordStorage.save(projectId as ProjectId, {
  conversationId, agentId, provider: 'anthropic',
  model: agent.modelConfig?.model ?? 'claude-code',
  inputTokens, outputTokens, source: 'chat',
})
```

**2. data-usage 事件发送**

```typescript
writer.write({
  type: 'data-usage' as `data-${string}`,
  data: { inputTokens, outputTokens },
})
```

**3. SSE adapter — usage 数据提取**

```typescript
function processResultMessage(msg, writer, state) {
  if (msg.modelUsage) {
    for (const usage of Object.values(msg.modelUsage)) {
      inputTokens += usage.inputTokens ?? 0
      outputTokens += usage.outputTokens ?? 0
    }
  } else if (msg.usage) {
    inputTokens = msg.usage.input_tokens ?? 0
    outputTokens = msg.usage.output_tokens ?? 0
  }
  state.inputTokens = inputTokens
  state.outputTokens = outputTokens
  writer.write({ type: 'data-usage', data: { inputTokens, outputTokens, durationMs, costUsd, numTurns } })
}
```

- 优先从 `modelUsage` 聚合（多模型场景），fallback 到 `usage`

**验证结果**: 通过。token 追踪覆盖了 result 事件提取 + 持久化 + SSE 推送。

---

### A10: Agent 状态 ✅

**文件**: `packages/server/src/routes/chat-claude-code.ts`

```typescript
// Mark running
deps.activeChatRegistry.register(chatConvId, { agentId, projectId })
await deps.agentStorage.update(projectId, agentId, { status: 'running' })
deps.wsManager.emit(`project:${projectId}`, { event: 'agent:status_changed', agentId, status: 'running' })
deps.wsManager.emit(`project:${projectId}`, { event: 'runtime:chat_started', ... })

// Mark idle (with reference counting)
const markChatEnded = async () => {
  deps.activeChatRegistry.unregister(chatConvId)
  const remaining = deps.activeChatRegistry.countByAgent(agentId)
  if (remaining === 0) {
    await deps.agentStorage.update(projectId, agentId, { status: 'idle' })
    deps.wsManager.emit(...)  // agent:status_changed → idle
  }
  deps.wsManager.emit(...) // runtime:chat_ended
}
```

- 使用 `activeChatRegistry` 进行引用计数
- 只在最后一个 chat 结束时才标记 idle
- WS 事件推送状态变更

**验证结果**: 通过。

---

### A11: 消息存储 ✅

**文件**: `packages/server/src/routes/chat-claude-code.ts`

**User 消息**:
```typescript
await deps.conversationStorage.saveMessage(projectId, conversationId, {
  id: lastUserMsg.id, role: 'user', parts: extractedParts, content: userTextContent,
})
```

**Assistant 消息**:
```typescript
await deps.conversationStorage.saveMessage(projectId, conversationId, {
  id: assistantMsgId, role: 'assistant',
  parts: [{ type: 'text', text: displayText }],
  content: displayText, inputTokens, outputTokens,
  provider: 'anthropic', model: agent.modelConfig?.model ?? 'claude-code',
})
```

- User 消息在 streaming 之前保存
- Assistant 消息在 SDK 完成后保存
- 两者都通过 `extractUploads` 处理上传内容

**验证结果**: 通过。

---

### A12: Session 管理 (sdkSessionId) ✅

**1. 读取 sdkSessionId**

```typescript
let sdkSessionId: string | undefined
if (conversationId) {
  const conv = await deps.conversationStorage.getById(...)
  sdkSessionId = conv?.sdkSessionId
}
```

**2. 传递给 SDK (via config-mapper)**

```typescript
if (sdkSessionId) {
  options.resume = sdkSessionId
}
```

**3. 更新 sdkSessionId**

```typescript
if (newSessionId) {
  const storage = deps.conversationStorage as ConversationStorageWithSdk
  if (typeof storage.updateSdkSessionId === 'function') {
    await storage.updateSdkSessionId(projectId, conversationId, newSessionId)
  }
}
```

**4. Storage 实现**

```typescript
async updateSdkSessionId(projectId, conversationId, sessionId) {
  await db.update(schema.conversations)
    .set({ sdkSessionId: sessionId, updatedAt: now })
    .where(...)
}
```

**5. Session ID 提取 (SSE adapter)**

```typescript
if (msg.subtype === 'init') {
  if (msg.session_id) {
    state.sessionId = msg.session_id
    writer.write({ type: 'data-session', data: { sessionId: msg.session_id, ... } })
  }
}
```

**验证结果**: 通过。session 读取 → 传递 → 提取 → 更新全链路正确。

---

### A13: FTS 搜索 ✅

**文件**: `packages/server/src/routes/chat-claude-code.ts`

```typescript
const userTextContent = contentBlocks
  .filter((b): b is SDKTextBlock => b.type === 'text')
  .map(b => b.text)
  .join('\n')
```

- User 消息的 content 字段是纯文本（从 contentBlocks 中过滤 text 类型）
- Assistant 消息的 content 字段是 `responseText`（纯文本）
- 这些 content 字段用于 FTS5 索引（`messages.content` 列）

**文件**: `packages/server/src/db/schema.ts`

```typescript
content: text('content').notNull().default(''), // plain text for FTS
```

**验证结果**: 通过。

---

### A14: Cron Jobs ✅

**文件**: `packages/server/src/scheduler/executor.ts` — `executeClaudeCode()`

完整的 Cron Job Claude Code 执行流程:
1. 创建 conversation (runtime: `'claude-code'`)
2. 构建 user message
3. 解析 MCP configs
4. 解析 skillIds (project → agent fallback)
5. 设置 workspace directory
6. 同步 skills 到 SDK filesystem
7. 解析 permission mode
8. 创建 no-op writer (cron 不推流)
9. 调用 `handleClaudeCodeStream`
10. 清理 skill symlinks
11. 保存 assistant message
12. 保存 token record
13. 更新 run 状态
14. 更新 cronJob 元数据
15. 标记 agent idle

**验证结果**: 通过。`executeClaudeCode()` 覆盖了所有必要步骤，与 chat-claude-code.ts 路径一致。

---

### A15: Permissions ✅

**1. chat-claude-code.ts — resolvePermissionsConfig**

```typescript
const resolved = await resolvePermissionsConfig(
  deps.permissionsConfigStorage, projectId,
  project?.config?.permissionsConfigId, workspaceDir, platform,
)
permissionMode = resolved.mode
```

**2. config-mapper.ts — mapPermissionMode**

```typescript
function mapPermissionMode(mode?: PermissionMode | string): SdkPermissionMode {
  switch (mode) {
    case 'restricted':   return 'plan'
    case 'sandbox':      return 'default'
    case 'unrestricted': return 'bypassPermissions'
    default:             return 'default'
  }
}
```

- Golemancy `restricted` → SDK `plan` (只读)
- Golemancy `sandbox` → SDK `default`
- Golemancy `unrestricted` → SDK `bypassPermissions` + `allowDangerouslySkipPermissions: true`

**验证结果**: 通过。

---

### A16: Artifacts ✅

SDK 不支持 Artifact 功能（P2 延后处理）。当前代码中没有 artifact 相关的 claude-code 路径，这是预期行为。

**验证结果**: 通过（确认不处理）。

---

### A17: Memory ✅

**文件**: `packages/server/src/storage/memories.ts` — `FileMemoryStorage`

Memory 是基于文件系统的存储，与 runtime 选择完全无关:
- 不在 chat 路径中
- 不依赖于 conversation 或 agent runtime
- 两种 runtime 共享同一个 memory 存储

chat-claude-code.ts 中没有任何 memory 相关代码，memory 的读写在独立的 REST 路由中处理。

**验证结果**: 通过。

---

### B18: Global Settings UI ✅

**文件**: `packages/ui/src/pages/settings/GlobalSettingsPage.tsx`

```typescript
const SETTINGS_TABS = [
  { id: 'general', label: 'General' },
  { id: 'runtime', label: 'Runtime' },
  { id: 'speech', label: 'Speech' },
]
```

- 3 个 tab: General, Runtime, Speech
- `GeneralTab`: 主题选择 (Light/Dark/System)
- `RuntimeTab`: Runtime 选择卡片 (Standard/Claude Code) + 条件渲染:
  - Standard 选中时显示 `ProvidersSection` (inline)
  - Claude Code 选中时显示连接测试

```typescript
{current === 'standard' && <ProvidersSection settings={settings} onUpdate={onUpdate} />}
{current === 'claude-code' && <PixelCard>CONNECTION TEST...</PixelCard>}
```

- `ProvidersSection` 是 inline 组件（非独立 tab），包含 Default Model + Provider Cards

**验证结果**: 通过。三个 tab + ProvidersSection 在 Runtime tab 内 inline 显示。

---

### B19: Project Settings UI ✅

**文件**: `packages/ui/src/pages/project/ProjectSettingsPage.tsx`

```typescript
const SETTINGS_TABS = [
  { id: 'general', label: 'General' },
  { id: 'agent', label: 'Agent' },
  { id: 'permissions', label: 'Permissions' },
]
```

**AgentTab 内容**:
```typescript
function AgentTab({ ... }) {
  return (
    <div className="flex flex-col gap-4">
      <ProjectRuntimeSection projectConfig={project.config} projectId={projectId} />
      <PixelCard>MAIN AGENT...</PixelCard>
    </div>
  )
}
```

- Runtime 在 AgentTab 中，位于 MAIN AGENT 之前

**ProjectRuntimeSection**:
```typescript
const globalRuntime: AgentRuntime = settings?.agentRuntime ?? 'standard'
const current: AgentRuntime = projectConfig.agentRuntime ?? globalRuntime
```

- 无 "Inherit" 选项 — 只有 Standard 和 Claude Code 两个选择
- 默认值从 global runtime fallback，但没有独立的 inherit 选项
- 使用 `grid-cols-2` 布局

```typescript
<div className="grid grid-cols-2 gap-3">
```

**验证结果**: 通过。Runtime 在 AgentTab，没有 Inherit 选项，grid-cols-2 布局。

---

### B20: Agent Detail 条件渲染 ✅

**文件**: `packages/ui/src/pages/agent/AgentDetailPage.tsx`

**SkillsTab**:
```typescript
{isClaudeCode && (
  <PixelCard variant="outlined" className="mb-4 border-accent-blue bg-accent-blue/5">
    <p>Skills are managed at the Project level. In Claude Code mode, skills are synced to the SDK's filesystem for native discovery.</p>
  </PixelCard>
)}
```

**ToolsTab**:
```typescript
{isClaudeCode && (
  <PixelCard variant="outlined" className="mb-4 border-accent-blue bg-accent-blue/5">
    <p>Claude Code runtime manages its own tools (Bash, Read, Write, Grep, etc.). The settings below are for standard runtime only.</p>
  </PixelCard>
)}
```

**SubAgentsTab**:
```typescript
{isClaudeCode && (
  <PixelCard variant="outlined" className="mb-4 border-accent-blue bg-accent-blue/5">
    <p>Claude Code runtime handles sub-agent orchestration internally via the Agent SDK. The settings below are for standard runtime only.</p>
  </PixelCard>
)}
```

**ModelConfigTab**:
- Claude Code 模式下显示 sonnet/opus/haiku 下拉框
- 隐藏 compact threshold 控件 (`!isClaudeCode && <CompactThresholdControl>`)

**验证结果**: 通过。所有相关 Tab 都有 claude-code info card 提示用户。

---

## 总结

所有 20 个验证点（A1-A17 + B18-B20）均通过源码审查验证。实现与需求一致，关键发现:

1. **数据一致性**: runtime 从 shared types → DB schema → migration → storage → routes → UI 全链路正确
2. **降级兼容**: skillIds 的三层 fallback (project → agent → empty) 在所有入口一致
3. **SDK 适配层**: sse-adapter.ts 正确桥接了 SDK 消息格式到 UIMessageStream
4. **权限映射**: 三种 Golemancy 权限模式正确映射到 SDK 权限模式
5. **Cron Jobs**: executeClaudeCode 完整镜像了 chat-claude-code.ts 的功能

**无发现问题**。代码质量良好，架构清晰。
