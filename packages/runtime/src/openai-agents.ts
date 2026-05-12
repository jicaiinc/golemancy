import {
  Agent,
  OpenAIProvider,
  Runner,
  assistant,
  system,
  user,
  type AgentInputItem,
  type RunStreamEvent,
} from "@openai/agents";
import type { RuntimeMessage } from "@golemancy/protocol";
import type { RuntimeEngine, RuntimeEventSink, RuntimeRunRequest, RuntimeRunResult } from "./types";
import { createRunEventDraft, RuntimeEngineError } from "./types";

const supportedTransports = ["openai-responses", "openai-chat-compatible"] as const;

export class OpenAIAgentsRuntimeEngine implements RuntimeEngine {
  readonly descriptor = {
    id: "openai-agents",
    label: "OpenAI Agents SDK",
    transport: "openai-responses",
    supportedTransports: [...supportedTransports],
    defaultToolMode: "auto",
  } as const;

  canRun(request: RuntimeRunRequest): boolean {
    return supportedTransports.includes(request.provider.transport as (typeof supportedTransports)[number]);
  }

  async run(request: RuntimeRunRequest, sink: RuntimeEventSink): Promise<RuntimeRunResult> {
    if (!request.provider.apiKey) {
      throw new RuntimeEngineError("OpenAI Agents runtime requires a resolved provider API key", "provider_api_key_missing", {
        providerId: request.provider.id,
        secretRef: request.provider.apiKeySecretRef,
      });
    }

    await sink.emit(
      createRunEventDraft("run.started", {
        engineId: this.descriptor.id,
        providerId: request.provider.id,
        model: request.provider.model,
        transport: request.provider.transport,
      }),
    );

    const provider = new OpenAIProvider({
      apiKey: request.provider.apiKey,
      baseURL: request.provider.baseUrl,
      useResponses: request.provider.useResponses ?? request.provider.transport === "openai-responses",
      cacheResponsesWebSocketModels: false,
      strictFeatureValidation: request.provider.transport === "openai-chat-compatible" ? false : undefined,
    });

    const runner = new Runner({
      modelProvider: provider,
      model: request.provider.model,
      tracingDisabled: request.provider.tracingDisabled ?? true,
      workflowName: request.agent?.name ?? "Golemancy Agent Run",
      groupId: request.threadId,
      traceId: request.runId,
      traceMetadata: {
        runId: request.runId,
        threadId: request.threadId,
        providerId: request.provider.id,
        engineId: this.descriptor.id,
        ...request.metadata,
      },
    });

    const agent = new Agent({
      name: request.agent?.name ?? "Golemancy",
      instructions: request.agent?.instructions ?? "You are a production-grade AI assistant inside Golemancy.",
    });

    try {
      const stream = await runner.run(agent, toAgentInput(request.messages), {
        stream: true,
        signal: request.signal,
      });

      for await (const event of stream.toStream()) {
        await emitMappedEvent(event, sink);
      }

      await stream.completed;

      if (stream.interruptions?.length) {
        await sink.emit(
          createRunEventDraft(
            "tool.call.approval_required",
            {
              count: stream.interruptions.length,
            },
            {
              interruptions: stream.interruptions,
            },
          ),
        );
        return {
          status: "waiting_for_approval",
          finalOutput: stringifyFinalOutput(stream.finalOutput),
          providerData: { interruptions: stream.interruptions },
        };
      }

      const finalOutput = stringifyFinalOutput(stream.finalOutput);
      await sink.emit(createRunEventDraft("run.completed", { finalOutput }));
      return { status: "completed", finalOutput };
    } catch (error) {
      if (request.signal?.aborted || isAbortLikeError(error)) {
        await sink.emit(createRunEventDraft("run.cancelled", { reason: "aborted" }, serializeError(error)));
        return { status: "cancelled", providerData: serializeError(error) };
      }

      await sink.emit(createRunEventDraft("run.failed", { message: errorMessage(error) }, serializeError(error)));
      return { status: "failed", providerData: serializeError(error) };
    } finally {
      await provider.close();
    }
  }
}

export function toAgentInput(messages: RuntimeMessage[]): AgentInputItem[] {
  return messages.map((message) => {
    switch (message.role) {
      case "system":
        return system(message.content);
      case "user":
        return user(message.content);
      case "assistant":
        return assistant(message.content);
      case "tool":
        throw new RuntimeEngineError(
          "Tool message replay is not supported until tool call events are rehydrated from RunEvent history",
          "tool_message_replay_unsupported",
          { messageId: message.id },
        );
      default:
        return assertNever(message.role);
    }
  });
}

export async function emitMappedEvent(event: RunStreamEvent, sink: RuntimeEventSink): Promise<void> {
  if (event.type === "raw_model_stream_event") {
    await emitRawModelEvent(event, sink);
    return;
  }

  if (event.type === "agent_updated_stream_event") {
    await sink.emit(createRunEventDraft("usage.updated", { activeAgent: event.agent.name }, safeToJson(event.agent)));
    return;
  }

  if (event.type !== "run_item_stream_event") {
    return;
  }

  const item = event.item;
  if (item.type === "tool_call_item") {
    await sink.emit(
      createRunEventDraft(
        "tool.call.requested",
        {
          toolCallId: item.callId,
          toolName: item.toolName,
          input: readRawArguments(item.rawItem),
        },
        safeToJson(item),
      ),
    );
    return;
  }

  if (item.type === "tool_approval_item") {
    await sink.emit(
      createRunEventDraft(
        "tool.call.approval_required",
        {
          toolCallId: readRawCallId(item.rawItem),
          toolName: item.name,
          input: item.arguments,
        },
        safeToJson(item),
      ),
    );
    return;
  }

  if (item.type === "tool_call_output_item") {
    await sink.emit(
      createRunEventDraft(
        "tool.call.completed",
        {
          toolCallId: item.callId,
          output: item.output,
        },
        safeToJson(item),
      ),
    );
  }
}

async function emitRawModelEvent(
  event: Extract<RunStreamEvent, { type: "raw_model_stream_event" }>,
  sink: RuntimeEventSink,
): Promise<void> {
  const data = event.data;
  if (data.type === "output_text_delta") {
    await sink.emit(
      createRunEventDraft(
        "text.delta",
        {
          delta: data.delta,
          source: event.source,
        },
        data,
      ),
    );
    return;
  }

  if (data.type === "response_done") {
    const usage = readUsage(data.response);
    if (usage) {
      await sink.emit(createRunEventDraft("usage.updated", usage, data));
    }
  }
}

function readUsage(response: unknown): unknown | undefined {
  if (!response || typeof response !== "object") {
    return undefined;
  }
  const usage = (response as { usage?: unknown }).usage;
  return usage ?? undefined;
}

function readRawArguments(rawItem: unknown): unknown {
  if (!rawItem || typeof rawItem !== "object") {
    return undefined;
  }
  return (rawItem as { arguments?: unknown }).arguments;
}

function readRawCallId(rawItem: unknown): string | undefined {
  if (!rawItem || typeof rawItem !== "object") {
    return undefined;
  }
  const value = (rawItem as { callId?: unknown; id?: unknown }).callId ?? (rawItem as { id?: unknown }).id;
  return typeof value === "string" ? value : undefined;
}

function stringifyFinalOutput(output: unknown): string | undefined {
  if (typeof output === "undefined") {
    return undefined;
  }
  return typeof output === "string" ? output : JSON.stringify(output);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isAbortLikeError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.name === "AbortError" || error.message.toLowerCase().includes("abort");
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

function safeToJson(value: unknown): unknown {
  if (!value || typeof value !== "object") {
    return value;
  }
  const candidate = value as { toJSON?: () => unknown };
  if (typeof candidate.toJSON === "function") {
    return candidate.toJSON();
  }
  return value;
}

function assertNever(value: never): never {
  throw new RuntimeEngineError(`Unsupported message role: ${String(value)}`, "message_role_unsupported", { role: value });
}
