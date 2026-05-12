import { API_PATHS } from '@golemancy/protocol';
import type { Hono } from 'hono';

export function registerRunsRoutes(app: Hono): void {
  app.post(API_PATHS.runs, (c) => c.json({ error: 'not_implemented' }, 501));
  app.get(API_PATHS.runEvents(':id'), (c) => c.json({ error: 'not_implemented' }, 501));
  app.post(API_PATHS.runCancel(':id'), (c) => c.json({ error: 'not_implemented' }, 501));
}
