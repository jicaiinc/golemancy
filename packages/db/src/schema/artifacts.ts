import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { createdAt, id } from './_columns.js';
import { runs } from './runs.js';

export const artifacts = sqliteTable('artifacts', {
  id: id(),
  runId: text('run_id').references(() => runs.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  name: text('name').notNull(),
  path: text('path'),
  sizeBytes: integer('size_bytes'),
  mimeType: text('mime_type'),
  metadata: text('metadata'),
  createdAt: createdAt(),
});

export type ArtifactRow = typeof artifacts.$inferSelect;
