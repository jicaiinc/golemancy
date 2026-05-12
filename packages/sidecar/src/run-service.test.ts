import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MessageRepository, ProjectRepository, ThreadRepository, openDatabase } from "@golemancy/db";
import { RuntimeEngineRegistry, type RuntimeEngine } from "@golemancy/runtime";
import { RunManager } from "./run-service";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("RunManager", () => {
  it("starts runs without blocking, persists ordered events, and records assistant output", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "golemancy-run-service-"));
    tempDirs.push(dataDir);

    const database = openDatabase({ dataDir });
    const project = new ProjectRepository(database).createProject({
      id: "project_1",
      name: "Project",
      createdAt: "2026-05-12T00:00:00.000Z",
    });
    const thread = new ThreadRepository(database).createThread({
      id: "thread_1",
      projectId: project.id,
      title: "Thread",
      createdAt: "2026-05-12T00:00:00.000Z",
    });
    const messages = new MessageRepository(database);
    messages.createMessage({
      id: "message_1",
      threadId: thread.id,
      role: "user",
      content: "hello",
      createdAt: "2026-05-12T00:00:01.000Z",
    });

    let releaseRun!: () => void;
    const runGate = new Promise<void>((resolve) => {
      releaseRun = resolve;
    });

    const engine = {
      descriptor: {
        id: "fake",
        label: "Fake",
        transport: "openai-responses",
        supportedTransports: ["openai-responses"],
        defaultToolMode: "auto",
      },
      canRun: () => true,
      run: async (_request, sink) => {
        await sink.emit({ type: "run.started", payload: { engineId: "fake" } });
        await runGate;
        await sink.emit({ type: "text.delta", payload: { delta: "hello" } });
        return { status: "completed", finalOutput: "hello" };
      },
    } satisfies RuntimeEngine;

    const manager = new RunManager({
      database,
      runtimeEngines: new RuntimeEngineRegistry([engine]),
      resolveProviderApiKey: () => "test-key",
    });

    const response = manager.start({
      threadId: thread.id,
      engineId: "fake",
      messages: messages.listRuntimeMessages(thread.id),
      provider: {
        id: "openai",
        name: "OpenAI",
        transport: "openai-responses",
        model: "gpt-5.4",
        toolMode: "auto",
        apiKeySecretRef: "env:GOLEMANCY_OPENAI_API_KEY",
      },
    });

    expect(response.status).toBe("queued");
    expect(manager.listRunEvents(response.runId).map((event) => [event.sequence, event.type, event.payload])).toEqual([
      [1, "run.created", { status: "queued", providerId: "openai", model: "gpt-5.4", engineId: "fake" }],
    ]);

    releaseRun();
    await waitFor(() => manager.getRun(response.runId)?.status === "completed");

    expect(manager.listRunEvents(response.runId).map((event) => [event.sequence, event.type, event.payload])).toEqual([
      [1, "run.created", { status: "queued", providerId: "openai", model: "gpt-5.4", engineId: "fake" }],
      [2, "run.started", { engineId: "fake" }],
      [3, "text.delta", { delta: "hello" }],
      [4, "run.completed", { finalOutput: "hello" }],
    ]);
    expect(messages.listMessages(thread.id).map((message) => [message.role, message.content, message.runId])).toEqual([
      ["user", "hello", undefined],
      ["assistant", "hello", response.runId],
    ]);

    manager.dispose();
    database.close();
  });
});

async function waitFor(predicate: () => boolean, timeoutMs = 1_000): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
