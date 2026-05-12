import {
  MessageRepository,
  ProjectRepository,
  ThreadRepository,
  openDatabase,
  type OpenedDatabase,
} from "@golemancy/db";
import type { RunEvent, RuntimeAgentConfig, RuntimeProviderConfig, RuntimeStatusResponse } from "@golemancy/protocol";
import { initialRuntimeEngines, RuntimeEngineRegistry } from "@golemancy/runtime";
import { Hono } from "hono";
import type { Context } from "hono";
import { stream } from "hono/streaming";
import { asBrowserActionRequest, BrowserBridge } from "./browser-bridge";
import type { SidecarConfig } from "./config";
import { isTerminalRunEvent, RunManager } from "./run-service";

export interface SidecarContext {
  config: SidecarConfig;
  database: OpenedDatabase;
  startedAt: Date;
  browserBridge: BrowserBridge;
  runtimeEngines: RuntimeEngineRegistry;
  runManager: RunManager;
}

export function createSidecarApp(context: SidecarContext): Hono {
  const app = new Hono();

  app.use("*", async (c, next) => {
    const origin = c.req.header("origin");
    if (origin && isAllowedLocalOrigin(origin)) {
      c.header("Access-Control-Allow-Origin", origin);
      c.header("Access-Control-Allow-Headers", "authorization, content-type");
      c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      c.header("Vary", "Origin");
    }

    if (c.req.method === "OPTIONS") {
      return c.body(null, 204);
    }

    return next();
  });

  app.use("*", async (c, next) => {
    const header = c.req.header("authorization");
    if (header !== `Bearer ${context.config.authToken}`) {
      return c.json({ error: { code: "unauthorized", message: "Missing or invalid local runtime token" } }, 401);
    }

    return next();
  });

  app.get("/health", (c) => {
    const now = new Date();
    const body: RuntimeStatusResponse = {
      appVersion: context.config.appVersion,
      environment: context.config.environment,
      nodeVersion: process.version,
      pid: process.pid,
      uptimeSeconds: Math.round(process.uptime()),
      startedAt: context.startedAt.toISOString(),
      database: {
        path: context.database.path,
        opened: true,
        migrationsApplied: context.database.migrationStatus.applied,
        schemaVersion: context.database.migrationStatus.schemaVersion,
      },
      components: [
        {
          name: "sidecar",
          status: "ok",
          detail: `Hono listening on ${context.config.host}:${context.config.port}`,
          checkedAt: now.toISOString(),
        },
        {
          name: "database",
          status: "ok",
          detail: context.database.path,
          checkedAt: now.toISOString(),
        },
        {
          name: "browser-extension",
          status: context.browserBridge.listProfiles().some((profile) => profile.status === "online")
            ? "ok"
            : "degraded",
          detail: JSON.stringify(context.browserBridge.getStatus()),
          checkedAt: now.toISOString(),
        },
        {
          name: "runtime-engines",
          status: context.runtimeEngines.list().length > 0 ? "ok" : "error",
          detail: context.runtimeEngines
            .list()
            .map((engine) => `${engine.descriptor.id}:${engine.descriptor.supportedTransports.join(",")}`)
            .join("; "),
          checkedAt: now.toISOString(),
        },
        {
          name: "model-access",
          status: context.config.openaiApiKey ? "ok" : "degraded",
          detail: context.config.openaiApiKey ? "configured" : "not configured",
          checkedAt: now.toISOString(),
        },
      ],
    };

    return c.json(body);
  });

  app.get("/runtime/engines", (c) => {
    return c.json({
      engines: context.runtimeEngines.list().map((engine) => engine.descriptor),
    });
  });

  app.get("/projects", (c) => {
    return c.json({ projects: new ProjectRepository(context.database).listProjects() });
  });

  app.post("/projects", async (c) => {
    try {
      const body = await readJsonObject(c.req);
      const project = new ProjectRepository(context.database).createProject({
        name: readRequiredString(body, "name"),
      });
      return c.json({ project }, 201);
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.get("/projects/:projectId/threads", (c) => {
    const projectId = c.req.param("projectId");
    if (!new ProjectRepository(context.database).getProject(projectId)) {
      return c.json({ error: { code: "project_not_found", message: "Project not found" } }, 404);
    }
    return c.json({ threads: new ThreadRepository(context.database).listThreads(projectId) });
  });

  app.post("/projects/:projectId/threads", async (c) => {
    try {
      const projectId = c.req.param("projectId");
      if (!new ProjectRepository(context.database).getProject(projectId)) {
        return c.json({ error: { code: "project_not_found", message: "Project not found" } }, 404);
      }
      const body = await readJsonObject(c.req);
      const thread = new ThreadRepository(context.database).createThread({
        projectId,
        title: readRequiredString(body, "title"),
      });
      return c.json({ thread }, 201);
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.get("/threads/:threadId/messages", (c) => {
    const threadId = c.req.param("threadId");
    if (!new ThreadRepository(context.database).getThread(threadId)) {
      return c.json({ error: { code: "thread_not_found", message: "Thread not found" } }, 404);
    }
    return c.json({ messages: new MessageRepository(context.database).listMessages(threadId) });
  });

  app.post("/threads/:threadId/runs", async (c) => {
    try {
      const threadId = c.req.param("threadId");
      const threads = new ThreadRepository(context.database);
      if (!threads.getThread(threadId)) {
        return c.json({ error: { code: "thread_not_found", message: "Thread not found" } }, 404);
      }

      const body = await readJsonObject(c.req);
      const message = readRequiredString(body, "message");
      const provider = readRuntimeProviderConfig(body);
      const agent = readRuntimeAgentConfig(body);
      const engineId = readOptionalString(body, "engineId");
      if (requiresUnconfiguredModelAccess(context, provider)) {
        return c.json(
          {
            error: {
              code: "model_access_not_configured",
              message: "Model access is not configured",
            },
          },
          409,
        );
      }

      const messages = new MessageRepository(context.database);
      const userMessage = messages.createMessage({
        threadId,
        role: "user",
        content: message,
      });
      threads.touchThread(threadId, userMessage.createdAt);

      const response = context.runManager.start({
        threadId,
        messages: messages.listRuntimeMessages(threadId),
        provider,
        agent,
        engineId,
      });
      return c.json(response, 202);
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.post("/runs/:runId/cancel", (c) => {
    const runId = c.req.param("runId");
    if (!context.runManager.getRun(runId)) {
      return c.json({ error: { code: "run_not_found", message: "Run not found" } }, 404);
    }
    return c.json({ cancelled: context.runManager.cancel(runId) });
  });

  app.get("/runs/:runId/events/history", (c) => {
    try {
      const runId = c.req.param("runId");
      if (!context.runManager.getRun(runId)) {
        return c.json({ error: { code: "run_not_found", message: "Run not found" } }, 404);
      }
      const afterSequence = readAfterSequence(c.req.query("after"));
      return c.json({ events: context.runManager.listRunEvents(runId, afterSequence) });
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.get("/runs/:runId/events", (c) => {
    let afterSequence: number;
    try {
      afterSequence = readAfterSequence(c.req.query("after"));
      const runId = c.req.param("runId");
      if (!context.runManager.getRun(runId)) {
        return c.json({ error: { code: "run_not_found", message: "Run not found" } }, 404);
      }
    } catch (error) {
      return jsonError(c, error, 400);
    }

    c.header("Content-Type", "text/event-stream; charset=utf-8");
    c.header("Cache-Control", "no-cache, no-transform");
    c.header("Connection", "keep-alive");

    const runId = c.req.param("runId");
    return stream(c, async (output) => {
      let closed = false;
      let unsubscribe = () => {};
      let keepAlive: NodeJS.Timeout | undefined;
      let resolveDone: () => void = () => {};
      const done = new Promise<void>((resolve) => {
        resolveDone = resolve;
      });

      const close = () => {
        if (closed) {
          return;
        }
        closed = true;
        if (keepAlive) {
          clearInterval(keepAlive);
        }
        unsubscribe();
        resolveDone();
      };

      const send = async (event: RunEvent) => {
        if (closed) {
          return;
        }
        await output.write(formatSseEvent(event));
        if (isTerminalRunEvent(event)) {
          close();
        }
      };

      await output.write(": connected\n\n");
      for (const event of context.runManager.listRunEvents(runId, afterSequence)) {
        await send(event);
        if (closed) {
          return;
        }
      }

      let writeQueue = Promise.resolve();
      unsubscribe = context.runManager.subscribe(runId, (event) => {
        writeQueue = writeQueue.then(() => send(event)).catch((error) => {
          console.error("SSE run event write failed", error);
          close();
        });
      });
      keepAlive = setInterval(() => {
        writeQueue = writeQueue.then(async () => {
          await output.write(": keep-alive\n\n");
        }).catch((error) => {
          console.error("SSE keep-alive write failed", error);
          close();
        });
      }, 15_000);
      output.onAbort(close);
      await done;
    });
  });

  app.get("/browser/status", (c) => {
    return c.json(context.browserBridge.getStatus());
  });

  app.get("/browser/profiles", (c) => {
    return c.json({ profiles: context.browserBridge.listProfiles() });
  });

  app.post("/browser/actions", async (c) => {
    try {
      const request = asBrowserActionRequest(await c.req.json());
      const result = await context.browserBridge.invoke(request);
      return c.json({ ok: true, result });
    } catch (error) {
      return c.json(
        {
          error: {
            code: error instanceof Error ? error.name : "browser_action_failed",
            message: error instanceof Error ? error.message : String(error),
          },
        },
        error instanceof Error && error.message.includes("timed out") ? 504 : 400,
      );
    }
  });

  app.post("/browser/native/messages", async (c) => {
    try {
      const result = context.browserBridge.handleNativeMessage(await c.req.json());
      return c.json(result);
    } catch (error) {
      return c.json(
        {
          error: {
            code: error instanceof Error ? error.name : "native_message_failed",
            message: error instanceof Error ? error.message : String(error),
          },
        },
        400,
      );
    }
  });

  app.post("/browser/native/poll", async (c) => {
    try {
      const body = await c.req.json();
      const profileId = typeof body.profileId === "string" ? body.profileId : "";
      const timeoutMs = typeof body.timeoutMs === "number" ? body.timeoutMs : undefined;
      if (!profileId) {
        return c.json({ error: { code: "missing_profile_id", message: "profileId is required" } }, 400);
      }

      const message = await context.browserBridge.poll(
        profileId,
        {
          sessionId: typeof body.sessionId === "string" ? body.sessionId : undefined,
          extensionId: typeof body.extensionId === "string" ? body.extensionId : undefined,
          extensionVersion: typeof body.extensionVersion === "string" ? body.extensionVersion : undefined,
          browser: typeof body.browser === "string" ? body.browser : undefined,
          userAgent: typeof body.userAgent === "string" ? body.userAgent : undefined,
          connectedAt: typeof body.connectedAt === "string" ? body.connectedAt : undefined,
          metadata: "metadata" in body ? body.metadata : undefined,
        },
        timeoutMs,
      );
      return c.json({ ok: true, message });
    } catch (error) {
      return c.json(
        {
          error: {
            code: error instanceof Error ? error.name : "native_poll_failed",
            message: error instanceof Error ? error.message : String(error),
          },
        },
        400,
      );
    }
  });

  return app;
}

function formatSseEvent(event: RunEvent): string {
  return `id: ${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

async function readJsonObject(request: { json: () => Promise<unknown> }): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => undefined);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Request body must be a JSON object");
  }
  return body as Record<string, unknown>;
}

function readRequiredString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${key} is required`);
  }
  return value.trim();
}

function readOptionalString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  if (typeof value === "undefined") {
    return undefined;
  }
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${key} must be a non-empty string`);
  }
  return value.trim();
}

function readRuntimeProviderConfig(body: Record<string, unknown>): RuntimeProviderConfig {
  const provider = body.provider;
  if (!provider || typeof provider !== "object" || Array.isArray(provider)) {
    throw new Error("provider is required");
  }
  const record = provider as Record<string, unknown>;
  const transport = readRequiredString(record, "transport");
  const toolMode = readOptionalString(record, "toolMode") ?? "auto";
  if (!["openai-responses", "openai-chat-compatible", "ai-sdk-adapter", "custom-model", "cli-agent"].includes(transport)) {
    throw new Error(`Unsupported provider transport: ${transport}`);
  }
  if (!["auto", "native", "prompted", "disabled"].includes(toolMode)) {
    throw new Error(`Unsupported tool mode: ${toolMode}`);
  }

  return {
    id: readRequiredString(record, "id"),
    name: readRequiredString(record, "name"),
    transport: transport as RuntimeProviderConfig["transport"],
    model: readRequiredString(record, "model"),
    toolMode: toolMode as RuntimeProviderConfig["toolMode"],
    baseUrl: readOptionalString(record, "baseUrl"),
    apiKeySecretRef: readOptionalString(record, "apiKeySecretRef"),
    useResponses: readOptionalBoolean(record, "useResponses"),
    tracingDisabled: readOptionalBoolean(record, "tracingDisabled"),
  };
}

function readRuntimeAgentConfig(body: Record<string, unknown>): RuntimeAgentConfig | undefined {
  const agent = body.agent;
  if (typeof agent === "undefined") {
    return undefined;
  }
  if (!agent || typeof agent !== "object" || Array.isArray(agent)) {
    throw new Error("agent must be a JSON object");
  }
  const record = agent as Record<string, unknown>;
  return {
    name: readRequiredString(record, "name"),
    instructions: readOptionalString(record, "instructions"),
  };
}

function requiresUnconfiguredModelAccess(context: SidecarContext, provider: RuntimeProviderConfig): boolean {
  if (provider.transport !== "openai-responses" && provider.transport !== "openai-chat-compatible") {
    return false;
  }
  return !canResolveProviderApiKey(context, provider);
}

function canResolveProviderApiKey(context: SidecarContext, provider: RuntimeProviderConfig): boolean {
  if (provider.apiKeySecretRef === "env:GOLEMANCY_OPENAI_API_KEY") {
    return !!context.config.openaiApiKey;
  }
  return false;
}

function readOptionalBoolean(body: Record<string, unknown>, key: string): boolean | undefined {
  const value = body[key];
  if (typeof value === "undefined") {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new Error(`${key} must be a boolean`);
  }
  return value;
}

function readAfterSequence(value: string | undefined): number {
  if (!value) {
    return 0;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid after sequence: ${value}`);
  }
  return parsed;
}

function jsonError(c: Context, error: unknown, status: 400 | 500) {
  return c.json(
    {
      error: {
        code: error instanceof Error ? error.name : "error",
        message: error instanceof Error ? error.message : String(error),
      },
    },
    status,
  );
}

function isAllowedLocalOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (
      (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "tauri:") &&
      (url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "tauri.localhost")
    );
  } catch {
    return false;
  }
}

export function createSidecarContext(config: SidecarConfig): SidecarContext {
  const runtimeEngines = new RuntimeEngineRegistry(initialRuntimeEngines);
  const database = openDatabase({ dataDir: config.dataDir });
  return {
    config,
    database,
    startedAt: new Date(),
    browserBridge: new BrowserBridge(),
    runtimeEngines,
    runManager: new RunManager({
      database,
      runtimeEngines,
      resolveProviderApiKey: (provider) => {
        if (provider.apiKeySecretRef === "env:GOLEMANCY_OPENAI_API_KEY") {
          return config.openaiApiKey;
        }
        return undefined;
      },
    }),
  };
}
