import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { createdAt, id } from './_columns.js';
import { runs } from './runs.js';
import { threads } from './threads.js';

export const messages = sqliteTable('messages', {
  id: id(),
  threadId: text('thread_id')
    .notNull()
    .references(() => threads.id, { onDelete: 'cascade' }),
  runId: text('run_id').references(() => runs.id, { onDelete: 'set null' }),
  role: text('role', { enum: ['system', 'user', 'assistant', 'tool'] }).notNull(),
  content: text('content').notNull(),
  providerMetadata: text('provider_metadata'),
  createdAt: createdAt(),
});

export type MessageRow = typeof messages.$inferSelect;
