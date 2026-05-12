import type { Hono } from 'hono';

export function registerToolsRoutes(app: Hono): void {
  app.post('/tools/:id/approve', (c) => c.json({ error: 'not_implemented' }, 501));
}
