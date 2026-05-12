import { describe, expect, it } from "vitest";
import { RuntimeEngineRegistry } from "./registry";
import type { RuntimeEngine } from "./types";

const engine = {
  descriptor: {
    id: "test-engine",
    label: "Test Engine",
    transport: "openai-responses",
    supportedTransports: ["openai-responses"],
    defaultToolMode: "auto",
  },
  canRun: (request) => request.provider.transport === "openai-responses",
  run: async () => ({ status: "completed" }),
} satisfies RuntimeEngine;

describe("RuntimeEngineRegistry", () => {
  it("resolves an engine by supported provider transport", () => {
    const registry = new RuntimeEngineRegistry([engine]);

    expect(
      registry.resolve({
        runId: "run_1",
        threadId: "thread_1",
        messages: [],
        provider: {
          id: "openai",
          name: "OpenAI",
          transport: "openai-responses",
          model: "gpt-5.4",
          toolMode: "auto",
        },
      }).descriptor.id,
    ).toBe("test-engine");
  });

  it("rejects a preferred engine that cannot run the provider transport", () => {
    const registry = new RuntimeEngineRegistry([engine]);

    expect(() =>
      registry.resolve(
        {
          runId: "run_1",
          threadId: "thread_1",
          messages: [],
          provider: {
            id: "cli",
            name: "CLI",
            transport: "cli-agent",
            model: "codex",
            toolMode: "prompted",
          },
        },
        "test-engine",
      ),
    ).toThrow("cannot run provider transport");
  });
});
