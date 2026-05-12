import { API_PATHS } from '@golemancy/protocol';
import type { Hono } from 'hono';
import { asBrowserActionRequest } from '../browser-bridge.js';
import type { RuntimeContext } from '../runtime-context.js';

export function registerBrowserRoutes(app: Hono, ctx: RuntimeContext): void {
  app.get(API_PATHS.browserStatus, (c) => c.json(ctx.browserBridge.getStatus()));
  app.get(API_PATHS.browserProfiles, (c) =>
    c.json({ profiles: ctx.browserBridge.listProfiles() }),
  );

  app.post(API_PATHS.browserActions, async (c) => {
    try {
      const request = asBrowserActionRequest(await c.req.json());
      const result = await ctx.browserBridge.invoke(request);
      return c.json({ ok: true, result });
    } catch (error) {
      return c.json(
        {
          error: {
            code: error instanceof Error ? error.name : 'browser_action_failed',
            message: error instanceof Error ? error.message : String(error),
          },
        },
        error instanceof Error && error.message.includes('timed out') ? 504 : 400,
      );
    }
  });

  app.post(API_PATHS.browserNativeMessages, async (c) => {
    try {
      return c.json(ctx.browserBridge.handleNativeMessage(await c.req.json()));
    } catch (error) {
      return c.json(
        {
          error: {
            code: error instanceof Error ? error.name : 'native_message_failed',
            message: error instanceof Error ? error.message : String(error),
          },
        },
        400,
      );
    }
  });

  app.post(API_PATHS.browserNativePoll, async (c) => {
    try {
      const body = await c.req.json();
      const profileId = typeof body.profileId === 'string' ? body.profileId : '';
      const timeoutMs = typeof body.timeoutMs === 'number' ? body.timeoutMs : undefined;

      if (!profileId) {
        return c.json(
          { error: { code: 'missing_profile_id', message: 'profileId is required' } },
          400,
        );
      }

      const message = await ctx.browserBridge.poll(
        profileId,
        {
          sessionId: typeof body.sessionId === 'string' ? body.sessionId : undefined,
          extensionId: typeof body.extensionId === 'string' ? body.extensionId : undefined,
          extensionVersion:
            typeof body.extensionVersion === 'string' ? body.extensionVersion : undefined,
          browser: typeof body.browser === 'string' ? body.browser : undefined,
          userAgent: typeof body.userAgent === 'string' ? body.userAgent : undefined,
          connectedAt: typeof body.connectedAt === 'string' ? body.connectedAt : undefined,
          metadata: 'metadata' in body ? body.metadata : undefined,
        },
        timeoutMs,
      );

      return c.json({ ok: true, message });
    } catch (error) {
      return c.json(
        {
          error: {
            code: error instanceof Error ? error.name : 'native_poll_failed',
            message: error instanceof Error ? error.message : String(error),
          },
        },
        400,
      );
    }
  });
}
