import type { RunEvent } from '@golemancy/shared';
import { EngineNotImplementedError, type EngineRunInput, type RuntimeEngine } from '../engine.js';

export type CliAgentSpec = {
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  readonly cwd?: string;
  readonly env?: Record<string, string>;
  readonly timeoutMs?: number;
  readonly pty?: boolean;
};

// Independent RunLoop engine that does NOT route through OpenAI Agents SDK.
// Claude Code CLI / Codex CLI run their own internal agent loop; this engine
// is responsible for process spawn, stream parsing, and mapping their output
// to product RunEvents. Implementation lands in M5.
export class CliAgentEngine implements RuntimeEngine {
  readonly kind = 'cli-agent' as const;

  async *run(_input: EngineRunInput): AsyncIterable<RunEvent> {
    throw new EngineNotImplementedError(this.kind);
  }
}
