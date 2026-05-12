import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { createdAt, id } from './_columns.js';
import { providers } from './providers.js';

export const models = sqliteTable('models', {
  id: id(),
  providerId: text('provider_id')
    .notNull()
    .references(() => providers.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  displayName: text('display_name'),
  maxContextTokens: integer('max_context_tokens'),
  capabilities: text('capabilities'),
  createdAt: createdAt(),
});

export type ModelRow = typeof models.$inferSelect;
