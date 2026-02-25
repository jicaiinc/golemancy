# 功能验证点清单 + 验收标准

> 基于需求文档 `_requirement/20260225-1800-runtime-verification-and-fix.md`
> 分析日期：2026-02-25

---

## A. 功能验证（A1–A17）

### A1. Runtime 切换机制验证

| 项目 | 内容 |
|------|------|
| **验收标准** | 1. Global Settings 可以切换 Standard ↔ Claude Code<br>2. Project Settings 可以覆盖 Global Runtime<br>3. 切换后，新对话正确路由到对应处理器（standard → `streamText`，claude-code → `handleClaudeCodeChat`）<br>4. `resolveAgentRuntime()` 三级级联正确：Project → Global → 'standard' |
| **当前状态** | ✅ 已实现 |
| **相关文件** | `packages/server/src/agent/resolve-runtime.ts:9-14` — 三级级联逻辑<br>`packages/server/src/routes/chat.ts:111-117` — 分流逻辑<br>`packages/shared/src/types/settings.ts:29,44,51` — `AgentRuntime` 类型定义<br>`packages/ui/src/hooks/index.ts:102-107` — `useAgentRuntime()` 前端 hook |
| **测试用例** | **Unit**: resolveAgentRuntime 三种组合测试（project 覆盖、global 生效、默认值）<br>**E2E**: 切换 Global Runtime 后新建对话确认路由 |
| **优先级** | P0 |

---

### A2. Conversation Runtime 锁定

| 项目 | 内容 |
|------|------|
| **验收标准** | 1. 对话创建时记录当前 Runtime（`standard` 或 `claude-code`）到 Conversation 记录<br>2. 后续消息发送时校验 Conversation 的 Runtime 与当前请求一致<br>3. 如果 Runtime 不匹配，返回错误提示（不允许混用）<br>4. UI 上展示当前对话的 Runtime 标识 |
| **当前状态** | ❌ 需修复 — DB schema `conversations` 表无 `runtime` 字段，当前无任何锁定逻辑 |
| **相关文件** | `packages/server/src/db/schema.ts:3-12` — conversations 表（缺少 runtime 列）<br>`packages/shared/src/types/conversation.ts:28-37` — Conversation 类型（缺少 runtime 字段）<br>`packages/server/src/storage/conversations.ts:51` — create 方法（需加 runtime 参数）<br>`packages/server/src/routes/chat.ts:111-117` — 分流处需加校验 |
| **测试用例** | **Unit**: 1. 创建 conversation 时 runtime 字段被正确写入<br>2. 消息请求时 runtime 不匹配返回 400 错误<br>**E2E**: 在 claude-code 对话中切换到 standard 后尝试继续对话应报错 |
| **优先级** | P0 |

---

### A3. Compact 功能验证

| 项目 | 内容 |
|------|------|
| **验收标准** | 1. Claude Code 模式下 `/compact` 命令正常工作（SDK 内置处理）<br>2. SDK 自动 Compact 时，UI 通过 `data-compact` SSE 事件正确显示 Compacting 状态<br>3. `CompactBoundary` 组件在 Claude Code 对话中正确渲染<br>4. Standard 模式的 CompactThreshold 自动 Compact 不受影响<br>5. Claude Code 模式下隐藏 CompactThreshold 设置和手动 Compact Now 按钮 |
| **当前状态** | ⚠️ 部分实现 — UI 已隐藏 CompactThreshold（`ChatPage.tsx:186`），但需验证 SDK data-compact 事件是否正确传递 |
| **相关文件** | `packages/ui/src/pages/chat/ChatPage.tsx:183-186` — isClaudeCode 时隐藏 compactThreshold<br>`packages/ui/src/pages/chat/ChatWindow.tsx:143-146` — `data-compact` 事件处理<br>`packages/ui/src/pages/chat/ChatWindow.tsx:368-372` — CompactBoundary 渲染<br>`packages/ui/src/pages/chat/ChatPage.tsx:257` — StatusBar onCompactNow 为 undefined |
| **测试用例** | **Unit**: 1. ChatPage isClaudeCode 时 compactThreshold 为 null<br>2. StatusBar onCompactNow 为 undefined 时不显示 Compact 按钮<br>**E2E**: 1. Claude Code 模式发送 `/compact` 验证响应<br>2. Standard 模式手动 Compact 仍然可用 |
| **优先级** | P1 |

---

### A4. 图片上传验证

| 项目 | 内容 |
|------|------|
| **验收标准** | 1. 确认 Agent SDK `query()` 是否支持图片/multimodal 输入<br>2. 如支持：修复 `extractTextContent()` 保留图片 parts，传递给 SDK<br>3. 如不支持：UI 在 Claude Code 模式下禁用图片上传按钮并给出提示 |
| **当前状态** | ❌ 需修复 — `chat-claude-code.ts:34-39` 中 `extractTextContent()` 只提取文本，图片 parts 被丢弃 |
| **相关文件** | `packages/server/src/routes/chat-claude-code.ts:34-39` — extractTextContent 只取 text<br>`packages/server/src/routes/chat-claude-code.ts:71` — userMessage 只是文本字符串<br>`packages/server/src/agent/claude-code/handler.ts:161-171` — createUserMessageGenerator 只接受 text |
| **测试用例** | **Unit**: 1. 图片消息传递到 SDK 时包含 image parts（如 SDK 支持）<br>2. 图片消息在不支持时返回友好错误<br>**E2E**: Claude Code 模式上传图片验证行为 |
| **优先级** | P1（依赖技术调研 C21 结果） |

---

### A5. Built-in Tools 验证

| 项目 | 内容 |
|------|------|
| **验收标准** | 1. Standard 模式下 Bash/Browser/Task 工具正常工作<br>2. Claude Code 模式下 Bash → [Bash, Read, Write, Edit, Glob, Grep] 映射正确<br>3. Claude Code 模式下 Browser → [WebFetch, WebSearch] 映射正确（功能缩减）<br>4. Claude Code 模式下 Task → [Task] 映射正确<br>5. UI 在 Claude Code 模式下显示工具信息提示（已实现） |
| **当前状态** | ✅ 已实现 |
| **相关文件** | `packages/server/src/agent/claude-code/config-mapper.ts:56-60` — BUILTIN_TOOL_MAP<br>`packages/server/src/agent/claude-code/config-mapper.ts:114-121` — allowedTools 构建<br>`packages/ui/src/pages/agent/AgentDetailPage.tsx:420-425` — Claude Code 工具提示 |
| **测试用例** | **Unit**: 1. buildSdkOptions 的 allowedTools 包含正确映射<br>2. bash=true → ['Bash','Read','Write','Edit','Glob','Grep']<br>3. browser=true → ['WebFetch','WebSearch']<br>**E2E**: Claude Code 模式下执行 Bash 命令验证 |
| **优先级** | P1 |

---

### A6. Skills 架构变更

| 项目 | 内容 |
|------|------|
| **验收标准** | 1. Skills 配置从 Agent 级别迁移到 Project 级别<br>2. SDK 期望的文件系统结构 `.claude/skills/*/SKILL.md` 正确生成/同步<br>3. `settingSources: ["project"]` 正确配置<br>4. 现有 agent.skillIds 迁移到 project 级别不丢数据<br>5. Claude Code 模式下 Skills 作为 system prompt 注入生效 |
| **当前状态** | ❌ 需新增 — 当前 Skills 仍在 Agent 级别（`agent.skillIds`），Claude Code 模式下通过 `loadAgentSkillTools()` 注入 system prompt（`chat-claude-code.ts:122-132`），但文件系统同步机制未实现 |
| **相关文件** | `packages/shared/src/types/agent.ts:52` — agent.skillIds<br>`packages/server/src/routes/chat-claude-code.ts:118-132` — skill 加载与 prompt 注入<br>`packages/server/src/agent/skills.ts` — loadAgentSkillTools 实现 |
| **测试用例** | **Unit**: 1. Project 级别 skill 配置的 CRUD<br>2. Skill 文件系统同步/symlink 正确生成<br>3. Claude Code 模式下 skill 内容注入 system prompt<br>**E2E**: 配置 Project Skill 后 Claude Code 对话验证 skill 内容生效 |
| **优先级** | P0（影响面大，需详细设计） |

---

### A7. MCP Servers 验证

| 项目 | 内容 |
|------|------|
| **验收标准** | 1. Claude Code 模式下 stdio 类型 MCP Server 正常工作<br>2. Claude Code 模式下 SSE 类型 MCP Server 正常工作<br>3. Claude Code 模式下 HTTP (streamable) 类型 MCP Server 正常工作<br>4. MCP 工具名称自动加入 allowedTools（`mcp__{name}__*` 通配符）<br>5. Agent SDK query 在有 MCP 时使用 AsyncGenerator prompt 模式 |
| **当前状态** | ✅ 已实现 |
| **相关文件** | `packages/server/src/agent/claude-code/mcp-adapter.ts` — MCP 配置转换<br>`packages/server/src/agent/claude-code/config-mapper.ts:160-169` — MCP 服务器合并<br>`packages/server/src/agent/claude-code/config-mapper.ts:163-164` — mcp__{name}__* allowedTools<br>`packages/server/src/agent/claude-code/handler.ts:100-110` — MCP 时用 AsyncGenerator prompt |
| **测试用例** | **Unit**: 1. convertMcpServers 三种传输类型转换正确<br>2. allowedTools 包含 MCP 通配符<br>3. hasMcpServers 时使用 createUserMessageGenerator<br>**E2E**: 配置 MCP Server 后 Claude Code 对话调用 MCP 工具 |
| **优先级** | P1 |

---

### A8. Sub-Agents 验证

| 项目 | 内容 |
|------|------|
| **验收标准** | 1. Sub-Agent 正确映射为 SDK agents（name → key, systemPrompt → prompt）<br>2. Sub-Agent 的 model 正确规范化（sonnet/opus/haiku，非法值 fallback 到 sonnet）<br>3. Sub-Agent 有配置时 Task tool 自动加入 allowedTools<br>4. Sub-Agent 的 builtinTools 正确映射到 SDK 工具名<br>5. UI 在 Claude Code 模式下显示 Sub-Agent 提示信息 |
| **当前状态** | ✅ 已实现 |
| **相关文件** | `packages/server/src/agent/claude-code/config-mapper.ts:124-157` — Sub-Agent 映射<br>`packages/server/src/agent/claude-code/config-mapper.ts:47-51` — normalizeModel fallback<br>`packages/ui/src/pages/agent/AgentDetailPage.tsx:644-649` — UI 提示 |
| **测试用例** | **Unit**: 1. buildSdkOptions 的 agents 对象包含正确映射<br>2. Task tool 在有 sub-agents 时自动加入<br>3. model 规范化测试（gpt-4o → sonnet fallback）<br>**E2E**: Claude Code 模式下 Task tool 调用 sub-agent |
| **优先级** | P1 |

---

### A9. 对话存储验证

| 项目 | 内容 |
|------|------|
| **验收标准** | 1. Claude Code 模式下用户消息正确持久化（含 parts + content + upload 提取）<br>2. Assistant 消息正确保存（responseText + token 计数）<br>3. sdkSessionId 首次获取后写入 Conversation 并可用于后续 session resume<br>4. Session resume 后对话上下文连续<br>5. 消息列表按时间顺序正确加载 |
| **当前状态** | ✅ 已实现 |
| **相关文件** | `packages/server/src/routes/chat-claude-code.ts:88-106` — 保存用户消息<br>`packages/server/src/routes/chat-claude-code.ts:228-265` — 保存 assistant 消息 + sdkSessionId<br>`packages/server/src/storage/conversations.ts:51,84-88` — create + updateSdkSessionId<br>`packages/server/src/db/schema.ts:9` — sdkSessionId 列 |
| **测试用例** | **Unit**: 1. 用户消息 + assistant 消息均写入 DB<br>2. sdkSessionId 更新到 conversation 记录<br>3. session resume 时 options.resume 包含正确的 sessionId<br>**E2E**: 多轮对话后刷新页面验证消息持久化 |
| **优先级** | P0 |

---

### A10. Token 记录和 Dashboard

| 项目 | 内容 |
|------|------|
| **验收标准** | 1. Claude Code 模式正确记录 inputTokens + outputTokens<br>2. Token 记录包含 provider='anthropic' 和正确的 model<br>3. contextTokens 字段在 Claude Code 模式下为 0（SDK 不返回此值），Dashboard 仍能正常渲染<br>4. Dashboard 按 provider/model 分组统计时包含 claude-code 记录<br>5. SSE `data-usage` 事件正确推送到前端 |
| **当前状态** | ⚠️ 需验证 — Claude Code 消息保存时 contextTokens 未赋值（`chat-claude-code.ts:237-244` 无 contextTokens），会使用 schema 默认值 0。Dashboard 分组是否能处理 model='claude-code' fallback 需确认 |
| **相关文件** | `packages/server/src/routes/chat-claude-code.ts:237-244` — assistant 消息无 contextTokens<br>`packages/server/src/routes/chat-claude-code.ts:269-289` — token record 保存<br>`packages/server/src/routes/chat-claude-code.ts:292-295` — data-usage SSE 事件<br>`packages/server/src/db/schema.ts:23` — contextTokens 列默认 0 |
| **测试用例** | **Unit**: 1. tokenRecordStorage.save 被调用且参数正确<br>2. assistant message 的 contextTokens 为 0 不引发错误<br>3. Dashboard 统计逻辑能处理 model='claude-code' 和 model='sonnet' 等值<br>**E2E**: 对话后检查 Dashboard token 统计 |
| **优先级** | P1 |

---

### A11. Agent 状态生命周期

| 项目 | 内容 |
|------|------|
| **验收标准** | 1. Chat 开始时 agent.status 设为 `running`<br>2. Chat 结束时 agent.status 恢复为 `idle`（考虑并发：用 ActiveChatRegistry 计数）<br>3. WebSocket 事件 `agent:status_changed` 在两种 Runtime 下均正确发出<br>4. `runtime:chat_started` / `runtime:chat_ended` 事件正常<br>5. 异常中断时也能恢复 idle 状态 |
| **当前状态** | ✅ 已实现 |
| **相关文件** | `packages/server/src/routes/chat-claude-code.ts:155-168` — 标记 running<br>`packages/server/src/routes/chat-claude-code.ts:170-193` — markChatEnded（含 ActiveChatRegistry 并发处理）<br>`packages/server/src/routes/chat-claude-code.ts:298` — 在 stream 结束时调用 markChatEnded |
| **测试用例** | **Unit**: 1. chat 开始时 agentStorage.update 被调用 status='running'<br>2. chat 结束时恢复 idle（单次）<br>3. 并发对话时最后一个结束才恢复 idle<br>**E2E**: 对话进行中 Agent 状态为 running，结束后为 idle |
| **优先级** | P1 |

---

### A12. 消息搜索 (FTS)

| 项目 | 内容 |
|------|------|
| **验收标准** | 1. Claude Code 模式的消息正确写入 FTS 索引（content 字段非空）<br>2. 搜索结果跨 Runtime 模式正常返回<br>3. FTS 对 assistant 消息的 responseText 可搜索 |
| **当前状态** | ⚠️ 需验证 — assistant 消息的 content 使用 `responseText || '[Claude Code SDK response]'`（`chat-claude-code.ts:237`），如果 SDK 返回空文本则 FTS 搜索可能无法命中实际内容 |
| **相关文件** | `packages/server/src/routes/chat-claude-code.ts:237` — displayText 可能是 placeholder<br>`packages/server/src/db/schema.ts:20` — content 列用于 FTS |
| **测试用例** | **Unit**: 1. 保存的 assistant message content 非 placeholder 时可被 FTS 搜索<br>2. content 为 placeholder 时搜索不到（预期行为但需记录）<br>**E2E**: 搜索 Claude Code 对话内容验证结果 |
| **优先级** | P2 |

---

### A13. Cron Job 执行

| 项目 | 内容 |
|------|------|
| **验收标准** | 1. Claude Code 模式下 Cron Job 正确路由到 `executeClaudeCode` 方法<br>2. Cron Job 创建对话、保存消息、记录 token 均正常<br>3. Skills 注入正确（通过 `loadAgentSkillTools`）<br>4. Permission mode 正确解析<br>5. Agent 状态 running → idle 生命周期正确 |
| **当前状态** | ✅ 已实现 |
| **相关文件** | `packages/server/src/scheduler/executor.ts:82-88` — runtime 分流<br>`packages/server/src/scheduler/executor.ts:86-87` — executeClaudeCode 调用<br>`packages/server/src/scheduler/executor.ts:329-333` — cron skill 加载<br>`packages/server/src/scheduler/executor.ts:389-417` — 消息 + token 保存 |
| **测试用例** | **Unit**: 1. runtime=claude-code 时调用 executeClaudeCode<br>2. cron 执行完成后创建对话和消息<br>3. cron 异常时正确标记 run 失败 + agent idle<br>**E2E**: 手动触发 Cron Job 在 Claude Code 模式下执行 |
| **优先级** | P1 |

---

### A14. Permissions 映射

| 项目 | 内容 |
|------|------|
| **验收标准** | 1. `restricted` → `plan` 映射正确<br>2. `sandbox` → `default` 映射正确<br>3. `unrestricted` → `bypassPermissions` 映射正确（同时设置 `allowDangerouslySkipPermissions: true`）<br>4. 未配置时默认为 `default`<br>5. 映射后的 permissionMode 正确传递给 SDK |
| **当前状态** | ✅ 已实现 |
| **相关文件** | `packages/server/src/agent/claude-code/config-mapper.ts:65-76` — mapPermissionMode<br>`packages/server/src/agent/claude-code/config-mapper.ts:177-181` — 设置到 options |
| **测试用例** | **Unit**: 1. mapPermissionMode('restricted') === 'plan'<br>2. mapPermissionMode('sandbox') === 'default'<br>3. mapPermissionMode('unrestricted') === 'bypassPermissions' + allowDangerouslySkipPermissions<br>4. mapPermissionMode(undefined) === 'default' |
| **优先级** | P1 |

---

### A15. Artifact 系统

| 项目 | 内容 |
|------|------|
| **验收标准** | 1. 确认 Agent SDK 是否支持 Artifact（code blocks, files）<br>2. 如支持：Claude Code 模式下的 Artifact 能正确展示<br>3. 如不支持：UI 上给出提示或回退处理 |
| **当前状态** | ⚠️ 需调研（依赖 C23） — 需确认 SDK 的 Artifact 支持情况 |
| **相关文件** | `packages/server/src/agent/claude-code/sse-adapter.ts` — SDK 消息处理（可能需扩展 artifact 事件） |
| **测试用例** | 待调研结果确定 |
| **优先级** | P2（依赖调研结果） |

---

### A16. Memory 系统

| 项目 | 内容 |
|------|------|
| **验收标准** | 1. Claude Code 模式下 Memory 数据可以正常 CRUD<br>2. Memory 内容在 system prompt 中注入（如果 Agent 配置了 Memory）<br>3. Memory 存储不受 Runtime 切换影响 |
| **当前状态** | ⚠️ 需验证 — Memory 是独立于 Runtime 的文件存储系统，理论上不受影响，但需确认 Claude Code 模式下的注入路径 |
| **相关文件** | Memory 存储与 Runtime 无直接关系，属于 Agent 级配置 |
| **测试用例** | **Unit**: 1. Memory CRUD 不受 runtime 影响<br>**E2E**: Claude Code 模式下验证 Memory 内容在对话中生效 |
| **优先级** | P2 |

---

### A17. WebSocket 事件

| 项目 | 内容 |
|------|------|
| **验收标准** | 1. `agent:status_changed` 事件在两种 Runtime 下一致<br>2. `runtime:chat_started` / `runtime:chat_ended` 事件在两种 Runtime 下一致<br>3. `token:recorded` 事件在两种 Runtime 下一致<br>4. `runtime:cron_started` / `runtime:cron_ended` 事件正常 |
| **当前状态** | ✅ 已实现 |
| **相关文件** | `packages/server/src/routes/chat-claude-code.ts:163-164` — chat_started<br>`packages/server/src/routes/chat-claude-code.ts:187-189` — chat_ended<br>`packages/server/src/routes/chat-claude-code.ts:279-285` — token:recorded<br>`packages/server/src/scheduler/executor.ts:68,450` — cron WS 事件 |
| **测试用例** | **Unit**: wsManager.emit 在 claude-code 路径中被调用且参数与 standard 路径一致<br>**E2E**: WebSocket 监听验证事件推送 |
| **优先级** | P2 |

---

## B. UI 改动需求（B18–B20）

### B18. Global Settings 页面改动

| 项目 | 内容 |
|------|------|
| **验收标准** | 1. 合并 Runtime Tab 和 Providers Tab 为一个页面<br>2. 顶部：Standard / Claude Code 切换（保留当前 RuntimeTab 的选择卡片）<br>3. Standard 选中时 → 下方展示 Provider 配置（当前 ProvidersTab 的全部内容）<br>4. Claude Code 选中时 → 下方展示 Connection Test（当前 RuntimeTab 下半部分）<br>5. 移除 SETTINGS_TABS 中的 'runtime' 和 'providers'，替换为单一 tab |
| **当前状态** | ❌ 需修改 — 当前 Runtime 和 Providers 是独立的两个 Tab |
| **相关文件** | `packages/ui/src/pages/settings/GlobalSettingsPage.tsx:10-15` — SETTINGS_TABS 定义<br>`packages/ui/src/pages/settings/GlobalSettingsPage.tsx:77-93` — Tab 内容渲染<br>`packages/ui/src/pages/settings/GlobalSettingsPage.tsx:108-196` — RuntimeTab 组件<br>`packages/ui/src/pages/settings/GlobalSettingsPage.tsx:199-375` — ProvidersTab 组件 |
| **测试用例** | **Unit**: 1. 合并后的 tab 正确渲染 Runtime 选择<br>2. Standard 选中时显示 Provider 列表<br>3. Claude Code 选中时显示 Connection Test<br>4. 切换 Runtime 后下方内容正确切换<br>**E2E**: 打开 Global Settings 验证合并后的 UI |
| **优先级** | P1 |

---

### B19. Project Settings 页面改动

| 项目 | 内容 |
|------|------|
| **验收标准** | 1. Agent Runtime 从 General Tab 移到 Agent Tab<br>2. 移除 `Inherit` 选项，只保留 Standard / Claude Code 两个选项<br>3. 新建 Project 时默认跟随 Global Setting 的值（显式写入 `agentRuntime` 值，不再用 `undefined` 表示 inherit）<br>4. 已有 Project 的 `undefined` agentRuntime 需要在读取时填充实际值 |
| **当前状态** | ❌ 需修改 — 当前 `ProjectRuntimeSection` 在 General Tab 中，有 Inherit 选项（`ProjectSettingsPage.tsx:293-297`），使用 `undefined` 表示 inherit |
| **相关文件** | `packages/ui/src/pages/project/ProjectSettingsPage.tsx:249` — `ProjectRuntimeSection` 在 GeneralTab 中<br>`packages/ui/src/pages/project/ProjectSettingsPage.tsx:262-343` — ProjectRuntimeSection 组件<br>`packages/ui/src/pages/project/ProjectSettingsPage.tsx:293-297` — options 含 inherit |
| **测试用例** | **Unit**: 1. Agent Tab 渲染 Runtime 选择（无 Inherit 选项）<br>2. 选择 Runtime 后 config.agentRuntime 被显式设置<br>3. 新建 Project 时 agentRuntime 有明确值<br>**E2E**: 打开 Project Settings → Agent Tab 验证 Runtime 选项 |
| **优先级** | P1 |

---

### B20. Agent Detail Page 条件渲染

| 项目 | 内容 |
|------|------|
| **验收标准** | 1. Claude Code 模式下隐藏 CompactThreshold 控件<br>2. Claude Code 模式下 Model Config 简化为 sonnet/opus/haiku 选择<br>3. Claude Code 模式下 Tools Tab 显示信息提示<br>4. Claude Code 模式下 Sub-Agents Tab 显示信息提示<br>5. Standard 模式下所有功能不受影响 |
| **当前状态** | ✅ 已实现 |
| **相关文件** | `packages/ui/src/pages/agent/AgentDetailPage.tsx:177-178` — isClaudeCode 变量<br>`packages/ui/src/pages/agent/AgentDetailPage.tsx:292-293` — 隐藏 CompactThreshold<br>`packages/ui/src/pages/agent/AgentDetailPage.tsx:224-226` — claude-code model config<br>`packages/ui/src/pages/agent/AgentDetailPage.tsx:420-425` — Tools 提示<br>`packages/ui/src/pages/agent/AgentDetailPage.tsx:644-649` — Sub-Agents 提示 |
| **测试用例** | **Unit**: 1. isClaudeCode=true 时 CompactThreshold 不渲染<br>2. isClaudeCode=true 时 Model Config 为简化版<br>3. isClaudeCode=true 时 Tools/Sub-Agents 显示提示<br>**E2E**: Agent Detail 页面在两种 Runtime 下 UI 差异验证 |
| **优先级** | P1 |

---

## C. 技术调研需求（C21–C23）

### C21. Agent SDK `query()` 图片/multimodal 输入

| 项目 | 内容 |
|------|------|
| **调研目标** | 确认 `@anthropic-ai/claude-agent-sdk` 的 `query()` 函数是否支持图片/multimodal 输入 |
| **影响范围** | A4 图片上传验证的实现方案取决于此 |
| **优先级** | P0（阻塞 A4） |

### C22. Agent SDK `settingSources` 配置后 Skills 发现机制

| 项目 | 内容 |
|------|------|
| **调研目标** | 确认 SDK 如何通过 `settingSources` 发现 Skills（文件路径规则、SKILL.md 格式要求） |
| **影响范围** | A6 Skills 架构变更的实现方案取决于此 |
| **优先级** | P0（阻塞 A6） |

### C23. Agent SDK Artifact 支持

| 项目 | 内容 |
|------|------|
| **调研目标** | 确认 SDK 是否支持 Artifact 创建/展示（如 code blocks, HTML preview 等） |
| **影响范围** | A15 Artifact 系统的处理方案取决于此 |
| **优先级** | P1 |

---

## 汇总：优先级分布

### P0（必须修复/实现，阻塞核心功能）
| 编号 | 项目 | 状态 |
|------|------|------|
| A2 | Conversation Runtime 锁定 | ❌ 需修复 |
| A6 | Skills 架构变更（Agent → Project） | ❌ 需新增 |
| A1 | Runtime 切换机制 | ✅ 需验证 |
| A9 | 对话存储 | ✅ 需验证 |
| C21 | 调研：SDK 图片支持 | 🔍 需调研 |
| C22 | 调研：SDK Skills 发现机制 | 🔍 需调研 |

### P1（重要功能修复/验证）
| 编号 | 项目 | 状态 |
|------|------|------|
| A4 | 图片上传 | ❌ 需修复（依赖 C21） |
| B18 | Global Settings 合并 | ❌ 需修改 |
| B19 | Project Settings 改动 | ❌ 需修改 |
| A3 | Compact 功能 | ⚠️ 需验证 |
| A5 | Built-in Tools | ✅ 需验证 |
| A7 | MCP Servers | ✅ 需验证 |
| A8 | Sub-Agents | ✅ 需验证 |
| A10 | Token + Dashboard | ⚠️ 需验证 |
| A11 | Agent 状态生命周期 | ✅ 需验证 |
| A13 | Cron Job | ✅ 需验证 |
| A14 | Permissions 映射 | ✅ 需验证 |
| B20 | Agent Detail 条件渲染 | ✅ 需验证 |
| C23 | 调研：SDK Artifact 支持 | 🔍 需调研 |

### P2（低优先级，验证即可）
| 编号 | 项目 | 状态 |
|------|------|------|
| A12 | 消息搜索 FTS | ⚠️ 需验证 |
| A15 | Artifact 系统 | ⚠️ 需调研（依赖 C23） |
| A16 | Memory 系统 | ⚠️ 需验证 |
| A17 | WebSocket 事件 | ✅ 需验证 |

---

## 修复 vs 验证 清单

### 需修复/新增（代码变更）
1. **A2** — Conversation Runtime 锁定：DB 加列、类型加字段、路由加校验
2. **A4** — 图片上传支持：修复 extractTextContent 或 UI 禁用（依赖调研）
3. **A6** — Skills 迁移到 Project 级别：类型变更 + 存储迁移 + 文件系统同步
4. **B18** — Global Settings UI 合并
5. **B19** — Project Settings UI 改动

### 仅需验证（不改代码或小修）
A1, A3, A5, A7, A8, A9, A10, A11, A12, A13, A14, A15, A16, A17, B20
