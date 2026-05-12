import { sql } from 'drizzle-orm';
import { text } from 'drizzle-orm/sqlite-core';

export const id = () => text('id').primaryKey();

export const createdAt = () =>
  text('created_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`);

export const updatedAt = () =>
  text('updated_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`);
