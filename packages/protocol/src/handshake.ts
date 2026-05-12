import { z } from 'zod';

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  version: z.string(),
  startedAt: z.string(),
  uptimeMs: z.number().int().nonnegative(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const NativeHostRuntimeSchema = z.object({
  url: z.string().url(),
  token: z.string().min(16),
  pid: z.number().int().positive(),
  version: z.string(),
  writtenAt: z.string(),
});
export type NativeHostRuntime = z.infer<typeof NativeHostRuntimeSchema>;
