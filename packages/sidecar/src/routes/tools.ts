import { API_PATHS } from '@golemancy/protocol';
import type { Hono } from 'hono';

export function registerToolsRoutes(app: Hono): void {
  app.post(API_PATHS.toolApprove(':id'), (c) => c.json({ error: 'not_implemented' }, 501));
}
