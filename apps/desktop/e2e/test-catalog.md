# E2E 测试完整目录（385 个用例）

> 生成时间：2026-03-15 | 65 个文件 | 385 个 test（含 7 个 skip）

## 总览

| 层级 | 文件数 | 用例数 | Skip | 需要 API Key | 运行命令示例 |
|------|--------|-------|------|-------------|------------|
| smoke | 26 | 145 | 7 | 否 | `test:e2e:only -- --project=smoke` |
| server | 27 | 192 | 0 | 否* | `test:e2e:only -- --project=server` |
| ai | 11 | 55 | 0 | 是 | `test:e2e:only -- --project=ai` |
| onboarding | 1 | 7 | 0 | 否 | `test:e2e:only -- --project=onboarding` |
| **总计** | **65** | **385** | **7** | | |

> *server 层的 `code-execution.spec.ts` 需要 API key

---

## 运行方式

```bash
# 前提：先 build 一次（UI 代码没改就不用重复 build）
pnpm --filter @golemancy/desktop exec electron-vite build --mode test

# 跑单个文件
pnpm --filter @golemancy/desktop test:e2e:only -- e2e/smoke/team-page.spec.ts

# 跑单个用例（按名字匹配）
pnpm --filter @golemancy/desktop test:e2e:only -- -g "memory tab shows empty state"

# 跑某个模块（匹配所有 Team 相关）
pnpm --filter @golemancy/desktop test:e2e:only -- -g "Team"

# 跑某个层级
pnpm --filter @golemancy/desktop test:e2e:only -- --project=smoke
```

---

## Smoke 层（26 文件 / 145 用例）

### 应用启动

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 1 | app-launch | window opens and renders React app | ✅ |
| 2 | app-launch | store bridge is available | ✅ |
| 3 | app-launch | initial state is defined | ✅ |
| 4 | app-launch | project list page is displayed by default | ✅ |

### 导航

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 5 | navigation | project list page loads at root | ✅ |
| 6 | navigation | navigate to global settings page | ✅ |
| 7 | navigation | sidebar navigation within project | ✅ |
| 8 | navigation | navigate back to project list from project | ✅ |

### Project 管理

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 9 | project-crud | project list shows existing projects or empty state | ✅ |
| 10 | project-crud | create project modal opens | ✅ |
| 11 | project-crud | create a new project via UI | ✅ |
| 12 | project-crud | project appears in list after creation | ✅ |
| 13 | project-crud | navigate into project by clicking card | ✅ |
| 14 | project-crud | edit project name via project settings | ✅ |
| 15 | project-crud | project icon selector shows icons | ✅ |
| 16 | project-crud | navigate to all project settings tabs | ✅ |
| 17 | project-advanced | clone project creates a new project in the list | ✅ |
| 18 | project-advanced | delete project shows confirmation dialog — cancel keeps project | ✅ |
| 19 | project-advanced | set default agent via project settings API | ✅ |
| 20 | project-advanced | set default team via project settings API | ✅ |

### Agent 管理

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 21 | agent-crud | navigate to agents page | ✅ |
| 22 | agent-crud | agent create modal opens | ✅ |
| 23 | agent-crud | create a new agent and verify in store | ✅ |
| 24 | agent-crud | delete agent and verify removed | ✅ |
| 25 | agent-crud | agent config info tab edit name | ✅ |
| 26 | agent-advanced | agent shows idle status badge | ✅ |
| 27 | agent-advanced | clone agent via UI creates a new agent | ✅ |
| 28 | agent-advanced | MCP server shows security warning indicator | ✅ |
| 29 | agent-advanced | agent detail page renders all tabs | ✅ |

### Agent 配置（Tab 导航）

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 30 | agent-config | navigate to agent detail page | ✅ |
| 31 | agent-config | Info tab shows agent details | ✅ |
| 32 | agent-config | switch to Skills tab | ✅ |
| 33 | agent-config | switch to Tools tab and verify Bash toggle | ✅ |
| 34 | agent-config | switch to MCP tab | ✅ |
| 35 | agent-config | switch to Memory tab | ✅ |
| 36 | agent-config | Model Config tab shows provider/model selects | ✅ |
| 37 | agent-config | edit system prompt in General tab and save | ✅ |

### Agent 配置交互（Auto-Save / Explicit Save）

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 38 | agent-config-interaction | Skills Tab: assign skill triggers auto-save | ✅ |
| 39 | agent-config-interaction | Tools Tab: toggle browser triggers auto-save | ✅ |
| 40 | agent-config-interaction | MCP Tab: assign MCP server triggers auto-save | ✅ |
| 41 | agent-config-interaction | Model Config Tab: explicit save persists compactThreshold | ✅ |

### Team 管理

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 42 | team-page | team list page renders with empty state | ✅ |
| 43 | team-page | New Team button opens create modal | ✅ |
| 44 | team-page | sidebar navigation to teams page works | ✅ |
| 45 | team-page | team cards appear after creating a team via API | ✅ |
| 46 | team-crud | create team via UI modal | ✅ |
| 47 | team-crud | create button disabled when name is empty | ✅ |
| 48 | team-crud | team card navigates to detail page on click | ⏭️ skip |
| 49 | team-crud | clone team via UI button | ✅ |
| 50 | team-crud | delete team via API and verify removal from store | ✅ |

### Memory Tab

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 51 | memory-tab | memory tab shows empty state | ✅ |
| 52 | memory-tab | add button reveals form with all fields | ✅ |
| 53 | memory-tab | save button disabled when content is empty | ✅ |
| 54 | memory-tab | cancel button closes the form | ✅ |
| 55 | memory-tab | creating memory via API shows card in tab | ✅ |
| 56 | memory-tab | memory card shows pin, edit, delete buttons | ✅ |

### Chat 侧边栏

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 57 | chat-sidebar | conversation list renders | ✅ |
| 58 | chat-sidebar | switch between conversations | ✅ |
| 59 | chat-sidebar | rename conversation via double-click | ✅ |
| 60 | chat-sidebar | delete conversation | ✅ |

### Dashboard

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 61 | dashboard | dashboard loads as project index page | ✅ |
| 62 | dashboard | time range selector switches | ✅ |
| 63 | dashboard | token breakdown tabs switch | ✅ |
| 64 | dashboard | activity tabs work | ✅ |
| 65 | dashboard | navigate to dashboard via sidebar | ✅ |
| 66 | dashboard | overview agents section shows created agent | ✅ |
| 67 | dashboard | global dashboard page loads | ✅ |
| 68 | dashboard | global dashboard shows breakdown tabs | ✅ |
| 69 | dashboard | global dashboard shows top projects | ✅ |

### Skills 管理

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 70 | skills-page | navigate to skills page via sidebar | ✅ |
| 71 | skills-page | skills page shows header with count | ✅ |
| 72 | skills-page | empty state displayed when no skills | ✅ |
| 73 | skills-page | new skill button visible | ✅ |
| 74 | skills-page | open skill form modal | ✅ |
| 75 | skills-page | tabs visible: installed and marketplace | ✅ |
| 76 | skill-crud | create skill via UI | ✅ |
| 77 | skill-crud | tabs: switch between installed and marketplace | ✅ |
| 78 | skill-crud | edit skill | ✅ |
| 79 | skill-crud | delete skill | ✅ |

### MCP Server 管理

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 80 | mcp-page | navigate to MCP page via sidebar | ✅ |
| 81 | mcp-page | mcp page shows header | ✅ |
| 82 | mcp-page | empty state displayed when no servers | ✅ |
| 83 | mcp-page | new server button visible | ✅ |
| 84 | mcp-page | open MCP form modal | ✅ |
| 85 | mcp-page | transport type selector shows STDIO/SSE/HTTP | ✅ |

### Cron Job 管理

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 86 | cron-page | navigate to cron page via sidebar | ✅ |
| 87 | cron-page | cron page shows header | ✅ |
| 88 | cron-page | empty state displayed when no cron jobs | ✅ |
| 89 | cron-page | new button visible | ✅ |
| 90 | cron-page | open cron form modal | ✅ |
| 91 | cron-page | type toggle between recurring and one-time | ✅ |
| 92 | cron-page | cron expression presets visible | ✅ |

### Permission 配置 UI

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 93 | permission-config-ui | permission mode selector shows three modes | ✅ |
| 94 | permission-config-ui | selecting Sandbox mode shows config editor | ✅ |
| 95 | permission-config-ui | network restrictions toggle works | ✅ |
| 96 | permission-config-ui | applyToMCP toggle is visible and clickable | ✅ |
| 97 | permission-config-ui | denied commands section is visible | ✅ |
| 98 | permission-config-ui | selecting Restricted mode hides sandbox config | ✅ |
| 99 | permission-config-ui | selecting Unrestricted mode shows confirmation modal | ✅ |
| 100 | permission-config-ui | named config CRUD: create, verify, delete | ✅ |

### 模板系统

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 101 | template-selector | create project modal shows blank and template options | ✅ |
| 102 | template-selector | clicking From Template shows master-detail panel | ✅ |
| 103 | template-selector | selecting a template shows detail and auto-fills name | ✅ |
| 104 | template-selector | switching back to blank collapses template panel | ✅ |
| 105 | template-full | template selector shows all category filters | ✅ |
| 106 | template-full | category filter narrows template list | ✅ |
| 107 | template-full | selecting template shows detail panel with description | ✅ |
| 108 | template-full | selecting different template updates detail and name | ✅ |
| 109 | template-full | UI flow: select template → create → enter project → verify agents in sidebar | ✅ |

### Settings（全局设置）

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 110 | settings | settings page loads | ✅ |
| 111 | settings | settings tabs are visible | ✅ |
| 112 | settings | providers tab shows PROVIDERS header | ✅ |
| 113 | settings | providers tab shows configured providers | ✅ |
| 114 | settings | add provider button is visible | ✅ |
| 115 | settings | add provider shows preset options | ✅ |
| 116 | settings | add preset provider creates a new provider card | ✅ |
| 117 | settings | custom provider flow | ✅ |
| 118 | settings | general tab is default | ✅ |
| 119 | settings-advanced | theme switch updates store | ✅ |
| 120 | settings-advanced | language switch changes page text without crashing | ✅ |
| 121 | settings-advanced | provider API keys are masked in the UI | ✅ |
| 122 | settings-advanced | default model selector is visible in providers tab | ✅ |
| 123 | settings-advanced | Speech tab renders with enable toggle | ✅ |
| 124 | settings-advanced | Speech tab shows configuration form | ✅ |

### Task 页面

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 125 | task-page | navigate to tasks page via sidebar | ⏭️ skip |
| 126 | task-page | tasks page shows header | ⏭️ skip |
| 127 | task-page | tasks page shows empty state when no tasks | ⏭️ skip |
| 128 | task-page | tasks page has filter controls | ⏭️ skip |
| 129 | task-page | tasks page shows total count | ⏭️ skip |
| 130 | task-page | no console errors on task page | ⏭️ skip |

### Workspace / Artifacts

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 131 | workspace-page | navigate to workspace page via sidebar | ✅ |
| 132 | workspace-page | workspace page shows header | ✅ |
| 133 | workspace-page | refresh button visible | ✅ |
| 134 | workspace-page | file tree panel visible | ✅ |
| 135 | workspace-page | preview panel shows select prompt | ✅ |
| 136 | workspace-files | file tree renders | ✅ |
| 137 | workspace-files | preview panel shows select prompt | ✅ |
| 138 | workspace-files | refresh button works | ✅ |
| 139 | workspace-operations | file tree shows seeded files after refresh | ✅ |
| 140 | workspace-operations | clicking a file shows preview with content | ✅ |
| 141 | workspace-operations | directory can be expanded to show nested files | ✅ |

---

## Server 层（27 文件 / 192 用例）

### Agent API

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 142 | agent-clone | POST /agents/:id/clone creates a new agent with copied fields | ✅ |
| 143 | agent-clone | cloned agent is independently retrievable via GET | ✅ |
| 144 | agent-clone | clone with empty name returns 400 | ✅ |
| 145 | agent-clone | clone with name exceeding 100 chars returns 400 | ✅ |
| 146 | agent-clone | clone without name field returns 400 | ✅ |
| 147 | agent-clone | clone preserves skillIds and mcpServers when present | ✅ |

### Browser Tool 配置

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 148 | browser-tool-config | POST agent with builtinTools.browser: true persists correctly | ✅ |
| 149 | browser-tool-config | POST agent with explicit builtinTools preserves all fields | ✅ |
| 150 | browser-tool-config | POST agent without builtinTools gets correct defaults | ✅ |
| 151 | browser-tool-config | PATCH agent can toggle builtinTools.browser | ✅ |

### Chat UI

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 152 | chat-ui | chat page loads and shows empty state | ✅ |
| 153 | chat-ui | start chat shows chat input | ✅ |
| 154 | chat-ui | type and send a user message | ✅ |

### Chat 导航

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 155 | chat-navigation | navigating to ?conv=id syncs selectedConversationId in store | ✅ |
| 156 | chat-navigation | PATCH empty conversation targetType/targetId switches agent | ✅ |
| 157 | chat-navigation | conversation with messages supports creating new conversation for different agent | ✅ |
| 158 | chat-navigation | PATCH conversation to team target type | ✅ |

### Conversation API

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 159 | conversation-api | POST /conversations creates a conversation | ✅ |
| 160 | conversation-api | GET /conversations lists conversations | ✅ |
| 161 | conversation-api | GET /conversations?agentId= filters by agent | ✅ |
| 162 | conversation-api | GET /conversations/:id returns single conversation | ✅ |
| 163 | conversation-api | PATCH /conversations/:id updates title | ✅ |
| 164 | conversation-api | POST messages saves a user message | ✅ |
| 165 | conversation-api | POST messages saves an assistant message with token fields | ✅ |
| 166 | conversation-api | GET messages returns paginated results | ✅ |
| 167 | conversation-api | GET messages returns oldest first | ✅ |
| 168 | conversation-api | GET /messages/search finds saved message via FTS5 | ✅ |
| 169 | conversation-api | GET /token-usage returns usage structure | ✅ |
| 170 | conversation-api | DELETE /conversations/:id removes conversation | ✅ |

### Conversation 高级

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 171 | conversation-advanced | GET /messages with small pageSize returns limited results and hasMore=true | ✅ |
| 172 | conversation-advanced | GET /messages page 2 returns different messages than page 1 | ✅ |
| 173 | conversation-advanced | GET /messages last page has hasMore=false | ✅ |
| 174 | conversation-advanced | POST /compact returns 400 for conversation with no messages | ✅ |
| 175 | conversation-advanced | POST /compact accepts conversation with messages (201 or 500) | ✅ |
| 176 | conversation-advanced | GET /conversations?agentId= returns only conversations for that agent | ✅ |

### Cron Job API

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 177 | cronjob-api | POST /cronjobs creates a recurring cron job | ✅ |
| 178 | cronjob-api | POST /cronjobs creates a one-time cron job | ✅ |
| 179 | cronjob-api | GET /cronjobs lists both cron jobs | ✅ |
| 180 | cronjob-api | GET /cronjobs/:id returns cron job with expected structure | ✅ |
| 181 | cronjob-api | PATCH /cronjobs/:id updates cron expression | ✅ |
| 182 | cronjob-api | PATCH /cronjobs/:id toggles enabled to false | ✅ |
| 183 | cronjob-api | POST /cronjobs with invalid cron expression returns 400 | ✅ |
| 184 | cronjob-api | POST /cronjobs one-time without valid scheduledAt returns 400 | ✅ |
| 185 | cronjob-api | GET /cronjobs/runs returns empty array initially | ✅ |
| 186 | cronjob-api | GET /cronjobs/:id/runs returns empty array initially | ✅ |
| 187 | cronjob-api | DELETE /cronjobs/:id removes cron job and GET returns 404 | ✅ |

### Dashboard API

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 188 | dashboard-api | dashboard summary returns valid structure | ✅ |
| 189 | dashboard-api | dashboard summary with timeRange param | ✅ |
| 190 | dashboard-api | token-by-model returns array | ✅ |
| 191 | dashboard-api | token-by-agent returns array | ✅ |
| 192 | dashboard-api | token-trend returns 24 hourly entries for today | ✅ |
| 193 | dashboard-api | runtime-status returns valid structure | ✅ |
| 194 | dashboard-api | global dashboard summary returns valid structure | ✅ |
| 195 | dashboard-api | global dashboard token-by-project returns array with at least 1 project | ✅ |
| 196 | dashboard-api | global dashboard runtime-status returns valid structure | ✅ |
| 197 | dashboard-full | GET summary with timeRange=today | ✅ |
| 198 | dashboard-full | GET summary with timeRange=7d | ✅ |
| 199 | dashboard-full | GET summary with timeRange=30d | ✅ |
| 200 | dashboard-full | GET summary with no timeRange param | ✅ |
| 201 | dashboard-full | GET token-by-model with timeRange=today | ✅ |
| 202 | dashboard-full | GET token-by-model with timeRange=7d | ✅ |
| 203 | dashboard-full | GET token-by-model with timeRange=30d | ✅ |
| 204 | dashboard-full | GET token-by-model with no timeRange | ✅ |
| 205 | dashboard-full | GET token-by-agent with timeRange=today | ✅ |
| 206 | dashboard-full | GET token-by-agent with timeRange=7d | ✅ |
| 207 | dashboard-full | GET token-by-agent with timeRange=30d | ✅ |
| 208 | dashboard-full | GET token-by-agent with no timeRange | ✅ |
| 209 | dashboard-full | GET agent-stats returns array | ✅ |
| 210 | dashboard-full | GET agent-stats with timeRange=7d | ✅ |
| 211 | dashboard-full | GET recent-chats returns array | ✅ |
| 212 | dashboard-full | GET recent-chats with limit respects limit | ✅ |
| 213 | dashboard-full | GET token-trend with timeRange=today returns 24 entries | ✅ |
| 214 | dashboard-full | GET token-trend with timeRange=7d | ✅ |
| 215 | dashboard-full | GET token-trend with timeRange=30d | ✅ |
| 216 | dashboard-full | GET /api/dashboard/token-by-model returns array | ✅ |
| 217 | dashboard-full | GET /api/dashboard/token-by-agent returns array | ✅ |
| 218 | dashboard-full | GET /api/dashboard/token-trend with timeRange=7d returns array | ✅ |

### 删除安全性

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 219 | deletion-safety | deleting agent leaves orphan reference in team — team GET still works | ✅ |
| 220 | deletion-safety | deleting agent leaves orphan reference in cron — cron GET still works | ✅ |
| 221 | deletion-safety | deleting team leaves orphan reference in cron — cron GET still works | ✅ |
| 222 | deletion-safety | deleting project cascades — all sub-resource APIs return 404 | ✅ |

### MCP API

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 223 | mcp-api | POST /mcp creates a stdio server | ✅ |
| 224 | mcp-api | POST /mcp creates an SSE server | ✅ |
| 225 | mcp-api | GET /mcp lists both servers | ✅ |
| 226 | mcp-api | GET /mcp/:name returns server by name | ✅ |
| 227 | mcp-api | PATCH /mcp/:name updates description | ✅ |
| 228 | mcp-api | POST /mcp/:name/test tests connectivity | ✅ |
| 229 | mcp-api | POST /mcp with duplicate name returns 409 | ✅ |
| 230 | mcp-api | DELETE /mcp/:name deletes unreferenced server | ✅ |
| 231 | mcp-api | DELETE /mcp/:name returns 409 when referenced by agent | ✅ |

### Memory API

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 232 | memory-api | POST /memories creates a memory with required fields | ✅ |
| 233 | memory-api | POST /memories creates a memory with all optional fields | ✅ |
| 234 | memory-api | GET /memories lists memories for agent | ✅ |
| 235 | memory-api | PATCH /memories/:id updates content | ✅ |
| 236 | memory-api | PATCH /memories/:id updates tags | ✅ |
| 237 | memory-api | PATCH /memories/:id pins a memory | ✅ |
| 238 | memory-api | PATCH /memories/:id unpins a memory | ✅ |
| 239 | memory-api | POST /memories with priority 0 succeeds | ✅ |
| 240 | memory-api | POST /memories with priority 5 succeeds | ✅ |
| 241 | memory-api | POST /memories with priority 6 returns 400 | ✅ |
| 242 | memory-api | POST /memories with negative priority returns 400 | ✅ |
| 243 | memory-api | POST /memories with empty content returns 400 | ✅ |
| 244 | memory-api | POST /memories with whitespace-only content returns 400 | ✅ |
| 245 | memory-api | DELETE /memories/:id removes a memory | ✅ |

### 消息上传

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 246 | message-uploads | saving a message with base64 image extracts upload | ✅ |
| 247 | message-uploads | GET /uploads/:filename returns correct content for valid upload | ✅ |
| 248 | message-uploads | GET /uploads with path traversal returns 400 | ✅ |
| 249 | message-uploads | GET /uploads with invalid filename format returns 400 | ✅ |

### Permission 系统

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 250 | permission-modes | navigate to project settings and see Permissions tab | ✅ |
| 251 | permission-modes | Permissions tab renders permissions settings component | ✅ |
| 252 | permission-modes | Agent tab shows main agent selector | ✅ |
| 253 | permission-modes | Provider tab shows global default | ✅ |
| 254 | permission-modes | MCP tab on agent shows warning when mode is not sandbox | ✅ |
| 255 | permissions-api | POST creates restricted config | ✅ |
| 256 | permissions-api | POST creates sandbox config with settings | ✅ |
| 257 | permissions-api | POST creates unrestricted config | ✅ |
| 258 | permissions-api | GET / lists all 3 configs | ✅ |
| 259 | permissions-api | GET /:id returns config with correct fields | ✅ |
| 260 | permissions-api | PATCH /:id updates mode | ✅ |
| 261 | permissions-api | POST /:id/duplicate creates a copy with new title | ✅ |
| 262 | permissions-api | DELETE /:id removes config | ✅ |
| 263 | permissions-api | POST with invalid mode returns 400 | ✅ |

### Project & Agent 生命周期

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 264 | project-agent-lifecycle | POST /projects creates project with id and name | ✅ |
| 265 | project-agent-lifecycle | GET /projects/:id returns all expected fields | ✅ |
| 266 | project-agent-lifecycle | PATCH /projects/:id updates name and description | ✅ |
| 267 | project-agent-lifecycle | GET /projects/:id verifies updated fields | ✅ |
| 268 | project-agent-lifecycle | creates agents and sets defaultAgentId | ✅ |
| 269 | project-agent-lifecycle | DELETE agent1 cascades: clears defaultAgentId | ✅ |
| 270 | project-agent-lifecycle | PATCH project icon is persisted | ✅ |
| 271 | project-agent-lifecycle | creates conversation tied to agent2 | ✅ |
| 272 | project-agent-lifecycle | DELETE /projects/:id removes project | ✅ |
| 273 | project-agent-lifecycle | GET /projects/:id returns 404 after deletion | ✅ |

### Runtime

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 274 | runtime-api | GET /runtime/status returns python and node keys | ✅ |
| 275 | runtime-api | GET /runtime/python/packages returns array | ✅ |
| 276 | runtime-api | GET /api/health returns ok status | ✅ |
| 277 | runtime-api | GET /dashboard/runtime-status returns structure with runningChats | ✅ |
| 278 | runtime-extended | pip install a package | ✅ |
| 279 | runtime-extended | pip install with invalid package name returns 400 | ✅ |
| 280 | runtime-extended | pip install with empty packages array returns 400 | ✅ |
| 281 | runtime-extended | pip uninstall a package | ✅ |
| 282 | runtime-extended | pip uninstall with invalid package name returns 400 | ✅ |
| 283 | runtime-extended | venv reset | ✅ |
| 284 | runtime-management | model config tab shows effective configuration | ✅ |
| 285 | runtime-management | model config tab shows provider selector with inherit option | ✅ |
| 286 | runtime-management | save model config changes and verify persistence | ✅ |
| 287 | runtime-management | project provider override configuration | ✅ |
| 288 | runtime-management | general tab shows project info and working directory | ✅ |

### Sandbox Readiness

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 289 | sandbox-readiness | GET /sandbox/readiness returns correct structure | ✅ |
| 290 | sandbox-readiness | GET /sandbox/readiness with projectId returns structure | ✅ |
| 291 | sandbox-readiness | issues array items have correct shape when present | ✅ |
| 292 | sandbox-readiness | available is true when no issues | ✅ |
| 293 | sandbox-readiness | readiness with non-existent projectId still returns structure | ✅ |

### Settings API

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 294 | settings-api | GET /api/settings returns object with providers | ✅ |
| 295 | settings-api | PATCH /api/settings updates a field | ✅ |
| 296 | settings-api | GET /api/settings verifies updated field persisted | ✅ |
| 297 | settings-api | PATCH /api/settings adds custom provider entry | ✅ |
| 298 | settings-api | GET /api/settings verifies custom provider exists | ✅ |
| 299 | settings-api | PATCH /api/settings removes custom provider | ✅ |

### Skill API

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 300 | skill-api | POST /skills creates a skill | ✅ |
| 301 | skill-api | GET /skills lists skills including created one | ✅ |
| 302 | skill-api | GET /skills/:id returns full skill | ✅ |
| 303 | skill-api | PATCH /skills/:id updates name and instructions | ✅ |
| 304 | skill-api | POST /skills creates a second skill | ✅ |
| 305 | skill-api | DELETE /skills/:id deletes unreferenced skill | ✅ |
| 306 | skill-api | DELETE /skills/:id returns 409 when skill is referenced by agent | ✅ |
| 307 | skill-api | POST /skills with empty name returns 400 | ✅ |
| 308 | skill-api | GET /skills lists only non-deleted skills | ✅ |

### Team API

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 309 | team-api | POST /teams creates a team with members | ✅ |
| 310 | team-api | GET /teams lists teams including created one | ✅ |
| 311 | team-api | GET /teams/:id returns full team with members | ✅ |
| 312 | team-api | PATCH /teams/:id updates name and description | ✅ |
| 313 | team-api | PATCH /teams/:id updates members | ✅ |
| 314 | team-api | POST /teams/:id/clone creates a copy | ✅ |
| 315 | team-api | POST /teams/:id/clone returns 400 for empty name | ✅ |
| 316 | team-api | POST /teams/:id/clone returns 400 for name over 100 chars | ✅ |
| 317 | team-api | GET /teams/:id/layout returns layout (empty initially) | ✅ |
| 318 | team-api | PUT /teams/:id/layout saves and returns layout | ✅ |
| 319 | team-api | DELETE /teams/:id removes the team | ✅ |
| 320 | team-api | DELETE /teams/:id clears project defaultTargetId if pointing to team | ✅ |
| 321 | team-api | GET /teams/:id returns 404 for non-existent team | ✅ |

### Template 创建

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 322 | template-creation | POST /projects/from-template creates writing-assistant project | ✅ |
| 323 | template-creation | writing-assistant has 1 agent (Writer) | ✅ |
| 324 | template-creation | writing-assistant has 5 skills | ✅ |
| 325 | template-creation | writing-assistant has 1 MCP server (fetch) | ✅ |
| 326 | template-creation | writing-assistant has no teams | ✅ |
| 327 | template-creation | POST /projects/from-template creates deep-research project | ✅ |
| 328 | template-creation | deep-research has 3 agents with correct roles | ✅ |
| 329 | template-creation | deep-research has 4 skills | ✅ |
| 330 | template-creation | deep-research has 1 team with 3 members | ✅ |
| 331 | template-creation | deep-research has 3 MCP servers | ✅ |
| 332 | template-creation | deep-research has 1 cron job (disabled) | ✅ |
| 333 | template-creation | POST /projects/from-template returns 404 for unknown template | ✅ |
| 334 | template-creation | POST /projects/from-template returns 400 without templateId | ✅ |
| 335 | template-creation | POST /projects still creates a blank project (no template) | ✅ |
| 336 | template-creation | cleanup: delete test projects | ✅ |
| 337 | template-creation-all | smart-secretary template creates correct structure | ✅ |
| 338 | template-creation-all | translator template creates correct structure | ✅ |
| 339 | template-creation-all | knowledge-explorer template creates correct structure | ✅ |
| 340 | template-creation-all | life-manager template creates correct structure | ✅ |
| 341 | template-creation-all | doc-hub template creates correct structure | ✅ |
| 342 | template-creation-all | social-media-ops template creates correct structure | ✅ |
| 343 | template-creation-all | customer-service template creates correct structure | ✅ |
| 344 | template-creation-all | legal-compliance template creates correct structure | ✅ |
| 345 | template-creation-all | product-mgmt template creates correct structure | ✅ |
| 346 | template-creation-all | recruitment template creates correct structure | ✅ |
| 347 | template-creation-all | content-marketing template creates correct structure | ✅ |
| 348 | template-creation-all | seo-optimizer template creates correct structure | ✅ |
| 349 | template-creation-all | sales-pipeline template creates correct structure | ✅ |
| 350 | template-creation-all | financial-mgmt template creates correct structure | ✅ |
| 351 | template-creation-all | data-analytics template creates correct structure | ✅ |
| 352 | template-creation-all | academic-research template creates correct structure | ✅ |
| 353 | template-creation-all | cleanup: delete all test projects | ✅ |

### Workspace API

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 354 | workspace-api | GET /workspace lists root directory as array | ✅ |
| 355 | workspace-api | GET /workspace response entries are valid objects | ✅ |
| 356 | workspace-api | GET /workspace?path=nonexistent returns empty array | ✅ |
| 357 | workspace-api | GET /workspace/file without path returns 400 | ✅ |
| 358 | workspace-api | GET /workspace/file?path=nonexistent.txt returns 404 | ✅ |
| 359 | workspace-api | DELETE /workspace/file without path returns 400 | ✅ |

---

## AI 层（11 文件 / 55 用例）

### Agent Persona

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 360 | agent-persona | agent with pirate system prompt responds in character | ✅ |
| 361 | agent-persona | agent with translator system prompt translates | ✅ |
| 362 | agent-persona | agent with strict format system prompt follows format | ✅ |

### Chat 流程

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 363 | chat-flow | send message and receive real AI response | ✅ |
| 364 | chat-flow | thinking indicator appears while waiting for response | ✅ |
| 365 | chat-flow | multi-turn conversation retains context | ✅ |
| 366 | chat-flow | chat input disabled during streaming and re-enabled after | ✅ |
| 367 | chat-flow | empty state shows agent cards for quick start | ✅ |

### Chat 高级

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 368 | chat-advanced | Stop button interrupts streaming and re-enables input | ✅ |
| 369 | chat-advanced | tool call block appears in chat when bash tool is used | ✅ |
| 370 | chat-advanced | manual compact via API returns 201 after chat messages | ✅ |

### Chat 生命周期

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 371 | chat-lifecycle | create conversation and send message via API | ✅ |
| 372 | chat-lifecycle | verify conversation messages contain user and assistant | ✅ |
| 373 | chat-lifecycle | verify agent status after chat completes | ✅ |
| 374 | chat-lifecycle | verify runtime-status structure | ✅ |
| 375 | chat-lifecycle | delete conversation and verify messages deleted | ✅ |
| 376 | chat-lifecycle | chat with primary agent | ✅ |
| 377 | chat-lifecycle | chat with secondary agent | ✅ |
| 378 | chat-lifecycle | dashboard shows independent token counts for each agent | ✅ |

### Auto Compact

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 379 | auto-compact | auto compact triggers after multiple rounds exceeding threshold | ✅ |

### Cron Job 执行

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 380 | cronjob-execution | create and manually trigger cron job | ✅ |
| 381 | cronjob-execution | verify cron job run completed successfully | ✅ |
| 382 | cronjob-execution | verify triggered conversation has messages | ✅ |
| 383 | cronjob-execution | create cron job with every-minute schedule | ✅ |
| 384 | cronjob-execution | wait for scheduled execution and verify | ✅ |
| 385 | cronjob-execution | verify scheduled run created conversation | ✅ |

### Memory 工具

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 386 | memory-tools | pinned memory is available in new conversations | ✅ |
| 387 | memory-tools | agent can save memory via MemorySave tool | ✅ |
| 388 | memory-tools | agent can search memory via MemorySearch tool | ✅ |

### Permission 模式 & 工具

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 389 | permission-modes-tools | restricted mode: agent cannot execute bash | ✅ |
| 390 | permission-modes-tools | restricted mode: sandbox readiness check | ✅ |
| 391 | permission-modes-tools | restricted mode: verify config applied | ✅ |
| 392 | permission-modes-tools | sandbox mode: agent can execute bash | ✅ |
| 393 | permission-modes-tools | sandbox mode: verify sandbox readiness | ✅ |
| 394 | permission-modes-tools | sandbox mode: denied commands blocked | ✅ |
| 395 | permission-modes-tools | sandbox mode: allowed paths work | ✅ |
| 396 | permission-modes-tools | sandbox mode: verify applyToMCP config | ✅ |
| 397 | permission-modes-tools | unrestricted mode: agent can execute bash | ✅ |
| 398 | permission-modes-tools | unrestricted mode: file operations work | ✅ |
| 399 | permission-modes-tools | unrestricted mode: verify config | ✅ |
| 400 | permission-modes-tools | unrestricted mode: all tools available | ✅ |

### Task 工具

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 401 | task-tool | agent creates a task via task tool | ✅ |
| 402 | task-tool | agent can list tasks | ✅ |
| 403 | task-tool | agent can update a task status | ✅ |

### Team Chat

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 404 | team-chat | team chat triggers sub-agent delegation via tool call | ✅ |
| 405 | team-chat | team chat returns a meaningful response | ✅ |

### Token 准确性

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 406 | token-accuracy | conversation token-usage matches sent totals | ✅ |
| 407 | token-accuracy | dashboard summary todayTokens total is positive | ✅ |
| 408 | token-accuracy | dashboard summary call count >= 3 | ✅ |
| 409 | token-accuracy | dashboard token-by-model contains agent model | ✅ |
| 410 | token-accuracy | dashboard token-by-agent contains test agent | ✅ |
| 411 | token-accuracy | timeRange=today returns positive tokens | ✅ |
| 412 | token-accuracy | timeRange=7d tokens >= today | ✅ |
| 413 | token-accuracy | timeRange=30d tokens >= 7d | ✅ |
| 414 | token-accuracy | timeRange all tokens >= 30d | ✅ |
| 415 | token-accuracy | global token-by-project contains test project | ✅ |

### Code Execution

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| — | code-execution | execute echo command via bash tool | ✅ |
| — | code-execution | execute Python code and verify output | ✅ |
| — | code-execution | execute Node.js code and verify output | ✅ |

---

## Onboarding 层（1 文件 / 7 用例）

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 416 | onboarding-flow | Welcome step renders with logo and Get Started button | ✅ |
| 417 | onboarding-flow | Welcome step has language selector | ✅ |
| 418 | onboarding-flow | Get Started navigates to Provider step | ✅ |
| 419 | onboarding-flow | Provider step shows preset provider grid | ✅ |
| 420 | onboarding-flow | Provider step: selecting a preset shows API key input | ✅ |
| 421 | onboarding-flow | Back button returns to Welcome step from Provider step | ✅ |
| 422 | onboarding-flow | Skip button completes onboarding and goes to project list | ✅ |
