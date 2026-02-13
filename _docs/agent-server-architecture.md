# Agent Server Architecture

`packages/server/` — Hono HTTP server + SQLite + Vercel AI SDK agent runtime.

## 1. SQLite Schema (Drizzle ORM)

SQLite stores **only** high-volume, query-intensive data. Single file: `~/.golemancy/data.db`.

### 1.1 Tables

```typescript
// packages/server/src/db/schema.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const conversations = sqliteTable('conversations', {
  id:            text('id').primaryKey(),            // ConversationId
  projectId:     text('project_id').notNull(),       // ProjectId
  agentId:       text('agent_id').notNull(),         // AgentId
  title:         text('title').notNull(),
  lastMessageAt: text('last_message_at'),
  createdAt:     text('created_at').notNull(),
  updatedAt:     text('updated_at').notNull(),
})

export const messages = sqliteTable('messages', {
  id:             text('id').primaryKey(),            // MessageId
  conversationId: text('conversation_id').notNull()
                    .references(() => conversations.id, { onDelete: 'cascade' }),
  role:           text('role').notNull(),             // 'user' | 'assistant' | 'system' | 'tool'
  content:        text('content').notNull(),
  toolCalls:      text('tool_calls', { mode: 'json' }), // ToolCallResult[] | null
  tokenUsage:     text('token_usage', { mode: 'json' }), // { promptTokens, completionTokens } | null
  createdAt:      text('created_at').notNull(),
})

export const taskLogs = sqliteTable('task_logs', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  taskId:    text('task_id').notNull(),               // TaskId
  type:      text('type').notNull(),                  // 'start' | 'tool_call' | 'generation' | 'error' | 'completed'
  content:   text('content').notNull(),
  metadata:  text('metadata', { mode: 'json' }),      // Record<string, unknown> | null
  timestamp: text('timestamp').notNull(),
})
```

### 1.2 FTS5 Full-Text Search

```sql
CREATE VIRTUAL TABLE messages_fts USING fts5(
  content,
  content=messages,
  content_rowid=rowid
);

-- Triggers to keep FTS in sync
CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
END;
CREATE TRIGGER messages_ad AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.rowid, old.content);
END;
CREATE TRIGGER messages_au AFTER UPDATE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.rowid, old.content);
  INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
END;
```

Search query:

```typescript
// Full-text search across messages within a project
const results = db.all(sql`
  SELECT m.*, c.project_id, c.agent_id
  FROM messages_fts fts
  JOIN messages m ON m.rowid = fts.rowid
  JOIN conversations c ON c.id = m.conversation_id
  WHERE fts.content MATCH ${query}
    AND c.project_id = ${projectId}
  ORDER BY rank
  LIMIT ${limit}
`)
```

### 1.3 What is NOT in SQLite

| Data | Storage | Rationale |
|------|---------|-----------|
| Projects | `projects/{id}/project.json` | Human-readable, git-trackable, hand-editable |
| Agents | `projects/{id}/agents/{id}.json` | Same — users may want to inspect/edit agent configs |
| Tasks | `projects/{id}/tasks/{id}.json` | Low volume per project, simple status reads |
| Artifacts | `projects/{id}/artifacts/` files + `.meta.json` | Binary/large files belong on disk; metadata co-located |
| Memory | `projects/{id}/memory/{id}.json` | Low volume, tag search viable via file scan at desktop scale |
| Settings | `settings.json` | Single global config file |
| Skills | `projects/{id}/skills/{name}/` | Directory-based Skill Package (SKILL.md + scripts/). Skills 归属于 Agent，通过 Agent 配置引用 |

**Design rationale**: At desktop scale (tens of projects, hundreds of agents), file-based storage is fast enough for CRUD. SQLite is reserved for data that genuinely needs pagination (messages: thousands per conversation), full-text search (message history), or high-frequency append (task logs: many writes per second during agent execution).

### 1.4 Indexes

```typescript
// Conversation lookup by project
CREATE INDEX idx_conversations_project ON conversations(project_id);
// Conversation lookup by agent
CREATE INDEX idx_conversations_agent ON conversations(project_id, agent_id);

// Message pagination (newest first within a conversation)
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at DESC);

// Task log lookup
CREATE INDEX idx_task_logs_task ON task_logs(task_id, timestamp);
```

## 2. HTTP API Routes

Base URL: `http://localhost:{port}/api`

Hono app with route groups per domain. Each row maps to a service interface method.

### 2.1 Projects (`IProjectService`) — File System

| Method | Path | Interface Method | Data Source |
|--------|------|-----------------|-------------|
| GET | `/projects` | `list()` | FS: scan `projects/*/project.json` |
| GET | `/projects/:id` | `getById(id)` | FS: read `projects/{id}/project.json` |
| POST | `/projects` | `create(data)` | FS: mkdir + write `project.json` |
| PATCH | `/projects/:id` | `update(id, data)` | FS: read-merge-write `project.json` |
| DELETE | `/projects/:id` | `delete(id)` | FS: rm -rf `projects/{id}/` |

### 2.2 Agents (`IAgentService`) — File System

**CRUD** (existing interface):

| Method | Path | Interface Method | Data Source |
|--------|------|-----------------|-------------|
| GET | `/projects/:projectId/agents` | `list(projectId)` | FS: scan `agents/*.json` |
| GET | `/projects/:projectId/agents/:id` | `getById(projectId, id)` | FS: read `agents/{id}.json` |
| POST | `/projects/:projectId/agents` | `create(projectId, data)` | FS: write `agents/{id}.json` |
| PATCH | `/projects/:projectId/agents/:id` | `update(projectId, id, data)` | FS: read-merge-write |
| DELETE | `/projects/:projectId/agents/:id` | `delete(projectId, id)` | FS: unlink `agents/{id}.json` |

**Lifecycle** (new — see Section 7.3 for interface evolution):

| Method | Path | Description | Implementation |
|--------|------|-------------|----------------|
| POST | `/projects/:projectId/agents/:id/start` | Start an agent (create conversation + run) | Creates task, updates `status` → `running` in agent JSON, registers in AgentProcessManager |
| POST | `/projects/:projectId/agents/:id/stop` | Stop a running agent | AbortSignal cascade, `status` → `idle`, deregister from AgentProcessManager |
| GET | `/projects/:projectId/agents/:id/status` | Get live agent status | In-memory AgentProcessManager lookup (running/idle/error + currentTaskId + uptime) |

**Start flow**: `POST /start` with body `{ conversationId?, prompt? }` creates a new conversation (or resumes), creates a task, forks the agent process, and returns `{ taskId, conversationId }`. The agent then runs autonomously — the UI subscribes to WebSocket events for progress.

**Stop flow**: `POST /stop` sends abort signal to the agent process, waits for graceful shutdown (5s timeout), then force-kills. Updates agent status in both the JSON file and in-memory state.

### 2.3 Conversations (`IConversationService`) — SQLite

| Method | Path | Interface Method | Data Source |
|--------|------|-----------------|-------------|
| GET | `/projects/:projectId/conversations` | `list(projectId, agentId?)` | SQLite: query `conversations` |
| GET | `/projects/:projectId/conversations/:id` | `getById(projectId, id)` | SQLite: conversation row (no messages) |
| POST | `/projects/:projectId/conversations` | `create(projectId, agentId, title)` | SQLite: insert `conversations` |
| DELETE | `/projects/:projectId/conversations/:id` | `delete(projectId, id)` | SQLite: delete (cascade deletes messages) |

**Messages** (sub-resource, paginated — uses `PaginatedResult<Message>` from `@golemancy/shared`):

| Method | Path | Notes |
|--------|------|-------|
| GET | `/.../conversations/:convId/messages?page=1&pageSize=50` | SQLite: offset-based pagination using shared `PaginationParams`. Returns `PaginatedResult<Message>` (items + total + page + pageSize). Ordered newest-first. |
| GET | `/.../messages/search?q=keyword&page=1&pageSize=20` | SQLite: FTS5 search across all conversations in project. Returns `PaginatedResult<Message>`. |

> **Pagination types**: `PaginationParams` and `PaginatedResult<T>` already exist in `packages/shared/src/types/common.ts` but are unused by current interfaces. The server's messages API is the first consumer. We propose also adding these to `IConversationService` — see Section 7.2.

**Chat** (AI streaming — see Section 4 and Section 7.1):

| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/chat` | AI SDK v6 UI message stream protocol. Body: `{ conversationId, messages }`. Returns streaming response via `toUIMessageStreamResponse()`. |

The `/api/chat` endpoint replaces `IConversationService.sendMessage()` for real-time chat. The UI uses `useChat()` with `DefaultChatTransport` pointing to this endpoint. The server persists user/assistant messages to SQLite as a side effect. See **Section 7.1** for the full before/after comparison.

### 2.4 Tasks (`ITaskService`) — File System + SQLite (logs)

| Method | Path | Interface Method | Data Source |
|--------|------|-----------------|-------------|
| GET | `/projects/:projectId/tasks` | `list(projectId, agentId?)` | FS: scan `tasks/*.json` |
| GET | `/projects/:projectId/tasks/:id` | `getById(projectId, id)` | FS: read `tasks/{id}.json` |
| POST | `/projects/:projectId/tasks/:id/cancel` | `cancel(projectId, id)` | FS: update status + abort agent process |
| GET | `/projects/:projectId/tasks/:id/logs?cursor=&limit=100` | (new) | SQLite: paginated task logs |

Tasks are created implicitly when the agent starts executing (via `/api/chat` or a scheduled trigger), not by direct user API call. The server creates the task JSON file and begins appending logs to SQLite.

### 2.5 Artifacts (`IArtifactService`) — File System

| Method | Path | Interface Method | Data Source |
|--------|------|-----------------|-------------|
| GET | `/projects/:projectId/artifacts` | `list(projectId, agentId?)` | FS: scan `artifacts/*.meta.json` |
| GET | `/projects/:projectId/artifacts/:id` | `getById(projectId, id)` | FS: read `.meta.json` + file content |
| GET | `/projects/:projectId/artifacts/:id/download` | (new) | FS: stream raw file |
| DELETE | `/projects/:projectId/artifacts/:id` | `delete(projectId, id)` | FS: unlink `.meta.json` + content file |

### 2.6 Memory (`IMemoryService`) — File System

| Method | Path | Interface Method | Data Source |
|--------|------|-----------------|-------------|
| GET | `/projects/:projectId/memories` | `list(projectId)` | FS: scan `memory/*.json` |
| POST | `/projects/:projectId/memories` | `create(projectId, data)` | FS: write `memory/{id}.json` |
| PATCH | `/projects/:projectId/memories/:id` | `update(projectId, id, data)` | FS: read-merge-write |
| DELETE | `/projects/:projectId/memories/:id` | `delete(projectId, id)` | FS: unlink |

### 2.7 Settings (`ISettingsService`) — File System

| Method | Path | Interface Method | Data Source |
|--------|------|-----------------|-------------|
| GET | `/settings` | `get()` | FS: read `settings.json` |
| PATCH | `/settings` | `update(data)` | FS: read-merge-write `settings.json` |

### 2.8 Dashboard (`IDashboardService`) — Computed Aggregation

The dashboard has **no `projectId` scoping** — it aggregates across all projects. This requires efficient cross-project queries over split storage.

| Method | Path | Interface Method | Data Source | Strategy |
|--------|------|-----------------|-------------|----------|
| GET | `/dashboard/summary` | `getSummary()` | FS + in-memory + SQLite | See below |
| GET | `/dashboard/active-agents` | `getActiveAgents()` | In-memory only | AgentProcessManager.getRunning() |
| GET | `/dashboard/recent-tasks?limit=10` | `getRecentTasks(limit)` | In-memory cache | ServerCache.recentTasks |
| GET | `/dashboard/activity?limit=20` | `getActivityFeed(limit)` | In-memory ring buffer | EventBus.getRecent(limit) |

**Cross-project aggregation strategy for `getSummary()`**:

```typescript
async getSummary(): Promise<DashboardSummary> {
  // 1. totalProjects — FS: count directories in projects/ (fast: readdir, no file reads)
  const projectDirs = await fs.readdir(projectsDir)
  const totalProjects = projectDirs.length

  // 2. totalAgents — ServerCache: maintained on agent create/delete events
  //    (avoids scanning every project's agents/ directory on each dashboard load)
  const totalAgents = serverCache.totalAgentCount

  // 3. activeAgents, runningTasks — In-memory: AgentProcessManager already tracks these
  const activeAgents = agentProcessManager.getRunningCount()
  const runningTasks = agentProcessManager.getRunningTaskCount()

  // 4. completedTasksToday — ServerCache: counter incremented on task:completed events
  const completedTasksToday = serverCache.completedTasksToday

  // 5. totalTokenUsageToday — SQLite: SUM from task_logs where type='completed' and today
  const tokenResult = db.get(sql`
    SELECT COALESCE(SUM(json_extract(metadata, '$.tokenUsage')), 0) as total
    FROM task_logs
    WHERE type = 'completed'
      AND timestamp >= ${todayStart}
  `)

  return { totalProjects, totalAgents, activeAgents, runningTasks, completedTasksToday, totalTokenUsageToday: tokenResult.total }
}
```

**Key insight**: The server maintains a `ServerCache` — a lightweight in-memory cache updated by an internal event bus. When agents/tasks/artifacts are created or modified through any API endpoint, the cache counters update. This avoids full filesystem scans on every dashboard request. The cache rebuilds from disk on server startup.

**`getRecentTasks()`**: Instead of scanning all `projects/*/tasks/*.json` on every call, the server maintains a bounded sorted list of recent tasks in memory. Updated whenever a task status changes. Capped at 100 entries.

**`getActivityFeed()`**: A ring buffer (fixed-size circular array, default 500 entries) maintained by the EventBus. Every significant server event (agent started, task completed, artifact created, etc.) appends an `ActivityEntry`. No disk I/O needed.

### 2.9 Hono Route Registration

```typescript
// packages/server/src/app.ts
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { projectRoutes } from './routes/projects'
import { agentRoutes } from './routes/agents'
import { conversationRoutes } from './routes/conversations'
import { chatRoute } from './routes/chat'
import { taskRoutes } from './routes/tasks'
import { artifactRoutes } from './routes/artifacts'
import { memoryRoutes } from './routes/memories'
import { settingsRoutes } from './routes/settings'
import { dashboardRoutes } from './routes/dashboard'

export function createApp() {
  const app = new Hono()

  // CORS on /api/* only — NOT on /ws (WebSocket routes + CORS = "immutable headers" error)
  app.use('/api/*', cors())

  app.route('/api/projects', projectRoutes)
  // Nested under projects
  app.route('/api/projects/:projectId/agents', agentRoutes)
  app.route('/api/projects/:projectId/conversations', conversationRoutes)
  app.route('/api/projects/:projectId/tasks', taskRoutes)
  app.route('/api/projects/:projectId/artifacts', artifactRoutes)
  app.route('/api/projects/:projectId/memories', memoryRoutes)
  // Top-level
  app.route('/api/chat', chatRoute)
  app.route('/api/settings', settingsRoutes)
  app.route('/api/dashboard', dashboardRoutes)

  return app
}
```

## 3. WebSocket Event Protocol

WebSocket handles real-time push from server to UI. Chat streaming goes through HTTP data stream (AI SDK protocol), NOT WebSocket.

### 3.1 Connection

```
WS /ws
```

Single WebSocket connection per client. The client subscribes to channels after connecting.

### 3.2 Client → Server Messages

```typescript
// Subscribe to events for a project/agent/task
{ type: 'subscribe',   channels: ['project:proj-1', 'agent:agent-1', 'task:task-1'] }
{ type: 'unsubscribe', channels: ['task:task-1'] }
// Ping (keep-alive)
{ type: 'ping' }
```

### 3.3 Server → Client Events

**Message events** (channel: `conversation:{conversationId}`):

```typescript
{ event: 'message:start',     conversationId, messageId }
{ event: 'message:delta',     conversationId, messageId, delta: string }
{ event: 'message:tool_call', conversationId, messageId, toolCall: { toolName, input, output?, status } }
{ event: 'message:end',       conversationId, messageId, tokenUsage: { promptTokens, completionTokens } }
```

> Note: These events mirror the chat stream for clients that need real-time awareness of conversations they didn't initiate (e.g., dashboard monitoring an agent running a scheduled task). The primary chat UI uses `useChat` HTTP streaming, not WebSocket.

**Task events** (channel: `task:{taskId}` or `project:{projectId}`):

```typescript
{ event: 'task:started',   taskId, agentId, title }
{ event: 'task:progress',  taskId, progress: number, log?: string }
{ event: 'task:completed', taskId, result?: string }
{ event: 'task:failed',    taskId, error: string }
```

**Agent events** (channel: `project:{projectId}`):

```typescript
{ event: 'agent:status_changed', agentId, status: AgentStatus, currentTaskId?: string }
```

**System events** (broadcast to all connected clients):

```typescript
{ event: 'server:ready' }
{ event: 'server:error', message: string }
```

### 3.4 Connection Lifecycle

```
Client                          Server
  │                                │
  │── WS CONNECT /ws ────────────►│
  │◄── { event: 'connected' } ───│
  │                                │
  │── subscribe(['project:p1']) ──►│  Register client for channels
  │                                │
  │◄── task:started {...} ────────│  Events pushed as they occur
  │◄── task:progress {...} ───────│
  │◄── agent:status_changed {...} │
  │                                │
  │── unsubscribe(['project:p1']) ►│
  │── WS CLOSE ──────────────────►│  Cleanup all subscriptions
```

### 3.5 Implementation

```typescript
// packages/server/src/ws/handler.ts
import type { ServerWebSocket } from 'hono' // Assumption: verify exact Hono WS API

interface WsClient {
  ws: ServerWebSocket
  channels: Set<string>
}

class WebSocketManager {
  private clients = new Map<string, WsClient>()

  subscribe(clientId: string, channels: string[]) { /* ... */ }
  unsubscribe(clientId: string, channels: string[]) { /* ... */ }

  // Emit to all clients subscribed to the given channel
  emit(channel: string, event: object) {
    for (const client of this.clients.values()) {
      if (client.channels.has(channel)) {
        client.ws.send(JSON.stringify(event))
      }
    }
  }

  // Broadcast to all connected clients
  broadcast(event: object) {
    for (const client of this.clients.values()) {
      client.ws.send(JSON.stringify(event))
    }
  }
}
```

> **Assumption**: Hono WebSocket API via `@hono/node-ws` adapter. Exact types to be verified by Fact Checker.

## 4. Agent Runtime Design

### 4.1 Core Loop: streamText + tools + stopWhen

The agent execution loop is driven entirely by Vercel AI SDK v6's `streamText`. No custom agent framework needed.

> **AI SDK v6 API changes** (verified by Fact Checker):
> - `system:` → `instructions:` (renamed)
> - `maxSteps: N` → `stopWhen: stepCountIs(N)` (new stop condition API)
> - `parameters:` → `inputSchema:` in `tool()` (renamed)
> - `CoreMessage` → `ModelMessage` (renamed)
> - `toDataStreamResponse()` → `toUIMessageStreamResponse()` (renamed)

**Model resolution — dual-mode provider strategy**:

Users choose between two modes via settings:

| Mode | When | How | Tradeoff |
|------|------|-----|----------|
| **Gateway** | User sets `AI_GATEWAY_API_KEY` | `gateway('provider/model')` from `ai` package, routes through Vercel AI Gateway | Unified routing, auto-failover, but requires Vercel account + gateway key |
| **Direct** | User sets individual keys (`ANTHROPIC_API_KEY`, etc.) | `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google` directly | No external dependency, full control, works offline (except AI calls) |

```typescript
// packages/server/src/agent/model.ts
import { gateway } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'

// Default models per provider
const DEFAULT_MODELS: Record<string, string> = {
  google:    'gemini-2.5-flash',
  openai:    'gpt-5-mini',
  anthropic: 'claude-haiku-4-5',
}

function resolveModel(settings: GlobalSettings, agentConfig?: AgentModelConfig) {
  const provider = agentConfig?.provider ?? settings.defaultProvider

  // --- Mode 1: Vercel AI Gateway ---
  if (provider === 'gateway') {
    const modelId = agentConfig?.model ?? 'google/gemini-2.5-flash'
    return gateway(modelId)  // requires AI_GATEWAY_API_KEY env var
  }

  // --- Mode 2: Direct provider SDK ---
  const providerConfig = settings.providers.find(p => p.provider === provider)
  if (!providerConfig) throw new Error(`Provider "${provider}" not configured in settings`)

  const modelId = agentConfig?.model ?? providerConfig.defaultModel ?? DEFAULT_MODELS[provider]

  switch (provider) {
    case 'anthropic':
      return createAnthropic({ apiKey: providerConfig.apiKey, baseURL: providerConfig.baseUrl })(modelId)
    case 'openai':
      return createOpenAI({ apiKey: providerConfig.apiKey, baseURL: providerConfig.baseUrl })(modelId)
    case 'google':
      return createGoogleGenerativeAI({ apiKey: providerConfig.apiKey, baseURL: providerConfig.baseUrl })(modelId)
    case 'custom':
      // OpenAI-compatible endpoint (e.g., local Ollama, Together AI)
      return createOpenAI({ apiKey: providerConfig.apiKey, baseURL: providerConfig.baseUrl })(modelId)
    default:
      throw new Error(`Unknown provider: ${provider}`)
  }
}
```

**Default configuration**: `defaultProvider: 'google'`, default model `gemini-2.5-flash`. Users can override per-project or per-agent via the config hierarchy (Global Settings → Project Config → Agent Config).

**Agent runtime**:

```typescript
// packages/server/src/agent/runtime.ts
import { streamText, generateText, stepCountIs } from 'ai'
import type { ModelMessage } from 'ai'

async function runAgent(params: {
  agent: Agent
  messages: ModelMessage[]
  conversationId: ConversationId
  abortSignal: AbortSignal
  onEvent: (event: AgentEvent) => void
}) {
  const { agent, messages, conversationId, abortSignal, onEvent } = params

  // 1. Resolve model (gateway or direct SDK, based on settings)
  const model = resolveModel(await settingsStorage.get(), agent.modelConfig)

  // 2. Load tools
  const tools = await loadAgentTools(agent)

  // 3. Execute with streaming (AI SDK v6 API)
  const result = streamText({
    model,
    instructions: agent.systemPrompt,     // v6: was `system:`
    messages,
    tools,
    stopWhen: stepCountIs(10),            // v6: was `maxSteps: 10`
    abortSignal,
    temperature: agent.modelConfig.temperature,
    maxTokens: agent.modelConfig.maxTokens,
    onStepFinish: ({ stepType, toolCalls, toolResults, usage }) => {
      if (toolCalls) {
        for (const tc of toolCalls) {
          onEvent({ type: 'tool_call', toolName: tc.toolName, input: tc.args })
        }
      }
      if (usage) {
        onEvent({ type: 'token_usage', usage })
      }
    },
  })

  return result
}
```

### 4.2 Chat Endpoint Integration

```typescript
// packages/server/src/routes/chat.ts
import { Hono } from 'hono'

const chatRoute = new Hono()

chatRoute.post('/', async (c) => {
  const { conversationId, messages } = await c.req.json()

  // 1. Load conversation + agent
  const conversation = await conversationStorage.getById(conversationId)
  const agent = await agentStorage.getById(conversation.projectId, conversation.agentId)

  // 2. Persist user message
  const userMsg = messages[messages.length - 1]
  await db.insert(messagesTable).values({
    id: generateId('msg'),
    conversationId,
    role: userMsg.role,
    content: userMsg.content,
    createdAt: new Date().toISOString(),
  })

  // 3. Run agent with streaming
  const result = await runAgent({
    agent,
    messages,
    conversationId,
    abortSignal: c.req.raw.signal,
    onEvent: (event) => {
      // Forward to WebSocket for monitoring
      wsManager.emit(`conversation:${conversationId}`, event)
    },
  })

  // 4. Persist assistant message on completion (via onFinish callback within streamText)

  // 5. Return AI SDK v6 UI message stream response
  return result.toUIMessageStreamResponse()  // v6: was toDataStreamResponse()
})
```

### 4.3 Skills Loading

Skills follow the Skill Package standard (agentskills.io). Loaded via `bash-tool` v1's `createSkillTool` (promoted from experimental in v1).

```typescript
// packages/server/src/agent/skills.ts
import { createSkillTool, createBashTool } from 'bash-tool'  // v1: no longer experimental

async function loadSkillTools(projectId: ProjectId, agent: Agent) {
  const skillsDir = path.join(getProjectPath(projectId), 'skills')

  // createSkillTool discovers SKILL.md files, returns skill tool + file references + instructions
  const { skill, files, instructions } = await createSkillTool({
    skillsDirectory: skillsDir,
  })

  // createBashTool creates bash execution tool with skill file access
  const { tools: bashTools } = await createBashTool({
    files,
    extraInstructions: instructions,
  })

  return { skill, ...bashTools }
}
```

### 4.4 Sub-Agent as Tool (Agent-as-Tool Pattern)

A parent agent delegates to child agents by wrapping them as `tool()` definitions. The child agent runs in-process via `generateText` (not `streamText` — the parent needs the complete result to continue its reasoning).

```typescript
// packages/server/src/agent/sub-agent.ts
import { tool } from 'ai'
import { generateText } from 'ai'
import { z } from 'zod'

function createSubAgentTool(childAgent: Agent, settings: GlobalSettings) {
  return tool({
    description: `Delegate task to ${childAgent.name}: ${childAgent.description}`,
    inputSchema: z.object({                              // v6: was `parameters:`
      task: z.string().describe('The task to delegate'),
      context: z.string().optional().describe('Additional context'),
    }),
    execute: async ({ task, context }, { abortSignal }) => {
      const childModel = resolveModel(settings, childAgent.modelConfig)
      const childTools = await loadAgentTools(childAgent)

      const result = await generateText({
        model: childModel,
        instructions: childAgent.systemPrompt,           // v6: was `system:`
        prompt: context ? `${task}\n\nContext: ${context}` : task,
        tools: childTools,
        stopWhen: stepCountIs(10),                       // v6: was `maxSteps: 10`
        abortSignal,
      })

      return result.text
    },
  })
}
```

**Tool assembly** — all tools for an agent are merged:

```typescript
async function loadAgentTools(agent: Agent): Promise<Record<string, CoreTool>> {
  const tools: Record<string, CoreTool> = {}
  const settings = await settingsStorage.get()

  // 1. Skills (bash-tool + createSkillTool)
  const skillTools = await loadSkillTools(agent.projectId, agent)
  Object.assign(tools, skillTools)

  // 2. Sub-Agents (using direct provider SDKs, not gateway)
  for (const ref of agent.subAgents) {
    const child = await agentStorage.getById(agent.projectId, ref.agentId)
    if (child) {
      tools[`delegate_${ref.role}`] = createSubAgentTool(child, settings)
    }
  }

  // 3. Built-in tools (registered via agent.tools config — future extension)

  return tools
}
```

### 4.5 Process Model

| Scenario | Execution Model | Rationale |
|----------|----------------|-----------|
| **Chat interaction** (user sends message, agent responds) | In-process `streamText` | Low latency, direct streaming to HTTP response |
| **Sub-Agent delegation** | In-process `generateText` | Parent needs result synchronously within its tool call |
| **Long-running background task** | `child_process.fork()` | Isolation — crash doesn't affect server; independent resource limits |
| **Python/Playwright runtime** | `child_process.fork()` or `spawn()` | Different runtime, must be isolated |

**Agent process manager**:

```typescript
// packages/server/src/agent/process.ts
class AgentProcessManager {
  private processes = new Map<TaskId, ChildProcess>()
  private maxConcurrent: number

  async spawnAgent(taskId: TaskId, agent: Agent, messages: ModelMessage[]): Promise<void> {
    if (this.processes.size >= this.maxConcurrent) {
      throw new Error('Max concurrent agents reached')
    }

    const child = fork(path.join(__dirname, 'worker.js'), {
      serialization: 'json',
    })

    child.send({ type: 'run', agent, messages, taskId })
    this.processes.set(taskId, child)

    child.on('message', (msg) => {
      // Forward events to WebSocket manager
      wsManager.emit(`task:${taskId}`, msg)
    })

    child.on('exit', (code) => {
      this.processes.delete(taskId)
    })
  }

  async cancelAgent(taskId: TaskId): Promise<void> {
    const child = this.processes.get(taskId)
    if (child) {
      child.send({ type: 'abort' })
      // Force kill after timeout
      setTimeout(() => child.kill('SIGKILL'), 5000)
    }
  }
}
```

### 4.6 AbortSignal Cascading

```
User clicks "Cancel"
  → POST /api/projects/:pid/tasks/:tid/cancel
    → AgentProcessManager.cancelAgent(taskId)
      → child.send({ type: 'abort' })
        → Worker receives abort → abortController.abort()
          → streamText abortSignal triggers
            → Sub-Agent generateText also aborts (shared signal)
              → All in-flight HTTP requests to AI providers abort
```

## 5. File System Storage

### 5.1 Directory Structure

```
~/.golemancy/                              # Electron app.getPath('userData') or XDG
├── settings.json                          # GlobalSettings
├── data.db                                # SQLite (conversations, messages, task_logs)
└── projects/
    └── {project-id}/
        ├── project.json                   # Project metadata + config
        ├── agents/
        │   └── {agent-id}.json            # Agent definition
        ├── tasks/
        │   └── {task-id}.json             # Task metadata (status, progress, tokenUsage)
        ├── artifacts/
        │   ├── {artifact-id}.meta.json    # Artifact metadata (title, type, size, agentId)
        │   └── {artifact-id}.{ext}        # Actual file content
        ├── memory/
        │   └── {memory-id}.json           # MemoryEntry
        └── skills/                        # Skills 存储（通过 Agent 配置引用）
            └── {skill-name}/              # Skill Package
                ├── SKILL.md               # YAML frontmatter + instructions
                ├── scripts/               # Deterministic scripts
                └── references/            # On-demand reference docs
```

### 5.2 JSON Schemas

**project.json** (maps to `Project` type):

```json
{
  "id": "proj-1",
  "name": "Content Factory",
  "description": "Automated content pipeline",
  "icon": "factory",
  "workingDirectory": "/Users/me/content-factory",
  "config": {
    "maxConcurrentAgents": 3,
    "providerOverride": null
  },
  "agentCount": 3,
  "activeAgentCount": 1,
  "lastActivityAt": "2026-02-10T12:00:00.000Z",
  "createdAt": "2026-01-15T08:00:00.000Z",
  "updatedAt": "2026-02-10T12:00:00.000Z"
}
```

**agents/{id}.json** (maps to `Agent` type):

```json
{
  "id": "agent-1",
  "projectId": "proj-1",
  "name": "Research Agent",
  "description": "Gathers and analyzes information",
  "status": "idle",
  "systemPrompt": "You are a research assistant...",
  "modelConfig": {
    "provider": "anthropic",
    "model": "claude-sonnet-4-5",
    "temperature": 0.7,
    "maxTokens": 4096
  },
  "skills": [
    { "id": "skill-web", "name": "web-search", "description": "Search the web" }
  ],
  "tools": [],
  "subAgents": [
    { "agentId": "agent-2", "role": "writer" }
  ],
  "createdAt": "2026-01-20T10:00:00.000Z",
  "updatedAt": "2026-02-10T12:00:00.000Z"
}
```

**tasks/{id}.json** (maps to `Task` type, excluding `log` field):

```json
{
  "id": "task-1",
  "projectId": "proj-1",
  "agentId": "agent-1",
  "title": "Research AI frameworks",
  "description": "Find and compare top 5 AI agent frameworks",
  "status": "running",
  "progress": 45,
  "tokenUsage": 12500,
  "startedAt": "2026-02-10T11:30:00.000Z",
  "completedAt": null,
  "createdAt": "2026-02-10T11:30:00.000Z",
  "updatedAt": "2026-02-10T11:45:00.000Z"
}
```

Note: `Task.log` (the `TaskLogEntry[]` array) is NOT stored in the JSON file. Log entries go to the `task_logs` SQLite table for efficient append and paginated retrieval. When the API returns a `Task`, the `log` field is populated by querying SQLite.

**artifacts/{id}.meta.json** (metadata for `Artifact` type):

```json
{
  "id": "art-1",
  "projectId": "proj-1",
  "taskId": "task-1",
  "agentId": "agent-1",
  "title": "Framework comparison",
  "type": "code",
  "mimeType": "text/markdown",
  "filePath": "art-1.md",
  "size": 4523,
  "createdAt": "2026-02-10T11:45:00.000Z",
  "updatedAt": "2026-02-10T11:45:00.000Z"
}
```

The actual content lives in `artifacts/art-1.md` alongside the `.meta.json`.

**memory/{id}.json** (maps to `MemoryEntry` type):

```json
{
  "id": "mem-1",
  "projectId": "proj-1",
  "content": "The user prefers concise summaries with bullet points",
  "source": "agent-1",
  "tags": ["preference", "format"],
  "createdAt": "2026-02-10T10:00:00.000Z",
  "updatedAt": "2026-02-10T10:00:00.000Z"
}
```

### 5.3 Storage Utilities

```typescript
// packages/server/src/storage/base.ts
import fs from 'node:fs/promises'
import path from 'node:path'

const DATA_DIR = process.env.GOLEMANCY_DATA_DIR ?? path.join(os.homedir(), '.golemancy')

export function getDataDir(): string { return DATA_DIR }
export function getProjectPath(projectId: string): string {
  return path.join(DATA_DIR, 'projects', projectId)
}

// Generic JSON file CRUD
export async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(raw) as T
  } catch (e: any) {
    if (e.code === 'ENOENT') return null
    throw e
  }
}

export async function writeJson<T>(filePath: string, data: T): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

export async function listJsonFiles<T>(dirPath: string): Promise<T[]> {
  try {
    const entries = await fs.readdir(dirPath)
    const items = await Promise.all(
      entries
        .filter(e => e.endsWith('.json'))
        .map(e => readJson<T>(path.join(dirPath, e)))
    )
    return items.filter((x): x is T => x !== null)
  } catch (e: any) {
    if (e.code === 'ENOENT') return []
    throw e
  }
}
```

### 5.4 Service Interface Mapping to File Operations

| Service | list() | getById() | create() | update() | delete() |
|---------|--------|-----------|----------|----------|----------|
| Project | `listJsonFiles(projects/)` | `readJson(project.json)` | `mkdir + writeJson` | `readJson + merge + writeJson` | `rm -rf dir` |
| Agent | `listJsonFiles(agents/)` | `readJson(agents/{id}.json)` | `writeJson` | `readJson + merge + writeJson` | `unlink` |
| Task | `listJsonFiles(tasks/)` | `readJson(tasks/{id}.json)` | `writeJson` (server-initiated) | `readJson + merge + writeJson` | N/A |
| Artifact | `listJsonFiles(artifacts/*.meta.json)` | `readJson(.meta.json)` | `writeFile + writeJson` (server-initiated) | N/A | `unlink both files` |
| Memory | `listJsonFiles(memory/)` | `readJson(memory/{id}.json)` | `writeJson` | `readJson + merge + writeJson` | `unlink` |
| Settings | `readJson(settings.json)` | N/A | N/A | `readJson + merge + writeJson` | N/A |

## 6. Package Structure

```
packages/server/
├── src/
│   ├── index.ts              # Entry point: parse args, start server
│   ├── app.ts                # Hono app factory + route registration
│   ├── db/
│   │   ├── schema.ts         # Drizzle table definitions (conversations, messages, task_logs)
│   │   ├── client.ts         # better-sqlite3 connection + Drizzle instance
│   │   ├── migrate.ts        # Schema migration (drizzle-kit or custom)
│   │   └── fts.ts            # FTS5 virtual table setup + search queries
│   ├── routes/
│   │   ├── projects.ts       # IProjectService endpoints
│   │   ├── agents.ts         # IAgentService endpoints
│   │   ├── conversations.ts  # IConversationService endpoints
│   │   ├── chat.ts           # POST /api/chat — AI SDK streaming
│   │   ├── tasks.ts          # ITaskService endpoints
│   │   ├── artifacts.ts      # IArtifactService endpoints
│   │   ├── memories.ts       # IMemoryService endpoints
│   │   ├── settings.ts       # ISettingsService endpoints
│   │   └── dashboard.ts      # IDashboardService endpoints
│   ├── ws/
│   │   ├── handler.ts        # WebSocket connection manager
│   │   └── events.ts         # Event type definitions
│   ├── agent/
│   │   ├── runtime.ts        # streamText orchestration (runAgent)
│   │   ├── model.ts          # resolveModel() — dual-mode: gateway or direct provider SDK
│   │   ├── skills.ts         # createSkillTool + createBashTool wrapper
│   │   ├── sub-agent.ts      # Agent-as-Tool pattern (createSubAgentTool)
│   │   ├── process.ts        # AgentProcessManager (child_process.fork)
│   │   └── worker.ts         # Worker entry point for forked agent processes
│   ├── storage/
│   │   ├── base.ts           # File system utilities (readJson, writeJson, listJsonFiles)
│   │   ├── projects.ts       # ProjectStorage (IProjectService over FS)
│   │   ├── agents.ts         # AgentStorage (IAgentService over FS)
│   │   ├── tasks.ts          # TaskStorage (ITaskService over FS + SQLite logs)
│   │   ├── artifacts.ts      # ArtifactStorage (IArtifactService over FS)
│   │   ├── memories.ts       # MemoryStorage (IMemoryService over FS)
│   │   ├── conversations.ts  # ConversationStorage (IConversationService over SQLite)
│   │   └── settings.ts       # SettingsStorage (ISettingsService over FS)
│   └── utils/
│       ├── ids.ts            # ID generation (nanoid with branded type casts)
│       └── paths.ts          # Path resolution helpers (getProjectPath, etc.)
├── drizzle.config.ts         # Drizzle Kit configuration
├── package.json
└── tsconfig.json
```

### 6.1 Dependencies

```json
{
  "name": "@golemancy/server",
  "dependencies": {
    "@golemancy/shared": "workspace:*",
    "hono": "^4",
    "@hono/node-server": "^1",
    "@hono/node-ws": "^1",
    "ai": "^6",
    "@ai-sdk/anthropic": "^2",
    "@ai-sdk/openai": "^2",
    "@ai-sdk/google": "^2",
    "bash-tool": "^1",
    "better-sqlite3": "^11",
    "drizzle-orm": "^0.45",
    "nanoid": "^5",
    "zod": "^3"
  },
  "devDependencies": {
    "drizzle-kit": "^0.30",
    "@types/better-sqlite3": "^7",
    "typescript": "^5.7",
    "vitest": "^3"
  }
}
```

> **Versions verified by Fact Checker**: `ai@^6` (v6.0.77), `bash-tool@^1` (v1.3.14), `drizzle-orm@^0.45` (v0.45.1). Dual-mode provider: `gateway()` from `ai` for Vercel AI Gateway mode, plus `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google` for direct SDK mode. See Section 4.1 for details.

### 6.2 Dependency Graph

```
@golemancy/desktop
  ├── @golemancy/ui (renderer)
  │     └── @golemancy/shared (types)
  └── @golemancy/server (fork'd from main process)
        └── @golemancy/shared (types)
```

`@golemancy/server` depends on `@golemancy/shared` for type definitions (branded IDs, entity types). It does NOT depend on `@golemancy/ui`. The UI depends on server only at runtime via HTTP/WebSocket — no compile-time dependency.

### 6.3 Build Configuration

```json
// tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "target": "ES2022"
  },
  "include": ["src"]
}
```

The server is a Node.js process. It compiles to ESM (matching the monorepo convention). `electron-vite` or a separate `tsup`/`unbuild` step bundles it for distribution.

### 6.4 Startup Flow

```
Electron Main Process
  │
  ├── app.whenReady()
  │     └── fork('packages/server/dist/index.js', ['--port', '0'])
  │           └── Server starts on random available port
  │                 └── Sends port number back via IPC: process.send({ port })
  │
  ├── Receives port from server process
  │     └── Creates BrowserWindow, passes port to renderer via preload
  │
  └── Renderer initializes:
        ├── configureServices({ baseUrl: `http://localhost:${port}` })
        └── useChat({ api: `http://localhost:${port}/api/chat` })
```

## Appendix A: Fact Checker Verification Status

| # | Item | Status | Resolution |
|---|------|--------|------------|
| A1 | AI Gateway (`gateway()`) | **Dual-mode** | User-configurable: Gateway mode (Vercel AI Gateway with `AI_GATEWAY_API_KEY`) or Direct mode (individual provider SDKs). Both supported — see Section 4.1 |
| A2 | `bash-tool` API | **Verified** | v1.3.14: `createSkillTool` and `createBashTool` are stable exports (no longer `experimental_`) |
| A3 | `@hono/node-ws` | **Verified** | Provides WebSocket upgrade handler for Hono on Node.js. CORS must NOT be applied to WS routes |
| A4 | `streamText().toDataStreamResponse()` | **Renamed** | v6: now `toUIMessageStreamResponse()`. Returns Web standard `Response` compatible with Hono |
| A5 | Drizzle ORM + FTS5 | **Verified** | Drizzle `^0.45` supports raw SQL execution for FTS5 virtual table creation and triggers |
| A6 | `DefaultChatTransport` | **Simplified** | In AI SDK v6, `useChat({ api: url })` handles transport automatically — no explicit transport class needed |

### AI SDK v6 Migration Summary

All code examples in this document use **AI SDK v6** (`ai@^6`, current v6.0.77). Key renames from earlier versions:

| v5 (old) | v6 (current) |
|----------|-------------|
| `system:` | `instructions:` |
| `maxSteps: N` | `stopWhen: stepCountIs(N)` — import `stepCountIs` from `'ai'` |
| `parameters:` in `tool()` | `inputSchema:` |
| `CoreMessage` | `ModelMessage` |
| `toDataStreamResponse()` | `toUIMessageStreamResponse()` |
| `experimental_createSkillTool` | `createSkillTool` (bash-tool v1) |

### ToolLoopAgent (v6 new API)

AI SDK v6 promotes `ToolLoopAgent` from experimental. This class wraps the `streamText` + tools + `stopWhen` pattern into a higher-level abstraction:

```typescript
import { ToolLoopAgent } from 'ai'

const agent = new ToolLoopAgent({
  model,
  instructions: systemPrompt,
  tools,
  stopWhen: stepCountIs(10),
})
```

**Decision**: We use raw `streamText` + `stopWhen` for now, not `ToolLoopAgent`. Reasons:
1. `streamText` gives us full control over the streaming response format needed by Hono
2. We need per-step event hooks (`onStepFinish`) for WebSocket emission and persistence
3. `ToolLoopAgent` abstracts away the step lifecycle we need to observe

If `ToolLoopAgent` adds support for step-level hooks in future versions, reconsider adopting it to reduce boilerplate.

## 7. Interface Evolution

The current service interfaces were designed for the UI-First phase with mock implementations. Moving to a real server backend requires several interface changes. This section documents each change with before/after comparisons.

### 7.1 Chat Streaming: `sendMessage()` → `useChat` + `/api/chat`

**The problem**: The current `IConversationService.sendMessage()` is fire-and-forget:

```typescript
// Current interface — synchronous mock
sendMessage(projectId: ProjectId, conversationId: ConversationId, content: string): Promise<void>

// Current mock implementation — adds user + fake assistant message instantly
async sendMessage(projectId, conversationId, content) {
  conv.messages.push({ role: 'user', content })
  conv.messages.push({ role: 'assistant', content: `Mock response to: "${content}"` })  // instant
}
```

**The real backend** needs streaming: the AI response arrives token-by-token over seconds/minutes, with tool calls interleaved. This is fundamentally different from a `Promise<void>` return.

**Solution**: Two-layer approach.

**Layer 1 — Chat page uses `useChat()` directly** (not through service interface):

```typescript
// packages/ui/src/pages/chat/ChatPage.tsx
import { useChat } from '@ai-sdk/react'

function ChatPage() {
  const { messages, input, handleSubmit, isLoading, stop } = useChat({
    api: `${serverBaseUrl}/api/chat`,  // Direct to server
    body: { conversationId },           // Extra body fields
  })
  // useChat manages message state, streaming, optimistic UI — no service layer needed
}
```

**Layer 2 — Server `/api/chat` endpoint** handles the full lifecycle:

```
POST /api/chat
  Body: { conversationId, messages: ModelMessage[] }  ← AI SDK v6 protocol

  Server:
    1. Look up conversation → agent config
    2. Persist user message → SQLite messages table
    3. streamText({ model, instructions, messages, tools, stopWhen: stepCountIs(10) })
    4. On each step: persist tool calls, emit WS events
    5. On finish: persist assistant message → SQLite
    6. Return: streaming Response via toUIMessageStreamResponse()
```

**What happens to `IConversationService.sendMessage()`**: Remove from the interface. The method conceptually splits into:
- **Streaming**: handled by `useChat` + `/api/chat` (not in service interface)
- **Message persistence**: internal server concern (not exposed as API)

**Updated `IConversationService`**:

```typescript
export interface IConversationService {
  list(projectId: ProjectId, agentId?: AgentId): Promise<Conversation[]>
  getById(projectId: ProjectId, id: ConversationId): Promise<Conversation | null>
  create(projectId: ProjectId, agentId: AgentId, title: string): Promise<Conversation>
  getMessages(projectId: ProjectId, id: ConversationId, params: PaginationParams): Promise<PaginatedResult<Message>>
  searchMessages(projectId: ProjectId, query: string, params: PaginationParams): Promise<PaginatedResult<Message>>
  delete(projectId: ProjectId, id: ConversationId): Promise<void>
  // sendMessage() REMOVED — replaced by useChat + /api/chat
}
```

### 7.2 Pagination Integration

`PaginationParams` and `PaginatedResult<T>` exist in `packages/shared/src/types/common.ts` but are currently unused. The server introduces pagination for:

| Endpoint | Why pagination is needed |
|----------|------------------------|
| `GET .../conversations/:id/messages` | Conversations can have thousands of messages |
| `GET .../messages/search` | FTS results can be unbounded |
| `GET .../tasks/:id/logs` | Task logs accumulate rapidly during agent execution |

**Server implementation for paginated messages**:

```typescript
// packages/server/src/storage/conversations.ts
async getMessages(
  projectId: ProjectId,
  conversationId: ConversationId,
  params: PaginationParams
): Promise<PaginatedResult<Message>> {
  const { page, pageSize } = params
  const offset = (page - 1) * pageSize

  const [items, countResult] = await Promise.all([
    db.select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` })
      .from(messages)
      .where(eq(messages.conversationId, conversationId)),
  ])

  return {
    items,
    total: countResult[0].count,
    page,
    pageSize,
  }
}
```

**`Conversation.messages` field change**: The `Conversation` type currently has `messages: Message[]` inline. With the server, `getById()` returns conversation metadata only (no messages). Messages are fetched separately via `getMessages()` with pagination. This means the `Conversation` type on the wire omits `messages`, or includes only a summary (e.g., `messageCount: number`).

**Proposed type update** in `packages/shared/src/types/conversation.ts`:

```typescript
// Conversation metadata (returned by list/getById)
export interface Conversation extends Timestamped {
  id: ConversationId
  projectId: ProjectId
  agentId: AgentId
  title: string
  messageCount: number   // NEW: replaces messages[] for metadata queries
  lastMessageAt: string
}

// Full conversation with messages (only used when explicitly loading messages)
// Messages are fetched separately via getMessages() with PaginatedResult<Message>
```

### 7.3 Agent Lifecycle APIs

The current `IAgentService` only has CRUD (list, getById, create, update, delete). Running agents requires lifecycle operations.

**Proposed `IAgentService` additions**:

```typescript
export interface IAgentService {
  // --- Existing CRUD ---
  list(projectId: ProjectId): Promise<Agent[]>
  getById(projectId: ProjectId, id: AgentId): Promise<Agent | null>
  create(projectId: ProjectId, data: Pick<Agent, 'name' | 'description' | 'systemPrompt' | 'modelConfig'>): Promise<Agent>
  update(projectId: ProjectId, id: AgentId, data: Partial<Agent>): Promise<Agent>
  delete(projectId: ProjectId, id: AgentId): Promise<void>

  // --- NEW: Lifecycle ---
  start(projectId: ProjectId, id: AgentId, options?: { conversationId?: ConversationId; prompt?: string }): Promise<{ taskId: TaskId; conversationId: ConversationId }>
  stop(projectId: ProjectId, id: AgentId): Promise<void>
  getStatus(projectId: ProjectId, id: AgentId): Promise<AgentRuntimeStatus>
}

// New type in packages/shared/
export interface AgentRuntimeStatus {
  status: AgentStatus              // 'idle' | 'running' | 'paused' | 'error'
  currentTaskId?: TaskId
  conversationId?: ConversationId
  startedAt?: string
  tokenUsage?: number              // Accumulated for current session
  error?: string                   // If status === 'error'
}
```

**Implementation**: `start()` and `stop()` delegate to `AgentProcessManager` (Section 4.5). `getStatus()` reads from in-memory process state (fast, no disk I/O). The `status` field in the agent JSON file is updated on transitions as a persistence backup.

### 7.4 Service Interfaces Location: `ui/` → `shared/`

**The problem**: Service interfaces currently live in `packages/ui/src/services/interfaces.ts`. If `packages/server/` implements these same interfaces, it would need to import from `packages/ui/`, creating a `server → ui` dependency that violates the one-way dependency rule.

**Solution**: Move service interfaces to `packages/shared/`.

```
BEFORE:
  packages/ui/src/services/interfaces.ts    ← 8 interfaces here
  packages/server/ cannot import from ui/

AFTER:
  packages/shared/src/services/interfaces.ts  ← 8 interfaces moved here
  packages/shared/src/services/index.ts        ← re-export

  packages/ui/ imports from @golemancy/shared   ✓ (already a dependency)
  packages/server/ imports from @golemancy/shared ✓ (already a dependency)
```

Updated dependency graph:

```
@golemancy/shared (types + service interfaces)
  ↑               ↑
  │               │
@golemancy/ui    @golemancy/server
  (renderer)       (backend)
```

**What moves**:
- `IProjectService`, `IAgentService`, `IConversationService`, `ITaskService`, `IArtifactService`, `IMemoryService`, `ISettingsService`, `IDashboardService`
- Their import of entity types already comes from `@golemancy/shared`, so no transitive dependency issues

**What stays in `packages/ui/`**:
- `ServiceContainer` type, `getServices()`, `configureServices()`, `useServices()` — these are UI-specific DI

### 7.5 Server-Side Dependency Injection

The UI uses a module-level container (`getServices()`/`configureServices()`) because Zustand actions can't access React Context. The server has no such constraint and uses a simpler approach: **constructor injection via app factory**.

```typescript
// packages/server/src/app.ts
import type { IProjectService, IAgentService /* ... */ } from '@golemancy/shared'

export interface ServerDependencies {
  db: DrizzleDatabase
  projectStorage: IProjectService
  agentStorage: IAgentService
  conversationStorage: IConversationService
  taskStorage: ITaskService
  artifactStorage: IArtifactService
  memoryStorage: IMemoryService
  settingsStorage: ISettingsService
  dashboardService: IDashboardService
  agentProcessManager: AgentProcessManager
  wsManager: WebSocketManager
  serverCache: ServerCache
}

export function createApp(deps: ServerDependencies) {
  const app = new Hono()
  app.use('/api/*', cors())  // CORS on /api/* only, NOT on /ws

  // Inject dependencies into route handlers via Hono context
  app.use('*', async (c, next) => {
    c.set('deps', deps)
    await next()
  })

  app.route('/api/projects', projectRoutes)
  // ... other routes
  return app
}
```

```typescript
// packages/server/src/index.ts — server entry point
import { createApp } from './app'
import { createDatabase } from './db/client'

const db = createDatabase(path.join(getDataDir(), 'data.db'))

// Construct real implementations
const deps: ServerDependencies = {
  db,
  projectStorage: new FileProjectStorage(getDataDir()),
  agentStorage: new FileAgentStorage(getDataDir()),
  conversationStorage: new SqliteConversationStorage(db),
  taskStorage: new FileTaskStorage(getDataDir(), db),  // FS for task JSON + SQLite for logs
  artifactStorage: new FileArtifactStorage(getDataDir()),
  memoryStorage: new FileMemoryStorage(getDataDir()),
  settingsStorage: new FileSettingsStorage(getDataDir()),
  dashboardService: new AggregateDashboardService(deps),  // Computes from other services
  agentProcessManager: new AgentProcessManager(maxConcurrent),
  wsManager: new WebSocketManager(),
  serverCache: new ServerCache(),
}

const app = createApp(deps)
serve({ fetch: app.fetch, port })
```

**Route handlers access deps via Hono context**:

```typescript
// packages/server/src/routes/projects.ts
const projectRoutes = new Hono()

projectRoutes.get('/', async (c) => {
  const { projectStorage } = c.get('deps') as ServerDependencies
  const projects = await projectStorage.list()
  return c.json(projects)
})
```

This approach is simpler than the UI's container pattern, easily testable (inject mocks in tests), and has no global mutable state.
