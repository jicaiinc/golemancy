import { describe, expect, it } from 'vitest';
import type { ToolCallId } from '@golemancy/shared';
import { ApprovalQueue } from './approval.js';
import { ToolRegistry } from './registry.js';

describe('tool registry', () => {
  it('registers, describes, lists, and invokes tool handlers', async () => {
    const registry = new ToolRegistry();
    registry.register(
      {
        name: 'browser.extract',
        source: 'browser',
        description: 'Extract page context',
        jsonSchema: { type: 'object' },
        requiresApproval: true,
      },
      async (input, ctx) => ({ ok: true, output: { input, runId: ctx.runId } }),
    );

    expect(registry.has('browser.extract')).toBe(true);
    expect(registry.describe('browser.extract')?.requiresApproval).toBe(true);
    expect(registry.list()).toHaveLength(1);
    await expect(
      registry.invoke(
        'browser.extract',
        { selector: 'main' },
        {
          runId: 'run_1',
          toolCallId: 'tool_1',
          signal: new AbortController().signal,
        },
      ),
    ).resolves.toEqual({
      ok: true,
      output: { input: { selector: 'main' }, runId: 'run_1' },
    });
  });

  it('rejects duplicate tool names and reports missing tools through the public result shape', async () => {
    const registry = new ToolRegistry();
    const desc = { name: 'shell.run', source: 'shell' as const, jsonSchema: {} };
    registry.register(desc, async () => ({ ok: true, output: null }));

    expect(() => registry.register(desc, async () => ({ ok: true, output: null }))).toThrow(
      'already registered',
    );
    await expect(
      registry.invoke('missing', null, {
        runId: 'run_1',
        toolCallId: 'tool_1',
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({ ok: false, error: 'tool "missing" is not registered' });
  });
});

describe('approval queue', () => {
  it('bridges a pending tool approval to a later HTTP decision', async () => {
    const queue = new ApprovalQueue();
    const toolCallId = 'tool_1' as ToolCallId;
    const pending = queue.request(toolCallId);

    expect(queue.status(toolCallId)).toBe('pending');
    expect(queue.decide(toolCallId, 'approve')).toBe(true);
    await expect(pending).resolves.toBe('approve');
    expect(queue.status(toolCallId)).toBe('approve');
    expect(queue.decide(toolCallId, 'reject')).toBe(false);
  });
});
