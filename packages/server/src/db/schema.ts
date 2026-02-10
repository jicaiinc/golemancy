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
  role: text('role').notNull(), // 'user' | 'assistant' | 'system' | 'tool'
  content: text('content').notNull(),
  toolCalls: text('tool_calls', { mode: 'json' }),
  tokenUsage: text('token_usage', { mode: 'json' }),
  createdAt: text('created_at').notNull(),
})

export const taskLogs = sqliteTable('task_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  taskId: text('task_id').notNull(),
  type: text('type').notNull(), // 'start' | 'tool_call' | 'generation' | 'error' | 'completed'
  content: text('content').notNull(),
  metadata: text('metadata', { mode: 'json' }),
  timestamp: text('timestamp').notNull(),
})
