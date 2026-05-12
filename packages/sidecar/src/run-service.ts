import { MessageRepository, RunRepository, type AppendRunEventInput, type OpenedDatabase } from "@golemancy/db";
import type {
  CreateRunRequest,
  CreateRunResponse,
  RunEvent,
  RunEventType,
  RuntimeProviderConfig,
} from "@golemancy/protocol";
import type { RuntimeEngineRegistry } from "@golemancy/runtime";
import type { ResolvedRuntimeProviderConfig, RuntimeRunRequest } from "@golemancy/runtime";

export interface RunManagerOptions {
  database: OpenedDatabase;
  runtimeEngines: RuntimeEngineRegistry;
  resolveProviderApiKey?: (provider: RuntimeProviderConfig) => Promise<string | undefined> | string | undefined;
}

type RunEventListener = (event: RunEvent) => void;

export class RunManager {
  readonly #runs: RunRepository;
  readonly #messages: MessageRepository;
  readonly #runtimeEngines: RuntimeEngineRegistry;
  readonly #resolveProviderApiKey: NonNullable<RunManagerOptions["resolveProviderApiKey"]>;
  readonly #activeRuns = new Map<string, AbortController>();
  readonly #subscribers = new Map<string, Set<RunEventListener>>();

  constructor(options: RunManagerOptions) {
    this.#runs = new RunRepository(options.database);
    this.#messages = new MessageRepository(options.database);
    this.#runtimeEngines = options.runtimeEngines;
    this.#resolveProviderApiKey = options.resolveProviderApiKey ?? (() => undefined);
  }

  start(request: CreateRunRequest): CreateRunResponse {
    const run = this.#runs.createRun({
      threadId: request.threadId,
      status: "queued",
      providerId: request.provider.id,
      modelId: request.provider.model,
    });

    this.#appendAndPublish({
      runId: run.id,
      type: "run.created",
      payload: {
        status: "queued",
        providerId: request.provider.id,
        model: request.provider.model,
        engineId: request.engineId,
      },
    });

    const controller = new AbortController();
    this.#activeRuns.set(run.id, controller);
    setImmediate(() => {
      void this.#execute(run.id, request, controller);
    });

    return {
      runId: run.id,
      status: "queued",
    };
  }

  cancel(runId: string): boolean {
    const controller = this.#activeRuns.get(runId);
    if (!controller) {
      return false;
    }
    controller.abort();
    this.#runs.updateRunStatus(runId, "cancelling");
    return true;
  }

  getRun(runId: string) {
    return this.#runs.getRun(runId);
  }

  listRunEvents(runId: string, afterSequence = 0): RunEvent[] {
    return this.#runs.listRunEvents(runId).filter((event) => event.sequence > afterSequence);
  }

  subscribe(runId: string, listener: RunEventListener): () => void {
    let listeners = this.#subscribers.get(runId);
    if (!listeners) {
      listeners = new Set<RunEventListener>();
      this.#subscribers.set(runId, listeners);
    }

    listeners.add(listener);
    return () => {
      listeners?.delete(listener);
      if (listeners?.size === 0) {
        this.#subscribers.delete(runId);
      }
    };
  }

  dispose(): void {
    for (const controller of this.#activeRuns.values()) {
      controller.abort();
    }
    this.#activeRuns.clear();
    this.#subscribers.clear();
  }

  async #execute(runId: string, request: CreateRunRequest, controller: AbortController): Promise<void> {
    try {
      const provider = await this.#resolveProvider(request.provider);
      const runtimeRequest: RuntimeRunRequest = {
        runId,
        threadId: request.threadId,
        messages: request.messages,
        provider,
        agent: request.agent,
        signal: controller.signal,
      };

      const engine = this.#runtimeEngines.resolve(runtimeRequest, request.engineId);
      this.#runs.updateRunStatus(runId, "running");

      let terminalEventEmitted = false;
      const result = await engine.run(runtimeRequest, {
        emit: (event) => {
          terminalEventEmitted = terminalEventEmitted || isTerminalRunEventType(event.type);
          this.#appendAndPublish({
            runId,
            type: event.type,
            payload: event.payload,
            providerData: event.providerData,
          });
        },
      });

      this.#runs.updateRunStatus(runId, result.status);
      if (!terminalEventEmitted) {
        const terminalEvent = toTerminalRunEvent(runId, result);
        if (terminalEvent) {
          this.#appendAndPublish(terminalEvent);
        }
      }

      if (result.status === "completed" && result.finalOutput?.trim()) {
        this.#messages.createMessage({
          threadId: request.threadId,
          runId,
          role: "assistant",
          content: result.finalOutput,
          providerData: result.providerData,
        });
      }
    } catch (error) {
      this.#appendAndPublish({
        runId,
        type: controller.signal.aborted ? "run.cancelled" : "run.failed",
        payload: controller.signal.aborted
          ? { reason: "aborted" }
          : { message: error instanceof Error ? error.message : String(error) },
        providerData: serializeError(error),
      });
      this.#runs.updateRunStatus(runId, controller.signal.aborted ? "cancelled" : "failed");
    } finally {
      this.#activeRuns.delete(runId);
    }
  }

  #appendAndPublish(input: AppendRunEventInput): RunEvent {
    const event = this.#runs.appendRunEvent(input);
    this.#publish(event);
    return event;
  }

  #publish(event: RunEvent): void {
    const listeners = this.#subscribers.get(event.runId);
    if (!listeners?.size) {
      return;
    }

    for (const listener of [...listeners]) {
      try {
        listener(event);
      } catch (error) {
        console.error("Run event subscriber failed", error);
      }
    }
  }

  async #resolveProvider(provider: RuntimeProviderConfig): Promise<ResolvedRuntimeProviderConfig> {
    return {
      ...provider,
      apiKey: await this.#resolveProviderApiKey(provider),
    };
  }
}

export function isTerminalRunEvent(event: RunEvent): boolean {
  return isTerminalRunEventType(event.type);
}

function isTerminalRunEventType(type: RunEventType): boolean {
  return type === "run.completed" || type === "run.failed" || type === "run.cancelled";
}

function toTerminalRunEvent(
  runId: string,
  result: { status: "completed" | "failed" | "cancelled" | "waiting_for_approval"; finalOutput?: string; providerData?: unknown },
): AppendRunEventInput | undefined {
  if (result.status === "completed") {
    return {
      runId,
      type: "run.completed",
      payload: { finalOutput: result.finalOutput },
      providerData: result.providerData,
    };
  }

  if (result.status === "failed") {
    return {
      runId,
      type: "run.failed",
      payload: { message: "Runtime engine returned failed status" },
      providerData: result.providerData,
    };
  }

  if (result.status === "cancelled") {
    return {
      runId,
      type: "run.cancelled",
      payload: { reason: "cancelled" },
      providerData: result.providerData,
    };
  }

  return undefined;
}

function serializeError(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return { message: String(error) };
  }
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
}
