import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { createdAt, id, updatedAt } from './_columns.js';

export const mcpServers = sqliteTable('mcp_servers', {
  id: id(),
  name: text('name').notNull(),
  transport: text('transport', { enum: ['stdio', 'http-sse'] }).notNull(),
  command: text('command'),
  args: text('args'),
  url: text('url'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  allowList: text('allow_list'),
  denyList: text('deny_list'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export type McpServerRow = typeof mcpServers.$inferSelect;
