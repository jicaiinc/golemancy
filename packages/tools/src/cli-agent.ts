export type CliAgentTarget = 'claude-code' | 'codex' | 'custom';

export type CliAgentSpawnOptions = {
  readonly target: CliAgentTarget;
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  readonly cwd?: string;
  readonly env?: Record<string, string>;
  readonly timeoutMs?: number;
  readonly pty?: boolean;
};

export interface CliAgentRunner {
  spawn(options: CliAgentSpawnOptions): Promise<void>;
}

export class NotYetImplementedCliAgentRunner implements CliAgentRunner {
  async spawn(_options: CliAgentSpawnOptions): Promise<void> {
    throw new Error('CLI agent runner is not implemented yet');
  }
}
