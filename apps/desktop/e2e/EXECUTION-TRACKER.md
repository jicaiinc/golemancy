# E2E Execution Tracker

Last updated: 2026-03-16

## Status Legend

| Status | Meaning |
| --- | --- |
| `not_started` | Not implemented or not scheduled yet |
| `implemented` | Test exists but has not been executed in this audit wave |
| `running` | Currently under execution or active debugging |
| `passed` | Implemented and executed successfully in current audit wave |
| `failed` | Executed and failed; root cause or next step must be recorded |
| `flaky` | Executed, but not stable enough to count as covered yet |
| `blocked` | Cannot execute yet because fixture, environment, or product behavior is missing |

## Wave 1: Permission / Sandbox / applyToMCP

| ID | Capability | Scenario | AI | Spec | Implemented | Executed | Status | Latest result | Next step |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `PERM-001` | Permission mode | `restricted` cannot affect host paths outside the virtual workspace | Yes | `e2e/ai/permission-modes-tools.spec.ts` | Yes | Yes | `passed` | Rerun with corrected semantics passed; host temp path stayed absent | Keep this as canonical restricted-mode behavior |
| `PERM-002` | Permission mode | `sandbox` allows bash write inside workspace | Yes | `e2e/ai/permission-modes-tools.spec.ts` | Yes | Yes | `passed` | Passed after switching tool-use tests to a more reliable tool-calling model and using side-effect assertion | Keep side-effect assertion; do not rely on assistant text |
| `PERM-003` | Permission mode | `sandbox` blocks denied `rm` and preserves file | Yes | `e2e/ai/permission-modes-tools.spec.ts` | Yes | Yes | `failed` | File was deleted even though config set `deniedCommands: ['rm']` | Investigate denied-command enforcement in sandbox mode; likely product bug |
| `PERM-004` | Permission mode | `unrestricted` allows destructive delete | Yes | `e2e/ai/permission-modes-tools.spec.ts` | Yes | Yes | `passed` | Host workspace file was deleted as expected | Keep as unrestricted baseline |
| `PERM-005` | Permission mode | switching mode changes effect immediately | Yes | `e2e/ai/permission-modes-tools.spec.ts` | Yes | Yes | `failed` | After applying `restricted`, host temp file was still created in mode-switch scenario | Investigate stale tool/mode cache or delayed permissions application |
| `PERM-006` | Network restriction | allowlisted domain request succeeds in sandbox | Yes | `e2e/ai/permission-network-restrictions.spec.ts` | Yes | Yes | `passed` | Local allowlisted server received the request under sandbox mode | Keep request-count assertion as primary signal |
| `PERM-007` | Network restriction | denylisted domain request never reaches server | Yes | `e2e/ai/permission-network-restrictions.spec.ts` | Yes | Yes | `failed` | Denylisted request still reached local server (`count = 1`) | Investigate denylist enforcement in sandbox network path; likely product bug |
| `MCP-001` | applyToMCP | `applyToMCP=true` wraps stdio MCP and blocks host side effect | Yes | `e2e/ai/mcp-applyToMCP.spec.ts` | Yes | Yes | `failed` | MCP startup side effect still happened on host (`startup-ok`) | Compare with MCPPool integration tests; current desktop behavior does not match wrapped expectation |
| `MCP-002` | applyToMCP | `applyToMCP=false` leaves stdio MCP unwrapped and allows host side effect | Yes | `e2e/ai/mcp-applyToMCP.spec.ts` | Yes | Yes | `passed` | Host startup marker and target file were created as expected | Keep as unwrapped baseline for applyToMCP |

## Wave 1: Regression Checks

| ID | Capability | Scenario | AI | Spec | Implemented | Executed | Status | Latest result | Next step |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `REG-001` | Chat API helper | existing `sandbox-runtime` echo command still works through helper | Yes | `e2e/ai/sandbox-runtime.spec.ts` | Yes | Yes | `failed` | Helper route/model/SSE issues are fixed, but this legacy test still assumes assistant always returns plain text instead of tool-only output | Re-audit legacy AI tests that rely on assistant text rather than side effects |

## Next Queue

| ID | Capability | Scenario | AI | Planned spec | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `BROWSER-001` | Built-in browser | agent opens deterministic local page and reads content | Yes | `e2e/ai/browser-tool.spec.ts` | `running` | First smoke run made zero requests to `/browser/basic`; need to distinguish model non-use vs browser tool unavailable |
| `BROWSER-002` | Built-in browser | agent clicks interactive element and extracts revealed marker | Yes | `e2e/ai/browser-tool.spec.ts` | `implemented` | Waiting for BROWSER-001 root cause before execution |
| `SKILL-001` | Skill import | import `.zip` skill with `scripts/` and assign to agent | Mixed | `e2e/smoke/skills-import-zip.spec.ts` + AI execution spec | `not_started` | Needs zip fixtures |
| `SKILL-002` | Skill import | import `.zip` skill without `scripts/` and execute successfully | Mixed | `e2e/smoke/skills-import-zip.spec.ts` + AI execution spec | `not_started` | Needs zip fixtures |
| `MEM-001` | Memory | agent recalls persisted memory in new conversation | Yes | `e2e/ai/memory-tools.spec.ts` | `passed` | Strengthened spec passed after shifting recall assertion from forced tool_call to persisted-result verification |
| `MEM-002` | Memory | memory persists across app relaunch | Mixed | `e2e/ai/memory-persistence.spec.ts` | `flaky` | First run forgot the saved code after relaunch; retry passed with the same scenario |
| `TEAM-001` | Team collaboration | PM delegates to two members and combines outputs | Yes | `e2e/ai/team-delegation-pm.spec.ts` | `failed` | PM did not reliably emit delegation events for both members; baseline `e2e/ai/team-chat.spec.ts` delegation test also failed |
| `CRON-001` | Cron | one-time cron triggers agent and creates run history | Mixed | `e2e/server/cronjob-once-runtime.spec.ts` | `flaky` | First run timed out with zero scheduled runs; retry passed and auto-disabled the once job |
| `CRON-002` | Cron | cron targets team and produces delegated run | Mixed | `e2e/server/cronjob-once-runtime.spec.ts` | `failed` | Team-target cron completed, but assistant message carried no delegated tool-invocation parts |
| `STATE-001` | Agent status | `idle -> running -> idle` visible in UI/dashboard | Mixed | `e2e/smoke/agent-status.spec.ts` | `not_started` | Use deterministic long-running command |

## Operating Rules

1. Every newly added scenario gets an `ID` before implementation.
2. A scenario is not counted as covered until `Executed = Yes` and `Status = passed`.
3. Any failure must record whether the fault is in `test`, `fixture`, `helper`, or `product`.
4. Small parallel runs are allowed, but status updates remain per-scenario.

## Findings

| ID | Finding | Impact |
| --- | --- | --- |
| `F-001` | Legacy `sendChatViaApi` helper was broken in three ways: wrong route, wrong agent creation payload, and fragile SSE parsing | Historical AI E2E results before this audit are not trustworthy |
| `F-002` | Tool-use tests are materially more reliable on explicit tool-calling models than on default `google/gemini-2.5-flash` | Tool-oriented E2E should pin model selection |
| `F-003` | Assistant message persistence does not currently give stable `tool-invocation` parts for these runs | Side effects are a stronger acceptance signal than assistant text/tool parts for now |
| `F-004` | `restricted` mode in current product means virtual sandbox, not “no bash execution” | E2E expectations must test isolation semantics, not total command denial |
| `F-005` | Cron E2E routes in the test suite were still using `/api/projects/:projectId/cronjobs`, but the server mounts `/api/projects/:projectId/cron-jobs` | Historical cron E2E results are untrustworthy until the route mismatch is corrected and rerun |
| `F-006` | Memory recall can succeed without a visible `MemorySearch` tool event in SSE | Recall assertions should use persisted data + answer content, not require explicit tool_call every time |
| `F-007` | Once-cron scheduling is timing-sensitive; identical scenario failed first and passed on retry | Cron schedule tests need wider windows or a deterministic scheduler hook before they can be treated as stable coverage |
| `F-008` | Team delegation is not just failing in the new PM scenario; the existing minimal `team-chat` delegation E2E also produced zero `delegate_to_` events | Treat team delegation as a broader product or event-capture issue, not just an over-strict new scenario |
