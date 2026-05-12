import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { createdAt, id } from './_columns.js';
import { runs } from './runs.js';

export const toolCalls = sqliteTable('tool_calls', {
  id: id(),
  runId: text('run_id')
    .notNull()
    .references(() => runs.id, { onDelete: 'cascade' }),
  toolName: text('tool_name').notNull(),
  input: text('input').notNull(),
  approvalState: text('approval_state', {
    enum: ['pending', 'approve', 'reject', 'not_required'],
  })
    .notNull()
    .default('not_required'),
  approvalReason: text('approval_reason'),
  createdAt: createdAt(),
});

export type ToolCallRow = typeof toolCalls.$inferSelect;
