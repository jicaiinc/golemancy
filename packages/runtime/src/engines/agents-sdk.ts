import type { RunEvent } from '@golemancy/shared';
import { EngineNotImplementedError, type EngineRunInput, type RuntimeEngine } from '../engine.js';

// Primary RunLoop engine. Wraps OpenAI Agents SDK. Internally selects a model
// source based on `provider.transport`:
//   - 'openai-style' -> OpenAIProvider (Responses / Chat Completions / baseURL)
//   - 'ai-sdk'       -> @openai/agents-extensions aisdk adapter
// Real implementation lands in M1 (openai-style) and M3 (ai-sdk).
export class AgentsSdkEngine implements RuntimeEngine {
  readonly kind = 'agents-sdk' as const;

  async *run(_input: EngineRunInput): AsyncIterable<RunEvent> {
    throw new EngineNotImplementedError(this.kind);
  }
}
