import {
  API_PATHS,
  RenameThreadRequestSchema,
  type ListMessagesResponse,
  type ListThreadsResponse,
  type MessageDto,
  type ThreadSummary,
} from '@golemancy/protocol';
import type { Hono } from 'hono';
import type { RuntimeContext } from '../runtime-context.js';

function toSummary(t: {
  id: string;
  title: string | null;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
}): ThreadSummary {
  return {
    id: t.id,
    title: t.title,
    projectId: t.projectId,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

export function registerThreadsRoutes(app: Hono, ctx: RuntimeContext): void {
  app.get(API_PATHS.threads, async (c) => {
    const projectId = c.req.query('projectId');
    const rows = projectId
      ? await ctx.repos.threads.listByProject(projectId)
      : await ctx.repos.threads.list();
    const res: ListThreadsResponse = { threads: rows.map(toSummary) };
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

  app.patch('/threads/:id', async (c) => {
    const threadId = c.req.param('id');
    if (!threadId) return c.json({ error: 'missing_thread_id' }, 400);
    const json = await c.req.json().catch(() => null);
    const parsed = RenameThreadRequestSchema.safeParse(json);
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', detail: parsed.error.format() }, 400);
    }
    const row = await ctx.repos.threads.rename(threadId, parsed.data.title);
    if (!row) return c.json({ error: 'not_found' }, 404);
    return c.json({ thread: toSummary(row) });
  });

  app.delete('/threads/:id', async (c) => {
    const threadId = c.req.param('id');
    if (!threadId) return c.json({ error: 'missing_thread_id' }, 400);
    const existing = await ctx.repos.threads.get(threadId);
    if (!existing) return c.json({ error: 'not_found' }, 404);
    await ctx.repos.threads.remove(threadId);
    return c.json({ ok: true });
  });
}
