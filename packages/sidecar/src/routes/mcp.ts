import { API_PATHS } from '@golemancy/protocol';
import type { Hono } from 'hono';

export function registerMcpRoutes(app: Hono): void {
  app.get(API_PATHS.mcpServers, (c) => c.json({ servers: [] }));
  app.post('/mcp/servers/:id/reload', (c) => c.json({ error: 'not_implemented' }, 501));
}
