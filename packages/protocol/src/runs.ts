import { z } from 'zod';

export const ChatRoleSchema = z.enum(['system', 'user', 'assistant', 'tool']);
export type ChatRole = z.infer<typeof ChatRoleSchema>;

export const ChatMessageInputSchema = z.object({
  role: ChatRoleSchema,
  content: z.string(),
});
export type ChatMessageInput = z.infer<typeof ChatMessageInputSchema>;

// The M1 client typically sends `{ prompt }` and we expand it into a single
// user message. Power callers can send `{ messages: [...] }` directly.
export const CreateRunRequestSchema = z
  .object({
    threadId: z.string().optional(),
    projectId: z.string().optional(),
    providerId: z.string().optional(),
    model: z.string().optional(),
    toolMode: z.enum(['auto', 'native', 'prompted', 'disabled']).optional(),
    prompt: z.string().optional(),
    messages: z.array(ChatMessageInputSchema).optional(),
    // M1: UI fetches the API key from the OS keychain via Tauri and inlines
    // it per request. This will move to a sidecar JIT secret fetch in M3.
    // See _decisions/secret-transport.zh.md.
    apiKey: z.string().min(1).optional(),
  })
  .refine((v) => Boolean(v.prompt || (v.messages && v.messages.length > 0)), {
    message: 'either prompt or messages is required',
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

export const RunStatusSchema = z.enum([
  'queued',
  'running',
  'awaiting_approval',
  'cancelled',
  'completed',
  'errored',
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const RunSummarySchema = z.object({
  id: z.string(),
  threadId: z.string(),
  status: RunStatusSchema,
  providerId: z.string(),
  model: z.string().nullable(),
  startedAt: z.string().nullable(),
  endedAt: z.string().nullable(),
  inputTokens: z.number().nullable(),
  outputTokens: z.number().nullable(),
  totalTokens: z.number().nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
});
export type RunSummary = z.infer<typeof RunSummarySchema>;

export const ListRunsResponseSchema = z.object({
  runs: z.array(RunSummarySchema),
});
export type ListRunsResponse = z.infer<typeof ListRunsResponseSchema>;

export const MessageDtoSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  runId: z.string().nullable(),
  role: ChatRoleSchema,
  content: z.string(),
  createdAt: z.string(),
});
export type MessageDto = z.infer<typeof MessageDtoSchema>;

export const ListMessagesResponseSchema = z.object({
  messages: z.array(MessageDtoSchema),
});
export type ListMessagesResponse = z.infer<typeof ListMessagesResponseSchema>;

export const ThreadSummarySchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  projectId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ThreadSummary = z.infer<typeof ThreadSummarySchema>;

export const ListThreadsResponseSchema = z.object({
  threads: z.array(ThreadSummarySchema),
});
export type ListThreadsResponse = z.infer<typeof ListThreadsResponseSchema>;
