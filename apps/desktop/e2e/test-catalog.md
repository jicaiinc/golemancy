# E2E 测试完整目录（479 个用例）

> 生成时间：2026-04-03 | 84 个文件 | 479 个用例（含 7 个 skip）

## 总览

| 层级 | 文件数 | 用例数 | Skip | 需要 API Key | 运行命令示例 |
|------|--------|-------|------|-------------|------------|
| smoke | 30 | 152 | 7 | 否 | `test:e2e:only -- --project=smoke` |
| server | 28 | 224 | 0 | 否 | `test:e2e:only -- --project=server` |
| ai | 25 | 96 | 0 | 是 | `test:e2e:only -- --project=ai` |
| onboarding | 1 | 7 | 0 | 否 | `test:e2e:only -- --project=onboarding` |
| **总计** | **84** | **479** | **7** | | |

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

## Smoke 层（30 文件 / 152 用例）

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

### Agent 配置

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 30 | agent-config | navigate to agent detail page | ✅ |
| 31 | agent-config | General tab shows agent details | ✅ |
| 32 | agent-config | switch to Skills tab | ✅ |
| 33 | agent-config | switch to Tools tab and verify Bash toggle | ✅ |
| 34 | agent-config | switch to MCP tab | ✅ |
| 35 | agent-config | switch to Memory tab | ✅ |
| 36 | agent-config | Model Config tab shows provider/model selects | ✅ |
| 37 | agent-config | edit system prompt in General tab and save | ✅ |

### Agent 配置交互

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 38 | agent-config-interaction | Skills Tab: assign skill triggers auto-save | ✅ |
| 39 | agent-config-interaction | Tools Tab: toggle browser triggers auto-save | ✅ |
| 40 | agent-config-interaction | MCP Tab: assign MCP server triggers auto-save | ✅ |
| 41 | agent-config-interaction | Model Config Tab: auto-save renders without Save button | ✅ |

### Agent 状态

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 42 | agent-status | agent status syncs across list, detail, and dashboard while running | ✅ |
| 43 | agent-status | agent error state appears in list, detail, and dashboard recent activity | ✅ |
| 44 | agent-status-relaunch | stale running agent resets to idle after app relaunch | ✅ |

### Team 管理

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 45 | team-page | team list page renders with empty state | ✅ |
| 46 | team-page | New Team button opens create modal | ✅ |
| 47 | team-page | sidebar navigation to teams page works | ✅ |
| 48 | team-page | team cards appear after creating a team via API | ✅ |
| 49 | team-crud | create team via UI modal | ✅ |
| 50 | team-crud | create button disabled when name is empty | ✅ |
| 51 | team-crud | team card navigates to detail page on click | ⏭️ skip |
| 52 | team-crud | clone team via UI button | ✅ |
| 53 | team-crud | delete team via API and verify removal from store | ✅ |

### Memory Tab

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 54 | memory-tab | memory tab shows empty state | ✅ |
| 55 | memory-tab | add button reveals form with all fields | ✅ |
| 56 | memory-tab | save button disabled when content is empty | ✅ |
| 57 | memory-tab | cancel button closes the form | ✅ |
| 58 | memory-tab | creating memory via API shows card in tab | ✅ |
| 59 | memory-tab | memory card shows pin, edit, delete buttons | ✅ |

### Chat 侧边栏

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 60 | chat-sidebar | conversation list renders | ✅ |
| 61 | chat-sidebar | switch between conversations | ✅ |
| 62 | chat-sidebar | rename conversation via double-click | ✅ |
| 63 | chat-sidebar | delete conversation | ✅ |

### Dashboard

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 64 | dashboard | dashboard loads as project index page | ✅ |
| 65 | dashboard | time range selector switches | ✅ |
| 66 | dashboard | token breakdown tabs switch | ✅ |
| 67 | dashboard | activity tabs work | ✅ |
| 68 | dashboard | navigate to dashboard via sidebar | ✅ |
| 69 | dashboard | overview agents section shows created agent | ✅ |
| 70 | dashboard | global dashboard page loads | ✅ |
| 71 | dashboard | global dashboard shows breakdown tabs | ✅ |
| 72 | dashboard | global dashboard shows top projects | ✅ |

### Skills 管理

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 73 | skills-page | navigate to skills page via sidebar | ✅ |
| 74 | skills-page | skills page shows header with count | ✅ |
| 75 | skills-page | empty state displayed when no skills | ✅ |
| 76 | skills-page | new skill button visible | ✅ |
| 77 | skills-page | open skill form modal | ✅ |
| 78 | skills-page | tabs visible: installed and marketplace | ✅ |
| 79 | skill-crud | create skill via UI | ✅ |
| 80 | skill-crud | tabs: switch between installed and marketplace | ✅ |
| 81 | skill-crud | edit skill | ✅ |
| 82 | skill-crud | delete skill | ✅ |

### Skills 导入

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 83 | skills-import-zip | uploading a zip shows success status and renders the imported skill | ✅ |
| 84 | skills-import-zip | invalid zip upload surfaces an error message | ✅ |

### MCP Server 管理

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 85 | mcp-page | navigate to MCP page via sidebar | ✅ |
| 86 | mcp-page | mcp page shows header | ✅ |
| 87 | mcp-page | empty state displayed when no servers | ✅ |
| 88 | mcp-page | new server button visible | ✅ |
| 89 | mcp-page | open MCP form modal | ✅ |
| 90 | mcp-page | transport type selector shows STDIO/SSE/HTTP | ✅ |

### Cron Job 管理

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 91 | cron-page | navigate to cron page via sidebar | ✅ |
| 92 | cron-page | cron page shows header | ✅ |
| 93 | cron-page | empty state displayed when no cron jobs | ✅ |
| 94 | cron-page | new button visible | ✅ |
| 95 | cron-page | open cron form modal | ✅ |
| 96 | cron-page | type toggle between recurring and one-time | ✅ |
| 97 | cron-page | cron expression presets visible | ✅ |

### Permission 配置 UI

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 98 | permission-config-ui | permission mode selector shows three modes | ✅ |
| 99 | permission-config-ui | selecting Sandbox mode shows config editor | ✅ |
| 100 | permission-config-ui | network restrictions toggle works | ✅ |
| 101 | permission-config-ui | applyToMCP toggle is visible and clickable | ✅ |
| 102 | permission-config-ui | denied commands section is visible | ✅ |
| 103 | permission-config-ui | selecting Restricted mode hides sandbox config | ✅ |
| 104 | permission-config-ui | selecting Unrestricted mode shows confirmation modal | ✅ |
| 105 | permission-config-ui | named config CRUD: create, verify, delete | ✅ |

### 模板系统

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 106 | template-selector | create project modal shows blank and template options | ✅ |
| 107 | template-selector | clicking From Template shows master-detail panel | ✅ |
| 108 | template-selector | selecting a template shows detail and auto-fills name | ✅ |
| 109 | template-selector | switching back to blank collapses template panel | ✅ |
| 110 | template-full | template selector shows all category filters | ✅ |
| 111 | template-full | category filter narrows template list | ✅ |
| 112 | template-full | selecting template shows detail panel with description | ✅ |
| 113 | template-full | selecting different template updates detail and name | ✅ |
| 114 | template-full | UI flow: select template → create → enter project → verify agents in sidebar | ✅ |

### Settings

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 115 | settings | settings page loads | ✅ |
| 116 | settings | settings tabs are visible | ✅ |
| 117 | settings | providers tab shows PROVIDERS header | ✅ |
| 118 | settings | providers tab shows configured providers | ✅ |
| 119 | settings | add provider button is visible | ✅ |
| 120 | settings | add provider shows preset options | ✅ |
| 121 | settings | add preset provider shows configure form | ✅ |
| 122 | settings | custom provider flow | ✅ |
| 123 | settings | general tab is default | ✅ |
| 124 | settings-advanced | theme switch updates store | ✅ |
| 125 | settings-advanced | language switch changes page text without crashing | ✅ |
| 126 | settings-advanced | provider API keys are masked in the UI | ✅ |
| 127 | settings-advanced | default model selector is visible in providers tab | ✅ |
| 128 | settings-advanced | Speech tab renders with enable toggle | ✅ |
| 129 | settings-advanced | Speech tab shows configuration form | ✅ |

### Task 页面

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 130 | task-page | navigate to tasks page via sidebar | ⏭️ skip |
| 131 | task-page | tasks page shows header | ⏭️ skip |
| 132 | task-page | tasks page shows empty state when no tasks | ⏭️ skip |
| 133 | task-page | tasks page has filter controls | ⏭️ skip |
| 134 | task-page | tasks page shows total count | ⏭️ skip |
| 135 | task-page | no console errors on task page | ⏭️ skip |

### Workspace

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 136 | workspace-page | navigate to workspace page via sidebar | ✅ |
| 137 | workspace-page | workspace page shows header | ✅ |
| 138 | workspace-page | refresh button visible | ✅ |
| 139 | workspace-page | file tree panel visible | ✅ |
| 140 | workspace-page | preview panel shows select prompt | ✅ |
| 141 | workspace-files | file tree renders | ✅ |
| 142 | workspace-files | preview panel shows select prompt | ✅ |
| 143 | workspace-files | refresh button works | ✅ |
| 144 | workspace-operations | file tree shows seeded files after refresh | ✅ |
| 145 | workspace-operations | clicking a file shows preview with content | ✅ |
| 146 | workspace-operations | directory can be expanded to show nested files | ✅ |

### 保存行为一致性

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 147 | save-behavior-consistency | Skills tab: assign triggers auto-save | ✅ |
| 148 | save-behavior-consistency | Tools tab: toggle triggers auto-save | ✅ |
| 149 | save-behavior-consistency | General tab: edit requires explicit Save click | ✅ |
| 150 | save-behavior-consistency | Model Config tab: auto-save renders without Save button | ✅ |
| 151 | save-behavior-consistency | Project default agent: select triggers auto-save | ✅ |
| 152 | save-behavior-consistency | Global theme: switch triggers auto-save | ✅ |

---

## Server 层（28 文件 / 224 用例）

### Agent API

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 153 | agent-clone | POST /agents/:id/clone creates a new agent with copied fields | ✅ |
| 154 | agent-clone | cloned agent is independently retrievable via GET | ✅ |
| 155 | agent-clone | clone with empty name returns 400 | ✅ |
| 156 | agent-clone | clone with name exceeding 100 chars returns 400 | ✅ |
| 157 | agent-clone | clone without name field returns 400 | ✅ |
| 158 | agent-clone | clone preserves skillIds and mcpServers when present | ✅ |

### Browser Tool 配置

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 159 | browser-tool-config | POST agent with builtinTools.browser: true persists correctly | ✅ |
| 160 | browser-tool-config | POST agent with explicit builtinTools preserves all fields | ✅ |
| 161 | browser-tool-config | POST agent without builtinTools gets storage defaults (bash only) | ✅ |
| 162 | browser-tool-config | PATCH agent can toggle builtinTools.browser | ✅ |

### Chat 导航

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 163 | chat-navigation | navigating to ?conv=id syncs currentConversation in store | ✅ |
| 164 | chat-navigation | PATCH empty conversation targetType/targetId switches agent | ✅ |
| 165 | chat-navigation | conversation with messages supports creating a new conversation for different agent | ✅ |
| 166 | chat-navigation | PATCH conversation to team target type | ✅ |

### Chat UI

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 167 | chat-ui | chat page loads and shows empty state | ✅ |
| 168 | chat-ui | start chat shows chat input | ✅ |
| 169 | chat-ui | type and send a user message | ✅ |

### Conversation API

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 170 | conversation-api | POST /conversations creates a conversation | ✅ |
| 171 | conversation-api | GET /conversations lists conversations | ✅ |
| 172 | conversation-api | GET /conversations?agentId= filters by agent | ✅ |
| 173 | conversation-api | GET /conversations/:id returns single conversation | ✅ |
| 174 | conversation-api | PATCH /conversations/:id updates title | ✅ |
| 175 | conversation-api | POST messages saves a user message | ✅ |
| 176 | conversation-api | POST messages saves an assistant message with token fields | ✅ |
| 177 | conversation-api | GET messages returns paginated results | ✅ |
| 178 | conversation-api | GET messages returns newest first | ✅ |
| 179 | conversation-api | GET /messages/search finds saved message via FTS5 | ✅ |
| 180 | conversation-api | GET /token-usage returns usage structure | ✅ |
| 181 | conversation-api | DELETE /conversations/:id removes conversation | ✅ |

### Conversation 高级

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 182 | conversation-advanced | GET /messages with small pageSize returns limited results and total exceeds page | ✅ |
| 183 | conversation-advanced | GET /messages page 2 returns different messages than page 1 | ✅ |
| 184 | conversation-advanced | GET /messages last page has total within pageSize | ✅ |
| 185 | conversation-advanced | POST /compact returns 400 for conversation with no messages | ✅ |
| 186 | conversation-advanced | POST /compact accepts conversation with messages (201 or 500) | ✅ |
| 187 | conversation-advanced | GET /conversations?agentId= returns only conversations for that agent | ✅ |

### Cron Job API

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 188 | cronjob-api | POST /cronjobs creates a recurring cron job | ✅ |
| 189 | cronjob-api | POST /cronjobs creates a one-time cron job | ✅ |
| 190 | cronjob-api | GET /cronjobs lists both cron jobs | ✅ |
| 191 | cronjob-api | GET /cronjobs/:id returns cron job with expected structure | ✅ |
| 192 | cronjob-api | PATCH /cronjobs/:id updates cron expression | ✅ |
| 193 | cronjob-api | PATCH /cronjobs/:id toggles enabled to false | ✅ |
| 194 | cronjob-api | POST /cronjobs with invalid cron expression returns 400 | ✅ |
| 195 | cronjob-api | POST /cronjobs one-time without valid scheduledAt returns 400 | ✅ |
| 196 | cronjob-api | GET /cronjobs/runs returns empty array initially | ✅ |
| 197 | cronjob-api | GET /cronjobs/:id/runs returns empty array initially | ✅ |
| 198 | cronjob-api | DELETE /cronjobs/:id removes cron job and GET returns 404 | ✅ |

### Dashboard API

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 199 | dashboard-api | dashboard summary returns valid structure | ✅ |
| 200 | dashboard-api | dashboard summary with timeRange param | ✅ |
| 201 | dashboard-api | token-by-model returns array | ✅ |
| 202 | dashboard-api | token-by-agent returns array | ✅ |
| 203 | dashboard-api | token-trend returns 24 hourly entries for today | ✅ |
| 204 | dashboard-api | runtime-status returns valid structure | ✅ |
| 205 | dashboard-api | global dashboard summary returns valid structure | ✅ |
| 206 | dashboard-api | global dashboard token-by-project returns array with at least 1 project | ✅ |
| 207 | dashboard-api | global dashboard runtime-status returns valid structure | ✅ |

### Dashboard 完整

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 208 | dashboard-full | GET summary with timeRange=today | ✅ |
| 209 | dashboard-full | GET summary with timeRange=7d | ✅ |
| 210 | dashboard-full | GET summary with timeRange=30d | ✅ |
| 211 | dashboard-full | GET summary with no timeRange param | ✅ |
| 212 | dashboard-full | GET token-by-model with timeRange=today | ✅ |
| 213 | dashboard-full | GET token-by-model with timeRange=7d | ✅ |
| 214 | dashboard-full | GET token-by-model with timeRange=30d | ✅ |
| 215 | dashboard-full | GET token-by-model with no timeRange | ✅ |
| 216 | dashboard-full | GET token-by-agent with timeRange=today | ✅ |
| 217 | dashboard-full | GET token-by-agent with timeRange=7d | ✅ |
| 218 | dashboard-full | GET token-by-agent with timeRange=30d | ✅ |
| 219 | dashboard-full | GET token-by-agent with no timeRange | ✅ |
| 220 | dashboard-full | GET agent-stats returns array | ✅ |
| 221 | dashboard-full | GET agent-stats with timeRange=7d | ✅ |
| 222 | dashboard-full | GET recent-chats returns array | ✅ |
| 223 | dashboard-full | GET recent-chats with limit respects limit | ✅ |
| 224 | dashboard-full | GET token-trend with timeRange=today returns 24 entries | ✅ |
| 225 | dashboard-full | GET token-trend with timeRange=7d | ✅ |
| 226 | dashboard-full | GET token-trend with timeRange=30d | ✅ |
| 227 | dashboard-full | GET /api/dashboard/token-by-model returns array | ✅ |
| 228 | dashboard-full | GET /api/dashboard/token-by-agent returns array | ✅ |
| 229 | dashboard-full | GET /api/dashboard/token-trend with timeRange=7d returns array | ✅ |

### 删除安全

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 230 | deletion-safety | deleting agent leaves orphan reference in team — team GET still works | ✅ |
| 231 | deletion-safety | deleting agent leaves orphan reference in cron — cron GET still works | ✅ |
| 232 | deletion-safety | deleting team leaves orphan reference in cron — cron GET still works | ✅ |
| 233 | deletion-safety | deleting project cascades — all sub-resource APIs return 404 | ✅ |
| 234 | deletion-safety | sub-resource APIs return 404 immediately via isProjectBlocked guard | ✅ |

### MCP API

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 235 | mcp-api | POST /mcp creates a stdio server | ✅ |
| 236 | mcp-api | POST /mcp creates an SSE server | ✅ |
| 237 | mcp-api | GET /mcp lists both servers | ✅ |
| 238 | mcp-api | GET /mcp/:name returns server by name | ✅ |
| 239 | mcp-api | PATCH /mcp/:name updates description | ✅ |
| 240 | mcp-api | POST /mcp/:name/test tests connectivity | ✅ |
| 241 | mcp-api | POST /mcp with duplicate name returns 409 | ✅ |
| 242 | mcp-api | DELETE /mcp/:name deletes unreferenced server | ✅ |
| 243 | mcp-api | DELETE /mcp/:name returns 409 when referenced by agent | ✅ |

### Memory API

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 244 | memory-api | POST /memories creates a memory with required fields | ✅ |
| 245 | memory-api | POST /memories creates a memory with all optional fields | ✅ |
| 246 | memory-api | GET /memories lists memories for agent | ✅ |
| 247 | memory-api | PATCH /memories/:id updates content | ✅ |
| 248 | memory-api | PATCH /memories/:id updates tags | ✅ |
| 249 | memory-api | PATCH /memories/:id pins a memory | ✅ |
| 250 | memory-api | PATCH /memories/:id unpins a memory | ✅ |
| 251 | memory-api | POST /memories with priority 0 succeeds | ✅ |
| 252 | memory-api | POST /memories with priority 5 succeeds | ✅ |
| 253 | memory-api | POST /memories with priority 6 returns 400 | ✅ |
| 254 | memory-api | POST /memories with negative priority returns 400 | ✅ |
| 255 | memory-api | POST /memories with empty content returns 400 | ✅ |
| 256 | memory-api | POST /memories with whitespace-only content returns 400 | ✅ |
| 257 | memory-api | DELETE /memories/:id removes a memory | ✅ |

### 消息上传

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 258 | message-uploads | saving a message with base64 image extracts upload | ✅ |
| 259 | message-uploads | GET /uploads/:filename returns correct content for valid upload | ✅ |
| 260 | message-uploads | GET /uploads with path traversal returns 400 | ✅ |
| 261 | message-uploads | GET /uploads with invalid filename format returns 400 | ✅ |

### Permission Modes

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 262 | permission-modes | navigate to project settings and see Permissions tab | ✅ |
| 263 | permission-modes | Permissions tab renders permissions settings component | ✅ |
| 264 | permission-modes | MCP tab on agent shows warning when mode is not sandbox | ✅ |

### Permission API

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 265 | permissions-api | POST creates restricted config | ✅ |
| 266 | permissions-api | POST creates sandbox config with settings | ✅ |
| 267 | permissions-api | POST creates unrestricted config | ✅ |
| 268 | permissions-api | GET / lists all 3 configs | ✅ |
| 269 | permissions-api | GET /:id returns config with correct fields | ✅ |
| 270 | permissions-api | PATCH /:id updates mode | ✅ |
| 271 | permissions-api | POST /:id/duplicate creates a copy with new title | ✅ |
| 272 | permissions-api | DELETE /:id removes config | ✅ |
| 273 | permissions-api | POST with invalid mode returns 400 | ✅ |

### Project/Agent 生命周期

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 274 | project-agent-lifecycle | POST /projects creates project with id and name | ✅ |
| 275 | project-agent-lifecycle | GET /projects/:id returns all expected fields | ✅ |
| 276 | project-agent-lifecycle | PATCH /projects/:id updates name and description | ✅ |
| 277 | project-agent-lifecycle | GET /projects/:id verifies updated fields | ✅ |
| 278 | project-agent-lifecycle | creates agents and sets defaultTargetId | ✅ |
| 279 | project-agent-lifecycle | DELETE agent1 cascades: clears defaultTargetId and legacy defaultAgentId | ✅ |
| 280 | project-agent-lifecycle | PATCH project icon is persisted | ✅ |
| 281 | project-agent-lifecycle | creates conversation tied to agent2 | ✅ |
| 282 | project-agent-lifecycle | DELETE /projects/:id removes project | ✅ |
| 283 | project-agent-lifecycle | GET /projects/:id returns 404 after deletion | ✅ |

### Runtime API

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 284 | runtime-api | GET /runtime/status returns python and node keys | ✅ |
| 285 | runtime-api | GET /runtime/python/packages returns array | ✅ |
| 286 | runtime-api | GET /api/health returns ok status | ✅ |
| 287 | runtime-api | GET /dashboard/runtime-status returns structure with runningChats | ✅ |

### Runtime 扩展

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 288 | runtime-extended | pip install a package | ✅ |
| 289 | runtime-extended | pip install with invalid package name returns 400 | ✅ |
| 290 | runtime-extended | pip install with empty packages array returns 400 | ✅ |
| 291 | runtime-extended | pip uninstall a package | ✅ |
| 292 | runtime-extended | pip uninstall with invalid package name returns 400 | ✅ |
| 293 | runtime-extended | venv reset | ✅ |

### Runtime 管理

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 294 | runtime-management | model config tab shows provider and model selectors | ✅ |
| 295 | runtime-management | model config tab shows provider select and compact threshold | ✅ |
| 296 | runtime-management | save model config changes and verify persistence | ✅ |
| 297 | runtime-management | general tab shows project info and working directory | ✅ |

### Sandbox Readiness

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 298 | sandbox-readiness | GET /sandbox/readiness returns correct structure | ✅ |
| 299 | sandbox-readiness | GET /sandbox/readiness with projectId returns structure | ✅ |
| 300 | sandbox-readiness | issues array items have correct shape when present | ✅ |
| 301 | sandbox-readiness | available is true when no issues | ✅ |
| 302 | sandbox-readiness | readiness with non-existent projectId still returns structure | ✅ |

### Settings API

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 303 | settings-api | GET /api/settings returns object with providers | ✅ |
| 304 | settings-api | PATCH /api/settings updates a field | ✅ |
| 305 | settings-api | GET /api/settings verifies updated field persisted | ✅ |
| 306 | settings-api | PATCH /api/settings adds custom provider entry | ✅ |
| 307 | settings-api | GET /api/settings verifies custom provider exists | ✅ |
| 308 | settings-api | PATCH /api/settings removes custom provider | ✅ |

### Skill API

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 309 | skill-api | POST /skills creates a skill | ✅ |
| 310 | skill-api | GET /skills lists skills including created one | ✅ |
| 311 | skill-api | GET /skills/:id returns full skill | ✅ |
| 312 | skill-api | PATCH /skills/:id updates name and instructions | ✅ |
| 313 | skill-api | POST /skills creates a second skill | ✅ |
| 314 | skill-api | DELETE /skills/:id deletes unreferenced skill | ✅ |
| 315 | skill-api | DELETE /skills/:id returns 409 when skill is referenced by agent | ✅ |
| 316 | skill-api | POST /skills with empty name returns 400 | ✅ |
| 317 | skill-api | GET /skills lists only non-deleted skills | ✅ |

### Skills 导入

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 318 | skills-import-zip | imports a packaged skill with bundled scripts and assets | ✅ |
| 319 | skills-import-zip | imports a packaged skill without a scripts directory | ✅ |
| 320 | skills-import-zip | invalid zip upload returns an error without importing any skills | ✅ |

### Team API

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 321 | team-api | POST /teams creates a team with members | ✅ |
| 322 | team-api | GET /teams lists teams including created one | ✅ |
| 323 | team-api | GET /teams/:id returns full team with members | ✅ |
| 324 | team-api | PATCH /teams/:id updates name and description | ✅ |
| 325 | team-api | PATCH /teams/:id updates members | ✅ |
| 326 | team-api | POST /teams/:id/clone creates a copy | ✅ |
| 327 | team-api | POST /teams/:id/clone returns 400 for empty name | ✅ |
| 328 | team-api | POST /teams/:id/clone returns 400 for name over 100 chars | ✅ |
| 329 | team-api | GET /teams/:id/layout returns layout (empty initially) | ✅ |
| 330 | team-api | PUT /teams/:id/layout saves and returns layout | ✅ |
| 331 | team-api | DELETE /teams/:id removes the team | ✅ |
| 332 | team-api | DELETE /teams/:id clears project defaultTargetId if pointing to team | ✅ |
| 333 | team-api | GET /teams/:id returns 404 for non-existent team | ✅ |

### 模板创建

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 334 | template-creation | POST /projects/from-template creates writing-assistant project | ✅ |
| 335 | template-creation | writing-assistant has 1 agent (Writer) | ✅ |
| 336 | template-creation | writing-assistant has 5 skills | ✅ |
| 337 | template-creation | writing-assistant has 1 MCP server (fetch) | ✅ |
| 338 | template-creation | writing-assistant has no teams | ✅ |
| 339 | template-creation | POST /projects/from-template creates deep-research project | ✅ |
| 340 | template-creation | deep-research has 3 agents with correct roles | ✅ |
| 341 | template-creation | deep-research has 4 skills | ✅ |
| 342 | template-creation | deep-research has 1 team with 3 members | ✅ |
| 343 | template-creation | deep-research has 3 MCP servers | ✅ |
| 344 | template-creation | deep-research has 1 cron job (disabled) | ✅ |
| 345 | template-creation | POST /projects/from-template returns 404 for unknown template | ✅ |
| 346 | template-creation | POST /projects/from-template returns 400 without templateId | ✅ |
| 347 | template-creation | POST /projects still creates a blank project (no template) | ✅ |
| 348 | template-creation | cleanup: delete test projects | ✅ |

### 模板全量

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 349 | template-creation-all | smart-secretary template creates correct structure | ✅ |
| 350 | template-creation-all | translator template creates correct structure | ✅ |
| 351 | template-creation-all | knowledge-explorer template creates correct structure | ✅ |
| 352 | template-creation-all | life-manager template creates correct structure | ✅ |
| 353 | template-creation-all | doc-hub template creates correct structure | ✅ |
| 354 | template-creation-all | social-media-ops template creates correct structure | ✅ |
| 355 | template-creation-all | customer-service template creates correct structure | ✅ |
| 356 | template-creation-all | legal-compliance template creates correct structure | ✅ |
| 357 | template-creation-all | product-mgmt template creates correct structure | ✅ |
| 358 | template-creation-all | recruitment template creates correct structure | ✅ |
| 359 | template-creation-all | content-marketing template creates correct structure | ✅ |
| 360 | template-creation-all | seo-optimizer template creates correct structure | ✅ |
| 361 | template-creation-all | sales-pipeline template creates correct structure | ✅ |
| 362 | template-creation-all | financial-mgmt template creates correct structure | ✅ |
| 363 | template-creation-all | data-analytics template creates correct structure | ✅ |
| 364 | template-creation-all | academic-research template creates correct structure | ✅ |
| 365 | template-creation-all | cleanup: delete all test projects | ✅ |

### 模板 MCP 验证

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 366 | template-mcp-validation | all templates use consistent fetch server naming | ✅ |
| 367 | template-mcp-validation | deep-research playwright package is consistent with other templates | ✅ |
| 368 | template-mcp-validation | all MCP servers have description fields | ✅ |
| 369 | template-mcp-validation | open-websearch version specifier is consistent | ✅ |
| 370 | template-mcp-validation | template agent count is sane (every template has at least 1 agent) | ✅ |

### Workspace API

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 371 | workspace-api | GET /workspace lists root directory as array | ✅ |
| 372 | workspace-api | GET /workspace response entries are valid objects | ✅ |
| 373 | workspace-api | GET /workspace?path=nonexistent returns empty array | ✅ |
| 374 | workspace-api | GET /workspace/file without path returns 400 | ✅ |
| 375 | workspace-api | GET /workspace/file?path=nonexistent.txt returns 404 | ✅ |
| 376 | workspace-api | DELETE /workspace/file without path returns 400 | ✅ |

---

## AI 层（25 文件 / 96 用例）

### Chat 流程

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 377 | chat-flow | send message and receive real AI response | ✅ |
| 378 | chat-flow | thinking indicator appears while waiting for response | ✅ |
| 379 | chat-flow | multi-turn conversation retains context | ✅ |
| 380 | chat-flow | chat input disabled during streaming and re-enabled after | ✅ |

### Chat 高级

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 381 | chat-advanced | Stop button interrupts streaming and re-enables input | ✅ |
| 382 | chat-advanced | tool call block appears in chat when bash tool is used | ✅ |
| 383 | chat-advanced | manual compact via API returns 201 after chat messages | ✅ |

### Chat 生命周期

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 384 | chat-lifecycle | create conversation and send message | ✅ |
| 385 | chat-lifecycle | verify conversation messages contain user and assistant | ✅ |
| 386 | chat-lifecycle | verify agent status after chat completes | ✅ |
| 387 | chat-lifecycle | verify runtime-status structure | ✅ |
| 388 | chat-lifecycle | delete conversation and verify messages deleted | ✅ |
| 389 | chat-lifecycle | chat with primary agent | ✅ |
| 390 | chat-lifecycle | chat with secondary agent | ✅ |
| 391 | chat-lifecycle | dashboard shows independent token counts for each agent | ✅ |

### Chat 中断

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 392 | chat-abort | abort mid-stream: agent status returns to idle and active count drops to 0 | ✅ |
| 393 | chat-abort | abort mid-stream: token usage is recorded for completed steps | ✅ |
| 394 | chat-abort | abort mid-stream: partial assistant message is not persisted | ✅ |
| 395 | chat-abort | abort then recover: new chat works normally after abort | ✅ |
| 396 | chat-abort | sub-agent abort: team chat abort returns all agents to idle | ✅ |

### Agent 角色

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 397 | agent-persona | agent with pirate system prompt responds in character | ✅ |
| 398 | agent-persona | agent with translator system prompt translates | ✅ |
| 399 | agent-persona | agent with strict format system prompt follows format | ✅ |

### Memory 工具

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 400 | memory-tools | agent saves memory in one conversation and recalls it in a new conversation | ✅ |
| 401 | memory-tools | agent can save memory via MemorySave tool | ✅ |
| 402 | memory-tools | agent can search memory via MemorySearch tool | ✅ |

### Memory 持久化

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 403 | memory-persistence | memory survives app relaunch and is recalled in a new conversation | ✅ |

### Skill 效果

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 404 | skill-effectiveness | JSON format skill: agent responds in JSON | ✅ |
| 405 | skill-effectiveness | French language skill: agent responds in French | ✅ |
| 406 | skill-effectiveness | removing skill changes agent behavior | ✅ |

### Skill 包执行

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 407 | skill-package-execution | packaged skill with scripts can be imported and executed by the agent | ✅ |
| 408 | skill-package-execution | agent discovers and runs skill script from natural language instructions only | ✅ |
| 409 | skill-package-execution | packaged skill without scripts can still be loaded and used by the agent | ✅ |

### Task 工具

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 410 | task-tool | agent creates a task via task tool | ✅ |
| 411 | task-tool | agent can list tasks | ✅ |
| 412 | task-tool | agent can update a task status | ✅ |

### Team Chat

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 413 | team-chat | team chat triggers sub-agent delegation via tool call | ✅ |
| 414 | team-chat | team chat returns a meaningful response | ✅ |

### Team 协作

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 415 | team-collaboration | leader knows team members | ✅ |
| 416 | team-collaboration | member with skill: skill affects delegation response | ✅ |
| 417 | team-collaboration | three-agent team: leader delegates to correct member | ✅ |

### Team PM 委派

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 418 | team-delegation-pm | PM delegates to two members and returns both member outputs | ✅ |

### Cron Job 执行

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 419 | cronjob-execution | create and manually trigger cron job | ✅ |
| 420 | cronjob-execution | verify cron job run completed successfully | ✅ |
| 421 | cronjob-execution | verify triggered conversation has messages | ✅ |
| 422 | cronjob-execution | create cron job with every-minute schedule | ✅ |
| 423 | cronjob-execution | wait for scheduled execution and verify | ✅ |
| 424 | cronjob-execution | verify scheduled run created conversation | ✅ |

### 沙箱运行时

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 425 | sandbox-runtime | sandbox: bash can write an echo marker inside workspace | ✅ |
| 426 | sandbox-runtime | sandbox: ls command can inspect workspace contents | ✅ |
| 427 | sandbox-runtime | sandbox: python execution works | ✅ |
| 428 | sandbox-runtime | sandbox: node execution works | ✅ |
| 429 | sandbox-runtime | sandbox: writeFile via bash creates a file | ✅ |
| 430 | sandbox-runtime | sandbox: readFile via bash reads file content | ✅ |
| 431 | sandbox-runtime | sandbox: denied command pattern is blocked | ✅ |
| 432 | sandbox-runtime | restricted: host writes outside the virtual workspace do not happen | ✅ |
| 433 | sandbox-runtime | unrestricted: allows all commands including rm | ✅ |
| 434 | sandbox-runtime | sandbox: long-running command is handled gracefully | ✅ |
| 435 | sandbox-runtime | sandbox: large output is handled without crash | ✅ |

### Permission 模式工具

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 436 | permission-modes-tools | restricted mode cannot affect host paths outside the virtual workspace | ✅ |
| 437 | permission-modes-tools | sandbox mode allows bash writes inside workspace | ✅ |
| 438 | permission-modes-tools | sandbox mode blocks denied commands and preserves existing file | ✅ |
| 439 | permission-modes-tools | unrestricted mode allows destructive file operations | ✅ |
| 440 | permission-modes-tools | mode switching changes effective behavior immediately | ✅ |

### Permission 网络限制

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 441 | permission-network-restrictions | sandbox allows requests to allowlisted domains | ✅ |
| 442 | permission-network-restrictions | sandbox blocks requests to denylisted domains even if allowlisted | ✅ |

### MCP 工具

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 443 | mcp-tools | fetch MCP: agent can fetch a URL | ✅ |
| 444 | mcp-tools | memory MCP: agent can store and recall knowledge | ✅ |
| 445 | mcp-tools | filesystem MCP: agent can list directory contents | ✅ |

### MCP applyToMCP

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 446 | mcp-applyToMCP | applyToMCP=true wraps stdio MCP in sandbox and prevents host side effects | ✅ |
| 447 | mcp-applyToMCP | applyToMCP=false leaves stdio MCP unwrapped and allows host side effects | ✅ |

### Browser 工具

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 448 | browser-tool | agent can open a deterministic local page with the browser tool | ✅ |
| 449 | browser-tool | agent can click the reveal button on the deterministic page | ✅ |

### 自动 Compact

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 450 | auto-compact | auto compact triggers after multiple rounds exceeding threshold | ✅ |

### Compact 质量

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 451 | compact-quality | context is preserved after manual compact | ✅ |
| 452 | compact-quality | chat continues normally after compact | ✅ |
| 453 | compact-quality | compact summary is stored and retrievable | ✅ |

### Token 精度

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 454 | token-accuracy | conversation token-usage matches sent totals | ✅ |
| 455 | token-accuracy | dashboard summary todayTokens total is positive | ✅ |
| 456 | token-accuracy | dashboard summary call count >= 3 | ✅ |
| 457 | token-accuracy | dashboard token-by-model contains agent model | ✅ |
| 458 | token-accuracy | dashboard token-by-agent contains test agent | ✅ |
| 459 | token-accuracy | timeRange=today returns positive tokens | ✅ |
| 460 | token-accuracy | timeRange=7d tokens >= today | ✅ |
| 461 | token-accuracy | timeRange=30d tokens >= 7d | ✅ |
| 462 | token-accuracy | timeRange all tokens >= 30d | ✅ |
| 463 | token-accuracy | global token-by-project contains test project | ✅ |

### 模板 E2E

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 464 | template-e2e | writing-assistant template: agent can chat | ✅ |
| 465 | template-e2e | deep-research template: team delegation works | ✅ |
| 466 | template-e2e | template MCP servers: connectivity check | ✅ |
| 467 | template-e2e | smart-secretary template: agent can chat | ✅ |
| 468 | template-e2e | translator template: agent can chat | ✅ |

### 边缘案例

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 469 | edge-cases | agent with no explicit model uses global default | ✅ |
| 470 | edge-cases | workspace file created by bash appears in workspace API | ✅ |
| 471 | edge-cases | conversation with 10+ messages maintains coherence | ✅ |
| 472 | edge-cases | error API key: chat returns error not crash | ✅ |

---

## Onboarding 层（1 文件 / 7 用例）

| # | 文件 | 用例名 | 状态 |
|---|------|--------|------|
| 473 | onboarding-flow | Welcome step renders with logo and Get Started button | ✅ |
| 474 | onboarding-flow | Welcome step has language selector | ✅ |
| 475 | onboarding-flow | Get Started navigates to Provider step | ✅ |
| 476 | onboarding-flow | Provider step shows preset provider grid | ✅ |
| 477 | onboarding-flow | Provider step: selecting a preset shows API key input | ✅ |
| 478 | onboarding-flow | Back button returns to Welcome step from Provider step | ✅ |
| 479 | onboarding-flow | Skip button completes onboarding and goes to project list | ✅ |
