# Message Persistence: Full UIMessage.parts Storage

## Problem

Current `messages` table stores only plain-text `content`, losing the full UIMessage structure (tool calls, reasoning, file parts, step boundaries, source URLs). When a conversation is reloaded from DB, only text parts survive — tool invocations, reasoning blocks, and multi-step flows are lost.

The `toUIMessages()` helper in `chat-instances.ts` converts flat `content` strings into single-text-part `UIMessage` objects, which is a lossy reconstruction.

## Schema Changes

### Before (current)

```sql
CREATE TABLE messages (
  id                TEXT PRIMARY KEY,
  conversation_id   TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role              TEXT NOT NULL,           -- 'user' | 'assistant' | 'system' | 'tool'
  content           TEXT NOT NULL,           -- plain text only
  tool_calls        TEXT,                    -- JSON, never written (dead column)
  token_usage       TEXT,                    -- JSON, never written (dead column)
  created_at        TEXT NOT NULL
)
```

### After

```sql
CREATE TABLE messages (
  id                TEXT PRIMARY KEY,
  conversation_id   TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role              TEXT NOT NULL,           -- 'user' | 'assistant'
  parts             TEXT NOT NULL,           -- JSON: serialized UIMessage.parts array
  content           TEXT NOT NULL DEFAULT '', -- plain text extracted from parts (FTS only)
  created_at        TEXT NOT NULL
)
```

### Changes Summary

| Column | Action | Rationale |
|--------|--------|-----------|
| `parts` | **ADD** (JSON, NOT NULL) | Stores complete `UIMessage.parts` array |
| `content` | **KEEP** (downgraded) | Now derived from parts — plain text for FTS index only |
| `tool_calls` | **DROP** | Never written, `parts` subsumes it |
| `token_usage` | **DROP** | Never written, not part of UIMessage |
| `role` | **KEEP** | Simplified to `'user' \| 'assistant'` (system messages not stored) |

### Drizzle Schema (`packages/server/src/db/schema.ts`)

```ts
export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),                    // 'user' | 'assistant'
  parts: text('parts', { mode: 'json' }).notNull(), // UIMessage['parts']
  content: text('content').notNull().default(''),   // plain text for FTS
  createdAt: text('created_at').notNull(),
})
```

### `execution` Column Decision: **DEFER**

The task mentions an `execution` JSON column for sub-agent execution trees (`AgentExecution`). However:
- No `AgentExecution` type exists in `packages/shared/src/types/` today
- Sub-agent results currently flow through tool parts (`tool-delegate_to_*` in `parts`)
- Adding a separate column without a defined type and consumer would be premature

**Recommendation**: The `parts` column already captures sub-agent tool invocations. If a dedicated execution tree display is needed later, add the column + type together when the UI consumer is designed. This is a separate feature from message persistence.

---

## Data Flow

### Write Path (Server → DB)

#### Current Flow (lossy)

```
streamText()
  → onFinish({ text })         ← streamText's onFinish: plain text only
    → saveMessage(id, role, text)
      → INSERT ... content = text
```

```
toUIMessageStreamResponse()    ← no onFinish, no persistence hook
```

#### New Flow (lossless)

```
streamText()
  → onFinish: cleanup only     ← keep for tool cleanup

result.toUIMessageStreamResponse({
  originalMessages: messages,   ← enables responseMessage generation
  onFinish: ({ responseMessage }) => {
    → saveMessage(id, role, responseMessage.parts)
      → INSERT ... parts = JSON(parts), content = extractText(parts)
  }
})
```

**Key insight**: `streamText`'s `onFinish` provides `{ text, toolCalls, ... }` (model-level). `toUIMessageStreamResponse`'s `onFinish` provides `{ responseMessage: UIMessage }` (UI-level, with complete parts). We need the latter.

#### User Message Persistence

User messages are saved **before** streaming begins (current behavior, unchanged). The user's `UIMessage.parts` come directly from the client request body:

```
POST /api/chat { messages: UIMessage[] }
  → lastUserMsg = messages.filter(role === 'user').at(-1)
  → saveMessage(lastUserMsg.id, 'user', lastUserMsg.parts)
```

### Read Path (DB → UI)

#### Current Flow (lossy reconstruction)

```
DB: SELECT * FROM messages WHERE conversation_id = ?
  → rowToMessage(): { id, role, content, ... }
  → toUIMessages(): [{ id, role, parts: [{ type: 'text', text: content }] }]
  → new Chat({ messages: UIMessage[] })
```

#### New Flow (lossless)

```
DB: SELECT * FROM messages WHERE conversation_id = ?
  → rowToUIMessage(): { id, role, parts: JSON.parse(row.parts) }
  → new Chat({ messages: UIMessage[] })

toUIMessages() → DELETED (no longer needed)
```

### FTS Integration

FTS5 continues to index the `content` column. The FTS triggers remain unchanged — they already index `content` on INSERT/UPDATE/DELETE. The only change is that `content` is now derived from `parts`:

```ts
function extractTextContent(parts: UIMessage['parts']): string {
  return parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map(p => p.text)
    .join('\n')
}
```

---

## Type Changes

### `packages/shared/src/types/conversation.ts`

```ts
// REMOVE these (no longer needed):
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool'
export interface ToolCallResult { ... }

// REPLACE Message interface:
export interface Message extends Timestamped {
  id: MessageId
  conversationId: ConversationId
  role: 'user' | 'assistant'
  parts: unknown[]       // serialized UIMessage['parts'] — opaque to shared package
  content: string        // plain text for display/search (derived from parts)
}
```

**Why `unknown[]` for parts?**: The `shared` package has zero runtime deps. `UIMessage['parts']` is an `ai` SDK type that belongs to `ui` and `server`. The shared type keeps it opaque; consumers in `ui` and `server` cast to `UIMessagePart[]` at their boundary.

### `packages/shared/src/services/interfaces.ts`

```ts
export interface IConversationService {
  // saveMessage signature changes:
  saveMessage(
    projectId: ProjectId,
    conversationId: ConversationId,
    data: { id: MessageId; role: string; parts: unknown[]; content: string },
  ): Promise<void>

  // Other methods unchanged
}
```

---

## Migration Strategy

### Approach: Additive ALTER TABLE + Backfill

SQLite supports `ALTER TABLE ... ADD COLUMN` but not `DROP COLUMN` in older versions (< 3.35.0). Since better-sqlite3 bundles SQLite 3.46+, we can use `ALTER TABLE ... DROP COLUMN`.

However, since we use `CREATE TABLE IF NOT EXISTS` as the migration mechanism, a simpler approach:

### Step-by-step in `migrateDatabase()`

```ts
export function migrateDatabase(db: AppDatabase) {
  // ... existing CREATE TABLE IF NOT EXISTS ...

  // --- Migration v2: message parts ---
  // 1. Add `parts` column if missing
  const hasParts = db.all<{ name: string }>(sql`
    PRAGMA table_info(messages)
  `).some(col => col.name === 'parts')

  if (!hasParts) {
    log.info('migrating messages table: adding parts column')

    // Add parts column (nullable initially for backfill)
    db.run(sql`ALTER TABLE messages ADD COLUMN parts TEXT`)

    // Backfill: convert existing content → parts JSON
    db.run(sql`
      UPDATE messages
      SET parts = json_array(json_object('type', 'text', 'text', content))
      WHERE parts IS NULL
    `)

    // Now make it effectively NOT NULL by setting default
    // (SQLite ALTER TABLE can't add NOT NULL to existing column,
    //  but drizzle schema enforces it at app level)
  }

  // 2. Drop unused columns
  const hasToolCalls = db.all<{ name: string }>(sql`
    PRAGMA table_info(messages)
  `).some(col => col.name === 'tool_calls')

  if (hasToolCalls) {
    log.info('migrating messages table: dropping tool_calls column')
    db.run(sql`ALTER TABLE messages DROP COLUMN tool_calls`)
  }

  const hasTokenUsage = db.all<{ name: string }>(sql`
    PRAGMA table_info(messages)
  `).some(col => col.name === 'token_usage')

  if (hasTokenUsage) {
    log.info('migrating messages table: dropping token_usage column')
    db.run(sql`ALTER TABLE messages DROP COLUMN token_usage`)
  }

  // ... existing FTS setup ...
}
```

### Backward Compatibility

- Existing messages get `parts: [{ type: 'text', text: <content> }]` via SQL backfill
- New messages get full parts from UIMessage
- `content` column continues to be populated for FTS (extracted from parts)
- No data loss for existing conversations

---

## Files to Change

### Server (`packages/server/`)

| File | Change |
|------|--------|
| `src/db/schema.ts` | Add `parts` column, remove `toolCalls`/`tokenUsage` |
| `src/db/migrate.ts` | Add migration v2: `ALTER TABLE ADD parts`, backfill, drop columns |
| `src/routes/chat.ts` | Move persistence from `streamText.onFinish` → `toUIMessageStreamResponse.onFinish`; save user message parts instead of text-only |
| `src/storage/conversations.ts` | Update `saveMessage()` signature to accept `parts`+`content`; update `rowToMessage()` to parse parts JSON; update `searchMessages()` raw SQL type |

### Shared (`packages/shared/`)

| File | Change |
|------|--------|
| `src/types/conversation.ts` | Replace `Message` interface: add `parts: unknown[]`, simplify `role`, remove `ToolCallResult` |
| `src/services/interfaces.ts` | Update `saveMessage` signature in `IConversationService` |

### UI (`packages/ui/`)

| File | Change |
|------|--------|
| `src/lib/chat-instances.ts` | Delete `toUIMessages()` function; update `ChatInstanceConfig` to take `UIMessage[]` directly; update `getOrCreateChat()` to pass through messages |
| `src/pages/chat/ChatWindow.tsx` | Remove `toUIMessages` import; pass `conversation.messages` → map to `UIMessage` format using `parts` field |
| `src/services/mock/data.ts` | Update mock message data to use `parts` format |
| `src/services/mock/conversations.ts` | Update mock `saveMessage` to match new signature |
| `src/services/http/services.ts` | Update HTTP `saveMessage` to match new signature (if it exists) |

### Tests

| File | Change |
|------|--------|
| `packages/server/src/db/db.test.ts` | Update FTS tests to insert with parts column |
| `packages/server/src/storage/conversations.test.ts` | Update saveMessage tests for new signature |
| `packages/ui/src/lib/chat-instances.test.ts` | Remove toUIMessages tests; update Chat init tests |

---

## Parts Serialization Safety

### What's Safe to Serialize

UIMessage parts are plain JSON objects. All part types are serializable:

```ts
// All these are safe for JSON.stringify / JSON.parse:
{ type: 'text', text: '...' }
{ type: 'reasoning', text: '...' }
{ type: 'step-start' }
{ type: 'source-url', sourceId: '...', url: '...', title: '...' }
{ type: 'file', mediaType: '...', url: '...' }  // url is data: or blob:
{ type: 'tool-delegate_to_agent-xxx', toolCallId: '...', state: 'result', ... }
```

### Streaming State Fields

Parts may have `state: 'streaming' | 'done'` during streaming. When persisted via `onFinish`, all parts should have `state: 'done'` or no `state` field. No special handling needed — `responseMessage` from `onFinish` contains the final state.

### File Parts with Data URLs

`FileUIPart` may contain `data:` URLs with base64 content (potentially large). This is acceptable for SQLite TEXT columns. If blob size becomes a concern later, consider externalizing to filesystem. Not in scope for this change.

---

## Summary of Key Decisions

1. **`parts` column stores the full UIMessage.parts array** — single source of truth for message content
2. **`content` is derived, for FTS only** — extracted text, populated on write
3. **`tool_calls` and `token_usage` columns are dropped** — never used, `parts` subsumes them
4. **`execution` column is deferred** — no type or consumer exists yet; sub-agent results already live in tool parts
5. **Persistence moves to `toUIMessageStreamResponse.onFinish`** — provides `responseMessage: UIMessage` with complete parts
6. **`toUIMessages()` is deleted** — DB now returns parts directly, no lossy reconstruction needed
7. **Migration uses `ALTER TABLE` + SQL backfill** — existing messages get `[{ type: 'text', text: content }]` as parts
8. **Shared `Message.parts` typed as `unknown[]`** — keeps shared package dependency-free; consumers cast at boundary
