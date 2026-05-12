import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { createdAt, id, updatedAt } from './_columns.js';
import { projects } from './projects.js';

export const threads = sqliteTable('threads', {
  id: id(),
  projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  title: text('title'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export type ThreadRow = typeof threads.$inferSelect;
