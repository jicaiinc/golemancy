import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull(),
  title: text('title').notNull(),
  lastMessageAt: text('last_message_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // 'user' | 'assistant'
  parts: text('parts', { mode: 'json' }).notNull(), // UIMessage['parts']
  content: text('content').notNull().default(''), // plain text for FTS
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  contextTokens: integer('context_tokens').notNull().default(0),
  provider: text('provider').notNull().default(''), // display only
  model: text('model').notNull().default(''), // display only
  metadata: text('metadata', { mode: 'json' }), // e.g. { toolUsages: { [toolCallId]: { inputTokens, outputTokens } } }
  createdAt: text('created_at').notNull(),
})

export const conversationTasks = sqliteTable('conversation_tasks', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  subject: text('subject').notNull(),
  description: text('description').notNull().default(''),
  status: text('status').notNull().default('pending'),
  activeForm: text('active_form'),
  owner: text('owner'),
  metadata: text('metadata', { mode: 'json' }),
  blocks: text('blocks', { mode: 'json' }).notNull().default('[]'),
  blockedBy: text('blocked_by', { mode: 'json' }).notNull().default('[]'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const tokenRecords = sqliteTable('token_records', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id'),
  messageId: text('message_id'),
  agentId: text('agent_id').notNull(),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  inputTokens: integer('input_tokens').notNull(),
  outputTokens: integer('output_tokens').notNull(),
  source: text('source').notNull(), // 'chat' | 'cron' | 'sub-agent' | 'compact'
  parentRecordId: text('parent_record_id'),
  aborted: integer('aborted').notNull().default(0),
  createdAt: text('created_at').notNull(),
})

export const compactRecords = sqliteTable('compact_records', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  summary: text('summary').notNull(),
  boundaryMessageId: text('boundary_message_id').notNull(),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  trigger: text('trigger').notNull(),
  createdAt: text('created_at').notNull(),
})

export const agentMemories = sqliteTable('agent_memories', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull(),
  content: text('content').notNull(),
  pinned: integer('pinned').notNull().default(0),
  priority: integer('priority').notNull().default(3),
  tags: text('tags', { mode: 'json' }).notNull().default('[]'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const cronJobRuns = sqliteTable('cron_job_runs', {
  id: text('id').primaryKey(),
  cronJobId: text('cron_job_id').notNull(),
  agentId: text('agent_id').notNull(),
  conversationId: text('conversation_id'),
  status: text('status').notNull().default('running'),
  durationMs: integer('duration_ms'),
  error: text('error'),
  triggeredBy: text('triggered_by').notNull().default('schedule'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})
