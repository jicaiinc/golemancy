# Runtime Monitoring + Token Statistics Enhancement

## Context

Two related problems:
1. **No runtime visibility** — When agents/cron jobs/chats are running, there's no way to see their status. Agent status is always `idle`.
2. **No model-dimension token tracking** — Messages store token counts but not which model produced them. Cannot answer "how many tokens did Claude Opus vs Sonnet use?"

**Solution**: Polling-based runtime monitoring + schema enhancement to record `provider`/`model` per message + multi-dimension dashboard queries (model, agent, date).

---

## Part A: Token Statistics Enhancement

### A1: Schema Migration

**Modify: `packages/server/src/db/schema.ts`**

Add two columns to `messages` table:
```typescript
provider: text('provider').notNull().default(''),   // e.g. 'anthropic'
model: text('model').notNull().default(''),          // e.g. 'claude-sonnet-4-20250514'
```

**Modify: `packages/server/src/db/migrate.ts`**

Add migration v5 after line 99:
```typescript
// --- Migration v5: model tracking columns ---
const columnsV5 = db.all<{ name: string }>(sql`PRAGMA table_info(messages)`)

if (!columnsV5.some(col => col.name === 'provider')) {
  db.run(sql`ALTER TABLE messages ADD COLUMN provider TEXT NOT NULL DEFAULT ''`)
}
if (!columnsV5.some(col => col.name === 'model')) {
  db.run(sql`ALTER TABLE messages ADD COLUMN model TEXT NOT NULL DEFAULT ''`)
}
```

Historical messages get empty strings — acceptable since we can't retroactively determine their model. New messages will always have model info.

### A2: Persist Model Info on Save

**Modify: `packages/shared/src/types/conversation.ts`**

Add to `Message` interface:
```typescript
provider: string   // e.g. 'anthropic'
model: string      // e.g. 'claude-sonnet-4-20250514'
```

**Modify: `packages/shared/src/services/interfaces.ts`**

Update `IConversationService.saveMessage` data parameter — add optional `provider?: string; model?: string`.

**Modify: `packages/server/src/storage/conversations.ts`**

Update `saveMessage()` to accept and persist `provider`/`model` (default `''`).

**Modify: `packages/server/src/routes/chat.ts`**

At line 97, `agent.modelConfig` gives us `{ provider, model }`. Pass them into `saveMessage` at line 215-226:
```typescript
await deps.conversationStorage.saveMessage(projectId, conversationId, {
  ...existing fields,
  provider: agent.modelConfig.provider,   // ADD
  model: agent.modelConfig.model,         // ADD
})
```

**Modify: `packages/server/src/scheduler/executor.ts`**

Same pattern — agent loaded at line 53, modelConfig available. Pass to `saveMessage` at lines 146-153.

**Modify: `packages/server/src/agent/sub-agent.ts`**

Sub-agent saves messages via parent conversation. The `childAgent.modelConfig` is available at line 72. Pass `provider`/`model` when saving sub-agent messages.

### A3: Enhanced Dashboard Types

**Modify: `packages/shared/src/types/dashboard.ts`**

Add new types:
```typescript
export type DashboardTimeRange = '7d' | '30d' | 'all'

/** Per-model token breakdown */
export interface DashboardModelStats {
  model: string                // e.g. 'claude-sonnet-4-20250514'
  inputTokens: number
  outputTokens: number
  messageCount: number
}

/** Token trend with model breakdown per day */
export interface DashboardTokenTrendByModel {
  date: string               // YYYY-MM-DD
  models: Array<{
    model: string
    inputTokens: number
    outputTokens: number
  }>
  totalInput: number
  totalOutput: number
}

/** Global dashboard: per-project summary */
export interface GlobalProjectSummary {
  projectId: ProjectId
  projectName: string
  totalTokens: number
  inputTokens: number
  outputTokens: number
  activeChats: number
  totalAgents: number
}

/** Global dashboard summary */
export interface GlobalDashboardSummary {
  totalTokens: { input: number; output: number }
  totalProjects: number
  totalAgents: number
  totalChats: number
}
```

Enhance existing `DashboardTokenTrend` — keep as-is for backward compat but add model-breakdown variant.

Update `DashboardSummary` to include time range:
```typescript
export interface DashboardSummary {
  tokens: { total: number; input: number; output: number }
  totalAgents: number
  activeChats: number
  totalChats: number
}
```

### A4: Enhanced Dashboard Queries

**Modify: `packages/server/src/storage/dashboard.ts`**

Add new methods to `DashboardService`:

```typescript
/** Token stats grouped by model, for a given time range */
async getModelStats(projectId: ProjectId, range: DashboardTimeRange): Promise<DashboardModelStats[]>

/** Token trend with per-model breakdown */
async getTokenTrendByModel(projectId: ProjectId, days: number): Promise<DashboardTokenTrendByModel[]>
```

`getModelStats` SQL:
```sql
SELECT model,
       COALESCE(SUM(input_tokens), 0) as inp,
       COALESCE(SUM(output_tokens), 0) as out,
       COUNT(*) as cnt
FROM messages
WHERE model != '' AND created_at >= ?  -- date filter based on range
GROUP BY model
ORDER BY (inp + out) DESC
```

`getTokenTrendByModel` SQL:
```sql
SELECT substr(created_at, 1, 10) as day, model,
       COALESCE(SUM(input_tokens), 0) as inp,
       COALESCE(SUM(output_tokens), 0) as out
FROM messages
WHERE model != '' AND created_at >= ?
GROUP BY day, model
```

Enhance existing `getSummary` to accept optional `range: DashboardTimeRange` parameter (default `'7d'` for backward compat; `'all'` means no date filter).

Enhance existing `getAgentStats` to accept optional `range: DashboardTimeRange`.

**New: Global Dashboard Service**

**New file: `packages/server/src/storage/global-dashboard.ts`**

```typescript
export class GlobalDashboardService {
  constructor(private deps: {
    projectStorage: IProjectService
    agentStorage: IAgentService
    getProjectDb: (projectId: ProjectId) => AppDatabase
  }) {}

  async getSummary(range: DashboardTimeRange): Promise<GlobalDashboardSummary>
  async getProjectSummaries(range: DashboardTimeRange): Promise<GlobalProjectSummary[]>
  async getModelStats(range: DashboardTimeRange): Promise<DashboardModelStats[]>
  async getTokenTrend(days: number): Promise<DashboardTokenTrendByModel[]>
}
```

Each method iterates `projectStorage.list()`, queries each project's DB, and aggregates results.

### A5: Service Layer for Dashboard Enhancement

**Modify: `packages/shared/src/services/interfaces.ts`**

Enhance `IDashboardService`:
```typescript
export interface IDashboardService {
  // Existing (enhanced with range)
  getSummary(projectId: ProjectId, range?: DashboardTimeRange): Promise<DashboardSummary>
  getAgentStats(projectId: ProjectId, range?: DashboardTimeRange): Promise<DashboardAgentStats[]>
  getRecentChats(projectId: ProjectId, limit?: number): Promise<DashboardRecentChat[]>
  getTokenTrend(projectId: ProjectId, days?: number): Promise<DashboardTokenTrend[]>

  // New
  getModelStats(projectId: ProjectId, range?: DashboardTimeRange): Promise<DashboardModelStats[]>
  getTokenTrendByModel(projectId: ProjectId, days?: number): Promise<DashboardTokenTrendByModel[]>
}
```

Add new interface:
```typescript
export interface IGlobalDashboardService {
  getSummary(range?: DashboardTimeRange): Promise<GlobalDashboardSummary>
  getProjectSummaries(range?: DashboardTimeRange): Promise<GlobalProjectSummary[]>
  getModelStats(range?: DashboardTimeRange): Promise<DashboardModelStats[]>
  getTokenTrend(days?: number): Promise<DashboardTokenTrendByModel[]>
}
```

**Modify: `packages/ui/src/services/container.ts`**

Add `globalDashboard: IGlobalDashboardService` to `ServiceContainer`.

**Modify: `packages/ui/src/services/http/services.ts`**

Add `HttpGlobalDashboardService`:
```typescript
export class HttpGlobalDashboardService implements IGlobalDashboardService {
  async getSummary(range) { return fetchJson(`${baseUrl}/api/dashboard/summary?range=${range}`) }
  async getProjectSummaries(range) { return fetchJson(`${baseUrl}/api/dashboard/projects?range=${range}`) }
  async getModelStats(range) { return fetchJson(`${baseUrl}/api/dashboard/models?range=${range}`) }
  async getTokenTrend(days) { return fetchJson(`${baseUrl}/api/dashboard/token-trend?days=${days}`) }
}
```

Update `HttpDashboardService` to pass `range` query param to enhanced endpoints.

**Modify: `packages/ui/src/services/mock/services.ts`**

Add mock implementations with empty/seed data.

### A6: Server — Global Dashboard Routes

**New: `packages/server/src/routes/global-dashboard.ts`**

Non-project-scoped routes:
```
GET /api/dashboard/summary?range=7d
GET /api/dashboard/projects?range=7d
GET /api/dashboard/models?range=7d
GET /api/dashboard/token-trend?days=14
```

**Modify: `packages/server/src/app.ts`**

Add route registration:
```typescript
app.route('/api/dashboard', createGlobalDashboardRoutes({
  globalDashboardService: deps.globalDashboardService,
}))
```

Add `globalDashboardService` to `ServerDependencies` interface.

Enhance project dashboard routes to pass `range` query param:
```
GET /api/projects/:projectId/dashboard/summary?range=7d
GET /api/projects/:projectId/dashboard/models?range=7d
GET /api/projects/:projectId/dashboard/token-trend-by-model?days=14
```

### A7: UI — Project Dashboard Enhancement

**Modify: `packages/ui/src/stores/useAppStore.ts`**

Add to dashboard slice:
```typescript
dashboardModelStats: DashboardModelStats[]
dashboardTokenTrendByModel: DashboardTokenTrendByModel[]
dashboardRange: DashboardTimeRange  // '7d' | '30d' | 'all'

setDashboardRange(range: DashboardTimeRange): void
```

`loadDashboard` passes `range` to all queries.

**Modify: `packages/ui/src/pages/dashboard/DashboardPage.tsx`**

1. **Time range selector** — 3 buttons (7d / 30d / All) at page top, controlling `dashboardRange`
2. **Model Stats section** — New component between SummaryCards and TokenTrend:
   - Horizontal bar chart showing token usage per model
   - Each bar labeled with model name, shows input/output breakdown
   - Sorted by total tokens descending
3. **Token Trend** — Enhance to show stacked bars by model (different color per model)
4. **Summary Cards** — Update to use range-filtered data

### A8: UI — Global Dashboard

**Modify: `packages/ui/src/pages/dashboard/GlobalDashboardPage.tsx`**

Replace "Coming soon..." with full dashboard:

```
+----------------------------------------------------------+
| GLOBAL DASHBOARD                    [7d] [30d] [All]     |
+----------------------------------------------------------+
| +----------+ +----------+ +----------+ +----------+      |
| | Total    | | Projects | | Agents   | | Chats    |      |
| | Tokens   | |          | |          | |          |      |
| | 12.5M    | | 5        | | 23       | | 142      |      |
| +----------+ +----------+ +----------+ +----------+      |
|                                                          |
| MODEL USAGE                                              |
| +------------------------------------------------------+ |
| | claude-sonnet-4  ████████████████░░░░ 8.2M           | |
| | gpt-4o           ██████░░░░░░░░░░░░░ 3.1M           | |
| | claude-haiku-4   ███░░░░░░░░░░░░░░░░ 1.2M           | |
| +------------------------------------------------------+ |
|                                                          |
| TOKEN TREND (by model, stacked)                          |
| +------------------------------------------------------+ |
| | ▓▓▓ ▓▓▓ ... stacked bar chart ...                   | |
| +------------------------------------------------------+ |
|                                                          |
| PROJECTS                                                 |
| +------------------------------------------------------+ |
| | Project A    5.2M tokens    3 agents    42 chats     | |
| | Project B    4.1M tokens    8 agents    67 chats     | |
| | Project C    3.2M tokens    12 agents   33 chats     | |
| +------------------------------------------------------+ |
+----------------------------------------------------------+
```

Add to store:
```typescript
globalDashboardSummary: GlobalDashboardSummary | null
globalProjectSummaries: GlobalProjectSummary[]
globalModelStats: DashboardModelStats[]
globalTokenTrend: DashboardTokenTrendByModel[]
globalDashboardRange: DashboardTimeRange
globalDashboardLoading: boolean

loadGlobalDashboard(range?: DashboardTimeRange): Promise<void>
setGlobalDashboardRange(range: DashboardTimeRange): void
```

---

## Part B: Runtime Status Monitoring

### B1: Shared Types

**New file: `packages/shared/src/types/runtime.ts`**

```typescript
export type ExecutionType = 'chat' | 'cron' | 'sub-agent'
export type ExecutionStatus = 'running' | 'tool_calling' | 'thinking'

export interface ActiveExecution {
  executionId: string
  type: ExecutionType
  projectId: ProjectId
  agentId: AgentId
  agentName: string
  conversationId?: ConversationId
  cronJobId?: CronJobId
  cronJobName?: string
  parentExecutionId?: string
  status: ExecutionStatus
  currentStep?: string
  startedAt: string
  elapsedMs: number
  tokenUsage: { input: number; output: number }
}

export interface RuntimeSummary {
  runningChats: number
  runningCrons: number
  runningSubAgents: number
  totalActive: number
  runningTokens: { input: number; output: number }
}

export interface CronJobBrief {
  id: CronJobId
  projectId: ProjectId
  name: string
  nextRunAt: string
  cronExpression: string
}

export interface RuntimeStatus {
  executions: ActiveExecution[]
  summary: RuntimeSummary
  upcomingCrons: CronJobBrief[]
}
```

**Update: `packages/shared/src/types/index.ts`** — Add `export * from './runtime'`

### B2: Server — ExecutionRegistry

**New file: `packages/server/src/agent/execution-registry.ts`**

Class `ExecutionRegistry` — plain in-memory `Map<string, RegistryEntry>`. Singleton export.

Methods:
- `register(entry)` — stores with `startedAt`
- `unregister(executionId)` — removes from map
- `update(executionId, patch)` — updates in-place
- `getByProject(projectId): ActiveExecution[]` — filters + computes `elapsedMs`
- `getAll(): ActiveExecution[]` — for global dashboard
- `getSummaryByProject(projectId): RuntimeSummary` — counts + sums tokens

### B3: Server — Integration Points

**Modify: `packages/server/src/routes/chat.ts`**

- Register after `streamText()` (line 171)
- Unregister in `ensureCleanup` (line 156-160)
- Update token in `onFinish` (line 207-210)

**Modify: `packages/server/src/scheduler/executor.ts`**

- Register after agent lookup (line 54)
- Unregister in success + catch paths (try/finally wrapping)
- Update token after `result.totalUsage` (line 141)

Sub-agent registration deferred (nice-to-have).

### B4: Server — API Endpoints

**Modify: `packages/server/src/routes/runtime.ts`**

Add project-scoped endpoint:
```
GET /api/projects/:projectId/runtime/active
```

Returns `RuntimeStatus` (executions + summary + upcoming crons).

Dependencies change: `createRuntimeRoutes()` needs `cronJobStorage`.

**Modify: `packages/server/src/app.ts`**

Update `createRuntimeRoutes()` call to pass deps.

### B5: UI — Runtime Service Layer

**Modify: `packages/shared/src/services/interfaces.ts`**

```typescript
export interface IRuntimeService {
  getActive(projectId: ProjectId): Promise<RuntimeStatus>
}
```

**Modify service files**: Add `HttpRuntimeService`, `MockRuntimeService`, wire into container.

### B6: UI — Store + Polling

**Modify: `packages/ui/src/stores/useAppStore.ts`**

Add `RuntimeSlice`:
```typescript
activeExecutions: ActiveExecution[]
runtimeSummary: RuntimeSummary | null
upcomingCrons: CronJobBrief[]
pollRuntime(projectId: ProjectId): Promise<void>
```

Clear on `selectProject()`.

**New file: `packages/ui/src/hooks/useRuntimePolling.ts`**

```typescript
export function useRuntimePolling(projectId: ProjectId | null, intervalMs = 3000)
```

Uses `useEffect` with `setInterval`.

**Modify: `packages/ui/src/app/layouts/ProjectLayout.tsx`**

Add `useRuntimePolling(projectId)`.

### B7: UI — Dashboard LIVE Area + Page Enhancements

**Modify: `packages/ui/src/pages/dashboard/DashboardPage.tsx`**

Add `LiveExecutions` component at top (only renders when `totalActive > 0`):
- Execution cards: type icon, agent name, elapsed time, token usage
- Elapsed time updates locally via 1-second interval from `execution.startedAt`
- Upcoming crons line below

**Modify: `packages/ui/src/pages/agent/AgentListPage.tsx`**

Derive live agent status from `activeExecutions` — replace static `agent.status` with runtime-aware status.

**Modify: `packages/ui/src/pages/chat/ChatPage.tsx`**

Running indicator (green pulsing dot) for conversations with active executions in sidebar.

**Modify: `packages/ui/src/pages/cron/CronJobsPage.tsx`**

Connect running state to live execution data instead of only `lastRunStatus`.

---

## Files Modified (Summary)

| File | Change |
|------|--------|
| **Part A: Token Stats** | |
| `packages/shared/src/types/conversation.ts` | Add `provider`, `model` fields to Message |
| `packages/shared/src/types/dashboard.ts` | New types: DashboardModelStats, DashboardTokenTrendByModel, GlobalProjectSummary, GlobalDashboardSummary, DashboardTimeRange |
| `packages/shared/src/types/index.ts` | Add runtime export |
| `packages/shared/src/services/interfaces.ts` | Enhance IDashboardService + add IGlobalDashboardService, IRuntimeService |
| `packages/server/src/db/schema.ts` | Add `provider`, `model` columns to messages |
| `packages/server/src/db/migrate.ts` | Migration v5: add provider/model columns |
| `packages/server/src/storage/conversations.ts` | Accept provider/model in saveMessage |
| `packages/server/src/storage/dashboard.ts` | Add getModelStats, getTokenTrendByModel; enhance getSummary/getAgentStats with range param |
| `packages/server/src/storage/global-dashboard.ts` | **NEW** — Cross-project dashboard queries |
| `packages/server/src/routes/chat.ts` | Pass provider/model to saveMessage + register/unregister execution |
| `packages/server/src/scheduler/executor.ts` | Pass provider/model to saveMessage + register/unregister execution |
| `packages/server/src/routes/global-dashboard.ts` | **NEW** — Global dashboard endpoints |
| `packages/server/src/app.ts` | Add global dashboard routes + update runtime routes deps |
| `packages/ui/src/services/container.ts` | Add globalDashboard, runtime to ServiceContainer |
| `packages/ui/src/services/http/services.ts` | Add HttpGlobalDashboardService, HttpRuntimeService; enhance HttpDashboardService |
| `packages/ui/src/services/mock/services.ts` | Add mock implementations |
| `packages/ui/src/services/ServiceProvider.tsx` | Wire new services |
| `packages/ui/src/stores/useAppStore.ts` | Add RuntimeSlice, GlobalDashboardSlice, dashboardRange, dashboardModelStats; enhance loadDashboard |
| **Part B: Runtime** | |
| `packages/shared/src/types/runtime.ts` | **NEW** — Runtime types |
| `packages/server/src/agent/execution-registry.ts` | **NEW** — ExecutionRegistry singleton |
| `packages/server/src/routes/runtime.ts` | Add GET /active endpoint |
| `packages/ui/src/hooks/useRuntimePolling.ts` | **NEW** — Polling hook |
| `packages/ui/src/app/layouts/ProjectLayout.tsx` | Add useRuntimePolling |
| **UI Pages** | |
| `packages/ui/src/pages/dashboard/DashboardPage.tsx` | Time range selector, model stats chart, LIVE area, enhanced trend chart |
| `packages/ui/src/pages/dashboard/GlobalDashboardPage.tsx` | Full global dashboard (replace "Coming soon") |
| `packages/ui/src/pages/agent/AgentListPage.tsx` | Live agent status from runtime |
| `packages/ui/src/pages/chat/ChatPage.tsx` | Running indicator on sidebar |
| `packages/ui/src/pages/cron/CronJobsPage.tsx` | Live running state from runtime |

---

## Implementation Order

1. **Schema + persistence** (A1-A2) — DB migration, saveMessage changes. Foundation for everything else.
2. **Runtime types + registry** (B1-B2) — Can be done in parallel with #1.
3. **Dashboard queries** (A3-A4, A6) — Server-side queries depend on schema being ready.
4. **Runtime integration** (B3-B4) — Wire ExecutionRegistry into chat.ts/executor.ts.
5. **Service layer** (A5, B5) — All services (dashboard, global-dashboard, runtime).
6. **Store + hooks** (A7 store changes, B6) — Zustand slices, polling hook.
7. **UI pages** (A7 global dashboard, A8 project dashboard, B7) — Final UI assembly.

---

## Verification

1. **Type check**: `pnpm lint` — all packages pass
2. **Unit tests**:
   - `packages/server/src/storage/dashboard.test.ts` — getModelStats, range filtering
   - `packages/server/src/agent/execution-registry.test.ts` — register/unregister/getByProject
   - `packages/ui/src/stores/useAppStore.test.ts` — dashboard range, model stats, pollRuntime
3. **Integration smoke test** (`pnpm dev`):
   - Start a chat → message saved with provider/model populated
   - Project Dashboard → time range toggle works (7d/30d/All)
   - Project Dashboard → Model Usage chart shows per-model breakdown
   - Project Dashboard → Token Trend shows stacked by model
   - Global Dashboard → shows cross-project token totals, per-project cards, model breakdown
   - Start a chat → Dashboard LIVE card appears with agent name, elapsed time
   - Chat completes → LIVE card disappears, token counts update
   - Agent page → running agent shows green pulsing status
   - Chat sidebar → running conversation shows indicator

---

## Known Gaps (Deferred)

- **Abort token loss**: When chat stream is aborted, `onFinish` doesn't fire, so tokens consumed by the LLM provider are not recorded in DB.
- **Sub-agent token loss**: Sub-agent makes separate `streamText()` calls with potentially different models. These tokens are captured in memory (`state.usage`) but not persisted separately. Parent message only records parent's tokens.
- **Solution direction**: `token_records` table — one record per API call, captures model/provider/tokens/source/abort status. Dashboard queries migrate to this table as single source of truth.
