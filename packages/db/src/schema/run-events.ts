import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { createdAt, id } from './_columns.js';
import { runs } from './runs.js';

export const runEvents = sqliteTable('run_events', {
  id: id(),
  runId: text('run_id')
    .notNull()
    .references(() => runs.id, { onDelete: 'cascade' }),
  sequence: integer('sequence').notNull(),
  type: text('type').notNull(),
  payload: text('payload').notNull(),
  rawProvider: text('raw_provider'),
  createdAt: createdAt(),
});

export type RunEventRow = typeof runEvents.$inferSelect;
