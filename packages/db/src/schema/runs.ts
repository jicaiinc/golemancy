import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { createdAt, id } from './_columns.js';
import { threads } from './threads.js';

export const runs = sqliteTable('runs', {
  id: id(),
  threadId: text('thread_id')
    .notNull()
    .references(() => threads.id, { onDelete: 'cascade' }),
  status: text('status', {
    enum: ['queued', 'running', 'awaiting_approval', 'cancelled', 'completed', 'errored'],
  })
    .notNull()
    .default('queued'),
  providerId: text('provider_id').notNull(),
  model: text('model'),
  toolMode: text('tool_mode', { enum: ['auto', 'native', 'prompted', 'disabled'] }),
  startedAt: text('started_at'),
  endedAt: text('ended_at'),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  totalTokens: integer('total_tokens'),
  error: text('error'),
  createdAt: createdAt(),
});

export type RunRow = typeof runs.$inferSelect;
export type NewRunRow = typeof runs.$inferInsert;
