import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { createdAt, id, updatedAt } from './_columns.js';

export const skills = sqliteTable('skills', {
  id: id(),
  name: text('name').notNull(),
  version: text('version'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  installedPath: text('installed_path'),
  manifest: text('manifest'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export type SkillRow = typeof skills.$inferSelect;
