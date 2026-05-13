# E2E Completion Implementation Plan

> Updated: 2026-03-16
> References: [`AUDIT-PLAN.md`](./AUDIT-PLAN.md)

## Objective

Turn the current desktop E2E suite from "broad but uneven" into a suite that can credibly prove the product is usable and safe from the agent's perspective.

Success means:

- Agent-critical capabilities have behavior-level coverage, not only config coverage.
- Permission modes are proven with side effects and runtime signals, not only model wording.
- MCP, skills, browser, cron, team, memory, artifacts, and status flows have deterministic closure.
- The suite has a clear split between AI E2E, non-AI E2E, and lower-level integration.
- The suite can be expanded across macOS, Windows, and Linux without rewriting core tests.

## Execution Rules

These rules govern implementation. If a test violates these rules, it should be redesigned rather than added.

| Rule | Implementation requirement |
|---|---|
| Config is not behavior | Saving a toggle, route, or entity does not count as proving the feature works |
| Prefer deterministic fixtures | Use local seeded files, local web pages, local MCP transports, and local side effects before remote services |
| AI only where needed | Use AI E2E to prove tool selection, delegation, recall, and orchestration; keep CRUD and transport checks deterministic |
| Assert effects, not only text | Prefer file existence, API state, run status, tool events, and UI state over "response contains/does not contain" |
| External live dependencies are opt-in | Remote cloud MCP or public network checks must be behind env guards |
| `skip` is not a substitute for degraded behavior | Missing `python`, `node`, `npx`, `uvx`, or browser runtime needs explicit degraded-mode tests |

## Delivery Shape

Implementation will be delivered in waves. Each wave has a clear goal and concrete output.

| Wave | Goal | Output |
|---|---|---|
| Wave 0 | Build shared test infrastructure and fix inventory drift | Shared fixtures, helper extensions, deterministic local servers, generated inventory |
| Wave 1 | Close security and permission gaps | Hardened permission specs, `applyToMCP` runtime proof, network restriction coverage |
| Wave 2 | Close core agent capability gaps | Browser E2E, skill package import/use, memory restart persistence, agent status |
| Wave 3 | Close orchestration gaps | Team PM scenario, `cron once`, `cron -> team`, cron history/navigation, MCP HTTP/SSE |
| Wave 4 | Close support and platform gaps | Speech/OAuth, topology/task resolution, cross-OS CI subsets, optional live cloud MCP |

## Shared Enablers

These items should be built first because multiple later specs depend on them.

| ID | Enabler | Planned change | Needed by | Acceptance criteria |
|---|---|---|---|---|
| INF-01 | Inventory generator | Add a script that derives suite counts and catalog from `playwright --list` output and replaces stale hand-written counts | Audit docs, review workflow | `test-catalog.md` and `TEST-LOG.md` are reproducible from commands, not hand-edited |
| INF-02 | Stronger `TestHelper` APIs | Extend [`fixtures/test-helper.ts`](./fixtures/test-helper.ts) with permission-config helpers, workspace file existence checks, run polling, SSE event extraction, and MCP/tool assertion helpers | Permission, MCP, cron, memory, artifacts | Later specs no longer duplicate polling or parse SSE ad hoc |
| INF-03 | Electron relaunch fixture | Extend [`fixtures/electron.ts`](./fixtures/electron.ts) or add a companion controller to close and relaunch the app against the same `GOLEMANCY_TEST_DATA_DIR` | Memory persistence, restart durability | A test can relaunch the app and continue assertions in the same data directory |
| INF-04 | Local deterministic web server | Add a lightweight local HTTP server fixture for browser-tool pages and permission-network tests | Browser, network restrictions | Tests can hit a known local URL with stable content and no public internet dependency |
| INF-05 | Local deterministic MCP harness | Add local HTTP and SSE MCP test servers plus a simple stdio-side-effect MCP harness | `applyToMCP`, remote MCP, transport failures | Tests can prove real MCP tool calls with observable side effects |
| INF-06 | Skill package fixtures | Add sample zip assets covering: `SKILL.md` only, `SKILL.md + scripts/`, invalid zip, multiple skills in one zip | Skill import, packaged skill execution | Tests import known fixtures rather than generating zip blobs inline |
| INF-07 | Runtime prerequisite helpers | Centralize checks for `python`, `node`, `npx`, `uvx`, browser runtime, and sandbox availability | Degraded-mode tests | Specs fail or downgrade consistently instead of each spec inventing its own `skip` logic |
| INF-08 | Cross-OS CI slices | Add at least smoke/server/critical-permission subsets for Windows and Linux | Cross-platform support claims | CI can prove a minimum support baseline outside macOS |

## Wave 0

Wave 0 creates the foundation. It should land before feature-heavy implementation starts.

| Work item | Scope | Files | Notes |
|---|---|---|---|
| W0-1 | Replace stale manual inventory | `apps/desktop/e2e/test-catalog.md`, `apps/desktop/e2e/TEST-LOG.md`, new generator script | This fixes the audit baseline before adding more tests |
| W0-2 | Add helper methods for workspace assertions | `fixtures/test-helper.ts` | Needed for side-effect verification in permission, MCP, artifacts, skills |
| W0-3 | Add relaunch support | `fixtures/electron.ts` or new fixture module | Required for cross-restart memory verification |
| W0-4 | Add deterministic local servers | new `fixtures/local-servers.ts` or similar | One server can serve browser pages, network tests, and fake MCP transports |
| W0-5 | Add zipped skill fixtures | new `apps/desktop/e2e/assets/skills/*` | Keeps skill tests readable and deterministic |

## Wave 1: Security And Permission Closure

Goal: prove the agent is correctly constrained under `restricted`, `sandbox`, and `unrestricted`, including MCP wrapping and network policy.

| ID | Capability | Action | Files | Assertion strategy | Depends on |
|---|---|---|---|---|---|
| PERM-01 | Restricted blocks command execution | Rewrite current blocked-command tests to verify no tool effect and no file side effect | [`ai/permission-modes-tools.spec.ts`](./ai/permission-modes-tools.spec.ts) | No output marker, no created file, no tool-call success event | INF-02 |
| PERM-02 | Sandbox allows safe bash/python/node in boundary | Strengthen existing sandbox runtime tests with workspace file side effects and runtime metadata | [`ai/sandbox-runtime.spec.ts`](./ai/sandbox-runtime.spec.ts) | File exists only where allowed; interpreter output is verified through actual created artifacts | INF-02 |
| PERM-03 | Denied commands are actually blocked | Add explicit deny-list cases with before/after file verification | [`ai/permission-modes-tools.spec.ts`](./ai/permission-modes-tools.spec.ts), [`ai/sandbox-runtime.spec.ts`](./ai/sandbox-runtime.spec.ts) | Command attempts are surfaced, but file system remains unchanged | INF-02 |
| PERM-04 | Network allowlist / denylist | Add a dedicated network-restriction spec using a local HTTP server and two domains/endpoints | new `ai/permission-network-restrictions.spec.ts` | Allowlisted request succeeds; non-allowlisted or denylisted request fails deterministically | INF-04, INF-07 |
| MCP-01 | `applyToMCP=true` inherits sandbox | Replace config-only `applyToMCP` tests with real stdio MCP side-effect tests | [`ai/mcp-applyToMCP.spec.ts`](./ai/mcp-applyToMCP.spec.ts) or renamed runtime spec | Wrapped case is blocked exactly where plain bash is blocked | INF-05 |
| MCP-02 | `applyToMCP=false` bypasses sandbox wrapping | Add paired control case to `MCP-01` | same as above | Same MCP call succeeds in bypass mode where wrapped mode fails | INF-05 |
| PERM-05 | Mode switching remains safe | Add a deterministic restricted -> sandbox -> unrestricted -> sandbox project-level flow | new or existing permission spec | Effective behavior changes with config changes and persists after reload | INF-02, INF-03 |

Wave 1 exit criteria:

- The permission matrix in [`AUDIT-PLAN.md`](./AUDIT-PLAN.md) is fully covered for bash, python, node, denied commands, network policy, and `applyToMCP`.
- No remaining P0 permission test relies only on assistant wording.

## Wave 2: Core Agent Capability Closure

Goal: close the highest-value agent usability gaps outside pure permissions.

| ID | Capability | Action | Files | Assertion strategy | Depends on |
|---|---|---|---|---|---|
| BROWSER-01 | Agent can really use browser tools | Add deterministic browser E2E against a local page with known elements, navigation, and extraction | new `ai/browser-tools.spec.ts` | Assert browser tool events and extracted content from local page | INF-04, INF-07 |
| SKILL-01 | Zip import works | Add server/UI tests for zip import happy path, invalid zip, and import status messages | new `server/skills-import-zip.spec.ts`, new smoke/UI import spec | Imported skill count, extracted asset presence, UI success/error banners | INF-06 |
| SKILL-02 | Packaged skill with `scripts/` can actually run | Add AI E2E proving imported packaged skill is selected and produces observable output | new `ai/skill-package-execution.spec.ts` | Imported package causes deterministic workspace side effect or structured output | INF-06, INF-02 |
| SKILL-03 | Packaged skill without `scripts/` still works | Add minimalist package case | same as above | Package imports cleanly and agent can use instructions without script assets | INF-06 |
| MEM-01 | Memory survives restart | Add cross-restart memory persistence spec | new `ai/memory-persistence.spec.ts` | Save memory, relaunch app, new conversation recalls same fact | INF-03 |
| STATUS-01 | Agent running state is visible | Add UI-level running-state assertions during in-flight chat | new `ai/agent-status.spec.ts` | Status badge changes to running and later returns to idle | INF-02 |
| STATUS-02 | Agent error state is visible | Force deterministic tool/provider/MCP failure and assert error status lifecycle | same as above | Error badge or dashboard runtime state updates and resets appropriately | INF-02 |
| TASK-01 | Task surface is either restored or explicitly removed | Audit route absence and decide: re-route `TaskListPage` or delete dead spec | [`smoke/task-page.spec.ts`](./smoke/task-page.spec.ts), UI routes | If kept, full page flow is covered; if removed, dead tests/docs are deleted | product decision |
| MCP-03 | Local stdio memory MCP does real recall | Rewrite weak store-only test into store + recall with explicit tool assertions | [`ai/mcp-tools.spec.ts`](./ai/mcp-tools.spec.ts) | Same fact is recalled in a second step, not only “stored” | INF-05, INF-02 |

Wave 2 exit criteria:

- Browser, skill packages, memory durability, and agent status all have at least one strong end-to-end path.
- The task surface ambiguity is resolved in code and tests.

## Wave 3: Orchestration Closure

Goal: cover multi-agent, scheduled, and remote-tool behavior that matters for real autonomous use.

| ID | Capability | Action | Files | Assertion strategy | Depends on |
|---|---|---|---|---|---|
| TEAM-01 | PM + two members workflow | Add a business-style team scenario: PM plans, delegates, synthesizes | new `ai/team-pm-workflow.spec.ts` or expand [`ai/team-collaboration.spec.ts`](./ai/team-collaboration.spec.ts) | Delegation events show the right member receives the right subtask | INF-02 |
| TEAM-02 | Team + skill/tool specialization | Extend team tests to prove member-specific tools or skills affect outcome | existing team specs | Delegation result differs based on assigned capability | INF-06 optional |
| CRON-01 | `scheduleType=once` actually fires | Add once-scheduled cron execution test | new `ai/cronjob-once.spec.ts` | Run appears, completes, and produces conversation/messages | INF-02 |
| CRON-02 | `cron -> team` really executes team workflow | Add scheduled or manual trigger for team target | new `ai/cronjob-team-execution.spec.ts` | Created run resolves to a team conversation with delegation behavior | INF-02 |
| CRON-03 | Cron history UI and run-to-chat navigation | Add UI closure for run history modal and navigation into the generated conversation | extend cron smoke/UI coverage | Run list shows status, and clicking opens the right chat | INF-02 |
| MCP-04 | Remote HTTP MCP real tool call | Add deterministic local HTTP MCP transport tests | new `server/mcp-http-sse-live.spec.ts`, new AI follow-up if needed | Real tool list/result from local HTTP endpoint | INF-05 |
| MCP-05 | Remote SSE MCP real tool call | Add deterministic local SSE MCP transport tests | same as above | Real tool list/result from local SSE endpoint | INF-05 |
| MCP-06 | Transport failure matrix | Add timeout, auth failure, invalid schema, and reconnect-ish failure cases | same as above | Errors are explicit and non-hanging | INF-05 |
| ART-01 | Agent-created outputs show up in artifacts UI | Close the loop from bash/skill-generated file to artifacts navigation and preview | extend workspace/artifacts specs | Generated file is visible and previewable in UI | INF-02 |

Wave 3 exit criteria:

- Team orchestration and cron orchestration both have strong product-level proof.
- Remote MCP transports are no longer config-only.

## Wave 4: Support Surfaces And Platform Coverage

Goal: close remaining non-core but product-significant surfaces, plus support claims on other OSes.

| ID | Capability | Action | Files | Notes |
|---|---|---|---|---|
| SPEECH-01 | Speech provider setup and test flow | Add desktop E2E for speech settings and onboarding speech step | new smoke specs | Should use deterministic mock/test provider path if available |
| OAUTH-01 | OAuth provider desktop flow | Add mocked connect/disconnect/status coverage | new smoke specs | Prefer deterministic local callback flow |
| TEAM-UI-01 | Team topology and layout persistence | Add detail page and layout save/load UI tests | new `smoke/team-topology.spec.ts` | Product-level topology confidence |
| ENV-01 | Missing runtime degradation | Add tests for missing `python`, `node`, `npx`, `uvx`, browser runtime | new support specs | Stop relying on per-spec skip logic |
| OS-01 | Windows subset CI | Add smoke/server/critical permission matrix on Windows | CI workflow | Validates support claim |
| OS-02 | Linux subset CI | Add smoke/server/critical permission matrix on Linux | CI workflow | Validates support claim |
| MCP-LIVE-01 | Optional cloud MCP live smoke | Add env-guarded live hosted MCP test | optional spec | Not part of default CI |

## Exact Test Design Decisions

These decisions should be followed consistently during implementation.

### Permission tests

- Use observable file side effects in workspace or temp paths.
- Verify absence of side effects in blocked modes.
- Use SSE/tool events when available, but never as the only assertion.
- Keep one command per behavior. Avoid compound shell commands unless the compound behavior is the thing being tested.

### MCP tests

- Separate transport connectivity from agent use.
- For `applyToMCP`, use a stdio MCP tool that attempts a known write or read outside the allowed boundary.
- For HTTP/SSE, use local fake MCP servers first. Public endpoints are optional only.
- Fix the current memory MCP test to include actual recall.

### Skill tests

- Separate import pipeline tests from agent-use tests.
- Use prebuilt zip fixtures, not inline-generated archives inside spec bodies.
- Cover both with and without `scripts/`.
- Prefer verifying a deterministic workspace file or structured text output over loose prose.

### Browser tests

- Use a local page with stable selectors and multi-step interaction.
- Validate at least navigation, click or form interaction, and content extraction.
- Add a degraded-mode test for missing browser runtime later instead of only `skip`.

### Cron and team tests

- Separate manual trigger, once schedule, recurring schedule, and team-target behavior.
- Always close the loop to run history and produced conversations.
- For team cron, assert delegation behavior, not only run existence.

### Memory and status tests

- Cross-conversation memory is not enough; restart durability is required.
- Status tests should cover `idle -> running -> idle`, and at least one deterministic `error` path.
- `paused` needs a product audit first; if unreachable, remove from E2E scope and treat as dead state cleanup.

## Dependencies And Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Remote/public services make tests flaky | Unstable CI and low trust | Default to local deterministic fixtures; make live tests opt-in |
| Existing worker-scoped Electron fixture cannot relaunch cleanly | Blocks restart-persistence coverage | Add explicit relaunch controller in Wave 0 |
| Task page is not routed today | Cannot honestly claim task UI coverage | Resolve product decision before writing task UI tests |
| Browser tool runtime may differ by OS | Cross-platform drift | Keep browser E2E deterministic and add OS subset matrix later |
| One-minute cron polling is slow and flaky | Slows suite and causes timing failures | Use `scheduleType=once` for deterministic timing and keep recurring checks minimal |
| MCP transport harness complexity | Can slow implementation | Build one reusable local harness for HTTP + SSE + side-effect tools |

## Confirmation Gates

These are the only plan decisions that should be confirmed before implementation starts in earnest.

| Gate | Decision needed | Recommended default |
|---|---|---|
| G1 | Task page strategy | Re-introduce a routed task page if product wants task UI; otherwise delete dead page tests and treat task as API/status-bar surface |
| G2 | Cloud MCP live coverage | Keep as opt-in env-guarded smoke, not default CI |
| G3 | Cross-OS CI scope | Start with smoke + server + critical permission subset, not full AI suite |

## Definition Of Done

The plan is considered implemented only when all of the following are true:

- All P0 items in [`AUDIT-PLAN.md`](./AUDIT-PLAN.md) are either covered or explicitly removed from scope by product decision.
- Weak tests called out in the audit are rewritten with strong assertions.
- `applyToMCP` is proven at runtime, not only in config.
- Browser, packaged skills, memory restart persistence, and cron/team orchestration each have at least one strong E2E path.
- Remote HTTP/SSE MCP has deterministic transport coverage.
- Inventory docs are generated from the real suite.
- Windows and Linux have at least a minimal CI-backed validation subset.

## Recommended Implementation Order

This is the recommended sequence for actual coding work once the plan is approved.

1. Wave 0 shared enablers.
2. Wave 1 permission and `applyToMCP`.
3. Browser and skill package coverage.
4. Memory restart and agent status.
5. Team PM scenario and cron gaps.
6. Remote HTTP/SSE MCP.
7. Task route decision, speech, OAuth, topology, and cross-OS CI.
