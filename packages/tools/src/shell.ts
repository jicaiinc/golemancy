import type { ShellCommandResult } from '@golemancy/shared';

export type ShellRunOptions = {
  readonly command: string;
  readonly cwd?: string;
  readonly env?: Record<string, string>;
  readonly timeoutMs?: number;
  readonly maxOutputBytes?: number;
  readonly signal?: AbortSignal;
};

export interface ShellRunner {
  run(options: ShellRunOptions): Promise<ShellCommandResult>;
}

export class NotYetImplementedShellRunner implements ShellRunner {
  async run(_options: ShellRunOptions): Promise<ShellCommandResult> {
    throw new Error('shell runner is not implemented yet — wire up child_process.spawn baseline');
  }
}
