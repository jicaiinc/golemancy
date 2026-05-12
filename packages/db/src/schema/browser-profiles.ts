import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { createdAt, id, updatedAt } from './_columns.js';

export const browserProfiles = sqliteTable('browser_profiles', {
  id: id(),
  name: text('name').notNull(),
  browser: text('browser', { enum: ['chrome', 'chromium', 'edge', 'brave', 'other'] })
    .notNull()
    .default('chrome'),
  online: integer('online', { mode: 'boolean' }).notNull().default(false),
  lastSeenAt: text('last_seen_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export type BrowserProfileRow = typeof browserProfiles.$inferSelect;
