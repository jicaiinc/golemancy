import {
  Agent,
  Runner,
  assistant,
  setDefaultOpenAIKey,
  system,
  user,
  type AgentInputItem,
} from '@openai/agents';
import type { RunEvent, RunId, RunUsage } from '@golemancy/shared';
import { EngineNotImplementedError, type EngineRunInput, type RuntimeEngine } from '../engine.js';
import { mapAgentsSdkEvent } from './event-mapper.js';

// Primary RunLoop engine. Wraps OpenAI Agents SDK.
// M1 path:
//   - provider.transport: 'openai-style' (or undefined) -> OpenAI provider via setDefaultOpenAIKey
//   - emits text_delta / usage / done / error
//   - tool calling / approvals land in M2; ai-sdk transport lands in M3
export class AgentsSdkEngine implements RuntimeEngine {
  readonly kind = 'agents-sdk' as const;

  async *run(input: EngineRunInput): AsyncIterable<RunEvent> {
    if (input.provider.engine !== 'agents-sdk') {
      throw new EngineNotImplementedError(input.provider.engine);
    }
    if (input.provider.transport === 'ai-sdk') {
      throw new Error('agents-sdk engine: ai-sdk transport is not implemented yet (M3)');
    }

    // Process-global key. M1 single-user OK; revisits with sidecar JIT secret fetch in M3.
    setDefaultOpenAIKey(input.apiKey);

    const runId = input.runId as RunId;
    const model = input.model ?? input.provider.model;

    yield { type: 'run_started', runId };

    let agentInput: string | AgentInputItem[];
    try {
      agentInput = buildAgentInput(input.messages);
    } catch (err) {
      yield { type: 'error', runId, error: messageOf(err) };
      return;
    }

    const agent = new Agent({ name: 'Golemancy', model });
    const runner = new Runner();

    try {
      const result = await runner.run(agent, agentInput, {
        stream: true,
        signal: input.signal,
      });

      for await (const event of result) {
        for (const mapped of mapAgentsSdkEvent(event, runId)) {
          yield mapped;
        }
      }

      await result.completed;

      const usage = extractUsage(result);
      if (usage) {
        yield { type: 'usage', runId, usage };
      }

      yield { type: 'done', runId };
    } catch (err) {
      if (input.signal.aborted) {
        yield { type: 'done', runId };
        return;
      }
      yield { type: 'error', runId, error: messageOf(err) };
    }
  }
}

function buildAgentInput(
  messages: ReadonlyArray<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>,
): string | AgentInputItem[] {
  // Single user message -> pass as plain string (most compatible).
  if (messages.length === 1 && messages[0]?.role === 'user') {
    return messages[0].content;
  }
  const items: AgentInputItem[] = [];
  for (const m of messages) {
    if (m.role === 'user') items.push(user(m.content));
    else if (m.role === 'assistant') items.push(assistant(m.content));
    else if (m.role === 'system') items.push(system(m.content));
    // role === 'tool' is intentionally dropped — the SDK manages tool messages itself in M2+.
  }
  if (items.length === 0) {
    throw new Error('agents-sdk engine: no convertible messages in input');
  }
  return items;
}

function extractUsage(result: {
  runContext?: { usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number } };
}): RunUsage | undefined {
  const u = result.runContext?.usage;
  if (!u) return undefined;
  if (!u.inputTokens && !u.outputTokens && !u.totalTokens) return undefined;
  return {
    inputTokens: u.inputTokens,
    outputTokens: u.outputTokens,
    totalTokens: u.totalTokens,
  };
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
