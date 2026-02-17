/**
 * Subset of @anthropic-ai/sandbox-runtime SandboxManager API.
 * Extracted to avoid duplicating the interface across sandbox-pool.ts and sandbox-worker.ts.
 *
 * @anthropic-ai/sandbox-runtime is dynamically imported at runtime;
 * this declaration covers only the methods we use.
 */
export interface SandboxManagerAPI {
  checkDependencies(): unknown
  initialize(config: Record<string, unknown>): Promise<void>
  wrapWithSandbox(
    command: string,
    binShell?: string,
    customConfig?: unknown,
    abortSignal?: AbortSignal,
  ): Promise<string>
  cleanupAfterCommand(): void
  reset(): Promise<void>
}
