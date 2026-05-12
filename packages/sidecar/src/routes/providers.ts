import { API_PATHS } from '@golemancy/protocol';
import type { Hono } from 'hono';

export function registerProvidersRoutes(app: Hono): void {
  app.get(API_PATHS.providers, (c) => c.json({ providers: [] }));
  app.post(API_PATHS.providersTest, (c) => c.json({ error: 'not_implemented' }, 501));
}
