import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { createdAt, id, updatedAt } from './_columns.js';

export const projects = sqliteTable('projects', {
  id: id(),
  name: text('name').notNull(),
  description: text('description'),
  cwd: text('cwd'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export type ProjectRow = typeof projects.$inferSelect;
export type NewProjectRow = typeof projects.$inferInsert;
