import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { createdAt, id } from './_columns.js';

export const secretRefs = sqliteTable('secret_refs', {
  id: id(),
  scope: text('scope').notNull(),
  account: text('account').notNull(),
  storageBackend: text('storage_backend', {
    enum: ['os-keychain', 'os-credential-manager', 'os-secret-service', 'encrypted-fallback'],
  }).notNull(),
  notes: text('notes'),
  createdAt: createdAt(),
});

export type SecretRefRow = typeof secretRefs.$inferSelect;
