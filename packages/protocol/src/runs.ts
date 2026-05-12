import { z } from 'zod';

export const CreateRunRequestSchema = z.object({
  threadId: z.string().optional(),
  projectId: z.string().optional(),
  providerId: z.string(),
  model: z.string().optional(),
  input: z.object({
    messages: z.array(
      z.object({
        role: z.enum(['system', 'user', 'assistant', 'tool']),
        content: z.string(),
      }),
    ),
  }),
  toolMode: z.enum(['auto', 'native', 'prompted', 'disabled']).optional(),
});
export type CreateRunRequest = z.infer<typeof CreateRunRequestSchema>;

export const CreateRunResponseSchema = z.object({
  runId: z.string(),
  threadId: z.string(),
});
export type CreateRunResponse = z.infer<typeof CreateRunResponseSchema>;

export const CancelRunResponseSchema = z.object({
  runId: z.string(),
  cancelled: z.boolean(),
});
export type CancelRunResponse = z.infer<typeof CancelRunResponseSchema>;
