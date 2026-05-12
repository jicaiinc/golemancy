import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { id } from './_columns.js';
import { providers } from './providers.js';

export const providerCapabilityTests = sqliteTable('provider_capability_tests', {
  id: id(),
  providerId: text('provider_id')
    .notNull()
    .references(() => providers.id, { onDelete: 'cascade' }),
  model: text('model').notNull(),
  testedAt: text('tested_at').notNull(),
  ok: integer('ok', { mode: 'boolean' }).notNull(),
  capabilities: text('capabilities').notNull(),
  errors: text('errors'),
});

export type ProviderCapabilityTestRow = typeof providerCapabilityTests.$inferSelect;
