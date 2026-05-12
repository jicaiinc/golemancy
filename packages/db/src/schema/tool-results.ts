import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { createdAt, id } from './_columns.js';
import { toolCalls } from './tool-calls.js';

export const toolResults = sqliteTable('tool_results', {
  id: id(),
  toolCallId: text('tool_call_id')
    .notNull()
    .references(() => toolCalls.id, { onDelete: 'cascade' }),
  output: text('output').notNull(),
  ok: integer('ok', { mode: 'boolean' }).notNull().default(true),
  error: text('error'),
  durationMs: integer('duration_ms'),
  createdAt: createdAt(),
});

export type ToolResultRow = typeof toolResults.$inferSelect;
