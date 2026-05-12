import { describe, expect, it } from "vitest";
import type { RunStreamEvent } from "@openai/agents";
import { emitMappedEvent, toAgentInput } from "./openai-agents";
import { RuntimeEngineError } from "./types";

describe("OpenAIAgentsRuntimeEngine mapping", () => {
  it("converts Golemancy messages into Agents SDK input items", () => {
    const input = toAgentInput([
      { role: "system", content: "stay brief" },
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
    ]);

    expect(input).toEqual([
      { type: "message", role: "system", content: "stay brief", providerData: undefined },
      { type: "message", role: "user", content: [{ type: "input_text", text: "hello" }], providerData: undefined },
      {
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: "hi" }],
        providerData: undefined,
      },
    ]);
  });

  it("refuses tool message replay until tool events can be rehydrated", () => {
    expect(() => toAgentInput([{ role: "tool", content: "tool output" }])).toThrow(RuntimeEngineError);
  });

  it("maps text deltas into product RunEvents", async () => {
    const events: unknown[] = [];

    await emitMappedEvent(
      {
        type: "raw_model_stream_event",
        source: "openai.responses",
        data: { type: "output_text_delta", delta: "hello" },
      } as RunStreamEvent,
      {
        emit: (event) => {
          events.push(event);
        },
      },
    );

    expect(events).toEqual([
      {
        type: "text.delta",
        payload: { delta: "hello", source: "openai.responses" },
        providerData: { type: "output_text_delta", delta: "hello" },
      },
    ]);
  });

  it("maps tool calls and results into product RunEvents", async () => {
    const events: unknown[] = [];

    await emitMappedEvent(
      {
        type: "run_item_stream_event",
        name: "tool_called",
        item: {
          type: "tool_call_item",
          callId: "call_1",
          toolName: "search",
          rawItem: { callId: "call_1", name: "search", arguments: "{\"q\":\"golemancy\"}" },
          toJSON: () => ({ type: "tool_call_item", rawItem: { callId: "call_1" } }),
        },
      } as unknown as RunStreamEvent,
      {
        emit: (event) => {
          events.push(event);
        },
      },
    );

    await emitMappedEvent(
      {
        type: "run_item_stream_event",
        name: "tool_output",
        item: {
          type: "tool_call_output_item",
          callId: "call_1",
          output: "done",
          toJSON: () => ({ type: "tool_call_output_item", output: "done" }),
        },
      } as unknown as RunStreamEvent,
      {
        emit: (event) => {
          events.push(event);
        },
      },
    );

    expect(events).toEqual([
      {
        type: "tool.call.requested",
        payload: { toolCallId: "call_1", toolName: "search", input: "{\"q\":\"golemancy\"}" },
        providerData: { type: "tool_call_item", rawItem: { callId: "call_1" } },
      },
      {
        type: "tool.call.completed",
        payload: { toolCallId: "call_1", output: "done" },
        providerData: { type: "tool_call_output_item", output: "done" },
      },
    ]);
  });
});
