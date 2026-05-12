import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { bearerAuth } from './auth.js';
import { registerHealthRoute } from './routes/health.js';
import { registerConfigRoute } from './routes/config.js';
import { registerRunsRoutes } from './routes/runs.js';
import { registerProvidersRoutes } from './routes/providers.js';
import { registerToolsRoutes } from './routes/tools.js';
import { registerBrowserRoutes } from './routes/browser.js';
import { registerMcpRoutes } from './routes/mcp.js';
import { registerSettingsRoutes } from './routes/settings.js';

export type AppDeps = {
  readonly version: string;
  readonly token: string;
  readonly startedAt: Date;
};

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();

  app.use(
    '*',
    cors({
      origin: ['http://127.0.0.1', 'http://localhost', 'tauri://localhost', 'app://localhost'],
      credentials: false,
    }),
  );
  app.use('*', secureHeaders());
  app.use('*', bearerAuth(deps.token));

  registerHealthRoute(app, deps);
  registerConfigRoute(app, deps);
  registerRunsRoutes(app);
  registerProvidersRoutes(app);
  registerToolsRoutes(app);
  registerBrowserRoutes(app);
  registerMcpRoutes(app);
  registerSettingsRoutes(app);

  app.notFound((c) => c.json({ error: 'not_found', path: c.req.path }, 404));
  app.onError((err, c) => {
    console.error('[sidecar]', err);
    return c.json({ error: 'internal_error', message: err.message }, 500);
  });

  return app;
}
