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
| 53 | server | code-execution | 4 | ⏳ | 需要 API key |
| 54 | onboarding | onboarding-flow | 7 | ✅ | |
| 55 | ai | agent-persona | 4 | ⏳ | 需要 API key |
| 56 | ai | auto-compact | 2 | ⏳ | 需要 API key |
| 57 | ai | chat-advanced | 4 | ⏳ | 需要 API key |
| 58 | ai | chat-flow | 6 | ⏳ | 需要 API key |
| 59 | ai | chat-lifecycle | 9 | ⏳ | 需要 API key |
| 60 | ai | cronjob-execution | 7 | ⏳ | 需要 API key |
| 61 | ai | memory-tools | 4 | ⏳ | 需要 API key |
| 62 | ai | permission-modes-tools | 13 | ⏳ | 需要 API key |
| 63 | ai | task-tool | 4 | ⏳ | 需要 API key |
| 64 | ai | team-chat | 3 | ⏳ | 需要 API key |
| 65 | ai | token-accuracy | 11 | ⏳ | 需要 API key |

**汇总**：54/65 文件通过（337 用例），11 文件待 API key 测试，7 用例 skip。
