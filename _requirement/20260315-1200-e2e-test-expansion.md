# E2E 测试全面扩展需求

## 目标

全面补全 Golemancy E2E 测试覆盖，从当前 ~232 个用例扩展到 ~350+ 用例。同时进行代码质量审计（死代码、一致性检查）。

---

## 执行阶段

### Phase 0 — 基础设施建设（阻塞 Phase 1）

#### 0.1 添加 data-testid

以下 UI 组件缺少 testid，E2E 测试无法可靠选取元素：

| 模块 | 组件文件 | 需要添加的 testid |
|------|---------|-----------------|
| Team | `TeamListPage.tsx` | 页面容器、New Team 按钮、team 卡片、空状态 |
| Team | `TeamCreateModal.tsx` | name/description/instruction 输入框、成员选择器、创建/取消按钮 |
| Team | `TeamDetailPage.tsx` | 页面容器、编辑/删除按钮、成员列表 |
| Memory | `AgentDetailPage.tsx` (MemoryTab) | 添加按钮、memory 卡片、content/tags/priority 输入、pin/unpin/delete 按钮、Memory Tab trigger |
| Onboarding | `OnboardingPage.tsx` + 5 个 Step 组件 | 进度条、Next/Back/Skip 按钮、各步骤表单字段 |
| Permission UI | `PermissionsSettings` 相关组件 | mode 选择器、路径编辑器、网络限制开关、denied commands 列表 |
| Chat | `ChatInput.tsx` / StatusBar 相关 | compact 按钮、token 显示区域、context 进度条、对话过滤开关 |
| Settings | `SpeechTab.tsx` | enable toggle、provider 配置表单、test 按钮 |
| Project | `ProjectListPage.tsx` | 项目卡片克隆/删除按钮 |
| Agent | `AgentListPage.tsx` / `AgentDetailPage.tsx` | 克隆按钮、Skills Tab assign/remove 按钮、MCP Tab assign/remove 按钮 |
| Template | `TemplateSelector.tsx` | 模板选择器容器、分类按钮、模板列表项、detail 面板、Blank/From Template 切换按钮 |

#### 0.2 扩展 constants.ts SELECTORS

为上述新增 testid 在 `apps/desktop/e2e/constants.ts` 的 `SELECTORS` 中添加对应常量（预计新增 ~50 个）。

#### 0.3 扩展 TestHelper

在 `apps/desktop/e2e/fixtures/test-helper.ts` 中添加：

**API 快捷方法：**
- `createTeamViaApi(projectId, name, members)` — Team CRUD
- `createMemoryViaApi(projectId, agentId, content, opts)` — Memory CRUD
- `assignSkillToAgent(projectId, agentId, skillId)` — 通过 PATCH agent 分配 Skill
- `assignMcpToAgent(projectId, agentId, mcpName)` — 通过 PATCH agent 分配 MCP
- `createTeamChatViaApi(projectId, teamId, message)` — Team 级 SSE 对话
- `setProjectDefaultTarget(projectId, targetType, targetId)` — 设置项目默认 agent/team
- `seedWorkspaceFile(projectId, relativePath, content)` — 往 workspace 目录写入文件（供 workspace 测试用）

**模型分层快捷方法：**
- `createCheapAgent(projectId, name, opts)` — 使用 global defaultModel（Tier A）
- `createSmartAgent(projectId, name, opts)` — 指定 Tier B 模型

模型降级逻辑：
- Tier A：Google key 可用 → `gemini-2.5-flash`；否则 → `claude-haiku-4-5`
- Tier B：Google key 可用 → `gemini-2.5-pro`；否则 → `claude-sonnet-4-6`

**SSE 事件扩展：**
- 扩展 `sendChatViaApi()` 返回值：保持现有 `{ response, usage }` 字段不变（向后兼容），新增 `events: SSEEvent[]` 字段收集完整 SSE 事件列表（包括 `tool_call`、`compact:*` 等）
- 现有测试无需修改（仍然解构 `{ response, usage }`），新测试可额外使用 `events`
- 这是 `ai/auto-compact.spec.ts` 和 `ai/team-chat.spec.ts` 的前置依赖

**Workspace 文件 seed：**
- `seedWorkspaceFile()` 通过 Node.js `fs` 直接写文件（路径 = `process.env.GOLEMANCY_TEST_DATA_DIR/projects/{projectId}/workspace/{relativePath}`），不是 HTTP API
- helper 需要在构造时接收 data dir 路径（从 `process.env.GOLEMANCY_TEST_DATA_DIR` 读取）

#### 0.4 Onboarding 测试方案

**背景**：当前 global-setup seed 了 `providers`（但没有 `onboardingCompleted`）。UI 路由的 onboarding 判定逻辑是：

```typescript
const needsOnboarding = !settings.onboardingCompleted
  && (settings.onboardingStep != null
    || (Object.keys(settings.providers ?? {}).length === 0
      && projects.length === 0))
```

只要 providers 非空就跳过 onboarding。所以通过 API 设 `onboardingCompleted: false` 无效。

**唯一可行方案**：在 `playwright.config.ts` 中新增独立 playwright project `onboarding`：

- **独立 globalSetup 函数**：创建空 data dir，写入最小 `settings.json`（`{ providers: {}, theme: 'dark' }`）
- **通过 project 级 env 覆盖**：`{ name: 'onboarding', env: { GOLEMANCY_TEST_DATA_DIR: onboardingDataDir } }` — 不需要参数化 fixture，Playwright project config 直接设不同 env
- **复用现有 fixture**：electron fixture 已通过 `process.env.GOLEMANCY_TEST_DATA_DIR` 读取 data dir，天然支持
- **独立 globalTeardown**：清理 onboarding data dir
- **不依赖** smoke/server/ai tier，可独立运行

---

### Phase 1 — 编写测试（按优先级分批，可并行）

#### P0 — 核心缺失模块

**Team 管理**

| 层级 | 文件 | 测试内容 |
|------|------|---------|
| Smoke | `smoke/team-page.spec.ts` | 列表页渲染、empty state、New Team 按钮、侧边栏导航 |
| Smoke | `smoke/team-crud.spec.ts` | UI 创建 Team（name/description/instruction/成员）、编辑、删除 |
| Server | `server/team-api.spec.ts` | POST（含 members `[{agentId, parentAgentId?}]`）、GET 列表/单个、PATCH、DELETE、clone、拓扑布局 GET/PUT |
| AI | `ai/team-chat.spec.ts` | Team Chat 多 agent 协作、sub-agent 委派展示（Tier B 模型） |

> **Team Chat 前置条件**（写在测试 beforeAll 中）：
> 1. 创建 2 个 agent：Leader（prompt："You are a team leader. When you receive any question, you MUST delegate it to your team member using the delegation tool available to you. Never answer directly."）+ Researcher（prompt："You are a researcher. Answer questions in one short sentence."）
> 2. 创建 team：`members: [{agentId: leaderId}, {agentId: researcherId, parentAgentId: leaderId}]`
> 3. 通过 `createTeamChatViaApi()` 发送消息（如 "What is 2+2?"）
> 4. 断言：SSE 事件列表中包含 `tool_call` 类型事件且工具名含 `delegate_to_`（依赖 Phase 0.3 的 SSE 扩展）
>
> **注意**：prompt 不能引用具体工具名 `delegate_to_xxx`（实际名称含 UUID，不可预知）。应描述委派行为，让 AI 从工具列表中自行匹配。
>
> **注意**：已有 `routes/teams.test.ts` 单元测试覆盖了 Team CRUD 的 mock 层。E2E 的 `server/team-api.spec.ts` 走真实 server + SQLite，验证集成正确性。

**Memory 系统**（**零现有覆盖** — 无单元测试、无 E2E）

| 层级 | 文件 | 测试内容 |
|------|------|---------|
| Smoke | `smoke/memory-tab.spec.ts` | Agent 详情 Memory Tab 渲染、空状态、添加表单（content/tags/priority/pinned 字段） |
| Server | `server/memory-api.spec.ts` | POST（content 必填、priority 0-5、tags 数组）、GET 列表、PATCH 更新、DELETE、pin/unpin toggle、priority 边界值（0 和 5）、空 content 返回 400 |
| AI | `ai/memory-tools.spec.ts` | Agent 使用 MemorySave 保存信息、MemorySearch 检索、pinned memory 跨对话持久化（Tier B） |

> **Pinned memory 验证方式**（间接验证，无法直接检查 system prompt）：
> 1. 创建 agent 并通过 API 添加 pinned memory：`content: "用户的名字是 Golem"`
> 2. 开新对话问 "你记得我的名字吗？"
> 3. 断言回复包含 "Golem"
> 4. 对比：不 pin 的 memory 在新对话中不一定被加载（取决于 priority 和数量）

**Chat 高级功能**

| 层级 | 文件 | 测试内容 |
|------|------|---------|
| Server | `server/conversation-advanced.spec.ts` | 消息分页加载（limit/cursor）、Compact API（POST 201 正常、POST 400 无消息）、对话过滤（API 创建带标记的 cron conversation，验证过滤可见性） |
| Server | `server/chat-navigation.spec.ts` | URL 同步验证（API 创建 conversation → 导航 ?conv=id → store 中 selectedConversationId 匹配）、Agent/Team 切换 — 空对话走 PATCH、有消息的对话创建新 conversation（两种分支都需测试） |
| AI | `ai/chat-advanced.spec.ts` | Stop 按钮中断 streaming（UI 点击 `chat-stop-btn` → 验证输入框重新启用 + 消息停止增长）、tool call 展开/折叠展示、manual compact（API 调用后验证消息重建）（Tier A） |
| AI | `ai/auto-compact.spec.ts` | 创建 agent 设 `compactThreshold: 5000` → 发送 3-5 轮对话 → 下一轮 SSE 事件列表中出现 compact 相关事件（Tier A） |

> **Compact threshold 说明**：系统 prompt + 工具指令约 1-2k tokens，每轮对话增长 500-2000 tokens。设 `compactThreshold: 5000` 可在 3-5 轮后触发，同时避免首轮误触发。
>
> **Chat Stop 机制**：没有独立的 stop API。Stop 通过客户端关闭 SSE 连接触发 `AbortSignal`。E2E 中通过 UI 点击 Stop 按钮测试（测的是用户实际操作路径）。
>
> **auto-compact 依赖 Phase 0.3** 的 SSE 事件扩展才能捕获 compact 事件。

**删除安全性**

| 层级 | 文件 | 测试内容 |
|------|------|---------|
| Server | `server/deletion-safety.spec.ts` | 见下方详细描述 |

删除行为的 **实际代码行为**（经源码验证）：

| 删除操作 | 实际行为 |
|---------|---------|
| 删除 Agent | 仅清除 `project.defaultTargetId`（如果指向该 agent），**不清理** Team members / Cron / Conversation 引用 |
| 删除 Team | 仅清除 `project.defaultTargetId`（如果指向该 team），**不清理** Conversation / Cron 引用 |
| 删除被引用 Skill | 返回 409 `SKILL_IN_USE` |
| 删除被引用 MCP | 返回 409 `MCP_SERVER_IN_USE` |
| 删除未引用 Skill/MCP | 正常删除 |
| 删除 Project | 递归删除整个项目目录 |

> 已有单元测试覆盖了 Agent/Team 的 `defaultTargetId` 清理和 Skill/MCP 的 409 保护。E2E 聚焦于 **单元测试无法覆盖的集成场景**：

E2E 仅测试（test title 即行为文档）：
1. `'deleting agent leaves orphan reference in team — team GET still works'`
2. `'deleting agent leaves orphan reference in cron — cron GET still works'`
3. `'deleting team leaves orphan reference in cron — cron GET still works'`
4. `'deleting project cascades — all sub-resource APIs return 404'`

#### P1 — 重要功能模块

**Onboarding**（依赖 Phase 0.4）

| 层级 | 文件 | 测试内容 |
|------|------|---------|
| 独立 project | `onboarding/onboarding-flow.spec.ts` | Welcome 页面渲染（语言选择）、步骤导航（Next/Back）、Skip 功能（跳过→直接进入项目列表）、Provider 步骤 UI（选择 preset provider、API key 输入框可见）、Project 步骤 UI（name/template 选择） |

> **Onboarding 测试范围限定**：标准 provider 步骤需要 API key 才能完成"Test Connection"，所以完整端到端流程（配置→测试→创建项目）在无 API key 时不可行。测试重点是 **UI 导航和 Skip 功能**，不强求完成 provider 连接。

**Agent 工具扩展**

| 层级 | 文件 | 测试内容 |
|------|------|---------|
| AI | `ai/task-tool.spec.ts` | Agent 创建 task、查看 task 列表、更新 task 状态（Tier A） |
| Server | `server/browser-tool-config.spec.ts` | 创建 agent 设 `builtinTools.browser: true` → GET 返回确认字段正确 → 验证默认值（bash/task/memory 默认 true，browser/computer_use 默认 false） |

> **Browser 工具说明**：没有 API 可以查询 agent 运行时已加载的工具（`loadAgentTools()` 仅在 chat 请求时临时调用）。只能验证配置字段。真实的 browser 工具执行不在 E2E 范围内（Playwright 冲突风险）。

**Permission 系统 UI**

| 层级 | 文件 | 测试内容 |
|------|------|---------|
| Smoke | `smoke/permission-config-ui.spec.ts` | Mode 选择器三选一、路径编辑器增删、网络限制开关+域名编辑、denied commands 增删、applyToMCP toggle、命名配置创建/编辑/删除 |
| Server | `server/sandbox-readiness.spec.ts` | GET /sandbox/readiness 返回 `{ready, issues}` 结构 |

**Agent 配置交互**

| 层级 | 文件 | 测试内容 |
|------|------|---------|
| Smoke | `smoke/agent-config-interaction.spec.ts` | Skills Tab 分配 skill 后 store 立即更新（auto-save）、Tools Tab toggle 后 store 立即更新（auto-save）、MCP Tab 分配后 store 立即更新（auto-save）、Model Config 修改 compact threshold 后点 Save 并验证 store |

> **前置条件**（beforeAll）：需通过 API 创建至少 1 个 skill（`createSkillViaApi`）和 1 个 MCP server（`apiPost /mcp-servers`），才有内容可分配。
>
> **保存模式差异**（测试需覆盖两种）：
> - **Auto-save**（点击即保存）：Skills Tab、Tools Tab、MCP Tab
> - **Explicit Save**（需点按钮）：General Tab、Model Config Tab
>
> 已有 `AgentDetailPage.test.tsx` 单元测试覆盖了 jsdom 层的 tab 交互。E2E 验证真实浏览器 + 真实 server 的 auto-save 完整链路。

#### P2 — 覆盖面扩展

**模板补全**

| 层级 | 文件 | 测试内容 |
|------|------|---------|
| Server | `server/template-creation-all.spec.ts` | 剩余 16 个模板验证：每个模板一个独立 `test()` case（非 `test.each`），验证 agent/skill/MCP/team/cron 数量，单个失败不影响其他模板报告 |
| Smoke | `smoke/template-full.spec.ts` | 模板选择器全分类展示、detail 预览信息、UI 全流程（选择模板→创建→进入项目→验证侧边栏有 agents） |

> 模板创建是纯同步文件 I/O（无网络调用），单个 < 100ms。Python venv 初始化是 fire-and-forget 不阻塞。

**消息上传**

| 层级 | 文件 | 测试内容 |
|------|------|---------|
| Server | `server/message-uploads.spec.ts` | 通过 `saveMessageViaApi` 传入含 base64 图片的消息 → GET /uploads/:filename 返回正确内容和 MIME type → 路径遍历防护（`../../` 返回 400/404） |

> 没有独立的 POST upload 端点。上传在消息保存时通过 `extractUploads()` 隐式发生。

**Project / Agent 补充**

| 层级 | 文件 | 测试内容 |
|------|------|---------|
| Smoke | `smoke/project-advanced.spec.ts` | 克隆项目（UI 点击后验证新项目出现）、删除确认弹窗（点击删除→弹窗→取消→项目仍在）、设置 default agent/team |
| Smoke | `smoke/agent-advanced.spec.ts` | 克隆 Agent（UI）、状态徽章显示（idle badge）、MCP 安全警告提示 |
| Server | `server/agent-clone.spec.ts` | POST /agents/:id/clone → 验证字段完整复制（name 来自请求、systemPrompt/builtinTools/skillIds/mcpServers/tools/compactThreshold 深拷贝、新 id、status 为 idle） |

> **Agent clone 零现有覆盖** — 存储层和路由层都没有 clone 测试。此为真正的覆盖空白。

#### P3 — 辅助功能

**Workspace 文件操作**

| 层级 | 文件 | 测试内容 |
|------|------|---------|
| Smoke | `smoke/workspace-operations.spec.ts` | 点击文件预览内容、目录展开折叠 |

> **前提**：新项目 workspace 目录是空的（模板也不往里写文件）。测试 `beforeAll` 需要通过 `helper.seedWorkspaceFile()` 写入测试文件。
>
> `server/workspace-operations.spec.ts` 不需要 — `routes/workspace.test.ts` 单元测试已全面覆盖，加上现有 E2E `workspace-api.spec.ts`。

**Global Settings 扩展（含 i18n 和 STT）**

| 层级 | 文件 | 测试内容 |
|------|------|---------|
| Smoke | `smoke/settings-advanced.spec.ts` | Appearance 主题/语言切换（auto-save 验证）、语言 fallback 不崩溃、Provider API key 掩码显示、添加删除 model、default model 选择、Speech Tab 渲染（enable toggle、配置表单可见） |

> i18n 语言切换和 STT 配置 UI 合并到此文件（都在 Global Settings 页面）。
>
> ⚠️ **状态还原**：`afterAll` 必须将语言和主题恢复为 `en` / `dark`（通过 API `PATCH /settings`），否则后续 smoke 文件的英文文本断言会全部失败。

**Runtime 管理扩展**

| 层级 | 文件 | 测试内容 |
|------|------|---------|
| Server | `server/runtime-extended.spec.ts` | pip install/uninstall、venv reset（需 Python 可用，否则 skip） |

---

### Phase 2 — 集成、稳定化与审计

#### 2.1 测试集成验证

- 全套分层运行：`pnpm test:e2e:smoke` → `test:e2e` → `test:e2e:ai`
- 独立运行 onboarding project
- 确认新旧测试不冲突
- **验证文件执行顺序**：Playwright 按字母序运行文件。确认新 smoke 文件（如 `agent-advanced` 在 `agent-config` 和 `agent-crud` 之间）不会因为顺序导致状态依赖问题

#### 2.2 Smoke 测试状态还原规则

所有修改全局状态的 smoke 测试必须在 `afterAll` 中还原：

| 文件 | 修改的状态 | 还原方式 |
|------|----------|---------|
| `smoke/settings-advanced.spec.ts` | 语言、主题 | `PATCH /settings { language: 'en', theme: 'dark' }` |
| `smoke/permission-config-ui.spec.ts` | permission configs | 删除测试创建的 config |
| 现有 `smoke/settings.spec.ts` | DeepSeek provider | 应补充清理（记入已知债务） |

#### 2.3 Flaky Test 策略

AI 层测试天然非确定性：
- **断言设计原则**：宽松匹配（`toContain` / regex），不精确匹配完整回复
- **Retry**：已有 `retries: 1`，AI 测试可考虑增加到 2
- **Timeout 基准**：Tier A 模型 30s、Tier B 模型 60s、Team Chat 90s
- **System prompt 引导**：明确指令（"只回复数字"、"用 JSON 格式"）减少不确定性

#### 2.4 代码质量审计

##### 死代码检查

| 类型 | 检查方式 |
|------|---------|
| 未使用的导出函数/组件 | `knip` 或手动 grep unused exports |
| 已知死代码 | `PixelTooltip`（已确认：导出但从未被任何页面使用） |
| 占位功能 | MCP Marketplace tab、Skill Marketplace tab（"Coming Soon"，非死代码但为未实现功能） |
| TODO/FIXME | 全局搜索，评估是否需要处理（目前仅 2 处，均为文档级） |

##### 一致性检查

**保存行为一致性**（已发现不一致）：

| 页面 | 组件 | 保存方式 | 备注 |
|------|------|---------|------|
| Agent > General | name/description/systemPrompt | **Explicit Save 按钮** | |
| Agent > Model Config | provider/model/threshold | **Explicit Save 按钮** | |
| Agent > Skills | skill 分配/取消 | **Auto-save（点击即保存）** | ⚠️ 与 General/Model 不一致 |
| Agent > Tools | 工具 toggle | **Auto-save（点击即保存）** | ⚠️ 与 General/Model 不一致 |
| Agent > MCP | MCP 分配/取消 | **Auto-save（点击即保存）** | ⚠️ 与 General/Model 不一致 |
| Agent > Memory | pin/unpin/delete | **Auto-save** | 添加/编辑用 Explicit Save |
| Project Settings > General | name/description/icon | **Explicit Save 按钮** | |
| Project Settings > General | default agent/team 选择 | **Auto-save（选择即保存）** | ⚠️ 同一页面两种模式 |
| Project Settings > Permissions | mode 选择 | **Auto-save** | |
| Project Settings > Permissions | 路径/命令/域名配置 | **Explicit Save 按钮** | 同一 tab 两种模式 |
| Global Settings > Appearance | 主题/语言 | **Auto-save** | |
| Global Settings > Providers | Provider 配置 | **Explicit Save 按钮** | 添加 preset 是 auto-save |
| Global Settings > Speech | 所有字段 | **Auto-save（blur/change）** | |
| Skill/MCP/Cron/Team Modal | 创建/编辑表单 | **Explicit Save/Create 按钮** | |

> 此表作为审计产出物，供 UI/UX 决策是否需要统一保存行为。

**颜色一致性**（已检查，无问题）：

| 概念 | 颜色 | 一致性 |
|------|------|--------|
| Skills | `accent-purple` | ✅ 全局一致 |
| MCP Servers | `accent-cyan` | ✅ 全局一致 |
| Built-in Tools | `accent-amber` | ✅ 全局一致 |
| Running/Active | `accent-green` | ✅ 全局一致 |
| Error | `accent-red` | ✅ 全局一致 |
| Info/Neutral | `accent-blue` | ✅ 全局一致 |

---

## 排除项（明确不测）

| 项目 | 原因 |
|------|------|
| 录音交互（麦克风、波形、录音→转录） | 硬件依赖，CI 无法运行 |
| OAuth 完整流程 | 外部服务依赖，CI 无法可靠运行 |
| Browser 工具真实浏览 | Playwright 冲突风险 + 无工具列表 API；仅验证配置字段 |
| WebSocket 事件直接验证 | 实现细节，相关行为由 Dashboard/Chat 测试间接覆盖 |
| Markdown 渲染正确性 | 组件单元测试职责 |
| 文件类型图标分类 | 组件单元测试职责 |
| 并发/大数据量性能测试 | 不属于功能 E2E 范畴 |
| Provider 连接测试 API | 需要真实 API key + `generateText()`，已被 AI chat 测试间接覆盖 |
| Workspace API CRUD | 单元测试已全面覆盖（listing/content/delete/path-traversal） |
| Speech API CRUD | 单元测试已覆盖（history/storage/transcribe/retry） |

---

## 已知测试缺口（本次不解决，记录备忘）

| 缺口 | 说明 |
|------|------|
| Server 崩溃恢复 | Electron child process crash → 是否自动重启？未测试 |
| 无效 API key 错误展示 | 配置错误 key 后发起聊天的 UI 错误处理 |
| Agent 未配置 model 时的行为 | 创建 agent 后不设 model 就发起聊天 |
| 现有测试的状态泄漏 | `smoke/settings.spec.ts` 添加 DeepSeek 后未清理；`template-creation.spec.ts` 用最后一个 test case 做清理（fragile） |
| Tier C 兼容性测试 | 每个 provider 跑基础 chat 验证兼容性 — 有价值但需要所有 provider 的 API key，适合单独的 CI job |

---

## AI 测试模型分层（成本控制）

| 分层 | 模型 | 适用场景 | 占比 |
|------|------|---------|------|
| Tier A 廉价 | Gemini 2.5 Flash / GPT-5 Mini / Haiku 4.5 | 简单 Q&A、echo 命令、基础工具调用、cron 触发、permission 阻止/放行、compact 触发、task 工具 | ~75% |
| Tier B 中端 | Sonnet 4.6 / GPT-5 / Gemini 2.5 Pro | Agent persona、多轮上下文、Memory 工具、Sub-agent 委派、Team Chat | ~25% |

> Tier C 兼容性测试（每个 provider 跑基础 chat）移入"已知缺口"，适合单独 CI job 处理，不在本次扩展范围内。

---

## 技术约束

- 遵循现有 E2E 框架（Playwright + Electron + fixtures）
- 四个 playwright project：smoke → server → ai（层级依赖）+ onboarding（独立）
- 与现有 spec 文件保持命名和结构一致
- 不动 git
- 不动 `__guidelines/` 目录
- 测试间数据隔离：每个 describe 创建独立项目，不依赖其他文件的数据
- **Smoke 状态还原**：修改全局 settings 的测试必须在 `afterAll` 中恢复原始值
- AI 测试断言用宽松匹配（`toContain`、regex），不精确匹配完整回复
- 避免与已有单元/路由测试冗余 — E2E 聚焦于：真实 server 集成、跨层级交互、UI 端到端流程

---

## 预估规模

| 类别 | 新增文件数 | 新增用例数 |
|------|----------|----------|
| Phase 0 基础设施 | ~6 修改（非新文件） | 0 |
| P0 核心模块 | 12 | ~48 |
| P1 重要功能 | 6 | ~23 |
| P2 覆盖扩展 | 6 | ~32 |
| P3 辅助功能 | 3 | ~12 |
| **合计** | **27 新文件 + ~6 修改** | **~115 新用例** |
| **总计（含现有）** | **~65 文件** | **~347 用例** |

### 新增文件完整清单

| # | 层级 | 文件名 | 优先级 |
|---|------|--------|-------|
| 1 | smoke | `team-page.spec.ts` | P0 |
| 2 | smoke | `team-crud.spec.ts` | P0 |
| 3 | server | `team-api.spec.ts` | P0 |
| 4 | ai | `team-chat.spec.ts` | P0 |
| 5 | smoke | `memory-tab.spec.ts` | P0 |
| 6 | server | `memory-api.spec.ts` | P0 |
| 7 | ai | `memory-tools.spec.ts` | P0 |
| 8 | server | `conversation-advanced.spec.ts` | P0 |
| 9 | server | `chat-navigation.spec.ts` | P0 |
| 10 | ai | `chat-advanced.spec.ts` | P0 |
| 11 | ai | `auto-compact.spec.ts` | P0 |
| 12 | server | `deletion-safety.spec.ts` | P0 |
| 13 | onboarding | `onboarding-flow.spec.ts` | P1 |
| 14 | ai | `task-tool.spec.ts` | P1 |
| 15 | server | `browser-tool-config.spec.ts` | P1 |
| 16 | smoke | `permission-config-ui.spec.ts` | P1 |
| 17 | server | `sandbox-readiness.spec.ts` | P1 |
| 18 | smoke | `agent-config-interaction.spec.ts` | P1 |
| 19 | server | `template-creation-all.spec.ts` | P2 |
| 20 | smoke | `template-full.spec.ts` | P2 |
| 21 | server | `message-uploads.spec.ts` | P2 |
| 22 | smoke | `project-advanced.spec.ts` | P2 |
| 23 | smoke | `agent-advanced.spec.ts` | P2 |
| 24 | server | `agent-clone.spec.ts` | P2 |
| 25 | smoke | `workspace-operations.spec.ts` | P3 |
| 26 | smoke | `settings-advanced.spec.ts` | P3 |
| 27 | server | `runtime-extended.spec.ts` | P3 |

### 与现有覆盖对比

| 模块 | 现有 | 新增 | 新增后 |
|------|------|------|-------|
| Team 管理 | 0 | ~15 | ~15 |
| Memory 系统 | 0 | ~15 | ~15 |
| Chat 高级 | ~13 | ~12 | ~25 |
| 删除安全性 | ~4 | ~4 | ~8 |
| Onboarding | 0 | ~5 | ~5 |
| Agent 工具/配置 | ~8 | ~10 | ~18 |
| Permission UI | ~5 | ~8 | ~13 |
| 模板系统 | ~11 | ~19 | ~30 |
| 上传（message-uploads） | 0 | ~3 | ~3 |
| Workspace 文件 | ~5 | ~3 | ~8 |
| Project/Agent 补充 | ~15 | ~10 | ~25 |
| Settings/i18n/STT | ~8 | ~6 | ~14 |
| Runtime | ~4 | ~3 | ~7 |
