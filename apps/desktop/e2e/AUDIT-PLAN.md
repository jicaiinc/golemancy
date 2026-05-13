# E2E Coverage Audit And Expansion Plan

> Updated: 2026-03-17
> Scope: `apps/desktop/e2e` plus related product/runtime capabilities

## Ground Truth

The current hand-written inventory is stale.

- `npx playwright test --config=e2e/playwright.config.ts --no-deps --list`
- Actual current desktop E2E inventory:

| Layer | Files | Tests | Uses AI |
|---|---:|---:|---|
| smoke | 27 | 147 | No |
| server | 28 | 226 | Mostly no |
| ai | 19 | 93 | Yes |
| onboarding | 1 | 7 | No |
| total | 75 | 473 | Mixed |

Current inventory drift:

- [`test-catalog.md`](./test-catalog.md) still says `65 files / 385 tests`.
- [`TEST-LOG.md`](./TEST-LOG.md) still says `65 files / 422 tests`.
- [`_requirement/20260316-e2e-functional-tests.md`](../../../_requirement/20260316-e2e-functional-tests.md) also assumes the suite baseline is `422` tests.
- Several newer specs are missing from those docs entirely.

## Audit Rules

| Label | Meaning |
|---|---|
| `strong` | Covered with meaningful assertions and low ambiguity |
| `medium` | Covered, but only part of the behavior is asserted |
| `weak` | Test exists, but mostly validates config, text, or loose symptoms |
| `missing` | No meaningful automated coverage for the capability |

Recommended test layers:

- `AI E2E`: real model, real agent decisions, real tool selection
- `Non-AI E2E`: UI flow, API flow, connectivity, deterministic behavior
- `Integration`: deterministic runtime, tool, sandbox, MCP, OS/path behavior

## AI / Non-AI Ownership Matrix

This clarifies which areas should be tested with AI, without AI, or in both layers. The rule is: do not spend AI budget on something that can be proven deterministically, but do not treat deterministic config tests as proof that the agent can really use the capability.

| Capability family | AI E2E | Non-AI E2E | Integration | Why |
|---|---|---|---|---|
| Page routing, CRUD, save behavior, navigation | No | Yes | Optional | Pure product surface and state persistence |
| Permission config editing and mode switching UI | No | Yes | Optional | Deterministic UI/data flow |
| Permission enforcement on actual execution | Yes | Partial | Yes | Must prove both product flow and runtime boundary |
| Bash / browser / task / memory tool selection by agent | Yes | No | Optional | Only AI layer proves agent picks the tool correctly |
| Tool side effects, path restrictions, timeout, network sandbox | Partial | No | Yes | Runtime determinism matters more than model text |
| Skill import, zip extraction, status display | No | Yes | Optional | Import pipeline and UI are deterministic |
| Imported skill is actually used by the agent | Yes | Partial | Yes | Needs end-to-end behavior, not just import success |
| MCP config CRUD and connectivity ping | No | Yes | Optional | Deterministic transport and configuration |
| MCP real tool invocation through agent | Yes | Partial | Yes | Must prove both agent use and transport/runtime correctness |
| Team delegation and role behavior | Yes | Partial | Optional | Agent planning and delegation are model behaviors |
| Cron creation, editing, history UI | No | Yes | Optional | Deterministic product flow |
| Cron actually triggers agent or team work | Yes | Partial | Yes | Needs scheduler + runtime + product closure |
| Memory tab CRUD | No | Yes | Optional | Deterministic state management |
| Memory recall across conversations | Yes | Partial | Optional | Agent has to actually use persisted memory |
| Memory durability across restart | Yes | Partial | Yes | Product lifecycle plus storage durability |
| Cross-OS path and shell differences | No | No | Yes | Best validated below the model layer first |

## Permission / Environment Matrix

This is the minimum matrix needed to claim the permission system is covered for agent execution.

| Surface | Restricted | Sandbox | Unrestricted | Primary layers | Strong assertion |
|---|---|---|---|---|---|
| Bash simple command | Must block | Must allow | Must allow | AI E2E + Integration | Tool event plus file/stdout verification |
| Bash write inside workspace | Must block | Must allow only in allowed path | Must allow | AI E2E + Integration | File exists only in expected mode/path |
| Bash read inside workspace | Must block | Must allow only in allowed path | Must allow | AI E2E + Integration | Returned content plus denied-path failure |
| Denied command list | Must block | Must block | Optional by config | AI E2E + Integration | No side effect; explicit blocked state |
| Python runtime | Must block | Must allow | Must allow | AI E2E + Integration | Runtime output plus file side effect |
| Node runtime | Must block | Must allow | Must allow | AI E2E + Integration | Runtime output plus file side effect |
| Network allowed domain | Must block or no tool | Must allow only allowlisted domain | Must allow | AI E2E + Integration | Allowed request succeeds, other request fails |
| Network denied domain | Must block or no tool | Must block denylisted domain | Must allow unless separately denied | AI E2E + Integration | Explicit denial and no network side effect |
| Local stdio MCP with `applyToMCP=true` | N/A | Must inherit sandbox boundary | N/A | AI E2E + Integration | MCP side effect is blocked/allowed exactly like bash |
| Local stdio MCP with `applyToMCP=false` | N/A | Must bypass sandbox boundary | N/A | AI E2E + Integration | Same MCP call succeeds where wrapped case fails |
| Remote HTTP / SSE MCP | N/A | Must obey network rules when wrapped | Must allow | AI E2E + Non-AI E2E + Integration | Transport connects and tool result matches policy |
| Browser built-in | Must block | Must obey network rules | Must allow | AI E2E + Integration | Deterministic local page navigation and extraction |
| Skill package with script asset | Must block script execution if permissions forbid | Must allow inside boundary | Must allow | AI E2E + Non-AI E2E + Integration | Imported skill runs only where policy allows |
| Cron -> agent | Should not bypass current policy | Must run under current policy | Must run under current policy | AI E2E + Non-AI E2E + Integration | Scheduled run outcome matches current mode |
| Cron -> team | Same as above | Same as above | Same as above | AI E2E + Non-AI E2E + Integration | Delegated scheduled run inherits expected restrictions |

Environment expectations:

| Environment dimension | Required coverage | Notes |
|---|---|---|
| macOS | Full suite baseline | Primary local development environment |
| Windows | Smoke + server + critical permission subset | Path, shell, quoting, deny command differences |
| Linux | Smoke + server + critical permission subset | Runtime and sandbox availability differences |
| Missing `python` / `node` / `npx` / `uvx` | Degraded-mode tests | Do not rely on `skip` alone |
| Missing browser runtime | Degraded-mode tests | Browser tool must fail clearly and safely |

## Master Coverage Matrix

| Domain | Capability | Agent-centric | Current | Existing coverage | Problems / gaps | Recommended layers | Priority | Proposed work |
|---|---|---|---|---|---|---|---|---|
| Inventory | E2E inventory and counts are accurate | No | weak | `test-catalog.md`, `TEST-LOG.md` | Both docs are stale and undercount the suite | Non-AI E2E tooling | P0 | Auto-generate catalog and run log summary from Playwright list output |
| Routing | Desktop routes match exposed product pages | No | medium | smoke navigation coverage | Route presence is partially inferred; hidden pages can drift silently | Non-AI E2E | P2 | Add route inventory snapshot test |
| Project | Project create/edit/delete/clone/default target | Partial | strong | `project-crud`, `project-advanced`, `project-agent-lifecycle` | No major gap | Non-AI E2E | Keep | Maintain |
| Agent | Agent create/edit/delete/clone/detail tabs | Yes | strong | `agent-crud`, `agent-advanced`, `agent-clone` | No major gap | Non-AI E2E | Keep | Maintain |
| Agent | Agent default model / compact threshold persistence | Yes | medium | `agent-config-interaction`, `save-behavior-consistency`, `runtime-management` | Mostly config persistence, not behavior-level validation | Non-AI E2E + AI E2E | P2 | Add compact threshold effect validation tied to chat behavior |
| Agent status | Idle badge visible | Yes | strong | `agent-advanced`, `smoke/agent-status` | Idle now asserted on both badge and status bar DOM in list/detail views | Non-AI E2E | Keep | Maintain |
| Agent status | Running state appears during chat | Yes | strong | `smoke/agent-status`, runtime-status API structure | List/detail/dashboard running state is now covered with in-flight chat assertions and DOM hooks | AI E2E + Non-AI E2E | Keep | Maintain |
| Agent status | Stale running state resets after relaunch | Yes | strong | `smoke/agent-status-relaunch` | Startup cleanup is now proven through UI and persisted storage after Electron relaunch | Non-AI E2E | Keep | Maintain |
| Agent status | Error state appears on failed execution | Yes | strong | `smoke/agent-status`, `server/routes/chat.test.ts` | Chat failures now persist error state and dashboard recent chat status | AI E2E + Non-AI E2E | Keep | Maintain |
| Agent status | Paused state behavior | Yes | strong | shared/ui/server status cleanup | Dead state was removed from `AgentStatus`; legacy persisted `paused` values normalize to `idle` | Non-AI E2E + Integration | Keep | Maintain |
| Chat | Basic chat send/stream/disable input/delete | Yes | strong | `chat-flow`, `chat-lifecycle`, `chat-ui`, `chat-navigation` | No major gap | AI E2E + Non-AI E2E | Keep | Maintain |
| Chat | Stop button interrupts stream safely | Yes | medium | `chat-advanced` | Good start, but no regression matrix across tools/team | AI E2E | P2 | Extend to tool-heavy response |
| Chat | Tool call block renders for tool usage | Yes | medium | `chat-advanced` with bash | Only bash is explicitly covered in UI | AI E2E | P1 | Add MCP/task/memory/browser tool-call display coverage |
| Chat | Manual compact works | Yes | strong | `chat-advanced`, `compact-quality`, `conversation-advanced` | No major gap | AI E2E + Non-AI E2E | Keep | Maintain |
| Chat | Auto compact triggers and preserves context | Yes | strong | `auto-compact`, `compact-quality` | No major gap | AI E2E | Keep | Maintain |
| Dashboard | Summary/token/runtime APIs return structure | Partial | strong | `dashboard-api`, `dashboard-full`, `token-accuracy` | Mostly API-level, less user-facing | Non-AI E2E + AI E2E | P2 | Add more UI-level runtime-status panel assertions |
| Permission | Permission settings UI modes and config editor | Yes | medium | `permission-config-ui`, `permission-modes`, `permissions-api` | Mostly config/UI, not actual enforcement | Non-AI E2E | Keep | Maintain |
| Permission | Restricted mode blocks bash | Yes | medium | `permission-modes-tools`, `sandbox-runtime` | Assertion is mostly “marker not present”; too model-dependent | AI E2E + Integration | P0 | Strengthen with tool-call absence and side-effect absence |
| Permission | Sandbox mode allows bash echo | Yes | strong | `permission-modes-tools`, `sandbox-runtime`, `code-execution` | Good baseline | AI E2E | Keep | Maintain |
| Permission | Sandbox mode allows Python execution | Yes | medium | `sandbox-runtime`, `code-execution` | Covered only via output string, not file/runtime side effects | AI E2E + Integration | P1 | Add workspace side-effect and runtime info assertions |
| Permission | Sandbox mode allows Node execution | Yes | medium | `sandbox-runtime`, `code-execution` | Same weakness as Python | AI E2E + Integration | P1 | Add stronger side-effect assertions |
| Permission | Sandbox path allow/deny enforcement | Yes | weak | Partial bash runtime coverage | No desktop E2E that proves blocked write/read paths in product flow | AI E2E + Integration | P0 | Add explicit allowed path and denied path cases with file verification |
| Permission | Denied commands enforcement | Yes | weak | `permission-modes-tools`, `sandbox-runtime` | Assertions are text-based and permissive | AI E2E + Integration | P0 | Validate command side effects do not happen and error/tool state is explicit |
| Permission | Network restrictions `allowedDomains` | Yes | missing | No real product-level test | Only config fields exist in E2E | AI E2E + Integration | P0 | Add allowed-domain and denied-domain sandbox cases |
| Permission | Network restrictions `deniedDomains` | Yes | missing | No real product-level test | Same as above | AI E2E + Integration | P0 | Add explicit denied-domain test |
| Permission | Unrestricted mode allows destructive or unrestricted commands | Yes | medium | `permission-modes-tools`, `sandbox-runtime` | Covered but with soft assertions and no rollback verification | AI E2E + Integration | P1 | Strengthen with file existence before/after |
| Permission | Mode switching is safe and persistent | Yes | medium | project permissions UI + API | Need multi-step switch regression matrix | Non-AI E2E + AI E2E | P1 | Add restricted -> sandbox -> unrestricted -> sandbox flow |
| Permission | Sandbox unavailable fallback / degradation | Yes | weak | readiness API, lower-level tests | No desktop E2E for degraded runtime path | Non-AI E2E + Integration | P1 | Add fallback behavior test and user-visible warning assertions |
| Built-in tools | `bash` command execution | Yes | strong | `code-execution`, `sandbox-runtime`, `permission-modes-tools` | Good baseline | AI E2E + Integration | Keep | Maintain |
| Built-in tools | `bash` file read/write in workspace | Yes | medium | `sandbox-runtime`, `edge-cases` | Weak UI linkage to artifacts/workspace | AI E2E + Non-AI E2E | P1 | Add artifact page verification after agent-generated file |
| Built-in tools | `browser` toggle/config persists | Yes | medium | `browser-tool-config`, smoke tool toggle | Config only | Non-AI E2E | Keep | Maintain |
| Built-in tools | `browser` agent can actually navigate/click/read page | Yes | missing | No desktop E2E; lower-level browser tests exist in `packages/tools` | Major agent capability gap | AI E2E + Integration | P0 | Add real browser tool E2E using deterministic local/data URL page |
| Built-in tools | `task` create/list/update through agent | Yes | medium | `task-tool` | Good API-level outcome, but task UI is skipped | AI E2E + Non-AI E2E | P0 | Unskip and repair task page E2E; verify UI reflects agent-created tasks |
| Built-in tools | `memory` pinned memory available in new conversation | Yes | strong | `memory-tools` | Good baseline | AI E2E | Keep | Maintain |
| Built-in tools | `memory` save and search tools | Yes | medium | `memory-tools` | Search is only response-based; persistence across restart missing | AI E2E + Integration | P0 | Add restart/reload persistence case |
| Built-in tools | `computer_use` unavailable state | Yes | medium | registry and config-level tests only | No product-level assertion that unavailable tool is guarded clearly | Non-AI E2E | P2 | Add UI assertion if product still exposes it |
| Skills | Skill CRUD | Yes | strong | `skill-crud`, `skill-api` | No major gap | Non-AI E2E | Keep | Maintain |
| Skills | Assign / remove skill from agent | Yes | medium | `agent-config-interaction`, `skill-effectiveness` | Mostly prompt-effect coverage | Non-AI E2E + AI E2E | Keep | Maintain |
| Skills | Skill instruction effectiveness | Yes | medium | `skill-effectiveness` | Good baseline, but not package/asset behavior | AI E2E | Keep | Maintain |
| Skills | Import `.md` by drag and drop | Yes | missing | UI supports it in `SkillsPage.tsx` | No desktop E2E | Non-AI E2E | P1 | Add drag/drop import flow |
| Skills | Import `.zip` package | Yes | missing | Route exists in `routes/skills.ts` | No desktop E2E | Non-AI E2E | P0 | Add zip import happy path and failure path |
| Skills | `.zip` package with `scripts/` directory | Yes | missing | Server route extracts assets; loader maps skill path | No end-to-end proof that agent can use such a package | AI E2E + Non-AI E2E + Integration | P0 | Add packaged skill with script asset and agent-use scenario |
| Skills | `.zip` package without `scripts/` directory | Yes | missing | Logic should allow it | No E2E coverage | AI E2E + Non-AI E2E | P0 | Add minimalist zip skill import and use |
| Skills | Imported skill UI status / import result display | Yes | missing | Status UI exists in `SkillsPage.tsx` | No desktop E2E | Non-AI E2E | P1 | Add import success and error message assertions |
| Skills | Imported skill can be selected by agent and loaded correctly | Yes | weak | Lower-level `agent/skills.test.ts` only | No desktop E2E proof | AI E2E + Integration | P0 | Add real chat scenario that forces skill selector use |
| MCP | MCP CRUD for `stdio` / `sse` / `http` config | Yes | medium | `mcp-api`, `mcp-page` | Mostly config existence | Non-AI E2E | Keep | Maintain |
| MCP | Local `stdio` MCP connectivity test | Yes | medium | `mcp-applyToMCP`, `mcp-api`, `template-e2e` | Connectivity only, not always real tool use | Non-AI E2E + AI E2E | P1 | Strengthen result assertions |
| MCP | Local `stdio` MCP real fetch tool call | Yes | medium | `mcp-tools` | Response-based only | AI E2E | P1 | Add tool event assertions |
| MCP | Local `stdio` MCP real memory tool store + recall | Yes | weak | `mcp-tools` store only | Recall is not actually asserted end-to-end | AI E2E | P0 | Expand into two-turn store + recall verification |
| MCP | Local `stdio` MCP real filesystem tool | Yes | medium | `mcp-tools` | Response is generic; file set not deterministic | AI E2E | P1 | Use seeded temp dir with deterministic contents |
| MCP | Remote `http` MCP real tool call | Yes | missing | No desktop E2E | Major gap | AI E2E + Non-AI E2E | P0 | Add local fake HTTP MCP server in test harness and real call |
| MCP | Remote `sse` MCP real tool call | Yes | missing | No desktop E2E | Major gap | AI E2E + Non-AI E2E | P0 | Add local fake SSE MCP server in test harness and real call |
| MCP | Cloud / internet-hosted MCP real call | Yes | missing | No desktop E2E | Important for hosted-provider compatibility | AI E2E + Non-AI E2E | P1 | Add optional live test behind env guard |
| MCP | MCP auth failure / timeout / bad transport handling | Yes | weak | invalid command connectivity failure only | Need realistic failure matrix | Non-AI E2E + Integration | P1 | Add timeout, 401, invalid schema cases |
| MCP | `applyToMCP` sandbox wrapping behavior | Yes | weak | Desktop E2E only verifies config; lower-level pool integration is strong | No product-level proof that MCP command is wrapped or bypassed correctly | AI E2E + Integration | P0 | Add one sandbox-wrapped MCP case and one bypass case with side effects |
| Team | Team CRUD / clone / API / layout save | Yes | medium | `team-api`, smoke team pages | Good backend coverage, weak UI detail coverage | Non-AI E2E | P1 | Add detail page and layout flow UI tests |
| Team | Team topology detail page opens correctly | Yes | weak | Route exists, almost no E2E | Missing desktop coverage | Non-AI E2E | P1 | Add team detail page open, topology nodes render |
| Team | Basic delegation leader -> member | Yes | medium | `team-chat`, `team-collaboration` | Good baseline | AI E2E | Keep | Maintain |
| Team | PM + two team members workflow | Yes | missing | Not covered as a business scenario | This is a stated user priority | AI E2E | P0 | Add product-manager team scenario with planning + delegation + synthesis |
| Team | Member-specific skill or tool affects delegation result | Yes | medium | `team-collaboration` | Good baseline | AI E2E | Keep | Maintain |
| Team | Team with MCP / memory / tasks | Yes | missing | Not systematically covered | Important real-world orchestration path | AI E2E | P1 | Add multi-tool team flow |
| Team | Team failure handling when member unavailable | Yes | missing | No E2E | Need resilience coverage | AI E2E + Non-AI E2E | P2 | Add missing member / deleted agent scenario |
| Cron | Cron CRUD for recurring and once | Yes | medium | `cronjob-api`, smoke cron page | Creation only for some cases | Non-AI E2E | Keep | Maintain |
| Cron | Manual trigger for agent target | Yes | medium | `cronjob-execution` | Good baseline | AI E2E + Non-AI E2E | Keep | Maintain |
| Cron | Scheduled recurring execution for agent target | Yes | medium | `cronjob-execution` | Time-sensitive and somewhat coarse | AI E2E | P1 | Stabilize timing and state assertions |
| Cron | One-time `scheduleType=once` actually fires | Yes | missing | API create only | Important product behavior missing | AI E2E + Non-AI E2E | P0 | Add once schedule execution harness |
| Cron | Team-target cron actually executes team workflow | Yes | missing | Types/runtime support team target | No E2E | AI E2E + Non-AI E2E | P0 | Add cron -> team -> delegation -> run history |
| Cron | Cron run history modal / list UI | Yes | weak | UI elements exist, no E2E | Missing history UX validation | Non-AI E2E | P0 | Add open history modal and verify runs |
| Cron | Cron run -> chat navigation | Yes | weak | UI code exists, no E2E | Missing end-to-end navigation validation | Non-AI E2E | P1 | Add “open last run chat” test |
| Memory | Memory tab CRUD UI | Yes | medium | `memory-tab`, `memory-api` | Good baseline | Non-AI E2E | Keep | Maintain |
| Memory | Same-app cross-conversation persistence | Yes | strong | `memory-tools` pinned/new conversation | Good baseline | AI E2E | Keep | Maintain |
| Memory | Cross-restart persistence for agent memory | Yes | missing | No desktop E2E | Very important agent autonomy requirement | Non-AI E2E + AI E2E + Integration | P0 | Add app restart or reload fixture and verify memory survives |
| Memory | Memory edit/delete reflected in agent behavior | Yes | missing | CRUD exists, no behavior follow-up | Need trust in memory maintenance | AI E2E + Non-AI E2E | P1 | Add edit/delete then re-query behavior |
| Artifacts | Workspace / artifacts navigation | Partial | strong | `workspace-page`, `workspace-files`, `workspace-operations` | Good baseline | Non-AI E2E | Keep | Maintain |
| Artifacts | Agent-generated workspace file appears in API | Yes | medium | `edge-cases` | API only; no artifacts UI proof | AI E2E + Non-AI E2E | P1 | Add chat -> file create -> artifacts page preview |
| Artifacts | Uploaded/generated binary or archive is visible/usable in artifacts | Partial | missing | No desktop E2E | Important for zip/doc workflows | Non-AI E2E | P2 | Add archive/file type rendering test |
| Uploads | Message upload extraction and serving | Partial | medium | `message-uploads` | API-level only | Non-AI E2E | P2 | Add chat UI upload flow if UI exists |
| Task page | Task list page route and UI | Yes | missing | Entire spec is skipped | Agent task flow lacks UI confidence | Non-AI E2E | P0 | Re-enable route or delete dead page; if kept, cover it fully |
| Templates | Template structure creation | Partial | strong | `template-creation`, `template-creation-all`, `template-mcp-validation` | Good baseline | Non-AI E2E | Keep | Maintain |
| Templates | Template behavior for representative templates | Yes | medium | `template-e2e` | Only partial template behavior coverage | AI E2E | P2 | Expand to more critical templates |
| Templates | Template cron / team / MCP behavior | Yes | weak | Mostly structural checks | Missing runtime validation per template | AI E2E + Non-AI E2E | P2 | Add targeted runtime behavior tests for templates with cron/team/MCP |
| Speech | Speech settings tab render | Partial | weak | `settings-advanced` smoke only | No actual test-provider or transcription history E2E | Non-AI E2E | P1 | Add speech provider test flow |
| Speech | Onboarding speech step | Partial | weak | onboarding UI only | No test-provider or finish-state validation | Non-AI E2E | P2 | Add speech setup completion path |
| Speech | Transcription history / clear / retry | Partial | missing | Backend/unit only | No desktop E2E | Non-AI E2E | P2 | Add speech history page tests if route is exposed |
| OAuth | OAuth provider onboarding flow | Partial | weak | UI unit tests only | No desktop E2E | Non-AI E2E | P1 | Add mocked OAuth desktop flow |
| OAuth | Global settings OAuth connect/disconnect/status | Partial | weak | UI unit tests only | No desktop E2E | Non-AI E2E | P1 | Add provider OAuth status flow |
| Security | Upload path traversal rejection | No | strong | `message-uploads` | Good baseline | Non-AI E2E | Keep | Maintain |
| Security | Deletion safety / orphan references | No | strong | `deletion-safety` | Good baseline | Non-AI E2E | Keep | Maintain |
| Security | Loopback auth / unauthorized rejection | No | medium | Server route tests exist | No desktop E2E or external-process validation | Non-AI E2E | P2 | Add direct unauthorized API request from test helper |
| Security | CORS / localhost-only policy | No | medium | Server config exists | No product-level validation | Non-AI E2E | P2 | Add direct request tests if worthwhile |
| Cross-OS | Windows permission/path adaptation | Yes | medium | Lower-level tests exist | No desktop E2E on Windows | Integration + CI matrix | P1 | Add Windows smoke/server subset in CI |
| Cross-OS | Linux desktop support validation | Yes | weak | Claimed in README, little desktop validation | Risk of false support confidence | Non-AI E2E + CI matrix | P1 | Add Linux smoke/server subset in CI |
| Cross-OS | macOS remains primary desktop baseline | Yes | medium | Current default environment | Need to keep as canonical full suite | All | Keep | Maintain |
| Environment | Missing `python` / `node` / `npx` / `uvx` handling | Yes | weak | Many specs just skip | Skip is not product behavior validation | Non-AI E2E + Integration | P1 | Add degraded behavior and warning tests |
| Environment | Browser runtime missing / Playwright unavailable | Yes | missing | No product-level fallback test | Important for browser tool reliability | Non-AI E2E + Integration | P2 | Add browser-tool unavailability path |

## User-Priority Gaps

These are the highest-priority gaps based on the audit and the explicit user requirements for agent autonomy.

| Priority | Gap | Why it matters |
|---|---|---|
| P0 | `applyToMCP` real sandbox behavior | This is a security boundary, not a cosmetic config flag |
| P0 | Permission mode enforcement matrix with stronger assertions | Current restricted/sandbox/unrestricted tests are too soft |
| P0 | Browser built-in real agent E2E | Browser is a core agent capability and currently lacks product-level proof |
| P0 | Skill zip import and packaged skill execution | Skill packs are a product promise and currently lack E2E confidence |
| P0 | Remote HTTP/SSE MCP real calls | Local stdio alone is not enough for MCP confidence |
| P0 | Cron `once` and cron-to-team execution | Scheduling is incomplete without these |
| P0 | Memory cross-restart persistence | Long-lived agent usefulness depends on this |
| P0 | Task page reactivation or explicit deprecation | Agent task capability lacks UI confirmation |
| P0 | Agent status transitions `running/error/paused` | Operations visibility and reliability depend on this |

## Existing Tests That Need Hardening

| Spec | Problem | Action |
|---|---|---|
| [`ai/mcp-applyToMCP.spec.ts`](./ai/mcp-applyToMCP.spec.ts) | Mostly validates config storage, not runtime wrapping behavior | Replace with behavior tests using a deterministic MCP server |
| [`ai/mcp-tools.spec.ts`](./ai/mcp-tools.spec.ts) | Memory MCP does not assert recall; tool call assertion is ineffective | Split into store and recall tests with explicit tool event checks |
| [`ai/permission-modes-tools.spec.ts`](./ai/permission-modes-tools.spec.ts) | Blocked-command assertions are too permissive | Assert no side effect and explicit error/tool state |
| [`ai/sandbox-runtime.spec.ts`](./ai/sandbox-runtime.spec.ts) | Similar soft assertions for blocked commands and unrestricted behavior | Strengthen with file-system verification |
| [`smoke/task-page.spec.ts`](./smoke/task-page.spec.ts) | Entire file is skipped | Unskip after route repair or remove dead surface |
| [`test-catalog.md`](./test-catalog.md) | Under-counts suite and omits new specs | Auto-generate |
| [`TEST-LOG.md`](./TEST-LOG.md) | Run log no longer reflects suite reality | Auto-generate summary from actual runs |

## Existing Supplement Proposal Audit

The older supplement draft in [`_requirement/20260316-e2e-functional-tests.md`](../../../_requirement/20260316-e2e-functional-tests.md) is useful as a starting point, but several assumptions need correction before implementation.

| Proposed area in draft | Keep / adjust | Audit note |
|---|---|---|
| `ai/sandbox-runtime.spec.ts` | Adjust | Good direction, but `readFile` / `writeFile` should not be treated as separate built-in tools; permission assertions need side effects, not only response text |
| `ai/mcp-applyToMCP.spec.ts` | Adjust heavily | Current idea uses config save and generic MCP connectivity; it does not prove sandbox wrapping. Use a deterministic MCP side effect instead |
| `ai/compact-quality.spec.ts` | Keep | This area is already reasonably aligned with current needs |
| `ai/skill-effectiveness.spec.ts` | Keep and expand | Prompt-effect tests are useful, but they do not cover packaged skill import, `scripts/`, or asset execution |
| `ai/mcp-tools.spec.ts` | Adjust | Fetch/memory/filesystem coverage is directionally correct, but memory must include recall and tool-call verification |
| `ai/template-e2e.spec.ts` | Keep | Good as representative template smoke, but not a replacement for feature-level coverage |
| `ai/team-collaboration.spec.ts` | Expand | Needs the PM + two members scenario explicitly requested by the user |
| `ai/edge-cases.spec.ts` | Keep selectively | Useful bucket, but some cases should be moved into first-class feature suites rather than remain “misc” |
| `server/template-mcp-validation.spec.ts` | Keep | Strong non-AI structural validation |
| `smoke/save-behavior-consistency.spec.ts` | Keep | Strong non-AI product-behavior validation |

Specific corrections from the draft:

- The draft baseline says `422` tests, but the real suite is now `473`.
- Browser capability needs a dedicated agent E2E; config-only tests are not enough.
- `applyToMCP` should be tested with a server whose side effect can be observed, not only by checking stored config or generic `fetch` success.
- Permission coverage must include network restrictions, not only local shell execution.
- Cross-restart memory persistence, `cron once`, `cron -> team`, and remote HTTP/SSE MCP still need explicit first-class coverage.

## Lower-Level Coverage Already Exists

These areas are not untested, but they are still missing product-level desktop E2E closure.

| Area | Lower-level coverage |
|---|---|
| Sandbox/bash/read-write behavior | `packages/server/src/agent/builtin-tools/integration.test.ts` |
| `applyToMCP` command wrapping | `packages/server/src/agent/mcp-pool.integration.test.ts` |
| Browser tool definitions and real driver integration | `packages/tools/src/browser/tools.test.ts`, `packages/tools/src/browser/drivers/playwright.integration.test.ts` |
| Skill loader path mapping and tool wrapping | `packages/server/src/agent/skills.test.ts` |
| Windows permission adapter behavior | `packages/server/src/agent/permissions-adapter.test.ts` |

## Execution Order

| Wave | Scope |
|---|---|
| Wave 1 | Fix inventory drift; harden permission tests; add `applyToMCP`; add browser E2E; add skill zip/script E2E |
| Wave 2 | Add HTTP/SSE MCP real-call tests; add cron once and cron-to-team; add memory cross-restart; add task page UI |
| Wave 3 | Add team topology/detail UI; add speech and OAuth desktop E2E; add richer dashboard/status coverage |
| Wave 4 | Add Windows/Linux CI subsets; add optional live cloud MCP and provider matrix |

## Suggested New Spec Files

These filenames are proposals, not final decisions.

| Proposed spec | Purpose |
|---|---|
| `ai/mcp-apply-to-mcp-runtime.spec.ts` | Prove MCP stdio commands are wrapped or bypassed depending on `applyToMCP` |
| `ai/permission-network-restrictions.spec.ts` | Validate `allowedDomains` / `deniedDomains` behavior in sandbox |
| `ai/browser-tools.spec.ts` | Real agent browser navigation/click/extract behavior |
| `server/skills-import-zip.spec.ts` | Zip import happy path, invalid zip, asset extraction |
| `ai/skill-package-execution.spec.ts` | Imported skill package with `scripts/` and without `scripts/` |
| `server/mcp-http-sse-live.spec.ts` | Deterministic local HTTP/SSE MCP transport tests |
| `ai/cronjob-once.spec.ts` | One-time cron actual execution |
| `ai/cronjob-team-execution.spec.ts` | Cron target team workflow and run history |
| `ai/memory-persistence.spec.ts` | Cross-conversation and cross-restart memory persistence |
| `smoke/task-page.spec.ts` | Repaired and unskipped task page coverage |
| `ai/agent-status.spec.ts` | Idle/running/error transitions across chat, MCP, cron |
| `smoke/team-topology.spec.ts` | Team detail, topology render, layout persistence |
| `smoke/speech-settings.spec.ts` | Speech provider test and history UI |
| `smoke/oauth-provider-flow.spec.ts` | OAuth connect/disconnect status in settings/onboarding |
