import { randomBytes, timingSafeEqual } from 'node:crypto';
import { AUTH_HEADER, AUTH_SCHEME } from '@golemancy/protocol';
import type { Context, MiddlewareHandler } from 'hono';

export function generateBearerToken(): string {
  return randomBytes(32).toString('base64url');
}

export function bearerAuth(expected: string): MiddlewareHandler {
  const expectedBuf = Buffer.from(expected, 'utf8');
  return async (c: Context, next) => {
    if (c.req.path === '/health') {
      return next();
    }
    const header = c.req.header(AUTH_HEADER);
    if (!header || !header.startsWith(`${AUTH_SCHEME} `)) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    const presented = header.slice(AUTH_SCHEME.length + 1);
    const presentedBuf = Buffer.from(presented, 'utf8');
    if (presentedBuf.length !== expectedBuf.length || !timingSafeEqual(presentedBuf, expectedBuf)) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    return next();
  };
}
