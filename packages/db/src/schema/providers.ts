import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { createdAt, id, updatedAt } from './_columns.js';

export const providers = sqliteTable('providers', {
  id: id(),
  name: text('name').notNull(),
  engine: text('engine', { enum: ['agents-sdk', 'cli-agent'] }).notNull(),
  transport: text('transport', { enum: ['openai-style', 'ai-sdk'] }),
  baseUrl: text('base_url'),
  defaultModel: text('default_model'),
  secretRef: text('secret_ref'),
  toolMode: text('tool_mode', { enum: ['auto', 'native', 'prompted', 'disabled'] })
    .notNull()
    .default('auto'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  providerOptions: text('provider_options'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export type ProviderRow = typeof providers.$inferSelect;
