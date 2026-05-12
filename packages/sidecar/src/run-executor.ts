import { randomUUID } from 'node:crypto';
import type { RunEvent, RunId, RunUsage, ToolMode } from '@golemancy/shared';
import type { RuntimeContext } from './runtime-context.js';

export type ExecutorInput = {
  readonly runId: string;
  readonly threadId: string;
  readonly engineMessages: ReadonlyArray<{
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
  }>;
  readonly model: string;
  readonly toolMode: ToolMode;
  readonly controller: AbortController;
};

// Background driver: resolves the provider secret JIT, pulls events from the
// engine generator, persists each event + final state to SQLite, broadcasts
// to live SSE subscribers, and finalises the run row + assistant message.
// Caller is expected to have already inserted the user message and seeded
// `inFlight[runId]` with a broadcaster + controller before calling.
export async function executeRun(ctx: RuntimeContext, input: ExecutorInput): Promise<void> {
  const slot = ctx.inFlight.get(input.runId);
  if (!slot) return;

  await ctx.repos.runs.markRunning(input.runId);

  let sequence = 0;
  let assistantContent = '';
  let usage: RunUsage | undefined;
  let errorMessage: string | null = null;

  const persist = async (event: RunEvent): Promise<number> => {
    sequence += 1;
    await ctx.repos.runEvents.insert({
      id: randomUUID(),
      runId: input.runId,
      sequence,
      type: event.type,
      payload: JSON.stringify(event),
    });
    return sequence;
  };

  const emitFailure = async (message: string) => {
    const failure: RunEvent = {
      type: 'error',
      runId: input.runId as RunId,
      error: message,
    };
    const seq = await persist(failure);
    slot.broadcaster.emit(failure, seq);
    errorMessage = message;
  };

  try {
    const provider = ctx.defaultProvider;
    const secretRef = provider.secretRef;
    if (!secretRef) {
      await emitFailure('provider has no secretRef configured');
    } else {
      const apiKey = await ctx.secretStore.get(secretRef);
      if (!apiKey) {
        await emitFailure(
          `secret "${secretRef}" is not set — open Settings → Providers to configure`,
        );
      } else {
        for await (const event of ctx.engine.run({
          runId: input.runId,
          provider,
          model: input.model,
          toolMode: input.toolMode,
          messages: input.engineMessages,
          signal: input.controller.signal,
          apiKey,
        })) {
          const seq = await persist(event);
          if (event.type === 'text_delta') {
            assistantContent += event.delta;
          } else if (event.type === 'usage') {
            usage = event.usage;
          } else if (event.type === 'error') {
            errorMessage = event.error;
          }
          slot.broadcaster.emit(event, seq);
        }
      }
    }
  } catch (err) {
    await emitFailure(err instanceof Error ? err.message : String(err));
  }

  try {
    if (assistantContent.length > 0) {
      await ctx.repos.messages.insert({
        id: randomUUID(),
        threadId: input.threadId,
        runId: input.runId,
        role: 'assistant',
        content: assistantContent,
      });
    }

    if (errorMessage) {
      await ctx.repos.runs.markErrored(input.runId, errorMessage);
    } else if (slot.controller.signal.aborted) {
      await ctx.repos.runs.markCancelled(input.runId);
    } else {
      await ctx.repos.runs.markCompleted(input.runId, {
        inputTokens: usage?.inputTokens ?? null,
        outputTokens: usage?.outputTokens ?? null,
        totalTokens: usage?.totalTokens ?? null,
      });
    }

    await ctx.repos.threads.touch(input.threadId);
  } finally {
    slot.broadcaster.close();
    ctx.inFlight.delete(input.runId);
  }
}
