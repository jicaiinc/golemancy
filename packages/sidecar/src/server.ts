import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { bearerAuth } from './auth.js';
import { registerHealthRoute } from './routes/health.js';
import { registerConfigRoute } from './routes/config.js';
import { registerRunsRoutes } from './routes/runs.js';
import { registerThreadsRoutes } from './routes/threads.js';
import { registerProvidersRoutes } from './routes/providers.js';
import { registerToolsRoutes } from './routes/tools.js';
import { registerBrowserRoutes } from './routes/browser.js';
import { registerMcpRoutes } from './routes/mcp.js';
import { registerSettingsRoutes } from './routes/settings.js';
import type { RuntimeContext } from './runtime-context.js';

export type AppDeps = {
  readonly version: string;
  readonly token: string;
  readonly startedAt: Date;
  readonly runtime: RuntimeContext;
};

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();

  app.use(
    '*',
    cors({
      origin: (origin) => {
        if (!origin) return undefined;
        if (origin === 'tauri://localhost' || origin === 'app://localhost') return origin;
        if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) return origin;
        return undefined;
      },
      credentials: false,
    }),
  );
  app.use('*', secureHeaders());
  app.use('*', bearerAuth(deps.token));

  registerHealthRoute(app, deps);
  registerConfigRoute(app, deps);
  registerRunsRoutes(app, deps.runtime);
  registerThreadsRoutes(app, deps.runtime);
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
