import type { MessageId, RunEvent, RunId } from '@golemancy/shared';

// M1 maps only text_delta. tool_request / tool_result / approval_required
// land in M2. usage and done are emitted by the engine wrapper directly,
// not from per-event source mapping. See _docs/implementation-roadmap.zh.md.
export function mapAgentsSdkEvent(event: unknown, runId: string): RunEvent[] {
  if (!isObject(event)) return [];
  if (event.type !== 'raw_model_stream_event') return [];

  const data = event.data;
  if (!isObject(data)) return [];

  if (data.type === 'output_text_delta' && typeof data.delta === 'string') {
    return [
      {
        type: 'text_delta',
        runId: runId as RunId,
        messageId: deriveMessageId(runId, data),
        delta: data.delta,
      },
    ];
  }

  return [];
}

function deriveMessageId(runId: string, data: Record<string, unknown>): MessageId {
  // Prefer the upstream item id if present; else fall back to a per-run stable id.
  // M1 has a single assistant message per run so the fallback is fine.
  const upstream =
    typeof data.itemId === 'string' ? data.itemId : typeof data.id === 'string' ? data.id : null;
  return (upstream ?? `${runId}:assistant`) as MessageId;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
