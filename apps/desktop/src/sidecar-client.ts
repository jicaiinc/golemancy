import type {
  ApiErrorResponse,
  CreateProjectResponse,
  CreateRunResponse,
  CreateThreadResponse,
  ListMessagesResponse,
  ListProjectsResponse,
  ListRunEventsResponse,
  ListThreadsResponse,
  LocalRuntimeConfig,
  RunEvent,
  RuntimeAgentConfig,
  RuntimeProviderConfig,
} from "@golemancy/protocol";

export interface StartRunOptions {
  message: string;
  provider: RuntimeProviderConfig;
  agent?: RuntimeAgentConfig;
  engineId?: string;
}

export interface RunEventSubscription {
  abort: () => void;
  done: Promise<void>;
}

export interface RunEventSubscriptionOptions {
  afterSequence?: number;
  onEvent: (event: RunEvent) => void;
  onError: (error: unknown) => void;
}

export interface ParsedSseFrame {
  id?: string;
  event?: string;
  data?: unknown;
}

export class SidecarRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = "SidecarRequestError";
  }
}

export class SidecarClient {
  constructor(private readonly config: LocalRuntimeConfig) {}

  listProjects(): Promise<ListProjectsResponse> {
    return this.requestJson("/projects");
  }

  createProject(name: string): Promise<CreateProjectResponse> {
    return this.requestJson("/projects", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  }

  listThreads(projectId: string): Promise<ListThreadsResponse> {
    return this.requestJson(`/projects/${encodeURIComponent(projectId)}/threads`);
  }

  createThread(projectId: string, title: string): Promise<CreateThreadResponse> {
    return this.requestJson(`/projects/${encodeURIComponent(projectId)}/threads`, {
      method: "POST",
      body: JSON.stringify({ title }),
    });
  }

  listMessages(threadId: string): Promise<ListMessagesResponse> {
    return this.requestJson(`/threads/${encodeURIComponent(threadId)}/messages`);
  }

  startRun(threadId: string, options: StartRunOptions): Promise<CreateRunResponse> {
    return this.requestJson(`/threads/${encodeURIComponent(threadId)}/runs`, {
      method: "POST",
      body: JSON.stringify(options),
    });
  }

  cancelRun(runId: string): Promise<{ cancelled: boolean }> {
    return this.requestJson(`/runs/${encodeURIComponent(runId)}/cancel`, {
      method: "POST",
    });
  }

  listRunEvents(runId: string, afterSequence = 0): Promise<ListRunEventsResponse> {
    const query = afterSequence > 0 ? `?after=${afterSequence}` : "";
    return this.requestJson(`/runs/${encodeURIComponent(runId)}/events/history${query}`);
  }

  subscribeRunEvents(runId: string, options: RunEventSubscriptionOptions): RunEventSubscription {
    const controller = new AbortController();
    const after = options.afterSequence && options.afterSequence > 0 ? `?after=${options.afterSequence}` : "";

    const done = this.streamRunEvents(`/runs/${encodeURIComponent(runId)}/events${after}`, controller.signal, options)
      .catch((error) => {
        if (!controller.signal.aborted) {
          options.onError(error);
        }
      });

    return {
      abort: () => controller.abort(),
      done,
    };
  }

  private async streamRunEvents(
    path: string,
    signal: AbortSignal,
    options: RunEventSubscriptionOptions,
  ): Promise<void> {
    const response = await fetch(this.url(path), {
      headers: this.headers(),
      signal,
    });

    if (!response.ok) {
      throw await toRequestError(response);
    }

    if (!response.body) {
      throw new Error("Run event stream did not return a readable body");
    }

    await readSseStream(response.body, (frame) => {
      if (isRunEvent(frame.data)) {
        options.onEvent(frame.data);
      }
    });
  }

  private async requestJson<TResponse>(path: string, init: RequestInit = {}): Promise<TResponse> {
    const response = await fetch(this.url(path), {
      ...init,
      headers: {
        ...this.headers(),
        ...init.headers,
      },
    });

    if (!response.ok) {
      throw await toRequestError(response);
    }

    return (await response.json()) as TResponse;
  }

  private url(path: string): string {
    return `${this.config.apiBaseUrl}${path}`;
  }

  private headers(): Record<string, string> {
    return {
      authorization: `Bearer ${this.config.authToken}`,
      "content-type": "application/json",
    };
  }
}

export function defaultOpenAIProvider(): RuntimeProviderConfig {
  return {
    id: "openai",
    name: "OpenAI",
    transport: "openai-responses",
    model: "gpt-5.4",
    toolMode: "auto",
    apiKeySecretRef: "env:GOLEMANCY_OPENAI_API_KEY",
    tracingDisabled: true,
  };
}

export function defaultAgentConfig(): RuntimeAgentConfig {
  return {
    name: "Golemancy",
    instructions: "You are a production-grade AI delivery assistant inside Golemancy.",
  };
}

export async function readSseStream(
  body: ReadableStream<Uint8Array>,
  onFrame: (frame: ParsedSseFrame) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });

      let boundary = findSseBoundary(buffer);
      while (boundary >= 0) {
        const rawFrame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + readBoundaryLength(buffer, boundary));
        const frame = parseSseFrame(rawFrame);
        if (frame) {
          onFrame(frame);
        }
        boundary = findSseBoundary(buffer);
      }

      if (done) {
        const frame = parseSseFrame(buffer);
        if (frame) {
          onFrame(frame);
        }
        return;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export function parseSseFrame(rawFrame: string): ParsedSseFrame | undefined {
  const lines = rawFrame.split(/\r?\n/);
  const dataLines: string[] = [];
  let id: string | undefined;
  let event: string | undefined;

  for (const line of lines) {
    if (!line || line.startsWith(":")) {
      continue;
    }

    const separatorIndex = line.indexOf(":");
    const field = separatorIndex >= 0 ? line.slice(0, separatorIndex) : line;
    const rawValue = separatorIndex >= 0 ? line.slice(separatorIndex + 1) : "";
    const value = rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue;

    if (field === "id") {
      id = value;
    } else if (field === "event") {
      event = value;
    } else if (field === "data") {
      dataLines.push(value);
    }
  }

  if (!id && !event && dataLines.length === 0) {
    return undefined;
  }

  return {
    id,
    event,
    data: dataLines.length > 0 ? JSON.parse(dataLines.join("\n")) : undefined,
  };
}

function findSseBoundary(buffer: string): number {
  const lf = buffer.indexOf("\n\n");
  const crlf = buffer.indexOf("\r\n\r\n");
  if (lf < 0) {
    return crlf;
  }
  if (crlf < 0) {
    return lf;
  }
  return Math.min(lf, crlf);
}

function readBoundaryLength(buffer: string, boundary: number): number {
  return buffer.slice(boundary, boundary + 4) === "\r\n\r\n" ? 4 : 2;
}

function isRunEvent(value: unknown): value is RunEvent {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<RunEvent>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.runId === "string" &&
    typeof candidate.sequence === "number" &&
    typeof candidate.type === "string" &&
    typeof candidate.createdAt === "string"
  );
}

async function toRequestError(response: Response): Promise<SidecarRequestError> {
  const body = await response.json().catch(() => undefined);
  const apiError = isApiErrorResponse(body) ? body.error : undefined;
  return new SidecarRequestError(
    apiError?.message ?? "The request could not be completed. Try again.",
    response.status,
    body,
  );
}

function isApiErrorResponse(body: unknown): body is ApiErrorResponse {
  return (
    !!body &&
    typeof body === "object" &&
    "error" in body &&
    !!(body as { error?: unknown }).error &&
    typeof (body as { error: { message?: unknown } }).error.message === "string"
  );
}
