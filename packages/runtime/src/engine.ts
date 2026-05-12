import type {
  ProviderConfig,
  RunEvent,
  RuntimeEngineKind,
  ToolMode,
} from '@golemancy/shared';

export type EngineRunInput = {
  readonly runId: string;
  readonly provider: ProviderConfig;
  readonly model?: string;
  readonly toolMode: ToolMode;
  readonly messages: ReadonlyArray<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>;
  readonly signal: AbortSignal;
};

export interface RuntimeEngine {
  readonly kind: RuntimeEngineKind;
  run(input: EngineRunInput): AsyncIterable<RunEvent>;
}

export class EngineNotImplementedError extends Error {
  constructor(kind: RuntimeEngineKind) {
    super(`runtime engine "${kind}" is not implemented yet`);
    this.name = 'EngineNotImplementedError';
  }
}
