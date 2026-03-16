# E2E Remaining Work Handoff

> Updated: 2026-03-16
> Owner handoff scope: all remaining desktop E2E audit, repair, implementation, and regression work
> Primary references:
> - [`AUDIT-PLAN.md`](./AUDIT-PLAN.md)
> - [`IMPLEMENTATION-PLAN.md`](./IMPLEMENTATION-PLAN.md)
> - [`EXECUTION-TRACKER.md`](./EXECUTION-TRACKER.md)

## 1. Objective

Take over everything that is still unfinished in the desktop E2E audit and completion effort.

This is not only “write more tests”.

The remaining work includes:

- fixing already-confirmed product issues that new tests exposed
- stabilizing flaky tests so they count as real coverage
- implementing all missing P0/P1/P2 E2E coverage called out in the audit
- keeping per-scenario execution records up to date
- making sure the final suite proves agent usability and safety from the product level

## 2. Ground Truth

Current real desktop E2E baseline:

| Layer | Files | Tests | AI usage |
| --- | ---: | ---: | --- |
| smoke | 27 | 147 | No |
| server | 28 | 226 | Mostly no |
| ai | 19 | 93 | Yes |
| onboarding | 1 | 7 | No |
| total | 75 | 473 | Mixed |

Important: older handwritten docs are stale and must not be trusted as the source of truth.

Known inventory drift:

- `test-catalog.md`
- `TEST-LOG.md`
- `_requirement/20260316-e2e-functional-tests.md`

## 3. What Has Already Been Done

### 3.1 Infrastructure and helper repairs already landed

These changes are already in the working tree and should be preserved.

| Area | File | What changed |
| --- | --- | --- |
| Test helper | [`fixtures/test-helper.ts`](./fixtures/test-helper.ts) | Fixed `/api/chat` usage, corrected agent creation payload, improved SSE parsing, added workspace/permissions/polling helpers, added tool-oriented agent creation helpers |
| Local deterministic HTTP fixture | [`fixtures/local-servers.ts`](./fixtures/local-servers.ts) | Added allowlist/denylist HTTP routes and deterministic browser pages |
| Local stdio MCP harness | [`fixtures/mcp-stdio-side-effect-server.mjs`](./fixtures/mcp-stdio-side-effect-server.mjs) | Added deterministic host-side-effect MCP server for `applyToMCP` behavior tests |
| Permission behavior tests | [`ai/permission-modes-tools.spec.ts`](./ai/permission-modes-tools.spec.ts) | Reworked around side effects instead of loose text checks |
| Network restriction tests | [`ai/permission-network-restrictions.spec.ts`](./ai/permission-network-restrictions.spec.ts) | Added deterministic allowlist/denylist cases |
| `applyToMCP` tests | [`ai/mcp-applyToMCP.spec.ts`](./ai/mcp-applyToMCP.spec.ts) | Reworked to real runtime side-effect tests |
| Browser tests | [`ai/browser-tool.spec.ts`](./ai/browser-tool.spec.ts) | Added deterministic local browser scenarios |
| Memory recall test | [`ai/memory-tools.spec.ts`](./ai/memory-tools.spec.ts) | Strengthened to use persisted-result assertions |
| Memory restart test | [`ai/memory-persistence.spec.ts`](./ai/memory-persistence.spec.ts) | Added cross-relaunch memory scenario |
| PM team delegation test | [`ai/team-delegation-pm.spec.ts`](./ai/team-delegation-pm.spec.ts) | Added PM + two members scenario |
| Cron once / team runtime test | [`server/cronjob-once-runtime.spec.ts`](./server/cronjob-once-runtime.spec.ts) | Added once-run and team-target runtime scenarios |
| Cron route correction | [`server/cronjob-api.spec.ts`](./server/cronjob-api.spec.ts), [`ai/cronjob-execution.spec.ts`](./ai/cronjob-execution.spec.ts), [`server/deletion-safety.spec.ts`](./server/deletion-safety.spec.ts) | Updated old `/cronjobs` route usage to real `/cron-jobs` |

### 3.2 Important semantic corrections already established

| Topic | Correction |
| --- | --- |
| `restricted` mode | In current product semantics, this is virtual sandbox isolation, not “bash disabled entirely” |
| memory recall assertions | Recall can succeed without a visible `MemorySearch` SSE event, so do not require a tool event as the only proof |
| cron routes | Desktop server uses `/api/projects/:projectId/cron-jobs`, not `/cronjobs` |
| root-level Playwright execution | Running Playwright from repo root can hit the wrong executable; use `apps/desktop` package context for targeted runs |

## 4. Current Scenario Status

This is the active scenario ledger for the handoff. Treat this as the current truth.

| ID | Area | Scenario | Current status | Meaning |
| --- | --- | --- | --- | --- |
| `PERM-001` | permission | restricted isolates host path | passed | good baseline |
| `PERM-002` | permission | sandbox writes workspace | passed | good baseline |
| `PERM-003` | permission | sandbox blocks denied `rm` | failed | looks like real product bug |
| `PERM-004` | permission | unrestricted delete works | passed | good baseline |
| `PERM-005` | permission | mode switch applies immediately | failed | looks like real product bug |
| `PERM-006` | network | allowlisted request succeeds | passed | good baseline |
| `PERM-007` | network | denylisted request never reaches server | failed | looks like real product bug |
| `MCP-001` | MCP | `applyToMCP=true` blocks host side effect | failed | looks like real product bug |
| `MCP-002` | MCP | `applyToMCP=false` allows host side effect | passed | good baseline |
| `REG-001` | regression | legacy `sandbox-runtime` echo test | failed | test assumption is outdated |
| `BROWSER-001` | browser | agent opens deterministic local page | running / unresolved | zero browser requests so far |
| `BROWSER-002` | browser | agent clicks deterministic page | implemented | blocked behind `BROWSER-001` root cause |
| `SKILL-001` | skills | zip import with `scripts/` and agent use | not_started | full gap |
| `SKILL-002` | skills | zip import without `scripts/` and agent use | not_started | full gap |
| `MEM-001` | memory | cross-conversation recall | passed | strengthened and working |
| `MEM-002` | memory | cross-restart persistence | flaky | first run failed, retry passed |
| `TEAM-001` | team | PM delegates to two members | failed | broader team delegation issue likely |
| `CRON-001` | cron | once cron auto-triggers and records run | flaky | first run failed, retry passed |
| `CRON-002` | cron | cron targets team and shows delegation | failed | delegation evidence missing |
| `STATE-001` | status | `idle -> running -> idle` visible | not_started | still missing |

## 5. Additional Diagnostic Evidence Already Collected

These are not just opinions; they came from actual runs and matter for the takeover.

| Finding ID | Finding | Why it matters |
| --- | --- | --- |
| `F-001` | `sendChatViaApi` helper used to be wrong in route, payload, and SSE handling | Historical AI E2E outcomes before this repair are low trust |
| `F-002` | Tool-use tests are more reliable when pinning a stronger tool-calling model | New tool-oriented E2E should prefer `createToolAgent()` |
| `F-003` | Assistant message parts do not always preserve stable tool invocation evidence | Side effects and persisted state are stronger assertions |
| `F-004` | `restricted` means isolation, not total denial of bash | Do not write the wrong expectation again |
| `F-005` | Cron E2E route names were stale across the suite | Old cron results are suspect until rerun |
| `F-006` | Memory recall may work without explicit memory tool SSE events | Use stored state + answer content |
| `F-007` | Once-cron timing is flaky | Needs stabilization before counting as done |
| `F-008` | Minimal existing team delegation E2E also failed | Team issue is broader than the new PM scenario |

## 6. Confirmed Or Likely Product Issues

These should be treated as real bugs until disproven.

| Bug ID | Symptom | Evidence | Likely area |
| --- | --- | --- | --- |
| `BUG-PERM-003` | `deniedCommands: ['rm']` still allows delete | `PERM-003` failed by actual file deletion | sandbox command enforcement |
| `BUG-PERM-005` | switching to `restricted` does not immediately isolate host writes | `PERM-005` failed by actual host file creation | permission config propagation / runtime cache |
| `BUG-PERM-007` | denylisted network request still reaches local server | `PERM-007` request count was `1` | sandbox network restriction path |
| `BUG-MCP-001` | `applyToMCP=true` still allows stdio MCP host startup side effect | `MCP-001` startup marker existed | MCP wrapping in desktop runtime |
| `BUG-TEAM-001` | team delegation is not reliably observable or not actually happening | `TEAM-001` failed and baseline `team-chat` delegation also failed | delegation runtime and/or event persistence |
| `BUG-CRON-002` | team-target cron finishes without delegation evidence | `CRON-002` failed twice | scheduler + team execution closure |

## 7. Flaky But Important Areas

These are not done. They must be stabilized or replaced with better deterministic coverage.

| ID | Area | Current behavior | Required follow-up |
| --- | --- | --- | --- |
| `MEM-002` | memory restart persistence | one fail, one pass | determine whether persistence is truly unstable or recall prompt/model is unstable; harden assertion path |
| `CRON-001` | once cron runtime | one fail, one pass | widen or redesign timing window; possibly use scheduler hook or a more deterministic scheduled-at strategy |

## 8. Remaining Work: Full Scope

This section is the actual takeover scope. Nothing below should be considered optional unless product explicitly removes it from scope.

### 8.1 P0 remaining work

| Group | Remaining work | Expected output |
| --- | --- | --- |
| Permission | fix `PERM-003`, `PERM-005`, `PERM-007` and rerun permission matrix | permission/security baseline is green and strong |
| MCP | fix `MCP-001`; then rerun `applyToMCP` pair | wrapped and unwrapped behaviors both proven |
| Browser | root-cause `BROWSER-001`, then run `BROWSER-002` | browser built-in has at least one strong E2E path |
| Skills | implement `SKILL-001` and `SKILL-002` fully | zip import and agent-use both proven |
| Team | investigate/fix delegation reliability for `TEAM-001` and baseline `team-chat` | team delegation is actually proven, not assumed |
| Cron | stabilize `CRON-001`, investigate/fix `CRON-002` | once and team cron both trustworthy |
| Memory | stabilize `MEM-002` | restart persistence is not flaky |
| Agent status | implement `STATE-001` | `idle -> running -> idle` is visibly covered |
| Inventory | implement generated inventory/log replacement | suite counts no longer drift silently |

### 8.2 P1 remaining work

| Group | Remaining work | Expected output |
| --- | --- | --- |
| MCP remote | add deterministic HTTP MCP and SSE MCP transport coverage | remote MCP is no longer config-only |
| Task UI | decide whether task page is real or dead; test or remove it | no dead surface ambiguity |
| Artifacts/UI | close loop from agent-generated files to workspace/artifacts UI | outputs are visible in product UI |
| Agent status | add deterministic error-state coverage; audit paused state | status model is not partially covered |
| Team UI | add topology/detail/layout persistence tests | team UI is product-safe |
| Environment | add degraded-mode tests for missing `python/node/npx/browser` | `skip` is not the only fallback |
| Cross-OS | start Windows/Linux smoke/server/critical-permission slices | support claims have CI proof |

### 8.3 P2 remaining work

| Group | Remaining work | Expected output |
| --- | --- | --- |
| Templates | expand runtime behavior tests for template flows | template claims are behavior-level |
| Speech | add speech settings/onboarding deterministic E2E | speech surface is covered |
| OAuth | add mocked OAuth desktop flow | provider auth surface is covered |
| Security | add direct desktop-level unauthorized/CORS checks if worthwhile | loopback security claims are stronger |
| Cloud MCP | add opt-in hosted MCP smoke behind env guard | live hosted integration confidence |

## 9. Recommended Execution Order

Follow this order unless a blocking discovery forces a change.

1. Fix confirmed product bugs: `PERM-003`, `PERM-005`, `PERM-007`, `MCP-001`.
2. Rerun the entire permission / `applyToMCP` wave and update [`EXECUTION-TRACKER.md`](./EXECUTION-TRACKER.md).
3. Root-cause browser tool behavior and complete `BROWSER-001/002`.
4. Implement skill zip fixtures and finish `SKILL-001/002`.
5. Investigate team delegation reliability using both the new PM spec and existing `team-chat` baseline.
6. Stabilize `MEM-002` and `CRON-001`.
7. Fix or redesign `CRON-002` until delegation is provable.
8. Implement `STATE-001`.
9. Move into remote MCP, artifacts, task page, team topology, degraded-mode, and cross-OS work.
10. Finish lower-priority template/speech/oauth/live-MCP items.

## 10. How To Run Tests Correctly

### 10.1 Important execution rules

- Run targeted tests from `apps/desktop`, not repo root.
- Use `--no-deps` for one-by-one scenario execution.
- After each scenario run, update [`EXECUTION-TRACKER.md`](./EXECUTION-TRACKER.md).
- A scenario counts as covered only when status is `passed`. `flaky` is not done.

### 10.2 Build once before targeted runs

```bash
cd apps/desktop
pnpm exec electron-vite build --mode test
```

### 10.3 Run one targeted scenario

```bash
cd apps/desktop
npx playwright test --config=e2e/playwright.config.ts --no-deps --project=ai e2e/ai/memory-tools.spec.ts -g "agent saves memory in one conversation and recalls it in a new conversation"
```

### 10.4 Useful targeted commands

```bash
cd apps/desktop
npx playwright test --config=e2e/playwright.config.ts --no-deps --project=ai e2e/ai/permission-modes-tools.spec.ts
npx playwright test --config=e2e/playwright.config.ts --no-deps --project=ai e2e/ai/permission-network-restrictions.spec.ts
npx playwright test --config=e2e/playwright.config.ts --no-deps --project=ai e2e/ai/mcp-applyToMCP.spec.ts
npx playwright test --config=e2e/playwright.config.ts --no-deps --project=ai e2e/ai/browser-tool.spec.ts
npx playwright test --config=e2e/playwright.config.ts --no-deps --project=ai e2e/ai/team-delegation-pm.spec.ts
npx playwright test --config=e2e/playwright.config.ts --no-deps --project=server e2e/server/cronjob-once-runtime.spec.ts
npx playwright test --config=e2e/playwright.config.ts --no-deps --project=server e2e/server/cronjob-api.spec.ts
```

## 11. Working Rules For The New Owner

| Rule | Required behavior |
| --- | --- |
| Per-scenario tracking is mandatory | Do not batch work without updating `EXECUTION-TRACKER.md` |
| Config is not proof | Saving a toggle or entity does not count as feature coverage |
| Prefer deterministic fixtures | local files, local pages, local MCP, local side effects before public services |
| Assert effects over prose | file existence, request counts, run status, persisted records, UI state |
| Do not over-trust tool events | use them as secondary evidence unless they are demonstrably stable |
| Do not call something “done” if flaky | fix stability or redesign the test |

## 12. Open Decisions To Carry Forward

These are still unresolved and need explicit resolution during takeover.

| Decision | Current recommendation |
| --- | --- |
| Task page: real surface or dead surface? | if product wants it, restore route and fully test it; otherwise delete dead tests |
| Team delegation observability: event issue or runtime issue? | investigate before adding more team scenarios |
| Once cron timing strategy | prefer deterministic scheduling hook if plain wall-clock remains flaky |
| Cross-restart fixture reuse | move relaunch logic into shared fixture if memory restart work continues |
| Cloud MCP live tests | keep behind env guard and out of default CI |

## 13. Definition Of Done For The Takeover

The takeover is complete only when all of the following are true:

- all current `failed` scenarios are either fixed and passing or explicitly removed from scope by product decision
- all current `flaky` scenarios are stable or redesigned
- `BROWSER-001/002`, `SKILL-001/002`, and `STATE-001` are implemented and passing
- team delegation is proven with reliable evidence
- once cron and team cron are both proven with reliable evidence
- remote HTTP/SSE MCP has deterministic coverage
- stale inventory docs are replaced by generated inventory or otherwise kept in sync
- the tracker reflects real execution, not intention

## 14. First Five Actions For The New Owner

If the new owner wants the shortest “start here” list, do this:

1. Read [`EXECUTION-TRACKER.md`](./EXECUTION-TRACKER.md), then rerun `PERM-003`, `PERM-005`, `PERM-007`, and `MCP-001`.
2. Fix the underlying product issues for those four scenarios.
3. Root-cause `BROWSER-001` and finish `BROWSER-002`.
4. Implement skill zip fixtures and complete `SKILL-001/002`.
5. Investigate team delegation using both [`ai/team-delegation-pm.spec.ts`](./ai/team-delegation-pm.spec.ts) and [`ai/team-chat.spec.ts`](./ai/team-chat.spec.ts).

