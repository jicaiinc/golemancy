export type ShellCommandResult = {
  readonly command: string;
  readonly cwd: string;
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly signal?: string;
  readonly timedOut: boolean;
  readonly durationMs: number;
  readonly truncated: boolean;
};
