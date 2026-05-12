import { z } from 'zod';

export const McpServerConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  transport: z.enum(['stdio', 'http-sse']),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  url: z.string().url().optional(),
  enabled: z.boolean(),
  allowList: z.array(z.string()).optional(),
  denyList: z.array(z.string()).optional(),
});
export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;

export const ListMcpServersResponseSchema = z.object({
  servers: z.array(McpServerConfigSchema),
});
