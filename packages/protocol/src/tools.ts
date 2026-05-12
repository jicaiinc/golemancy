import { z } from 'zod';

export const ToolApproveRequestSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  reason: z.string().optional(),
});
export type ToolApproveRequest = z.infer<typeof ToolApproveRequestSchema>;

export const ToolApproveResponseSchema = z.object({
  toolCallId: z.string(),
  decision: z.enum(['approve', 'reject']),
});
