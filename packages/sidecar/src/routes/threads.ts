import {
  API_PATHS,
  type ListMessagesResponse,
  type ListThreadsResponse,
  type MessageDto,
  type ThreadSummary,
} from '@golemancy/protocol';
import type { Hono } from 'hono';
import type { RuntimeContext } from '../runtime-context.js';

export function registerThreadsRoutes(app: Hono, ctx: RuntimeContext): void {
  app.get(API_PATHS.threads, async (c) => {
    const rows = await ctx.repos.threads.list();
    const threads: ThreadSummary[] = rows.map((t) => ({
      id: t.id,
      title: t.title,
      projectId: t.projectId,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));
    const res: ListThreadsResponse = { threads };
    return c.json(res);
  });

  app.get('/threads/:id/messages', async (c) => {
    const threadId = c.req.param('id');
    if (!threadId) return c.json({ error: 'missing_thread_id' }, 400);
    const thread = await ctx.repos.threads.get(threadId);
    if (!thread) {
      return c.json({ error: 'not_found' }, 404);
    }
    const rows = await ctx.repos.messages.listByThread(threadId);
    const messages: MessageDto[] = rows.map((m) => ({
      id: m.id,
      threadId: m.threadId,
      runId: m.runId,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
    }));
    const res: ListMessagesResponse = { messages };
    return c.json(res);
  });
}
