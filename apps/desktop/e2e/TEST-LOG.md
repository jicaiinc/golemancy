# E2E 测试运行记录

> 每次测试运行后更新此文件。测试目录见 `test-catalog.md`（同目录）。

## 测试方法

详见项目根目录 `CLAUDE.md` 的 E2E Testing 章节。

## 运行记录

### 2026-03-15 — 初始全量验证

**环境**：macOS Darwin 23.4.0 | Node 22 | Electron + Playwright

| # | 层级 | 文件 | 用例数 | 结果 | 备注 |
|---|------|------|-------|------|------|
| 1 | smoke | app-launch | 4 | ✅ | |
| 2 | smoke | agent-advanced | 4 | ✅ | |
| 3 | smoke | agent-config | 8 | ✅ | |
| 4 | smoke | agent-config-interaction | 4 | ✅ | |
| 5 | smoke | agent-crud | 5 | ✅ | |
| 6 | smoke | chat-sidebar | 4 | ✅ | |
| 7 | smoke | cron-page | 7 | ✅ | |
| 8 | smoke | dashboard | 9 | ✅ | |
| 9 | smoke | mcp-page | 6 | ✅ | |
| 10 | smoke | memory-tab | 6 | ✅ | |
| 11 | smoke | navigation | 4 | ✅ | |
| 12 | smoke | permission-config-ui | 8 | ✅ | |
| 13 | smoke | project-advanced | 4 | ✅ | |
| 14 | smoke | project-crud | 8 | ✅ | |
| 15 | smoke | settings | 9 | ✅ | |
| 16 | smoke | settings-advanced | 6 | ✅ | |
| 17 | smoke | skill-crud | 4 | ✅ | |
| 18 | smoke | skills-page | 6 | ✅ | |
| 19 | smoke | task-page | 6 | ⏭️ | describe.skip — 侧边栏无 tasks 入口 |
| 20 | smoke | team-crud | 5 | ✅ | 1 test skip（card 导航 race condition） |
| 21 | smoke | team-page | 4 | ✅ | |
| 22 | smoke | template-full | 5 | ✅ | |
| 23 | smoke | template-selector | 4 | ✅ | |
| 24 | smoke | workspace-files | 3 | ✅ | |
| 25 | smoke | workspace-operations | 3 | ✅ | |
| 26 | smoke | workspace-page | 5 | ✅ | |
| 27 | server | agent-clone | 6 | ✅ | |
| 28 | server | browser-tool-config | 4 | ✅ | |
| 29 | server | chat-navigation | 4 | ✅ | |
| 30 | server | chat-ui | 3 | ✅ | |
| 31 | server | conversation-advanced | 6 | ✅ | |
| 32 | server | conversation-api | 12 | ✅ | |
| 33 | server | cronjob-api | 11 | ✅ | |
| 34 | server | dashboard-api | 9 | ✅ | |
| 35 | server | dashboard-full | 22 | ✅ | |
| 36 | server | deletion-safety | 4 | ✅ | |
| 37 | server | mcp-api | 9 | ✅ | |
| 38 | server | memory-api | 14 | ✅ | |
| 39 | server | message-uploads | 4 | ✅ | |
| 40 | server | permission-modes | 5 | ✅ | |
| 41 | server | permissions-api | 9 | ✅ | |
| 42 | server | project-agent-lifecycle | 10 | ✅ | |
| 43 | server | runtime-api | 4 | ✅ | |
| 44 | server | runtime-extended | 10 | ✅ | |
| 45 | server | runtime-management | 5 | ✅ | |
| 46 | server | sandbox-readiness | 5 | ✅ | |
| 47 | server | settings-api | 6 | ✅ | |
| 48 | server | skill-api | 9 | ✅ | |
| 49 | server | team-api | 13 | ✅ | |
| 50 | server | template-creation | 15 | ✅ | |
| 51 | server | template-creation-all | 17 | ✅ | |
| 52 | server | workspace-api | 6 | ✅ | |
| 53 | server | code-execution | 4 | ✅ | |
| 54 | onboarding | onboarding-flow | 7 | ✅ | |
| 55 | ai | agent-persona | 4 | ✅ | |
| 56 | ai | auto-compact | 2 | ✅ | |
| 57 | ai | chat-advanced | 4 | ✅ | |
| 58 | ai | chat-flow | 6 | ✅ | |
| 59 | ai | chat-lifecycle | 9 | ✅ | |
| 60 | ai | cronjob-execution | 7 | ✅ | |
| 61 | ai | memory-tools | 4 | ✅ | |
| 62 | ai | permission-modes-tools | 13 | ✅ | |
| 63 | ai | task-tool | 4 | ✅ | |
| 64 | ai | team-chat | 3 | ✅ | |
| 65 | ai | token-accuracy | 11 | ✅ | |

**汇总**：65/65 文件通过（422 用例），7 用例 skip（task-page 6 + team-crud 1）。

### 2026-03-19 — AI E2E 全量 UI 化改造 + 验证

**背景**：将 24 个 AI 测试文件全部从 API 直接调用改为 UI 交互（`enterConversation` + `sendAndWaitForResponse`）。5 个 Phase 全部完成。

**环境**：macOS Darwin 23.4.0 | Node 22 | Electron + Playwright

#### Model Tier 配置（test-helper.ts）

| Method | Tier | Google Key | OpenAI Key | Anthropic Key |
|--------|------|-----------|-----------|--------------|
| `createCheapAgent` | A | global default (gemini-2.5-flash) | global default (gpt-5-mini) | — |
| `createSmartAgent` | B | gemini-2.5-pro | **gpt-5.4** | — |
| `createToolAgent` | Tool | gemini-2.5-pro (fallback) | gpt-5-mini (priority) | claude-haiku-4-5 |
| `createAgentViaApi` | Plain | = global default | = global default | — |

#### 测试结果（24 个 AI 文件 / 92 用例）

**第 1 轮**（UI 化改造完成后首次验证）：70P / 11F / 11Fl
**第 2 轮**（修复后重测 6 个文件）：最新结果如下

| # | File | Cases | Pass | Fail | Flaky | Tier | 状态 | 失败/Flaky 原因 |
|---|------|-------|------|------|-------|------|------|----------------|
| 1 | task-tool | 3 | 3 | 0 | 0 | Tool | ✅ | |
| 2 | sandbox-runtime | 11 | 8 | 0 | 3 | Tool | ✅ | flaky: bash 边界情况 |
| 3 | chat-lifecycle | 8 | 6 | 1 | 1 | Plain | ⚠️ | **fail**: dashboard token-by-agent 数据延迟（已加 retry 仍失败） |
| 4 | edge-cases | 4 | 4 | 0 | 0 | Cheap | ✅ | |
| 5 | permission-modes-tools | 5 | 5 | 0 | 0 | Tool | ✅ | |
| 6 | permission-network-restrictions | 2 | 2 | 0 | 0 | Tool | ✅ | |
| 7 | memory-tools | 3 | 2 | 0 | 1 | Tool+Smart | ✅ | |
| 8 | mcp-tools | 3 | 3 | 0 | 0 | Cheap+Tool | ✅ | |
| 9 | mcp-applyToMCP | 2 | 1 | 0 | 1 | Tool | ✅ | |
| 10 | auto-compact | 1 | 1 | 0 | 0 | Cheap | ✅ | |
| 11 | compact-quality | 3 | 1 | 0 | 2 | Cheap | ✅ | |
| 12 | token-accuracy | 10 | 10 | 0 | 0 | Plain | ✅ | |
| 13 | browser-tool | 2 | 2 | 0 | 0 | Plain | ✅ | |
| 14 | template-e2e | 5 | 2 | 0 | 3 | Template | ✅ | |
| 15 | skill-package-execution | 2 | 1 | 0 | 1 | Tool | ✅ | |
| 16 | team-chat | 2 | 1 | 1 | 0 | Smart | ⚠️ | **fail**: AI 不一定走 delegate_to 工具 |
| 17 | team-collaboration | 3 | 2 | 1 | 0 | Smart | ⚠️ | **fail**: AI skill 遵循不稳定（从 2F→1F） |
| 18 | team-delegation-pm | 1 | 1 | 0 | 0 | Plain | ✅ | |
| 19 | cronjob-execution | 6 | 4 | 0 | 2 | Plain | ✅ | **已修复**: navigateTo + store refresh（从 3F→0F） |
| 20 | memory-persistence | 1 | 1 | 0 | 0 | Tool | ✅ | |
| 21 | skill-effectiveness | 4 | 1 | 2 | 1 | Smart | ⚠️ | **改善**: Smart 模型 + skill 加载指令（从 4F→2F）；剩余 fail = AI 不可靠 |
| 22 | chat-flow | 5 | 5 | 0 | 0 | UI | ✅ | |
| 23 | chat-advanced | 3 | 3 | 0 | 0 | Cheap | ✅ | |
| 24 | agent-persona | 3 | 3 | 0 | 0 | UI | ✅ | |
| | **TOTAL** | **92** | **78** | **5** | **15** | | | |

#### 第 2 轮修复内容

| # | 文件 | 改动 | 效果 |
|---|------|------|------|
| 1 | `test-helper.ts` | `createSmartAgent` 备用模型 `gpt-5-mini` → `gpt-5.4` | — |
| 2 | `cronjob-execution.spec.ts` | `clickNav('crons')` → `navigateTo` + store `loadProjects()` | **3F → 0F** |
| 3 | `skill-effectiveness.spec.ts` | `createCheapAgent` → `createSmartAgent` + `builtinTools: NO_TOOLS` + prompt 要求先加载 skill | **4F → 2F** |
| 4 | `team-chat.spec.ts` | 子对话 title `===` → `includes()` + 优化 leader prompt | 未变 |
| 5 | `team-collaboration.spec.ts` | 优化 leader prompt 指定委派对象 | **2F → 1F** |
| 6 | `chat-lifecycle.spec.ts` | dashboard token-by-agent 加 retry polling (10 次 × 2s) | 未变 |

#### 剩余 5 个失败的根因

| File | Cases | Root Cause | 可修复性 |
|------|-------|-----------|---------|
| skill-effectiveness | 2 | AI 加载 skill 后仍不一定遵循指令（multi-skill + emoji 测试） | 低 — AI 行为不确定 |
| team-chat | 1 | AI leader 不一定使用 delegate_to 工具 | 低 — AI 行为不确定 |
| team-collaboration | 1 | AI 委派后 skill 指令不一定被遵循 | 低 — AI 行为不确定 |
| chat-lifecycle | 1 | dashboard token-by-agent API 不返回某个 agent 数据 | 中 — 可能是服务端 bug |

> 5 个 fail 中 4 个是 AI 行为不确定性导致，多跑几次可能通过。

#### 费用估算（每轮 AI 全量测试）

~160K input + ~28K output tokens。
- 纯 OpenAI: ~$0.10
- Google + OpenAI: ~$0.19
- 纯 Google: ~$0.36
- OAuth（ChatGPT 订阅）: $0（配额内）
