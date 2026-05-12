import type { MessageId, RunId, ToolCallId } from './ids.js';

export type RunUsage = {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
  readonly cachedInputTokens?: number;
  readonly providerData?: Record<string, unknown>;
};

export type RunEvent =
  | { readonly type: 'run_started'; readonly runId: RunId }
  | {
      readonly type: 'text_delta';
      readonly runId: RunId;
      readonly messageId: MessageId;
      readonly delta: string;
    }
  | {
      readonly type: 'tool_request';
      readonly runId: RunId;
      readonly toolCallId: ToolCallId;
      readonly toolName: string;
      readonly input: unknown;
    }
  | {
      readonly type: 'tool_result';
      readonly runId: RunId;
      readonly toolCallId: ToolCallId;
      readonly output: unknown;
    }
  | {
      readonly type: 'approval_required';
      readonly runId: RunId;
      readonly toolCallId: ToolCallId;
      readonly reason?: string;
    }
  | { readonly type: 'usage'; readonly runId: RunId; readonly usage: RunUsage }
  | { readonly type: 'done'; readonly runId: RunId }
  | { readonly type: 'error'; readonly runId: RunId; readonly error: string };

export type RunEventType = RunEvent['type'];
