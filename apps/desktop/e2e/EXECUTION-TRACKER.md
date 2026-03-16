# E2E Execution Tracker

Last updated: 2026-03-17

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
| `PERM-003` | Permission mode | `sandbox` blocks denied `rm` and preserves file | Yes | `e2e/ai/permission-modes-tools.spec.ts` | Yes | Yes | `passed` | Passed after fixing project permission assignment in the E2E helper; the sandbox config now really applies | Keep this as the canonical denied-command assertion |
| `PERM-004` | Permission mode | `unrestricted` allows destructive delete | Yes | `e2e/ai/permission-modes-tools.spec.ts` | Yes | Yes | `passed` | Host workspace file was deleted as expected | Keep as unrestricted baseline |
| `PERM-005` | Permission mode | switching mode changes effect immediately | Yes | `e2e/ai/permission-modes-tools.spec.ts` | Yes | Yes | `passed` | Passed after fixing project permission assignment in the E2E helper; mode changes now affect the next run as expected | Keep project-level side effects as the assertion |
| `PERM-006` | Network restriction | allowlisted domain request succeeds in sandbox | Yes | `e2e/ai/permission-network-restrictions.spec.ts` | Yes | Yes | `passed` | Passed after switching the AI E2E allowlist probe to `example.com` and using `curl -k` to avoid sandbox CA-chain noise | Keep public-domain probe; loopback was not a reliable allowlist signal |
| `PERM-007` | Network restriction | denylisted domain request never reaches server | Yes | `e2e/ai/permission-network-restrictions.spec.ts` | Yes | Yes | `passed` | Passed after fixing `deniedDomains` propagation into sandbox runtime config and isolating denylist from allowlist behavior | Keep the pure deny-over-allow case; this now proves the real runtime path |
| `MCP-001` | applyToMCP | `applyToMCP=true` wraps stdio MCP and blocks host side effect | Yes | `e2e/ai/mcp-applyToMCP.spec.ts` | Yes | Yes | `passed` | Passed after moving the side-effect path out of macOS temp directories that sandbox-runtime allows by default | Keep home-directory hidden file as the canonical host-side-effect probe |
| `MCP-002` | applyToMCP | `applyToMCP=false` leaves stdio MCP unwrapped and allows host side effect | Yes | `e2e/ai/mcp-applyToMCP.spec.ts` | Yes | Yes | `passed` | Host startup marker and target file were created as expected | Keep as unwrapped baseline for applyToMCP |

## Wave 1: Regression Checks

| ID | Capability | Scenario | AI | Spec | Implemented | Executed | Status | Latest result | Next step |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `REG-001` | Chat API helper | legacy `sandbox-runtime` suite works with tool-call and side-effect assertions | Yes | `e2e/ai/sandbox-runtime.spec.ts` | Yes | Yes | `passed` | Suite was refactored away from assistant-text assertions and now passes `11/11` with workspace/host side-effect assertions | Keep `permission-modes-tools.spec.ts` as the strongest canonical permission suite, and use this as broader runtime smoke coverage |

## Next Queue

| ID | Capability | Scenario | AI | Planned spec | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `BROWSER-001` | Built-in browser | agent opens deterministic local page and reads content | Yes | `e2e/ai/browser-tool.spec.ts` | `passed` | Passed after fixing agent-create persistence for `builtinTools.browser`, switching browser chat to buffered HTTP, and tightening the prompt to dedicated browser tools |
| `BROWSER-002` | Built-in browser | agent clicks interactive element and extracts revealed marker | Yes | `e2e/ai/browser-tool.spec.ts` | `passed` | Passed after the same agent-create fix plus dedicated `browser_snapshot` → `browser_click` prompting and buffered chat transport |
| `MEM-001` | Memory | agent recalls persisted memory in new conversation | Yes | `e2e/ai/memory-tools.spec.ts` | `passed` | Strengthened spec passed after shifting recall assertion from forced tool_call to persisted-result verification |
| `MEM-002` | Memory | memory persists across app relaunch | Mixed | `e2e/ai/memory-persistence.spec.ts` | `passed` | Passed after moving relaunch chat requests off page-context SSE onto buffered HTTP and simplifying the recall prompt to use pinned memory context directly |
| `TEAM-001` | Team collaboration | PM delegates to two members and combines outputs | Yes | `e2e/ai/team-delegation-pm.spec.ts` | `passed` | Passed after switching to real sub-agent conversation assertions and requiring the PM to return labeled Analyst/Executor summary lines |
| `CRON-001` | Cron | one-time cron triggers agent and creates run history | Mixed | `e2e/server/cronjob-once-runtime.spec.ts` | `passed` | Passed twice after widening the once-schedule lead time from 15s to 30s |
| `CRON-002` | Cron | cron targets team and produces delegated run | Mixed | `e2e/server/cronjob-once-runtime.spec.ts` | `passed` | Passed after switching to real specialist sub-agent conversation assertions and requiring the team lead to return a labeled Specialist summary |
| `STATE-001` | Agent status | `idle -> running -> idle` syncs across agent list, agent detail, and dashboard | Mixed | `e2e/smoke/agent-status.spec.ts` | `passed` | Passed with background bash execution plus explicit status badge/status-bar assertions on list and detail, and runtime panel visibility on dashboard |
| `STATE-002` | Agent status | stale `running` status resets to `idle` after app relaunch | Mixed | `e2e/smoke/agent-status-relaunch.spec.ts` | `passed` | Passed with persisted `status='running'` before shutdown, then verified startup cleanup resets both UI and stored agent record to `idle` |
| `STATE-003` | Agent status | deterministic `error` state is visible in UI/dashboard | Mixed | `e2e/smoke/agent-status.spec.ts` | `passed` | Passed after wiring chat failures to persist an error assistant message, mark the agent `error`, and expose failed chats as `error` in dashboard recent activity |
| `STATE-004` | Agent status | dead `paused` state is removed from the agent status surface | Mixed | shared/ui/server status cleanup | `passed` | Resolved by removing `paused` from `AgentStatus`, updating UI mappings, and normalizing legacy persisted `paused` agents back to `idle` |
| `SKILL-001` | Skill import | import `.zip` skill with bundled `scripts/` and assets | Mixed | `e2e/server/skills-import-zip.spec.ts` + `e2e/smoke/skills-import-zip.spec.ts` + `e2e/ai/skill-package-execution.spec.ts` | `passed` | Server import, UI upload, bundled asset extraction, and agent-side script execution all passed after fixing UI auth |
| `SKILL-002` | Skill import | import `.zip` skill without `scripts/` and execute successfully | Mixed | `e2e/server/skills-import-zip.spec.ts` + `e2e/ai/skill-package-execution.spec.ts` | `passed` | Packaged skill without scripts imported cleanly and agent recalled deterministic marker via skill tool |

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
| `F-009` | UI `HttpSkillService.importZip()` was sending multipart upload without the auth header, so valid ZIP uploads from the Skills page never reached the authenticated import route | Skill ZIP UI coverage was blocked by a real product bug, not by the new smoke tests |
| `F-010` | `applyPermissionsConfig()` in the E2E helper was patching `permissionsConfigId` onto the project top level instead of `project.config.permissionsConfigId` | Affected earlier permission-mode conclusions; reruns after the helper fix are the trustworthy baseline |
| `F-011` | macOS sandbox-runtime allows writes under broad temp roots, so tmpdir-based “host side effect” probes can produce false failures for `applyToMCP` | Sandbox-wrapping tests must use paths outside the temp root, such as home-directory hidden files |
| `F-012` | `deniedDomains` was dropped by `permissionsToSandboxConfig()` and then overwritten with `[]` in `sandbox-pool` runtime mapping | Denylist enforcement in sandbox mode was incomplete until the adapter/runtime mapping fix |
| `F-013` | `sandboxPool` worker startup assumed a built `sandbox-worker.js`, which breaks source-mode live tests and dev-time direct `sandboxPool` usage | Worker startup now falls back to `sandbox-worker.ts` with `tsx` in source environments |
| `F-014` | Loopback hosts were a poor allowlist probe for macOS sandbox-runtime and the AI E2E also hit CA-certificate noise with `curl` | Public-domain probes (`example.com`) plus `curl -k` are more reliable for AI E2E; runtime allow/deny is now also covered by server live tests |
| `F-015` | `FileAgentStorage.create()` was overwriting create-time `builtinTools`, `mcpServers`, `skillIds`, and related optional fields with hardcoded defaults | New agents silently lost non-default capabilities such as `browser`, which made browser E2E look like a model/tool bug when it was really a create-time persistence bug |
| `F-016` | Page-context SSE fetches were less stable after Electron relaunch and occasionally aborted the body stream even when the server-side chat completed | Buffered HTTP chat requests are a more reliable transport for relaunch-sensitive scenarios such as memory persistence and browser-tool E2E |
| `F-017` | Agent `paused` was a dead state: it existed in shared/UI types, but there was no server/runtime path that set it | Resolved by removing it from the agent status surface and normalizing legacy data to `idle` |
| `F-018` | Chat failures previously did not map to a persisted/displayed agent `error` state: chat routes emitted only `running -> idle`, and dashboard recent chat rows were hard-coded to `success` | Resolved by persisting chat error messages with metadata, marking the agent `error`, and deriving recent-chat status from the last message metadata |
