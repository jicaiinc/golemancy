import { z } from 'zod';

export const BrowserProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  online: z.boolean(),
  lastSeenAt: z.string().optional(),
});
export type BrowserProfile = z.infer<typeof BrowserProfileSchema>;

export const BrowserStatusResponseSchema = z.object({
  hostConnected: z.boolean(),
  profiles: z.array(BrowserProfileSchema),
});

export const BrowserActionRequestSchema = z.object({
  profileId: z.string(),
  action: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('click'), selector: z.string() }),
    z.object({ kind: z.literal('scroll'), x: z.number(), y: z.number() }),
    z.object({ kind: z.literal('type'), selector: z.string(), text: z.string() }),
    z.object({ kind: z.literal('navigate'), url: z.string().url() }),
    z.object({ kind: z.literal('extract'), selector: z.string().optional() }),
    z.object({ kind: z.literal('screenshot') }),
  ]),
  timeoutMs: z.number().int().positive().optional(),
});
export type BrowserActionRequest = z.infer<typeof BrowserActionRequestSchema>;

export const BrowserActionResponseSchema = z.object({
  actionId: z.string(),
  ok: z.boolean(),
  result: z.unknown().optional(),
  error: z.string().optional(),
});

export const NativeMessageInboundSchema = z.object({
  profileId: z.string().optional(),
  payload: z.unknown(),
});

export const NativePollResponseSchema = z.object({
  commands: z.array(
    z.object({
      id: z.string(),
      payload: z.unknown(),
    }),
  ),
});
