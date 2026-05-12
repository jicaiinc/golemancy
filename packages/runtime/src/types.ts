import type {
  RunEventType,
  RunStatus,
  RuntimeAgentConfig,
  RuntimeMessage,
  RuntimeProviderConfig,
} from "@golemancy/protocol";
import type { ProviderTransport, ToolMode } from "@golemancy/shared";

export interface RuntimeEngineDescriptor {
  id: string;
  label: string;
  transport: ProviderTransport;
  supportedTransports: readonly ProviderTransport[];
  defaultToolMode: ToolMode;
}

export interface ResolvedRuntimeProviderConfig extends RuntimeProviderConfig {
  apiKey?: string;
}

export interface RuntimeRunRequest {
  runId: string;
  threadId: string;
  messages: RuntimeMessage[];
  provider: ResolvedRuntimeProviderConfig;
  agent?: RuntimeAgentConfig;
  signal?: AbortSignal;
  metadata?: Record<string, string>;
}

export interface RunEventDraft<TPayload = unknown> {
  type: RunEventType;
  payload: TPayload;
  providerData?: unknown;
}

export interface RuntimeEventSink {
  emit: (event: RunEventDraft) => Promise<void> | void;
}

export interface RuntimeRunResult {
  status: Extract<RunStatus, "completed" | "failed" | "cancelled" | "waiting_for_approval">;
  finalOutput?: string;
  providerData?: unknown;
}

export interface RuntimeEngine {
  readonly descriptor: RuntimeEngineDescriptor;
  canRun(request: RuntimeRunRequest): boolean;
  run(request: RuntimeRunRequest, sink: RuntimeEventSink): Promise<RuntimeRunResult>;
  dispose?(): Promise<void> | void;
}

export class RuntimeEngineError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly detail?: unknown,
  ) {
    super(message);
    this.name = "RuntimeEngineError";
  }
}

export function createRunEventDraft<TPayload>(
  type: RunEventType,
  payload: TPayload,
  providerData?: unknown,
): RunEventDraft<TPayload> {
  return { type, payload, providerData };
}
