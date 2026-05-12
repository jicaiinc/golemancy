import { randomUUID } from 'node:crypto';
import type { RunEvent, RunId, RunUsage } from '@golemancy/shared';
import type { EngineRunInput } from '@golemancy/runtime';
import type { RuntimeContext } from './runtime-context.js';

export type ExecutorInput = {
  readonly engineInput: EngineRunInput;
  readonly threadId: string;
  readonly runId: string;
};

// Background driver: pulls events from the engine generator, persists each
// event + final state to SQLite, broadcasts events to live SSE subscribers,
// and finalises the run row + assistant message. Caller is expected to have
// already inserted the user message and seeded `inFlight[runId]` with a
// broadcaster + controller before calling.
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

  try {
    for await (const event of ctx.engine.run(input.engineInput)) {
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
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    const failure: RunEvent = {
      type: 'error',
      runId: input.runId as RunId,
      error: errorMessage,
    };
    const seq = await persist(failure);
    slot.broadcaster.emit(failure, seq);
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
