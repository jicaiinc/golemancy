import { API_PATHS } from '@golemancy/protocol';
import type { Hono } from 'hono';

export function registerSettingsRoutes(app: Hono): void {
  app.get(API_PATHS.settings, (c) => c.json({ error: 'not_implemented' }, 501));
}
