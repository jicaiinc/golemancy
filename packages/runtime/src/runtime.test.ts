import { describe, expect, it } from 'vitest';
import type { ProviderConfig, ProviderId } from '@golemancy/shared';
import { NoopCapabilityTester } from './capability-test.js';
import type { RuntimeEngine } from './engine.js';
import { mapAgentsSdkEvent } from './engines/event-mapper.js';
import { ProviderRegistry } from './provider-registry.js';

const provider = (id: string, engine: ProviderConfig['engine']): ProviderConfig => ({
  id: id as ProviderId,
  name: id,
  engine,
  transport: engine === 'agents-sdk' ? 'openai-style' : undefined,
  model: 'gpt-4o-mini',
  toolMode: 'disabled',
  capabilities: { streaming: true, nativeToolCalling: false },
});

describe('runtime boundaries', () => {
  it('maps Agents SDK text deltas into product RunEvents', () => {
    expect(
      mapAgentsSdkEvent(
        {
          type: 'raw_model_stream_event',
          data: { type: 'output_text_delta', id: 'msg_1', delta: 'hello' },
        },
        'run_1',
      ),
    ).toEqual([
      {
        type: 'text_delta',
        runId: 'run_1',
        messageId: 'msg_1',
        delta: 'hello',
      },
    ]);
  });

  it('drops unknown provider events instead of leaking provider-specific shapes', () => {
    expect(mapAgentsSdkEvent({ type: 'unsupported', data: { delta: 'x' } }, 'run_1')).toEqual([]);
    expect(
      mapAgentsSdkEvent(
        { type: 'raw_model_stream_event', data: { type: 'reasoning_delta', delta: 'x' } },
        'run_1',
      ),
    ).toEqual([]);
  });

  it('resolves engines by the provider engine axis', () => {
    const registry = new ProviderRegistry();
    const agentsEngine = { kind: 'agents-sdk' } as RuntimeEngine;
    const cliEngine = { kind: 'cli-agent' } as RuntimeEngine;

    registry.registerEngine(agentsEngine);
    registry.registerEngine(cliEngine);
    registry.registerProvider(provider('openai', 'agents-sdk'));
    registry.registerProvider(provider('codex-cli', 'cli-agent'));

    expect(registry.resolveEngine(registry.getProvider('openai' as ProviderId)!)).toBe(
      agentsEngine,
    );
    expect(registry.resolveEngine(registry.getProvider('codex-cli' as ProviderId)!)).toBe(
      cliEngine,
    );
  });

  it('returns current provider capabilities from the baseline capability tester', async () => {
    const tested = await new NoopCapabilityTester().test(provider('openai', 'agents-sdk'));
    expect(tested.providerId).toBe('openai');
    expect(tested.capabilities).toEqual({ streaming: true, nativeToolCalling: false });
    expect(Date.parse(tested.testedAt)).not.toBeNaN();
  });
});
