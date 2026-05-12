import { z } from 'zod';

export const RuntimeEngineKindSchema = z.enum(['agents-sdk', 'cli-agent']);

export const ProviderTransportSchema = z.enum(['openai-style', 'ai-sdk']);

export const ProviderCapabilitiesSchema = z.object({
  streaming: z.boolean(),
  nativeToolCalling: z.boolean(),
  jsonMode: z.boolean().optional(),
  vision: z.boolean().optional(),
  files: z.boolean().optional(),
  parallelToolCalls: z.boolean().optional(),
  maxContextTokens: z.number().int().positive().optional(),
});

export const ProviderConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  engine: RuntimeEngineKindSchema,
  transport: ProviderTransportSchema.optional(),
  baseUrl: z.string().url().optional(),
  model: z.string(),
  secretRef: z.string().optional(),
  toolMode: z.enum(['auto', 'native', 'prompted', 'disabled']),
  capabilities: ProviderCapabilitiesSchema,
  providerOptions: z.record(z.unknown()).optional(),
});
export type ProviderConfigDto = z.infer<typeof ProviderConfigSchema>;

export const ListProvidersResponseSchema = z.object({
  providers: z.array(ProviderConfigSchema),
});

export const TestProviderRequestSchema = z.object({
  providerId: z.string(),
});

export const TestProviderResponseSchema = z.object({
  providerId: z.string(),
  ok: z.boolean(),
  capabilities: ProviderCapabilitiesSchema.optional(),
  errors: z.array(z.string()).optional(),
});
