import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
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
