import { API_PATHS } from '@golemancy/protocol';
import type { Hono } from 'hono';
import type { AppDeps } from '../server.js';

export function registerConfigRoute(app: Hono, deps: AppDeps): void {
  app.get(API_PATHS.config, (c) =>
    c.json({
      version: deps.version,
      features: {
        runtime: 'stub',
        providers: [],
        browserBridge: true,
        mcp: false,
      },
    }),
  );
}
