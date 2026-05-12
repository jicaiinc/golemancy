import { API_PATHS, type HealthResponse } from '@golemancy/protocol';
import type { Hono } from 'hono';
import type { AppDeps } from '../server.js';

export function registerHealthRoute(app: Hono, deps: AppDeps): void {
  app.get(API_PATHS.health, (c) => {
    const body: HealthResponse = {
      status: 'ok',
      version: deps.version,
      startedAt: deps.startedAt.toISOString(),
      uptimeMs: Date.now() - deps.startedAt.getTime(),
    };
    return c.json(body);
  });
}
