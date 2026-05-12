import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { updatedAt } from './_columns.js';

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: updatedAt(),
});

export type SettingsRow = typeof settings.$inferSelect;
