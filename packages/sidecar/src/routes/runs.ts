import { randomUUID } from 'node:crypto';
import {
  API_PATHS,
  CreateRunRequestSchema,
  type CancelRunResponse,
  type CreateRunResponse,
  type ListRunsResponse,
  type RunStatus,
  type RunSummary,
} from '@golemancy/protocol';
import type { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { RunBroadcaster } from '../run-broadcaster.js';
import { executeRun, type ExecutorInput } from '../run-executor.js';
import type { RuntimeContext } from '../runtime-context.js';

export function registerRunsRoutes(app: Hono, ctx: RuntimeContext): void {
  app.post(API_PATHS.runs, async (c) => {
    const json = await c.req.json().catch(() => null);
    const parsed = CreateRunRequestSchema.safeParse(json);
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', detail: parsed.error.format() }, 400);
    }
    const body = parsed.data;
    const now = new Date().toISOString();
    const threadId =
      body.threadId ?? (await createThread(ctx, body.projectId ?? null, body.prompt ?? null));

    const runId = randomUUID();
    const provider = ctx.defaultProvider;
    const model = body.model ?? provider.model;
    const toolMode = body.toolMode ?? provider.toolMode;

    const incomingMessages = body.messages?.length
      ? body.messages
      : body.prompt
        ? [{ role: 'user' as const, content: body.prompt }]
        : [];

    if (incomingMessages.length === 0) {
      return c.json({ error: 'empty_input' }, 400);
    }

    // Persist user message(s). M1: only the trailing user message; full
    // history is replayed from DB for the engine input below.
    const trailingUser = [...incomingMessages].reverse().find((m) => m.role === 'user');
    const userMessageContent =
      trailingUser?.content ?? incomingMessages[incomingMessages.length - 1]!.content;

    await ctx.repos.runs.insert({
      id: runId,
      threadId,
      status: 'queued',
      providerId: provider.id,
      model,
      toolMode,
      createdAt: now,
    });

    await ctx.repos.messages.insert({
      id: randomUUID(),
      threadId,
      runId,
      role: 'user',
      content: userMessageContent,
    });

    const history = await ctx.repos.messages.listByThread(threadId);
    const engineMessages = history.map((m) => ({ role: m.role, content: m.content }));

    const broadcaster = new RunBroadcaster();
    const controller = new AbortController();
    let resolveDone!: () => void;
    const done = new Promise<void>((r) => {
      resolveDone = r;
    });
    ctx.inFlight.set(runId, { broadcaster, controller, done, resolveDone });

    const executorInput: ExecutorInput = {
      runId,
      threadId,
      engineMessages,
      model,
      toolMode,
      controller,
    };

    // Fire-and-forget. SSE subscribers attach via GET /runs/:id/events.
    void executeRun(ctx, executorInput).catch((err) => {
      console.error('[sidecar] executeRun crashed', err);
    });

    const res: CreateRunResponse = { runId, threadId };
    return c.json(res);
  });

  app.get('/runs/:id/events', (c) => {
    const runId = c.req.param('id');
    if (!runId) return c.json({ error: 'missing_run_id' }, 400);
    return streamSSE(c, async (stream) => {
      const past = await ctx.repos.runEvents.listByRun(runId);
      for (const row of past) {
        if (stream.aborted) return;
        await stream.writeSSE({
          id: String(row.sequence),
          event: row.type,
          data: row.payload,
        });
      }

      const slot = ctx.inFlight.get(runId);
      if (!slot) return;

      type Pending = { event: import('@golemancy/shared').RunEvent; sequence: number };
      const queue: Pending[] = [];
      let resolveNext: (() => void) | null = null;
      let terminated = slot.broadcaster.ended;

      const unsubscribe = slot.broadcaster.subscribe((event, sequence) => {
        queue.push({ event, sequence });
        if (event.type === 'done' || event.type === 'error') {
          terminated = true;
        }
        if (resolveNext) {
          const r = resolveNext;
          resolveNext = null;
          r();
        }
      });

      stream.onAbort(() => {
        unsubscribe();
        if (resolveNext) {
          const r = resolveNext;
          resolveNext = null;
          r();
        }
      });

      try {
        while (!stream.aborted) {
          if (queue.length === 0) {
            if (terminated) break;
            await new Promise<void>((resolve) => {
              resolveNext = resolve;
            });
            continue;
          }
          const item = queue.shift()!;
          await stream.writeSSE({
            id: String(item.sequence),
            event: item.event.type,
            data: JSON.stringify(item.event),
          });
        }
      } finally {
        unsubscribe();
      }
    });
  });

  app.post('/runs/:id/cancel', (c) => {
    const runId = c.req.param('id');
    if (!runId) return c.json({ error: 'missing_run_id' }, 400);
    const slot = ctx.inFlight.get(runId);
    if (!slot) {
      const res: CancelRunResponse = { runId, cancelled: false };
      return c.json(res);
    }
    slot.controller.abort();
    const res: CancelRunResponse = { runId, cancelled: true };
    return c.json(res);
  });

  app.get(API_PATHS.runs, async (c) => {
    const threadId = c.req.query('threadId');
    const rows = threadId
      ? await ctx.repos.runs.listByThread(threadId)
      : await ctx.repos.runs.listRecent();
    const runs: RunSummary[] = rows.map((r) => ({
      id: r.id,
      threadId: r.threadId,
      status: r.status as RunStatus,
      providerId: r.providerId,
      model: r.model,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      totalTokens: r.totalTokens,
      error: r.error,
      createdAt: r.createdAt,
    }));
    const res: ListRunsResponse = { runs };
    return c.json(res);
  });
}

async function createThread(
  ctx: RuntimeContext,
  projectId: string | null,
  prompt: string | null,
): Promise<string> {
  const id = randomUUID();
  const title = prompt ? prompt.slice(0, 64) : null;
  await ctx.repos.threads.insert({ id, projectId, title });
  return id;
}
