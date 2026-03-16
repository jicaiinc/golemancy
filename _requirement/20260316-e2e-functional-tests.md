# E2E 功能性测试补充计划

> 补充现有 422 用例中缺失的"功能是否好用"层面的测试。

## 新增文件与用例完整清单

### 文件 1: `ai/sandbox-runtime.spec.ts` — Sandbox 代码运行时（需要 API）

| # | 用例名 | 测试内容 | Permission 模式 |
|---|--------|---------|----------------|
| 1 | sandbox bash: echo command | `echo SANDBOX_ECHO_OK` → 输出包含 SANDBOX_ECHO_OK | sandbox |
| 2 | sandbox bash: ls lists workspace files | 先 seedWorkspaceFile 写文件 → `ls` → 输出包含文件名 | sandbox |
| 3 | sandbox bash: python3 execution | `python3 -c "print(7*6)"` → 输出包含 42 | sandbox |
| 4 | sandbox bash: node execution | `node -e "console.log('NODE_OK')"` → 输出包含 NODE_OK | sandbox |
| 5 | sandbox bash: denied command blocked in subcommand | 指令 "run: echo ok && rm -rf /" → 回复包含 blocked/denied | sandbox |
| 6 | sandbox readFile: AI reads a file | seedWorkspaceFile 写 test.txt → 让 AI 用 readFile 读 → 回复包含文件内容 | sandbox |
| 7 | sandbox writeFile: AI writes then reads | 让 AI 写 output.txt → 再读 → 回复包含写入内容 | sandbox |
| 8 | restricted: readFile/writeFile also blocked | 让 AI 读文件 → 回复包含无法执行/restricted | restricted |
| 9 | unrestricted: all tools work including file ops | 让 AI 写文件+读文件 → 成功 | unrestricted |
| 10 | sandbox bash: command timeout handling | 让 AI 执行 `sleep 60` → 应超时报错而非卡死 | sandbox |
| 11 | sandbox bash: large output truncation | 让 AI 执行 `python3 -c "print('x'*50000)"` → 输出包含 truncated | sandbox |

**前置条件**: 每个 permission 模式创建独立 project + agent + permission config。
**模型**: createCheapAgent（Gemini Flash）。

---

### 文件 2: `ai/mcp-applyToMCP.spec.ts` — MCP 沙箱化（需要 API）

| # | 用例名 | 测试内容 | 说明 |
|---|--------|---------|------|
| 12 | applyToMCP enabled: MCP tool executes within sandbox constraints | 创建 sandbox config 设 applyToMCP:true + deniedCommands:['curl'] → 配置 fetch MCP → AI 调用 fetch → 验证是否受 sandbox 限制 | 需要 fetch MCP 可用 |
| 13 | applyToMCP disabled: MCP tool executes without sandbox | 同上但 applyToMCP:false → MCP 工具不受 sandbox 限制 | 对比测试 |
| 14 | MCP connectivity test returns ok:true for valid server | 配置 `@modelcontextprotocol/server-memory` → POST /test → ok:true | 真实连接测试 |
| 15 | MCP connectivity test returns ok:false for invalid server | 配置一个不存在的命令 → POST /test → ok:false | 负面测试 |

**前置条件**: 需要 npx/uvx 可用。如果环境不支持则 skip。
**模型**: createCheapAgent。

---

### 文件 3: `ai/compact-quality.spec.ts` — Compact 对话质量（需要 API）

| # | 用例名 | 测试内容 | 说明 |
|---|--------|---------|------|
| 16 | compact preserves conversation context | 聊天中说 "我叫 Golem" → 手动 compact → 再问 "我叫什么" → 回复包含 Golem | 验证 compact 不丢关键信息 |
| 17 | chat continues normally after compact | 手动 compact → 发新消息 → 收到有意义的回复（非空/非错误） | 验证 compact 后不崩溃 |
| 18 | compact summary is stored as system message | 手动 compact → GET /messages → 验证有 compact summary 消息 | API 级验证 |

**模型**: createCheapAgent。

---

### 文件 4: `ai/skill-effectiveness.spec.ts` — Skill 功能性验证（需要 API）

| # | 用例名 | 测试内容 | 说明 |
|---|--------|---------|------|
| 19 | skill instruction influences AI behavior: JSON format | 创建 Skill "Always reply in valid JSON with a 'reply' field" → 分配给 agent → 发消息 → 回复是 JSON | 验证指令生效 |
| 20 | skill instruction influences AI behavior: language | 创建 Skill "Always reply in French" → 发消息 "What is 2+2?" → 回复包含法语词 (quatre/réponse) | |
| 21 | multiple skills combine correctly | Skill1: "Reply in JSON" + Skill2: "Include a 'lang' field set to 'en'" → 验证两个都生效 | |
| 22 | removing skill changes AI behavior | 先验证 Skill 生效 → 取消分配 → 再发消息 → 行为恢复默认 | |

**模型**: createCheapAgent。

---

### 文件 5: `ai/mcp-tools.spec.ts` — MCP 工具真实调用（需要 API）

| # | 用例名 | 测试内容 | 说明 |
|---|--------|---------|------|
| 23 | fetch MCP: AI fetches a URL | 配置 `uvx mcp-server-fetch` → 让 AI 抓 httpbin.org/get → 回复包含 URL 内容 | 需联网 + uvx |
| 24 | memory MCP: AI stores and retrieves | 配置 `@modelcontextprotocol/server-memory` → 让 AI 存 "key=test_value" → 再取 → 回复包含 test_value | 本地 |
| 25 | filesystem MCP: AI reads workspace file | seedWorkspaceFile 写文件 → 配置 filesystem MCP → 让 AI 读 → 回复包含文件内容 | 本地 |

**前置条件**: fetch 需要联网 + uvx 可用，不可用则 skip。memory 和 filesystem 用 npx。
**模型**: createCheapAgent。

---

### 文件 6: `ai/template-e2e.spec.ts` — Template 端到端可用性（需要 API）

| # | 用例名 | 测试内容 | 说明 |
|---|--------|---------|------|
| 26 | writing-assistant template: agent can chat | 从模板创建项目 → 找到 Writer agent → 发消息 "Write a one-sentence greeting" → 收到回复 | 验证模板 agent 基本可用 |
| 27 | deep-research template: team delegation works | 从模板创建项目 → 找到 team → 发 team chat → SSE 中有 delegate_to_ | 验证 team 拓扑正确 |
| 28 | template MCP servers: connectivity check | 从 writing-assistant 模板创建 → POST /mcp/fetch/test → 检查连通性 | 验证模板 MCP 可连接 |
| 29 | smart-secretary template: agent can chat | 从模板创建 → 发消息 → 收到回复 | 第 3 个模板抽检 |
| 30 | translator template: agent can chat | 从模板创建 → 发 "Translate hello to Spanish" → 回复包含 hola | |

**模型**: createCheapAgent。

---

### 文件 7: `ai/team-collaboration.spec.ts` — Team 协作扩展（需要 API）

| # | 用例名 | 测试内容 | 说明 |
|---|--------|---------|------|
| 31 | leader knows team members | 问 leader "What tools or team members do you have?" → 回复包含 Researcher（或 delegate 工具名） | |
| 32 | member with skill: skill affects delegation response | Researcher 绑定 Skill "Reply in French" → leader 委派问题 → 最终回复包含法语 | 验证 skill 在委派中生效 |
| 33 | three-agent team: leader delegates to correct member | Leader + Researcher + Writer → 问 research 问题 → 委派给 Researcher 而非 Writer | |

**模型**: createSmartAgent（需要较强的 reasoning 能力来做正确的委派决策）。

---

### 文件 8: `ai/edge-cases.spec.ts` — 边界情况（需要 API）

| # | 用例名 | 测试内容 | 说明 |
|---|--------|---------|------|
| 34 | agent with no explicit model uses global default | 创建 agent 不设 modelConfig → 发消息 → 收到正常回复 | |
| 35 | workspace file created by bash appears in workspace API | 让 AI 执行 `echo "test" > workspace_test.txt` → GET /workspace → 包含该文件 | 验证 bash 产出对 workspace 可见 |
| 36 | conversation with 10+ messages maintains coherence | 连续发 10 条消息（每条带编号）→ 最后问 "第 3 条消息是什么" → 回复正确 | 长对话 |
| 37 | error API key: chat returns error not crash | 创建 provider 用假 key → 创建 agent 用该 provider → 发消息 → 验证返回错误信息（不崩溃） | 不需要真 API |

---

### 文件 9: `server/template-mcp-validation.spec.ts` — 模板 MCP 配置验证（不需要 API）

| # | 用例名 | 测试内容 | 说明 |
|---|--------|---------|------|
| 38 | all templates use consistent fetch server name | 验证所有模板的 fetch server 要么都叫 `fetch`，要么都叫 `mcp-server-fetch` | 一致性检查 |
| 39 | deep-research playwright package matches others | 验证 deep-research 的 playwright MCP 与其他模板用同一个包名 | 发现的问题 |
| 40 | all MCP servers have description field | 验证所有模板 MCP server 都有 description（Sales Pipeline 缺失） | |
| 41 | open-websearch version specifier is consistent | 验证所有 open-websearch 命令用同一个版本格式 | |
| 42 | template agent count matches expected | 18 个模板的 agent 数量是否合理（>0） | 健全性检查 |

**这组不需要 API key**，纯数据验证。可以在 server 层跑。

---

### 文件 10: `smoke/save-behavior-consistency.spec.ts` — 保存行为一致性（不需要 API）

| # | 用例名 | 测试内容 | 说明 |
|---|--------|---------|------|
| 43 | agent Skills tab: assign auto-saves to store | 分配 skill → 无需点 Save → store 立即更新 | 已有，确认 auto-save |
| 44 | agent Tools tab: toggle auto-saves to store | toggle bash → 无需点 Save → store 立即更新 | 已有，确认 auto-save |
| 45 | agent General tab: edit requires explicit Save click | 改 name → 不点 Save → store 未变 → 点 Save → store 更新 | 验证 explicit save |
| 46 | agent Model Config: edit requires explicit Save click | 改 temperature → 不点 Save → store 未变 → 点 Save → store 更新 | |
| 47 | project default agent: select auto-saves | 选择 default agent → 无需点 Save → API 验证已更新 | |
| 48 | global theme: switch auto-saves | 切主题 → store 立即更新 → afterAll 还原 | |

**这组不需要 API key**，在 smoke 层跑。验证保存行为是否符合预期（不是测"一致性"，而是测"每种行为是否正确"）。

---

## 汇总

| 文件 | 层级 | 用例数 | 需要 API | 需要联网 | 需要 uvx/npx |
|------|------|-------|---------|---------|-------------|
| `ai/sandbox-runtime.spec.ts` | ai | 11 | 是 | 否 | 否 |
| `ai/mcp-applyToMCP.spec.ts` | ai | 4 | 是 | 否 | 是（MCP server） |
| `ai/compact-quality.spec.ts` | ai | 3 | 是 | 否 | 否 |
| `ai/skill-effectiveness.spec.ts` | ai | 4 | 是 | 否 | 否 |
| `ai/mcp-tools.spec.ts` | ai | 3 | 是 | 是（fetch） | 是 |
| `ai/template-e2e.spec.ts` | ai | 5 | 是 | 否 | 否* |
| `ai/team-collaboration.spec.ts` | ai | 3 | 是 | 否 | 否 |
| `ai/edge-cases.spec.ts` | ai | 4 | 部分 | 否 | 否 |
| `server/template-mcp-validation.spec.ts` | server | 5 | 否 | 否 | 否 |
| `smoke/save-behavior-consistency.spec.ts` | smoke | 6 | 否 | 否 | 否 |
| **合计** | | **48** | | | |

> *template-e2e 不直接调 MCP，只测 agent 聊天能力。MCP 连通性用 API 测。

## 需要修复的模板问题（非测试）

| # | 问题 | 影响 | 需要审批 |
|---|------|------|---------|
| 1 | deep-research Playwright 包名 `@anthropic-ai/mcp-server-playwright` → 应为 `@playwright/mcp` | 该模板的 Playwright MCP 可能不工作 | 是（改源码） |
| 2 | fetch server 命名不一致（`fetch` vs `mcp-server-fetch`） | 不影响功能，影响一致性 | 是 |
| 3 | Sales Pipeline 两个 MCP 缺 description | 不影响功能 | 是 |
| 4 | open-websearch 版本不一致（`@latest` vs 无） | 可能影响版本锁定 | 是 |

## 执行顺序

1. **先跑不需要 API 的**（2 个文件，11 用例）：template-mcp-validation + save-behavior-consistency
2. **再跑 AI 层**（8 个文件，37 用例）：sandbox-runtime → compact-quality → skill-effectiveness → mcp-applyToMCP → mcp-tools → template-e2e → team-collaboration → edge-cases
3. **修复发现的模板问题**（需要你审批）
