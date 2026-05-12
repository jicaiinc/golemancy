import { API_PATHS } from '@golemancy/protocol';
import type { Hono } from 'hono';

export function registerBrowserRoutes(app: Hono): void {
  app.get(API_PATHS.browserStatus, (c) => c.json({ hostConnected: false, profiles: [] }));
  app.get(API_PATHS.browserProfiles, (c) => c.json({ profiles: [] }));
  app.post(API_PATHS.browserActions, (c) => c.json({ error: 'not_implemented' }, 501));
  app.post(API_PATHS.browserNativeMessages, (c) => c.json({ error: 'not_implemented' }, 501));
  app.post(API_PATHS.browserNativePoll, (c) => c.json({ commands: [] }));
}
