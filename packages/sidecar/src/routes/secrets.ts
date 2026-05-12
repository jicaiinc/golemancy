import {
  AllowedSecretAccountSchema,
  SetSecretRequestSchema,
  type DeleteSecretResponse,
  type SecretStatusResponse,
  type SetSecretResponse,
} from '@golemancy/protocol';
import type { Hono } from 'hono';
import type { RuntimeContext } from '../runtime-context.js';

export function registerSecretsRoutes(app: Hono, ctx: RuntimeContext): void {
  app.get('/settings/secrets/:account/status', async (c) => {
    const account = c.req.param('account');
    const parsed = AllowedSecretAccountSchema.safeParse(account);
    if (!parsed.success) return c.json({ error: 'forbidden_account' }, 400);

    const value = await ctx.secretStore.get(parsed.data);
    const body: SecretStatusResponse = {
      account: parsed.data,
      present: value !== null,
      masked: value ? mask(value) : null,
    };
    return c.json(body);
  });

  app.put('/settings/secrets/:account', async (c) => {
    const account = c.req.param('account');
    const parsed = AllowedSecretAccountSchema.safeParse(account);
    if (!parsed.success) return c.json({ error: 'forbidden_account' }, 400);

    const json = await c.req.json().catch(() => null);
    const body = SetSecretRequestSchema.safeParse(json);
    if (!body.success) {
      return c.json({ error: 'invalid_request', detail: body.error.format() }, 400);
    }

    try {
      await ctx.secretStore.set(parsed.data, body.data.value.trim());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'set_failed', detail: msg }, 500);
    }

    const res: SetSecretResponse = {
      account: parsed.data,
      saved: true,
      masked: mask(body.data.value.trim()),
    };
    return c.json(res);
  });

  app.delete('/settings/secrets/:account', async (c) => {
    const account = c.req.param('account');
    const parsed = AllowedSecretAccountSchema.safeParse(account);
    if (!parsed.success) return c.json({ error: 'forbidden_account' }, 400);

    const existing = await ctx.secretStore.get(parsed.data);
    if (existing === null) {
      const res: DeleteSecretResponse = { account: parsed.data, deleted: false };
      return c.json(res);
    }
    try {
      await ctx.secretStore.delete(parsed.data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'delete_failed', detail: msg }, 500);
    }
    const res: DeleteSecretResponse = { account: parsed.data, deleted: true };
    return c.json(res);
  });
}

function mask(value: string): string {
  if (value.length <= 8) return '••••';
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}
