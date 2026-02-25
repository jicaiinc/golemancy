# Code Review 报告

## 总结
- 审查文件数：22
- 发现问题数：12 (Critical: 1, Major: 5, Minor: 6)
- 整体评价：代码整体质量较高，架构清晰，命名规范一致。Runtime 分支逻辑、数据迁移、UI 联动实现完整。存在 1 个安全问题（skills-sync 路径注入）、若干性能重复查询问题、和一些边界处理不足。

---

## 问题列表

### [Critical] skills-sync.ts: skillId 未校验可导致路径遍历
- **文件**: `packages/server/src/agent/claude-code/skills-sync.ts:42-48`
- **类型**: Security
- **描述**: `syncSkillsToSdkDir()` 接收 `skillIds: string[]` 参数，直接用 `path.join(projectSkillsDir, skillId)` 和 `path.join(sdkSkillsDir, skillId)` 拼接路径。虽然 `getProjectPath(projectId)` 内部调用了 `validateId()` 校验 projectId，但 **skillId 完全未校验**。如果 skillId 包含 `../../` 等路径遍历字符，`path.join()` 会将其解析为父目录。攻击者可以构造恶意 skillId 将 symlink 指向任意目录，例如 `../../../etc`。由于后续调用 `fs.symlink(source, target, 'dir')`，这将在 workspace 中创建指向系统敏感路径的符号链接，SDK 子进程可能读写这些路径。
- **建议修复**:
  ```typescript
  // 在循环前校验 skillId
  for (const skillId of skillIds) {
    if (!/^[a-z]+-[A-Za-z0-9_-]+$/.test(skillId)) {
      log.warn({ skillId, projectId }, 'invalid skillId format, skipping')
      continue
    }
    // 或使用 path.resolve + startsWith 检查
    const source = path.join(projectSkillsDir, skillId)
    const resolved = path.resolve(source)
    if (!resolved.startsWith(path.resolve(projectSkillsDir) + path.sep)) {
      log.warn({ skillId, projectId }, 'path traversal detected in skillId, skipping')
      continue
    }
    // ... rest of symlink logic
  }
  ```

---

### [Major] sse-adapter.ts: globalPartCounter 模块级变量在并发请求间共享
- **文件**: `packages/server/src/agent/claude-code/sse-adapter.ts:107-110`
- **类型**: Quality / Performance
- **描述**: `globalPartCounter` 是模块级变量，在所有并发 Claude Code chat 请求间共享。虽然 Node.js 是单线程的所以不会出现竞态条件，但这意味着 part ID 不再是每个会话独立递增的 —— 如果两个并发 chat 流同时运行，它们会交替消费 counter，导致 part ID 不连续。更重要的是，这个 counter 在服务器整个生命周期内持续递增、永不重置，长期运行可能产生非常大的数字（虽然 JS number 精度足够，但这是一个设计隐患）。
- **建议修复**: 将 counter 移入 `SseAdapterState` 中（已有 `textPartCounter` 字段但未使用），用 state 级别的 counter 生成 part ID，确保每个会话独立计数。

---

### [Major] executor.ts: executeClaudeCode() 内 projectStorage.getById() 被调用 3 次
- **文件**: `packages/server/src/scheduler/executor.ts:83,330,356`
- **类型**: Performance
- **描述**: 在 `execute()` 方法中，`this.deps.projectStorage.getById(projectId)` 在第 83 行被调用获取 project（用于 runtime 判断）。然后在 `executeClaudeCode()` 中又在第 330 行获取 `ccProject`（用于 skillIds），第 356 行再次获取 `project`（用于 permissions）。这 3 次查询针对同一个 projectId，完全可以复用。虽然 file-based storage 有 OS 级文件缓存，但这仍然是不必要的 I/O 开销。
- **建议修复**: 将第 83 行获取的 `project` 对象作为参数传入 `executeClaudeCode()` 方法，避免重复查询。

---

### [Major] chat.ts: runtime 校验时重复查询 conversation
- **文件**: `packages/server/src/routes/chat.ts:82-86,114-124`
- **类型**: Performance
- **描述**: 在第 82-86 行，已经通过 `deps.conversationStorage.getById()` 查询了 conversation 用于获取 agentId。然后在第 114-124 行的 runtime lock 检查中，又对同一个 conversationId 执行了一次完全相同的 `getById()` 查询。这是同一个函数内对同一 conversationId 的冗余数据库查询。
- **建议修复**: 复用第一次查询的结果。例如将第一次查询的 conv 赋给一个可复用的变量：
  ```typescript
  let conv: Conversation | null = null
  if (conversationId) {
    conv = await deps.conversationStorage.getById(projectId as ProjectId, conversationId as ConversationId)
    if (conv) agentId = conv.agentId
  }
  // ... later in runtime check
  if (conv && conv.runtime !== agentRuntime) { ... }
  ```

---

### [Major] handler.ts: `message as never` 类型强转隐藏类型不匹配
- **文件**: `packages/server/src/agent/claude-code/handler.ts:133`
- **类型**: Quality
- **描述**: `state = processSdkMessage(message as never, writer, state)` 中使用 `as never` 强转绕过类型检查。这掩盖了 SDK `query()` 返回的实际 message 类型与 `SdkMessage` 接口之间可能存在的不匹配。如果 SDK 升级后 message 结构变化，编译器不会给出任何警告。
- **建议修复**: 定义更精确的类型映射，或者至少使用 `as SdkMessage` 而非 `as never`，这样当 `SdkMessage` 缺少必要字段时编译器仍能提供部分类型保护。

---

### [Major] skills-sync.ts: 并发对话共享 `.claude/skills/` 目录的竞态条件
- **文件**: `packages/server/src/agent/claude-code/skills-sync.ts:26-35,57-73`
- **类型**: Performance / Quality
- **描述**: 多个并发对话（或 cron job）可能同时操作同一个 `{workspace}/.claude/skills/` 目录。第 28-35 行在同步开始时会清除所有现有 symlink，然后重新创建。如果两个对话并发执行：
  1. 对话 A 清除所有 symlink
  2. 对话 B 清除所有 symlink
  3. 对话 A 创建 symlink
  4. 对话 B 清除对话 A 刚创建的 symlink（cleanup）
  5. 对话 A 的 SDK 进程发现 skills 目录为空

  cleanup 函数也存在类似问题 —— 对话 A 的 cleanup 可能删除对话 B 正在使用的 symlink。
- **建议修复**: 使用会话级别的子目录（如 `{workspace}/.claude/skills-{conversationId}/`），或者引入引用计数机制。至少在 cleanup 中应该只删除自己创建的 symlink（可以通过记录 createdLinks 集合来实现）。

---

### [Minor] chat-claude-code.ts: `throw new Error('No user message found')` 未被 HTTP error handler 捕获
- **文件**: `packages/server/src/routes/chat-claude-code.ts:114-115`
- **类型**: Quality
- **描述**: 当 `lastUserMsg` 为 null 时，直接 throw Error。这个错误会被 Hono 的全局错误处理器捕获返回 500，但返回信息不够明确。更好的做法是返回 400 Bad Request。
- **建议修复**:
  ```typescript
  if (!lastUserMsg) {
    return c.json({ error: 'No user message found in request' }, 400)
  }
  ```
  注意：当前函数签名不接收 `c` 的完整类型，只接收 `{ req: { raw: { signal } } }`。要返回 JSON 响应需要调整调用方式或在 caller 中处理。

---

### [Minor] config-mapper.ts: `hasSkills` 参数被解构但未从 params 中使用
- **文件**: `packages/server/src/agent/claude-code/config-mapper.ts:96`
- **类型**: Quality
- **描述**: 第 96 行的解构赋值 `const { agent, systemPrompt, cwd, permissionMode, allAgents, mcpConfigs, sdkSessionId } = params` 没有解构 `hasSkills`，但后面第 174 行使用的是 `params.hasSkills`。虽然功能正确，但风格不一致 —— 其他字段都通过解构获取。
- **建议修复**: 在解构中加入 `hasSkills`：`const { ..., sdkSessionId, hasSkills } = params`

---

### [Minor] executor.ts: noopWriter 类型强转 `as unknown as UIMessageStreamWriter`
- **文件**: `packages/server/src/scheduler/executor.ts:371-374`
- **类型**: Quality
- **描述**: cron job 的 claude-code 分支创建了一个 no-op writer `{ write: () => {}, merge: () => {} } as unknown as UIMessageStreamWriter`。双重类型强转表明实际对象不满足 `UIMessageStreamWriter` 接口。如果 SDK 或 handler 内部调用了 writer 的其他方法（如 `close()`），会导致运行时错误。
- **建议修复**: 要么完整实现所有 `UIMessageStreamWriter` 需要的方法，要么将 handler 改为接受可选 writer 或更窄的接口类型。

---

### [Minor] GlobalSettingsPage.tsx: Runtime tab 和 Providers section 无需额外 tab
- **文件**: `packages/ui/src/pages/settings/GlobalSettingsPage.tsx:10-14`
- **类型**: Quality
- **描述**: 将 Runtime 作为独立 tab（3 个 tab: General / Runtime / Speech）是合理的设计。但 `ProvidersSection` 组件是嵌套在 `RuntimeTab` 内部有条件渲染的。当用户从 `claude-code` 切回 `standard` 时，Providers section 会重新挂载，任何正在编辑的 provider 状态会丢失。这是一个 UX 上的小问题，不影响功能正确性。
- **建议修复**: 可以考虑将 ProvidersSection 的 editing 状态提升到 RuntimeTab 层级以避免状态丢失，或在切换前提示用户保存。低优先级。

---

### [Minor] conversation.ts 类型: `Conversation.runtime` 是必选字段但旧数据可能缺失
- **文件**: `packages/shared/src/types/conversation.ts:34`
- **类型**: Quality
- **描述**: `Conversation` 接口中 `runtime: AgentRuntime` 是必选字段。`rowToConversation()` 使用 `(row.runtime ?? 'standard') as AgentRuntime` 做了兜底处理，这是正确的。但 Mock service 的 `SEED_CONVERSATIONS` 数据也需要包含 `runtime` 字段。如果 SEED 数据中遗漏了 `runtime`，TypeScript 编译会报错，所以实际上这已经被类型系统保护了。不过在接口层面将其标记为可选 `runtime?: AgentRuntime` 并在使用处默认化可能更安全。
- **建议修复**: 保持现状即可。`rowToConversation()` 的兜底处理已经足够，TypeScript 编译时会强制要求 seed data 包含此字段。确认通过。

---

### [Minor] chat.ts: runtime mismatch 错误信息泄露内部 runtime 名称
- **文件**: `packages/server/src/routes/chat.ts:120-122`
- **类型**: Security (Low)
- **描述**: 错误信息 `Runtime mismatch: conversation was created with "${conv.runtime}" runtime, but current runtime is "${agentRuntime}"` 向客户端暴露了内部 runtime 类型名称（`standard`/`claude-code`）。虽然这些不是敏感信息，且 API 只绑定 127.0.0.1 本地访问，安全影响很小。但作为最佳实践，服务端错误信息不应暴露过多实现细节。
- **建议修复**: 可以简化为 `"Runtime configuration has changed since this conversation was created. Please create a new conversation."`。低优先级，因为本应用仅本地运行。

---

## 无问题确认（通过审查）

### 核心后端

- **`packages/server/src/agent/claude-code/handler.ts`**: SDKContentBlock 类型定义清晰。contentBlocks 参数设计合理，支持多模态。错误处理完整（try-catch + writer.write error）。abort signal 正确传递。除 `as never` 类型问题外无其他问题。

- **`packages/server/src/agent/claude-code/config-mapper.ts`**: model 校验逻辑正确（normalizeModel fallback to sonnet）。permission mode 映射完整。sub-agent 映射逻辑正确。`settingSources: ['project']` 启用 SDK 原生 skill 发现。`hasSkills` 条件正确添加 Skill tool。

- **`packages/server/src/agent/claude-code/sse-adapter.ts`**: SSE 事件映射全面。sub-agent 事件处理正确区分 `parent_tool_use_id`。result message 的 usage 聚合逻辑正确（优先 modelUsage，fallback 到 top-level usage）。compact boundary 和 status 事件正确转发。整体设计"zero frontend changes"目标实现良好。

- **`packages/server/src/routes/chat-claude-code.ts`**: extractContentParts 正确处理 text 和 image 类型。base64 data URL 解析安全（regex 匹配）。sdkSessionId 更新使用 duck-typing 检查 `typeof storage.updateSdkSessionId === 'function'`，向后兼容。skill cleanup 在 finally-like 位置调用（stream execute 末尾），即使 SDK 报错也会执行。

- **`packages/server/src/agent/resolve-runtime.ts`**: 三层级联解析逻辑简洁正确：`projectConfig?.agentRuntime ?? settings.agentRuntime ?? 'standard'`。

### 数据层

- **`packages/shared/src/types/conversation.ts`**: `Conversation.runtime` 字段添加正确。类型引用 `AgentRuntime` 保持类型安全。

- **`packages/shared/src/types/settings.ts`**: `ProjectConfig.skillIds` 添加正确（可选字段 `SkillId[]`）。`AgentRuntime` 和 `ClaudeCodeModel` 类型定义位置合理。

- **`packages/shared/src/services/interfaces.ts`**: `IConversationService.create()` 添加可选 `runtime` 参数，向后兼容。

- **`packages/server/src/db/schema.ts`**: `runtime` 列定义正确（`text('runtime').notNull().default('standard')`）。

- **`packages/server/src/db/migrate.ts`**: Migration v8 使用 `ALTER TABLE ... ADD COLUMN runtime TEXT NOT NULL DEFAULT 'standard'` 安全。先检查列是否存在再添加，幂等操作。SQL 中无用户输入，无注入风险。

- **`packages/server/src/storage/conversations.ts`**: `create()` 方法正确接收 `runtime` 参数并写入数据库。`rowToConversation()` 使用 `row.runtime ?? 'standard'` 兼容旧数据。`updateSdkSessionId()` 方法实现安全。

- **`packages/server/src/storage/settings.ts`**: 无变更需要审查。

### UI

- **`packages/ui/src/pages/settings/GlobalSettingsPage.tsx`**: 3 tab 结构清晰（General / Runtime / Speech）。Runtime tab 正确条件渲染 Providers section。Claude Code 连接测试 UI 完整。

- **`packages/ui/src/pages/project/ProjectSettingsPage.tsx`**: `ProjectRuntimeSection` 在 AgentTab 中正确放置（MAIN AGENT 之前）。两列网格布局。不含 Inherit 选项（直接从 global 继承默认值）。`current` 变量正确使用 `projectConfig.agentRuntime ?? globalRuntime`。

- **`packages/ui/src/pages/agent/AgentDetailPage.tsx`**: Skills tab 中 Claude Code 模式提示信息正确。Tools 和 Sub-Agents tab 中也有相应的 Claude Code 信息卡。Model Config tab 根据 runtime 切换显示 standard providers 或 Claude Code model 选择。

- **`packages/ui/src/pages/chat/ChatPage.tsx`**: `handleNewChat` 正确传递 `agentRuntime`。`handleSwitchAgent` 也传递 runtime。compact 相关 UI 在 claude-code 模式下正确隐藏。

- **`packages/ui/src/pages/chat/ChatWindow.tsx`**: compact 事件处理正确。SDK compact boundary 合成为 CompactRecord。

- **`packages/ui/src/stores/useAppStore.ts`**: `createConversation` action 正确传递可选 `runtime` 参数。

- **`packages/ui/src/services/http/services.ts`**: `HttpConversationService.create()` 正确传递 `runtime` 到 HTTP body。

- **`packages/ui/src/services/mock/services.ts`**: `MockConversationService.create()` 正确使用 `runtime ?? 'standard'` 默认值。

- **`packages/ui/src/hooks/index.ts`**: `useAgentRuntime()` hook 正确实现三层级联解析。

- **`packages/shared/src/constants/index.ts`**: `CLAUDE_CODE_MODELS` 和 `DEFAULT_CLAUDE_CODE_MODEL` 定义正确。

- **`packages/server/src/agent/tools.ts`**: `skillIds` 参数正确传递到 `loadAgentSkillTools()`。fallback 逻辑 `params.skillIds ?? (agent.skillIds?.length ? agent.skillIds : [])` 正确。

---

## 审查小结

### 必须修复
1. **[Critical]** skills-sync.ts 中 skillId 路径遍历漏洞 —— 在创建 symlink 前必须校验 skillId 格式或 resolve 后检查路径是否越界。

### 建议修复
2. **[Major]** sse-adapter globalPartCounter 应改为 per-session 计数
3. **[Major]** executor.ts 中 project 重复查询 3 次应复用
4. **[Major]** chat.ts 中 conversation 重复查询应复用
5. **[Major]** handler.ts 中 `as never` 应改为 `as SdkMessage`
6. **[Major]** skills-sync.ts 并发竞态应使用会话级子目录或引用计数

### 可选改进
7-12. 各 Minor 级别问题，不影响功能正确性，可在后续迭代中改进。
