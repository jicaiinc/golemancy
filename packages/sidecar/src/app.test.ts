import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "@golemancy/db";
import { RuntimeEngineRegistry, type RuntimeEngine } from "@golemancy/runtime";
import { createSidecarApp, createSidecarContext, type SidecarContext } from "./app";
import { BrowserBridge } from "./browser-bridge";
import { RunManager } from "./run-service";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("createSidecarApp", () => {
  it("protects health with the local runtime token and reports SQLite status", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "golemancy-sidecar-"));
    tempDirs.push(dataDir);

    const context = createSidecarContext({
      appVersion: "0.2.0-test",
      environment: "test",
      host: "127.0.0.1",
      port: 47650,
      authToken: "test-local-runtime-token-000000",
      dataDir,
    });

    const app = createSidecarApp(context);

    const unauthorized = await app.request("/health");
    expect(unauthorized.status).toBe(401);

    const preflight = await app.request("/projects", {
      method: "OPTIONS",
      headers: {
        origin: "http://127.0.0.1:5173",
        "access-control-request-method": "GET",
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:5173");

    const response = await app.request("/health", {
      headers: { authorization: "Bearer test-local-runtime-token-000000" },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.database.opened).toBe(true);
    expect(body.database.schemaVersion).toBe(1);
    expect(body.components.some((component: { name: string }) => component.name === "runtime-engines")).toBe(true);
    expect(body.components).toContainEqual(
      expect.objectContaining({
        name: "model-access",
        status: "degraded",
      }),
    );

    const engines = await app.request("/runtime/engines", {
      headers: { authorization: "Bearer test-local-runtime-token-000000" },
    });

    expect(engines.status).toBe(200);
    expect(await engines.json()).toMatchObject({
      engines: [
        {
          id: "openai-agents",
          supportedTransports: ["openai-responses", "openai-chat-compatible"],
        },
      ],
    });

    context.runManager.dispose();
    context.database.close();
    await context.runtimeEngines.dispose();
  });

  it("creates conversation runs through the HTTP API and serves persisted event streams", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "golemancy-sidecar-api-"));
    tempDirs.push(dataDir);

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
        await sink.emit({ type: "text.delta", payload: { delta: "hello" } });
        await sink.emit({ type: "run.completed", payload: { finalOutput: "hello" } });
        return { status: "completed", finalOutput: "hello" };
      },
    } satisfies RuntimeEngine;

    const context = createTestContext(dataDir, engine);
    const app = createSidecarApp(context);
    const headers = {
      authorization: `Bearer ${context.config.authToken}`,
      "content-type": "application/json",
    };

    const projectResponse = await app.request("/projects", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Golemancy" }),
    });
    expect(projectResponse.status).toBe(201);
    const projectBody = await projectResponse.json();

    const threadResponse = await app.request(`/projects/${projectBody.project.id}/threads`, {
      method: "POST",
      headers,
      body: JSON.stringify({ title: "First run" }),
    });
    expect(threadResponse.status).toBe(201);
    const threadBody = await threadResponse.json();

    const runResponse = await app.request(`/threads/${threadBody.thread.id}/runs`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        engineId: "fake",
        message: "hello",
        provider: {
          id: "openai",
          name: "OpenAI",
          transport: "openai-responses",
          model: "gpt-5.4",
          toolMode: "auto",
          apiKeySecretRef: "env:GOLEMANCY_OPENAI_API_KEY",
        },
        agent: {
          name: "Golemancy",
          instructions: "Answer tersely.",
        },
      }),
    });
    expect(runResponse.status).toBe(202);
    const runBody = await runResponse.json();

    await waitFor(() => context.runManager.getRun(runBody.runId)?.status === "completed");

    const historyResponse = await app.request(`/runs/${runBody.runId}/events/history`, {
      headers,
    });
    expect(historyResponse.status).toBe(200);
    const historyBody = await historyResponse.json();
    expect(historyBody.events.map((event: { type: string }) => event.type)).toEqual([
      "run.created",
      "run.started",
      "text.delta",
      "run.completed",
    ]);

    const messagesResponse = await app.request(`/threads/${threadBody.thread.id}/messages`, {
      headers,
    });
    expect(messagesResponse.status).toBe(200);
    const messagesBody = await messagesResponse.json();
    expect(messagesBody.messages.map((message: { role: string; content: string }) => [message.role, message.content])).toEqual([
      ["user", "hello"],
      ["assistant", "hello"],
    ]);

    const streamResponse = await app.request(`/runs/${runBody.runId}/events`, {
      headers,
    });
    expect(streamResponse.status).toBe(200);
    expect(streamResponse.headers.get("content-type")).toContain("text/event-stream");
    const streamBody = await streamResponse.text();
    expect(streamBody).toContain("event: run.created");
    expect(streamBody).toContain("event: run.completed");

    context.runManager.dispose();
    context.database.close();
    await context.runtimeEngines.dispose();
  });

  it("rejects a run before saving the user message when model access is not configured", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "golemancy-sidecar-no-model-access-"));
    tempDirs.push(dataDir);

    const context = createSidecarContext({
      appVersion: "0.2.0-test",
      environment: "test",
      host: "127.0.0.1",
      port: 47650,
      authToken: "test-local-runtime-token-000000",
      dataDir,
    });
    const app = createSidecarApp(context);
    const headers = {
      authorization: `Bearer ${context.config.authToken}`,
      "content-type": "application/json",
    };

    const projectResponse = await app.request("/projects", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Golemancy" }),
    });
    const projectBody = await projectResponse.json();
    const threadResponse = await app.request(`/projects/${projectBody.project.id}/threads`, {
      method: "POST",
      headers,
      body: JSON.stringify({ title: "First run" }),
    });
    const threadBody = await threadResponse.json();

    const runResponse = await app.request(`/threads/${threadBody.thread.id}/runs`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        message: "hello",
        provider: {
          id: "openai",
          name: "OpenAI",
          transport: "openai-responses",
          model: "gpt-5.4",
          toolMode: "auto",
          apiKeySecretRef: "env:GOLEMANCY_OPENAI_API_KEY",
        },
      }),
    });

    expect(runResponse.status).toBe(409);
    expect(await runResponse.json()).toMatchObject({
      error: {
        code: "model_access_not_configured",
        message: "Model access is not configured",
      },
    });

    const messagesResponse = await app.request(`/threads/${threadBody.thread.id}/messages`, {
      headers,
    });
    expect(messagesResponse.status).toBe(200);
    expect(await messagesResponse.json()).toEqual({ messages: [] });

    context.runManager.dispose();
    context.database.close();
    await context.runtimeEngines.dispose();
  });
});

function createTestContext(dataDir: string, engine: RuntimeEngine): SidecarContext {
  const database = openDatabase({ dataDir });
  const runtimeEngines = new RuntimeEngineRegistry([engine]);
  return {
    config: {
      appVersion: "0.2.0-test",
      environment: "test",
      host: "127.0.0.1",
      port: 47650,
      authToken: "test-local-runtime-token-000000",
      dataDir,
      openaiApiKey: "test-key",
    },
    database,
    startedAt: new Date("2026-05-12T00:00:00.000Z"),
    browserBridge: new BrowserBridge(),
    runtimeEngines,
    runManager: new RunManager({
      database,
      runtimeEngines,
      resolveProviderApiKey: () => "test-key",
    }),
  };
}

async function waitFor(predicate: () => boolean, timeoutMs = 1_000): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
